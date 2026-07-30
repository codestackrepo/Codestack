import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { Role, ROLE_RANK } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AcceptInviteDto, CreateInviteDto, ListInvitesQueryDto } from './dto/invite.dto';
import { OrgInvite } from './entities/org-invite.entity';
import { OrgInviteKind, OrgInviteSource, OrgInviteStatus } from './enums/org-invite.enums';
import {
  AccountConflictException,
  InviteNotPendingException,
  InviteResendCooldownException,
} from './invite.exceptions';
import { assertMayInvite } from './invite-policy';
import { hashToken, mintInviteToken } from './invite-token.util';

const DEFAULT_TTL_DAYS = 14;
const DAY_MS = 86_400_000;
/** Per-invite resend cooldown. The global throttler buckets by user/IP and cannot express this. */
const RESEND_COOLDOWN_MS = 120_000;

/** What `accept` resolved to — the controller decides whether to set cookies. */
export interface AcceptResult {
  outcome: 'created' | 'already_member';
  user: User;
}

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(OrgInvite) private readonly invites: Repository<OrgInvite>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly orgs: OrganizationsService,
    private readonly quotas: QuotaService,
    private readonly mail: MailService,
  ) {}

  // ------------------------------------------------------------------- mint

  /**
   * Mints an invite for `organizationId`.
   *
   * Callers supply the org explicitly: the org controller passes
   * `actor.organizationId`, the platform controller passes the route param. This
   * method therefore never derives a tenant, and there is exactly one place —
   * `assertActorOrg` — that can fail to have one.
   */
  async create(
    dto: CreateInviteDto,
    actor: AuthenticatedUser,
    organizationId: string,
    source: OrgInviteSource = OrgInviteSource.MANUAL,
  ): Promise<OrgInvite> {
    assertMayInvite(actor.role, dto.role);

    const org = await this.orgs.getById(organizationId); // 404 for an unknown org
    // Minting into a suspended tenant would hold a seat for an account that can
    // never sign in — TenantContextGuard rejects the whole org.
    if (org.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({ reason: 'org_suspended' });
    }

    const email = dto.email.toLowerCase();
    const { token, tokenHash } = mintInviteToken();
    const ttlDays = dto.expiresInDays ?? DEFAULT_TTL_DAYS;

    // An unassigned self-registrant is asked to JOIN rather than to create an
    // account. Nothing here re-homes them — kind only changes what the mail says
    // and what accept/claim will do when they click.
    const existing = await this.users.findByEmail(email);
    const kind =
      existing && existing.organizationId === null
        ? OrgInviteKind.CLAIM
        : OrgInviteKind.NEW_ACCOUNT;

    const invite = await this.dataSource.transaction(async (manager) => {
      await this.expireStalePending(manager, organizationId, email);

      // Explicit pre-check so the caller gets `invite_already_pending` rather than
      // a raw 23505 from uq_org_invites_org_pending_email surfacing through the
      // exception filter as "Database constraint violation".
      const clash = await manager
        .getRepository(OrgInvite)
        .createQueryBuilder('i')
        .where('i.organizationId = :organizationId', { organizationId })
        .andWhere('lower(i.email) = :email', { email })
        .andWhere('i.status = :pending', { pending: OrgInviteStatus.PENDING })
        .getOne();
      if (clash) throw new AccountConflictException('invite_already_pending');

      await this.quotas.assertWithinQuota(
        organizationId,
        QuotaResource.MAX_USERS,
        1,
        manager, // the transaction's manager — this is what makes the lock real
      );

      const repo = manager.getRepository(OrgInvite);
      return repo.save(
        repo.create({
          organizationId,
          email,
          tokenHash,
          role: dto.role,
          status: OrgInviteStatus.PENDING,
          kind,
          source,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          invitedById: actor.id,
          expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
          sendCount: 1,
          lastSentAt: new Date(),
        }),
      );
    });

    // AFTER the transaction commits, never inside it: enqueue is a side effect on
    // another system, and a rollback cannot unsend it.
    await this.sendInviteMail(invite, org.name, token, ttlDays);
    return invite;
  }

  // ------------------------------------------------------------------- read

  async list(
    query: ListInvitesQueryDto,
    actor: AuthenticatedUser,
    overrideOrgId?: string,
  ): Promise<PaginatedResult<OrgInvite>> {
    const qb = this.invites.createQueryBuilder('i').orderBy('i.createdAt', 'DESC');
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.role) qb.andWhere('i.role = :role', { role: query.role });
    scopeToOrg(qb, 'i', actor, overrideOrgId ? { overrideOrgId } : {});
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /** Pending invites addressed to this (possibly org-less) user, for the holding state. */
  async listMine(actor: AuthenticatedUser): Promise<OrgInvite[]> {
    return this.invites
      .createQueryBuilder('i')
      .where('lower(i.email) = :email', { email: actor.email.toLowerCase() })
      .andWhere('i.status = :pending', { pending: OrgInviteStatus.PENDING })
      .andWhere('i.expiresAt > now()')
      .orderBy('i.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Public token preview.
   *
   * NEVER throws — including for a missing or malformed token. A 4xx here would
   * put the raw token into `AllExceptionsFilter`'s `path` field and from there
   * into the application log, which is exactly what the hashed-storage design
   * exists to prevent. An unusable token returns `valid: false` with no identity
   * fields.
   */
  async preview(token: string): Promise<{ invite: OrgInvite; organizationName: string } | null> {
    try {
      const invite = await this.findByToken(token);
      if (!invite || !this.isUsable(invite)) return null;
      const org = await this.orgs.findById(invite.organizationId);
      if (!org || org.status === OrganizationStatus.SUSPENDED) return null;
      return { invite, organizationName: org.name };
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------------- manage

  async resend(id: string, actor: AuthenticatedUser, orgId?: string): Promise<OrgInvite> {
    const invite = await this.getManageable(id, actor, orgId);

    if (invite.lastSentAt) {
      const elapsed = Date.now() - invite.lastSentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        throw new InviteResendCooldownException(Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
      }
    }

    const org = await this.orgs.getById(invite.organizationId);
    // Re-mints. The previous plaintext is unrecoverable by design, so every
    // earlier link dies here — that is the accepted trade for never storing a
    // reversible token.
    const { token, tokenHash } = mintInviteToken();
    invite.tokenHash = tokenHash;
    invite.sendCount += 1;
    invite.lastSentAt = new Date();
    invite.expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * DAY_MS);
    const saved = await this.invites.save(invite);

    await this.sendInviteMail(
      saved,
      org.name,
      token,
      DEFAULT_TTL_DAYS,
      MailTemplate.INVITE_REMINDER,
    );
    return saved;
  }

  async revoke(id: string, actor: AuthenticatedUser, orgId?: string): Promise<OrgInvite> {
    const invite = await this.getManageable(id, actor, orgId);
    invite.status = OrgInviteStatus.REVOKED;
    invite.revokedAt = new Date();
    return this.invites.save(invite);
  }

  // ----------------------------------------------------------------- accept

  /**
   * Redeem an invite as an ANONYMOUS caller, creating the account.
   *
   * Order inside the transaction is load-bearing and must not be rearranged:
   * consume FIRST, then charge. `countSeats` is active users + pending invites,
   * so charging before the invite flips out of `pending` double-counts the
   * accepting invitee — and 409s the last reserved seat, i.e. exactly the person
   * whose seat was already being held for them.
   */
  async accept(dto: AcceptInviteDto): Promise<AcceptResult> {
    const invite = await this.requireConsumable(dto.token);
    const existing = await this.users.findByEmail(invite.email);

    if (existing) return this.acceptAsExistingUser(invite, existing);

    // Hashed BEFORE the transaction opens: argon2 is ~100ms, and holding the
    // org_quotas row lock across it would serialise every concurrent join on the
    // slowest step (users.service.create does the same for the same reason).
    const passwordHash = await argon2.hash(dto.password);

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        await this.consume(manager, invite);
        await this.quotas.assertWithinQuota(
          invite.organizationId,
          QuotaResource.MAX_USERS,
          1,
          manager,
        );
        return this.users.createFromInvite(
          {
            email: invite.email,
            firstName: dto.firstName ?? invite.firstName ?? '',
            lastName: dto.lastName ?? invite.lastName ?? '',
            role: invite.role,
            organizationId: invite.organizationId,
            passwordHash,
          },
          manager,
        );
      });
      await this.mail.enqueue({
        to: user.email,
        template: MailTemplate.WELCOME,
        params: {
          firstName: user.firstName,
          lastName: user.lastName,
          orgName: (await this.orgs.getById(user.organizationId as string)).name,
          loginUrl: this.mail.webUrl('login'),
        },
      });
      return { outcome: 'created', user };
    } catch (err) {
      // The lost half of a concurrent double-accept: the other request consumed
      // the invite and inserted the row, so this one trips users.email's unique
      // index. That is "already accepted", not a generic constraint violation.
      if (err instanceof QueryFailedError && this.isUniqueViolation(err)) {
        throw new InviteNotPendingException('invite_already_accepted');
      }
      throw err;
    }
  }

  /**
   * Redeem as an AUTHENTICATED, org-less user — the transition out of the
   * holding state. No password: the account already has one.
   */
  async claim(actor: AuthenticatedUser, token: string): Promise<User> {
    const invite = await this.requireConsumable(token);

    // The invite is addressed to a person, not to whoever holds the link while
    // signed in as someone else.
    if (invite.email !== actor.email.toLowerCase()) {
      throw new ForbiddenException({
        reason: 'invite_email_mismatch',
        message: 'This invitation was sent to a different email address',
      });
    }

    const user = await this.users.getById(actor.id);
    this.assertEligible(user, invite);
    if (user.organizationId !== null) {
      throw new AccountConflictException(
        user.organizationId === invite.organizationId ? 'account_exists' : 'email_unavailable',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await this.consume(manager, invite);
      // A genuine +1: an org-less student was charged to no tenant, so joining
      // one takes a seat that was not previously held by their user row (only by
      // the pending invite, which the consume above just released).
      await this.quotas.assertWithinQuota(
        invite.organizationId,
        QuotaResource.MAX_USERS,
        1,
        manager,
      );
      await manager
        .getRepository(User)
        .update({ id: user.id }, { organizationId: invite.organizationId, role: invite.role });
      await this.restampDenormalisedOrg(manager, user.id, invite.organizationId);
      return manager.getRepository(User).findOneOrFail({ where: { id: user.id } });
    });
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Loads an invite that is currently redeemable, or throws the specific reason.
   *
   * Expiry is flipped LAZILY here rather than left derived: `expired` is a stored
   * status because `uq_org_invites_org_pending_email` cannot have `now()` in its
   * predicate, so a timed-out row that stays `pending` would hold its address's
   * only slot forever.
   */
  private async requireConsumable(token: string): Promise<OrgInvite> {
    const invite = await this.findByToken(token);
    if (!invite) throw new NotFoundException({ reason: 'invite_not_found' });

    if (invite.status === OrgInviteStatus.ACCEPTED) {
      throw new InviteNotPendingException('invite_already_accepted');
    }
    if (invite.status === OrgInviteStatus.REVOKED) {
      throw new InviteNotPendingException('invite_revoked');
    }
    if (invite.status === OrgInviteStatus.EXPIRED || invite.expiresAt.getTime() <= Date.now()) {
      if (invite.status === OrgInviteStatus.PENDING) {
        await this.invites.update({ id: invite.id }, { status: OrgInviteStatus.EXPIRED });
      }
      throw new InviteNotPendingException('invite_expired');
    }

    // accept/preview are @Public, so TenantContextGuard never ran — the suspended
    // check has to happen here or a suspended tenant keeps absorbing new members.
    const org = await this.orgs.getById(invite.organizationId);
    if (org.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({ reason: 'org_suspended' });
    }
    return invite;
  }

  /** The `accept` branch for an address that already has an account. */
  private async acceptAsExistingUser(invite: OrgInvite, existing: User): Promise<AcceptResult> {
    this.assertEligible(existing, invite);

    if (existing.organizationId === invite.organizationId) {
      // Idempotent: consume the invite so it stops holding a seat, and report
      // membership. No cookies — this path did not authenticate anyone.
      await this.dataSource.transaction((manager) => this.consume(manager, invite));
      return { outcome: 'already_member', user: existing };
    }

    if (existing.organizationId === null) {
      // They must claim it while signed in, so we never move an account into an
      // org on the strength of a link alone.
      throw new AccountConflictException('account_exists', { claimRequired: true });
    }

    // In some other tenant. Opaque on purpose — a distinct code here is a
    // cross-tenant existence oracle for whoever holds the invite link.
    throw new AccountConflictException('email_unavailable');
  }

  /**
   * Refuses to redeem into an account that would be DEMOTED or that is the
   * platform SuperAdmin.
   *
   * Without this, any professor mints a student invite for the SuperAdmin's
   * address; redeeming it writes them into a tenant, and `PlatformGuard`
   * (which requires `organizationId === null`) locks them out of the platform
   * console permanently, with no in-app way back.
   */
  private assertEligible(user: User, invite: OrgInvite): void {
    if (user.role === Role.SUPERADMIN) throw new AccountConflictException('account_ineligible');
    if (ROLE_RANK[user.role] > ROLE_RANK[invite.role]) {
      throw new AccountConflictException('account_ineligible');
    }
    if (!user.isActive) throw new AccountConflictException('account_disabled');
  }

  /**
   * Flips pending -> accepted, conditionally on it still being pending.
   *
   * The `WHERE status = 'pending'` plus `affected !== 1` is the concurrency
   * control: two simultaneous accepts of one token both read a pending row, but
   * only one UPDATE matches. Re-reading and checking in application code would
   * leave the classic read-modify-write race.
   */
  private async consume(manager: EntityManager, invite: OrgInvite): Promise<void> {
    const res = await manager
      .getRepository(OrgInvite)
      .createQueryBuilder()
      .update(OrgInvite)
      .set({ status: OrgInviteStatus.ACCEPTED, acceptedAt: () => 'now()' })
      .where('id = :id AND status = :pending', {
        id: invite.id,
        pending: OrgInviteStatus.PENDING,
      })
      .execute();
    if (res.affected !== 1) throw new InviteNotPendingException('invite_already_accepted');
  }

  /**
   * Re-stamps the rows that denormalise `organization_id`.
   *
   * An org-less student's gamification and submission rows are written with
   * `?? LEGACY_ORG_ID`, so without this they stay attributed to the Legacy tenant
   * forever and the org they just joined under-reports its own activity.
   */
  private async restampDenormalisedOrg(
    manager: EntityManager,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await manager.query('UPDATE user_gamification SET organization_id = $1 WHERE user_id = $2', [
      organizationId,
      userId,
    ]);
    await manager.query('UPDATE submissions SET organization_id = $1 WHERE user_id = $2', [
      organizationId,
      userId,
    ]);
  }

  /**
   * Flips any timed-out pending row for this address to `expired`.
   *
   * This is what keeps `uq_org_invites_org_pending_email` from permanently
   * bricking a re-invite: the index counts a stale `pending` row as occupying the
   * address's one slot, and nothing else would ever clear it.
   */
  private async expireStalePending(
    manager: EntityManager,
    organizationId: string,
    email: string,
  ): Promise<void> {
    await manager
      .getRepository(OrgInvite)
      .createQueryBuilder()
      .update(OrgInvite)
      .set({ status: OrgInviteStatus.EXPIRED })
      .where('organization_id = :organizationId', { organizationId })
      .andWhere('lower(email) = :email', { email })
      .andWhere('status = :pending', { pending: OrgInviteStatus.PENDING })
      .andWhere('expires_at <= now()')
      .execute();
  }

  /** `token_hash` is `select: false`, so it must be requested explicitly. */
  private findByToken(token: string): Promise<OrgInvite | null> {
    return this.invites
      .createQueryBuilder('i')
      .addSelect('i.tokenHash')
      .where('i.tokenHash = :hash', { hash: hashToken(token) })
      .getOne();
  }

  private isUsable(invite: OrgInvite): boolean {
    return invite.status === OrgInviteStatus.PENDING && invite.expiresAt.getTime() > Date.now();
  }

  /** Loads an invite the actor is allowed to manage, or 404s. */
  private async getManageable(
    id: string,
    actor: AuthenticatedUser,
    orgId?: string,
  ): Promise<OrgInvite> {
    const invite = await this.invites.findOne({ where: { id } });
    if (!invite) throw new NotFoundException({ reason: 'invite_not_found' });
    // The platform path pins the org from the route; a mismatch is a 404 rather
    // than a 403 so the SuperAdmin console cannot be used to probe which org an
    // arbitrary invite id belongs to.
    if (orgId !== undefined) {
      if (invite.organizationId !== orgId)
        throw new NotFoundException({ reason: 'invite_not_found' });
    } else {
      assertSameOrg(actor, invite.organizationId);
      assertMayInvite(actor.role, invite.role);
    }
    return invite;
  }

  private isUniqueViolation(err: QueryFailedError): boolean {
    return (err as unknown as { driverError?: { code?: string } })?.driverError?.code === '23505';
  }

  private async sendInviteMail(
    invite: OrgInvite,
    orgName: string,
    token: string,
    expiresInDays: number,
    template?: MailTemplate,
  ): Promise<void> {
    const byRole: Record<string, MailTemplate> = {
      [Role.ADMIN]: MailTemplate.ORG_ADMIN_INVITE,
      [Role.PROFESSOR]: MailTemplate.PROFESSOR_INVITE,
      [Role.STUDENT]: MailTemplate.STUDENT_INVITE,
    };
    await this.mail.enqueue({
      to: invite.email,
      template: template ?? byRole[invite.role] ?? MailTemplate.STUDENT_INVITE,
      params: {
        orgName,
        firstName: invite.firstName,
        lastName: invite.lastName,
        inviterName: null,
        // The one place the raw token appears outside this method's local scope.
        acceptUrl: this.mail.webUrl(`invite/${token}`),
        expiresInDays,
      },
    } as never);
  }
}
