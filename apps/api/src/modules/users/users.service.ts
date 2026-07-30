import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import {
  Brackets,
  EntityManager,
  Repository,
  SelectQueryBuilder,
  WhereExpressionBuilder,
} from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import {
  USER_ACCESS_GRANTED,
  USER_ACCESS_REVOKED,
  USER_ORGANIZATION_ASSIGNED,
  UserAccessChangedEvent,
  UserOrganizationAssignedEvent,
} from '../../common/events/user-events';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, isSuperAdmin, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { assertAssignableRole, assertCanToggleAccess } from './user-role.policy';

/** The name/email OR-group, shared by findAll, findUnassigned and search. */
function nameEmailBrackets(w: WhereExpressionBuilder, q: string): WhereExpressionBuilder {
  return w
    .where('u.email ILIKE :q', { q: `%${q}%` })
    .orWhere('u.firstName ILIKE :q', { q: `%${q}%` })
    .orWhere('u.lastName ILIKE :q', { q: `%${q}%` });
}

/** Appends the name/email filter when `q` is a non-empty search term. */
function applyNameEmailSearch(qb: SelectQueryBuilder<User>, q?: string): void {
  if (!q?.trim()) return;
  qb.andWhere(new Brackets((w) => nameEmailBrackets(w, q.trim())));
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly quotas: QuotaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * `actor` is the authenticated caller creating this user (omitted for the
   * public self-registration flow, which always forces role=student itself
   * before calling in). Only an ADMIN actor may assign a non-default role —
   * without this gate a PROFESSOR could mint an ADMIN account.
   */
  async create(dto: CreateUserDto, actor?: AuthenticatedUser): Promise<User> {
    const existing = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already registered');

    // DEFECT (fixed): this used to be
    //   `!actor || actor.role === ADMIN ? (dto.role ?? STUDENT) : STUDENT`
    // so any org ADMIN could POST {"role":"superadmin"} and mint a platform
    // SuperAdmin, inheriting every isSuperAdmin() bypass in tenant-scope.util.
    // The rank-aware policy refuses SUPERADMIN outright and refuses any role at
    // or above the actor's own.
    const role = dto.role ?? Role.STUDENT;
    if (actor) assertAssignableRole(actor, role);
    else if (role !== Role.STUDENT) {
      // No actor = public self-registration, which is always a student. Callers
      // force this already; the guard is here so a future caller cannot forget.
      throw new ForbiddenException({ reason: 'role_not_assignable' });
    }
    // Stamp the actor's org (admin/professor add). A no-actor self-register stays
    // NULL, which chk_users_org_required now permits for a STUDENT
    // (1785520000000) — they land in the confined holding state until staff
    // assign them or they claim an invite.
    const organizationId = actor?.organizationId ?? null;
    const passwordHash = await this.hashPassword(dto.password);

    // Hashing happens BEFORE the transaction on purpose: argon2 takes ~100ms, and
    // doing it while holding the org's seat lock would serialise concurrent adds
    // on the slowest step rather than the shortest one.
    return this.users.manager.transaction(async (manager) => {
      // MAX_USERS is checked inside the tx holding the quota row lock, so two
      // concurrent adds at limit-1 can't both succeed (#66).
      await this.quotas.assertWithinQuota(organizationId, QuotaResource.MAX_USERS, 1, manager);
      const repo = manager.getRepository(User);
      return repo.save(
        repo.create({
          email: dto.email.toLowerCase(),
          firstName: dto.firstName,
          lastName: dto.lastName,
          role,
          organizationId,
          passwordHash,
        }),
      );
    });
  }

  /**
   * Creates an account from an ACCEPTED invite, inside the caller's transaction.
   *
   * A named, greppable bypass of `create()` rather than an inline `repo.save`,
   * because it deliberately violates two of `create()`'s invariants and a reader
   * needs to see that stated:
   *
   *  - `create()` forces `organizationId = actor?.organizationId ?? null`. There
   *    is no actor here — the invitee is not yet a user — and the org comes from
   *    the invite row.
   *  - `create()` opens its OWN quota transaction. The invite flow must charge
   *    the seat inside the same transaction that consumed the invite, and in that
   *    order, so it does the quota call itself and this must not repeat it.
   *
   * The password is hashed by the CALLER, before the transaction opens: argon2
   * costs ~100ms and doing it while holding the `org_quotas` row lock would
   * serialise every concurrent join on the slowest step.
   */
  createFromInvite(
    input: {
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      organizationId: string;
      passwordHash: string;
    },
    manager: EntityManager,
  ): Promise<User> {
    const repo = manager.getRepository(User);
    return repo.save(
      repo.create({
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        organizationId: input.organizationId,
        passwordHash: input.passwordHash,
        isActive: true,
      }),
    );
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Case-insensitive lookup. `users.email` is stored lowercased and is unique. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Loads the user WITH the password hash (only for auth). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findAll(
    query: ListUsersQueryDto,
    actor: AuthenticatedUser,
    opts: { organizationId?: string } = {},
  ): Promise<PaginatedResult<User>> {
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');

    // A PROFESSOR now has the same READ surface as an ADMIN (the requirement):
    // they can see the admins in their own org. The escalation boundary stays a
    // WRITE boundary — assertCanModify is unchanged, so a professor still cannot
    // modify anyone but a student.
    if (actor.role === Role.STUDENT) {
      qb.andWhere('u.role = :student', { student: Role.STUDENT });
    }

    if (query.role) qb.andWhere('u.role = :roleFilter', { roleFilter: query.role });
    if (query.isActive !== undefined) {
      qb.andWhere('u.isActive = :isActive', { isActive: query.isActive });
    }
    applyNameEmailSearch(qb, query.q);

    // Org bound (omit includeGlobal: org-null SUPERADMIN rows must not surface).
    // `overrideOrgId` is read ONLY inside scopeToOrg's isSuperAdmin branch, so an
    // org admin cannot craft their way into another tenant through it.
    scopeToOrg(qb, 'u', actor, opts.organizationId ? { overrideOrgId: opts.organizationId } : {});

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /**
   * The unassigned pool: self-registered students with no organization.
   *
   * Deliberately does NOT call scopeToOrg. There is no tenant to scope to, and
   * `includeGlobal: true` emits `col IS NULL`, which here would surface every
   * org-less SUPERADMIN row alongside the students. The filter is hardcoded
   * instead — `organization_id IS NULL AND role = 'student'` — so an orphaned
   * STAFF row can never appear in the pool and be claimed at its elevated role.
   *
   * Matches the predicate of `idx_user_unassigned` (1785520000000) exactly.
   */
  async findUnassigned(query: ListUsersQueryDto): Promise<PaginatedResult<User>> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.organizationId IS NULL')
      .andWhere('u.role = :student', { student: Role.STUDENT })
      .orderBy('u.createdAt', 'DESC');
    applyNameEmailSearch(qb, query.q);
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  async search(dto: SearchUsersDto, actor: AuthenticatedUser): Promise<User[]> {
    // Mirror findAll's visibility rule: students may only discover students,
    // regardless of the requested `type` (search is used for member pickers,
    // not a general people-lookup — students should not enumerate staff).
    // Widened in lockstep with findAll's read parity: staff searching 'both' now
    // reach admins too, so listing and searching agree about who exists. A student
    // is still confined to students.
    const requestedType = actor.role === Role.STUDENT ? 'student' : dto.type;
    const roles =
      requestedType === 'both'
        ? [Role.STUDENT, Role.PROFESSOR, Role.ADMIN]
        : [requestedType as Role];
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles })
      .andWhere(new Brackets((w) => nameEmailBrackets(w, dto.q)));
    scopeToOrg(qb, 'u', actor);
    return qb.limit(dto.limit).getMany();
  }

  /** Role-scoped single-user lookup for the public GET /users/:id route. */
  async findOneVisible(id: string, actor: AuthenticatedUser): Promise<User> {
    const user = await this.getById(id);
    if (!this.canView(actor, user)) throw new ForbiddenException('You cannot view this user');
    return user;
  }

  private canView(actor: AuthenticatedUser, target: User): boolean {
    if (isSuperAdmin(actor)) return true;
    if (actor.id === target.id) return true;
    // An org-less non-superadmin has no tenant, so `null !== null` would read as
    // "same org" and expose every other org-less row. Self-only for them.
    if (actor.organizationId === null) return false;
    if (actor.organizationId !== target.organizationId) return false; // org bound
    if (actor.role === Role.ADMIN) return true;
    // Read parity with ADMIN — same-org is already asserted above. The write
    // boundary is assertCanModify, which is unchanged.
    if (actor.role === Role.PROFESSOR) return true;
    return target.role === Role.STUDENT;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<User> {
    const user = await this.getById(id);
    this.assertCanModify(actor, user);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const clash = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
      if (clash) throw new ConflictException('Email already registered');
      user.email = dto.email.toLowerCase();
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    // DEFECT (fixed): `actor.role === Role.ADMIN` gated this, which a SUPERADMIN
    // FAILS — so PATCH /users/:id {"role":...} silently did nothing for the one
    // actor most likely to be doing it. Rank policy replaces the equality check.
    if (dto.role !== undefined && dto.role !== user.role) {
      assertAssignableRole(actor, dto.role);
      user.role = dto.role;
    }

    // DEFECT (fixed): same broken `=== ADMIN` gate, so a SuperAdmin's
    // PATCH {"isActive":false} returned 200 with the row UNCHANGED — a revoke
    // that silently did nothing. Routed through setAccess so it charges a seat on
    // re-activation and emits the access events. Handled after the save below.
    const accessChange = dto.isActive !== undefined && dto.isActive !== user.isActive;

    // DEFECT (fixed): any ADMIN could set ANOTHER user's password — a plain
    // account-takeover primitive. Self-only now; everyone else uses the reset
    // flow, which proves mailbox control.
    if (dto.password) {
      if (actor.id !== user.id) {
        throw new ForbiddenException({
          reason: 'password_self_only',
          message: 'You can only change your own password',
        });
      }
      user.passwordHash = await this.hashPassword(dto.password);
    }

    const saved = await this.users.save(user);
    if (accessChange) return this.setAccess(saved.id, dto.isActive as boolean, actor);
    return saved;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const user = await this.getById(id);
    this.assertCanModify(actor, user);
    await this.users.remove(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  /**
   * Sets a user's role. For trusted internal flows only (professor-onboarding
   * invite consumption and admin request approval) — the CALLER is responsible
   * for authorizing the change; this method intentionally has no actor gate,
   * unlike `update()`. Returns the updated user.
   */
  async setRole(userId: string, role: Role): Promise<User> {
    const user = await this.getById(userId);
    user.role = role;
    return this.users.save(user);
  }

  verifyPassword(user: User, plain: string): Promise<boolean> {
    // No hash = an invited account that has not been accepted yet. It cannot log
    // in until the invitee sets a password.
    if (!user.passwordHash) return Promise.resolve(false);
    return argon2.verify(user.passwordHash, plain);
  }

  private hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  /**
   * The revoke/grant primitive. Idempotent: a no-op transition emits no event and
   * sends no mail, so re-revoking an already-revoked account does not mail them a
   * second time about something that happened last week.
   *
   * `false -> true` MUST charge a seat. `countSeats` counts `is_active = true`, so
   * without this an org at its cap could deactivate a member, invite a
   * replacement, and re-activate the first one — ending up permanently over cap
   * with every individual step having passed its check.
   */
  async setAccess(targetId: string, isActive: boolean, actor: AuthenticatedUser): Promise<User> {
    const target = await this.getById(targetId);
    assertCanToggleAccess(actor, target, () => assertSameOrg(actor, target.organizationId));

    if (target.isActive === isActive) return target; // idempotent — no event, no mail

    const saved = await this.users.manager.transaction(async (manager) => {
      if (isActive) {
        // Re-activation is a genuine +1 against the cap.
        await this.quotas.assertWithinQuota(
          target.organizationId,
          QuotaResource.MAX_USERS,
          1,
          manager,
        );
      }
      const repo = manager.getRepository(User);
      target.isActive = isActive;
      return repo.save(target);
    });

    // After commit: a rollback cannot unsend a mail.
    const payload: UserAccessChangedEvent = {
      userId: saved.id,
      email: saved.email,
      firstName: saved.firstName,
      lastName: saved.lastName,
      actorId: actor.id,
    };
    this.events.emit(isActive ? USER_ACCESS_GRANTED : USER_ACCESS_REVOKED, payload);
    return saved;
  }

  /**
   * Moves an unassigned student into an organization.
   *
   * `expectedOrgId` is the ORG path's tenant (from the actor, never the body);
   * the platform path passes undefined and names the org explicitly.
   *
   * Everything not in the unassigned pool answers a UNIFORM 404 for a
   * non-superadmin. Distinct codes here — "already in an org", "is a professor",
   * "no such user" — are a cross-tenant existence and membership oracle: an org
   * admin could enumerate which arbitrary uuids are real users and where they
   * belong.
   */
  async assignOrganization(
    targetId: string,
    organizationId: string,
    actor: AuthenticatedUser,
    role: Role = Role.STUDENT,
    organizationName = '',
  ): Promise<User> {
    assertAssignableRole(actor, role);

    const saved = await this.users.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      // FOR UPDATE: two concurrent assignments of the same person must not both
      // pass the "still unassigned" check and both charge a seat.
      const rows = (await manager.query(
        'SELECT id, role, organization_id FROM users WHERE id = $1 FOR UPDATE',
        [targetId],
      )) as { id: string; role: Role; organization_id: string | null }[];
      const row = rows[0];

      if (!row || row.organization_id !== null || row.role !== Role.STUDENT) {
        throw new NotFoundException({ reason: 'user_not_assignable' });
      }

      await this.quotas.assertWithinQuota(organizationId, QuotaResource.MAX_USERS, 1, manager);

      await repo.update({ id: targetId }, { organizationId, role });

      // NOT optional. An org-less student's rows are stamped LEGACY_ORG_ID by
      // `?? LEGACY_ORG_ID` in gamification and code-execution, so without this
      // re-stamp their whole history stays attributed to the Legacy tenant and the
      // org they just joined under-reports its own activity forever.
      await manager.query('UPDATE user_gamification SET organization_id = $1 WHERE user_id = $2', [
        organizationId,
        targetId,
      ]);
      await manager.query('UPDATE submissions SET organization_id = $1 WHERE user_id = $2', [
        organizationId,
        targetId,
      ]);

      return repo.findOneOrFail({ where: { id: targetId } });
    });

    // After commit — a rollback cannot unsend a mail. The org name is fetched by
    // the listener's caller rather than here so UsersService keeps no dependency
    // on OrganizationsService.
    const payload: UserOrganizationAssignedEvent = {
      userId: saved.id,
      email: saved.email,
      firstName: saved.firstName,
      lastName: saved.lastName,
      organizationId,
      organizationName,
      actorId: actor.id,
    };
    this.events.emit(USER_ORGANIZATION_ASSIGNED, payload);
    return saved;
  }

  /** Non-admins may only modify students or themselves. */
  private assertCanModify(actor: AuthenticatedUser, target: User): void {
    if (isSuperAdmin(actor)) return;
    if (actor.id === target.id) return;
    assertSameOrg(actor, target.organizationId); // block cross-org modify/delete IDOR
    if (actor.role === Role.ADMIN) return;
    if (actor.role === Role.PROFESSOR && target.role === Role.STUDENT) return;
    throw new ForbiddenException('You cannot modify this user');
  }
}
