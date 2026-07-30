import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, isSuperAdmin, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly quotas: QuotaService,
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

    const role = !actor || actor.role === Role.ADMIN ? (dto.role ?? Role.STUDENT) : Role.STUDENT;
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
    query: PaginationQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<User>> {
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');

    // Role scoping mirrors the original: admin sees all; professor sees
    // non-admins; student sees only students.
    if (actor.role === Role.PROFESSOR) {
      qb.andWhere('u.role != :admin', { admin: Role.ADMIN });
    } else if (actor.role === Role.STUDENT) {
      qb.andWhere('u.role = :student', { student: Role.STUDENT });
    }

    // Org bound (omit includeGlobal: org-null SUPERADMIN rows must not surface).
    scopeToOrg(qb, 'u', actor);

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  async search(dto: SearchUsersDto, actor: AuthenticatedUser): Promise<User[]> {
    // Mirror findAll's visibility rule: students may only discover students,
    // regardless of the requested `type` (search is used for member pickers,
    // not a general people-lookup — students should not enumerate staff).
    const requestedType = actor.role === Role.STUDENT ? 'student' : dto.type;
    const roles =
      requestedType === 'both' ? [Role.STUDENT, Role.PROFESSOR] : [requestedType as Role];
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles })
      .andWhere(
        new Brackets((w) => {
          w.where('u.email ILIKE :q', { q: `%${dto.q}%` })
            .orWhere('u.firstName ILIKE :q', { q: `%${dto.q}%` })
            .orWhere('u.lastName ILIKE :q', { q: `%${dto.q}%` });
        }),
      );
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
    if (actor.organizationId !== target.organizationId) return false; // org bound
    if (actor.role === Role.ADMIN) return true;
    if (actor.role === Role.PROFESSOR) return target.role !== Role.ADMIN;
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
    // Only admins may change roles or the active flag (same gate as role).
    if (dto.role !== undefined && actor.role === Role.ADMIN) user.role = dto.role;
    if (dto.isActive !== undefined && actor.role === Role.ADMIN) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await this.hashPassword(dto.password);

    return this.users.save(user);
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
