import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { QuotaResource } from '../quotas/enums/quota-resource.enum';
import { QuotaService } from '../quotas/quota.service';
import { User } from '../users/entities/user.entity';
import {
  ApproveOrganizationApplicationDto,
  CreateOrganizationApplicationDto,
} from './dto/organization-application.dto';
import { Organization } from './entities/organization.entity';
import { OrganizationApplication } from './entities/organization-application.entity';
import { OrgApplicationStatus } from './enums/organization-application.enums';
import { OrganizationStatus, OrganizationType } from './enums/organization.enums';
import { isSlugConflict, slugCandidates, slugifyOrgName } from './org-slug.util';

/** Bounded so a pathological name cannot spin. Ten same-named orgs is already absurd. */
const MAX_SLUG_ATTEMPTS = 10;

/**
 * What an approval produced, for the caller to mail after the transaction commits.
 * Returning it rather than mailing inside is the point — see `approve`.
 */
export interface ApprovalOutcome {
  application: OrganizationApplication;
  organization: Organization;
  adminEmail: string;
}

/**
 * Organization self-signup (#118).
 *
 * An institution applies from the public site; a superadmin reviews it; approval
 * creates the tenant, writes its per-role seat caps and mints the org-admin invite in
 * ONE transaction. The admin then invites professors and students, and professors
 * invite students — the closed ecosystem, entered without CodeStack creating anything
 * by hand.
 */
@Injectable()
export class OrganizationApplicationsService {
  private readonly logger = new Logger(OrganizationApplicationsService.name);

  constructor(
    @InjectRepository(OrganizationApplication)
    private readonly applications: Repository<OrganizationApplication>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly quotas: QuotaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Submit an application. NEVER throws for a duplicate, and returns nothing.
   *
   * The caller answers one fixed 202 on every branch. Three cases produce no new row —
   * an address with a pending application, one that already has an account, and a
   * repeat submission — and none may be distinguishable, because this is an
   * unauthenticated endpoint and any difference is an oracle. Specifically:
   *
   *  - "You already applied" would confirm that an address has an application pending.
   *  - Rejecting a duplicate ORGANIZATION NAME would be far worse: an outsider could
   *    discover which universities use CodeStack by submitting names until one bounced.
   *    Names are not unique in reality anyway (several "St. Mary's College" exist), so
   *    the superadmin sees possible duplicates at review time, where a human can tell
   *    two real institutions apart.
   *
   * The applicant already having a CodeStack account is irrelevant here and is not
   * checked: an application is not an account. It becomes relevant only at approval,
   * where the invite machinery resolves it.
   */
  async submit(dto: CreateOrganizationApplicationDto): Promise<void> {
    const contactEmail = dto.contactEmail.toLowerCase();

    // Explicit pre-check so the common case is a clean no-op rather than a caught
    // constraint violation. The partial unique index is still the real arbiter — two
    // simultaneous submissions both pass this check and one loses below.
    const pending = await this.applications
      .createQueryBuilder('a')
      .where('lower(a.contactEmail) = :contactEmail', { contactEmail })
      .andWhere('a.status = :pending', { pending: OrgApplicationStatus.PENDING })
      .getOne();
    if (pending) return;

    let saved: OrganizationApplication;
    try {
      saved = await this.applications.save(
        this.applications.create({
          organizationName: dto.organizationName,
          organizationType: dto.organizationType ?? OrganizationType.UNIVERSITY,
          website: dto.website ?? null,
          contactName: dto.contactName,
          contactEmail,
          message: dto.message ?? '',
          status: OrgApplicationStatus.PENDING,
        }),
      );
    } catch (err) {
      // The loser of a concurrent double-submit. Indistinguishable from success on
      // purpose: the applicant's application exists, just not this copy of it.
      if (isPendingApplicationConflict(err)) return;
      throw err;
    }

    // After the write — a rollback cannot unsend a mail. `enqueue` never throws, so a
    // Redis blip cannot turn a committed application into a 500 for the applicant.
    await this.mail.enqueue({
      to: saved.contactEmail,
      template: MailTemplate.ORG_APPLICATION_RECEIVED,
      params: {
        firstName: firstNameOf(saved.contactName),
        lastName: lastNameOf(saved.contactName),
        organizationName: saved.organizationName,
      },
    });
    await this.alertSuperAdmins(saved);
  }

  /** The review queue. Newest first; optionally narrowed to one status. */
  async list(
    query: PaginationQueryDto,
    status?: OrgApplicationStatus,
  ): Promise<PaginatedResult<OrganizationApplication>> {
    const qb = this.applications.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (status) qb.andWhere('a.status = :status', { status });
    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(data, total, query);
  }

  /**
   * Approve: claim the application, create the tenant, write its seat caps — atomically.
   *
   * WHAT IS AND IS NOT ATOMIC, stated plainly rather than implied.
   *
   * These three ARE one transaction, because every partial combination is broken in its
   * own way: an organization with no quota rows is an unlimited tenant nobody agreed
   * to, and an application marked approved with no organization is a dead end that
   * cannot be re-run.
   *
   * The ADMIN INVITE is deliberately NOT in it. `InvitesService.create` opens its own
   * transaction and mails on success; making it join an outer one would mean threading
   * a manager through invite creation, seat reservation, the stale-pending sweep and the
   * uniqueness pre-check — a refactor of the most security-sensitive service here, to
   * buy atomicity for a failure that is already recoverable. If the invite fails, the
   * tenant exists and is linked to its application, and the superadmin sends the invite
   * from the platform invites surface that already exists. The caller reports exactly
   * that. What must NOT happen — two tenants for one institution — is prevented by the
   * conditional flip below, not by the transaction span.
   *
   * That flip is `UPDATE ... WHERE status = 'pending'` with `affected === 1`. Two
   * simultaneous approvals would otherwise both read a pending row and both create an
   * organization.
   */
  async approve(
    id: string,
    actor: AuthenticatedUser,
    dto: ApproveOrganizationApplicationDto,
  ): Promise<ApprovalOutcome> {
    const application = await this.requirePending(id);

    return this.dataSource.transaction(async (manager) => {
      // 1. Claim the application. Whoever wins this UPDATE owns the approval.
      const flip = await manager
        .createQueryBuilder()
        .update(OrganizationApplication)
        .set({
          status: OrgApplicationStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: () => 'now()',
        })
        .where('id = :id AND status = :pending', {
          id,
          pending: OrgApplicationStatus.PENDING,
        })
        .execute();
      if (flip.affected !== 1) {
        throw new ConflictException({
          reason: 'application_already_reviewed',
          message: 'This application has already been reviewed',
        });
      }

      // 2. The tenant, with a derived slug.
      const organization = await this.insertOrganizationWithDerivedSlug(
        manager,
        application,
        actor,
      );

      // 3. Its seat caps. Both per-role values are required by the DTO, so an approved
      //    tenant always has deliberate caps; `maxUsers` stays optional (absent = no
      //    overall limit, bounded by the per-role caps).
      await this.quotas.setLimit(
        organization.id,
        QuotaResource.MAX_PROFESSORS,
        dto.maxProfessors,
        manager,
      );
      await this.quotas.setLimit(
        organization.id,
        QuotaResource.MAX_STUDENTS,
        dto.maxStudents,
        manager,
      );
      if (dto.maxUsers !== undefined) {
        await this.quotas.setLimit(organization.id, QuotaResource.MAX_USERS, dto.maxUsers, manager);
      }

      // Content caps, required alongside the seat caps so no tenant is created
      // silently unlimited. Same transaction: a committed organization with only
      // some of its caps is the half-provisioned state this block exists to avoid.
      await this.quotas.setLimit(
        organization.id,
        QuotaResource.MAX_PROBLEMS,
        dto.maxProblems,
        manager,
      );
      await this.quotas.setLimit(
        organization.id,
        QuotaResource.MAX_ASSIGNMENTS,
        dto.maxAssignments,
        manager,
      );

      // 4. Link the application to what it produced, for audit. Inside the transaction
      //    so an approved application can never point at an organization that rolled
      //    away.
      await manager
        .getRepository(OrganizationApplication)
        .update({ id }, { organizationId: organization.id });

      /*
       * Re-read rather than hand-spreading the pre-flip row.
       *
       * The earlier version spread `application` and patched two fields, which left
       * `reviewedAt` and `reviewedById` at their pre-flip NULLs — and the DTO projects
       * both, so the console rendered a freshly approved application with no reviewer
       * and no date until someone refreshed. `reject()` already did the re-read; the
       * asymmetry was the bug.
       */
      const refreshed = await manager
        .getRepository(OrganizationApplication)
        .findOneOrFail({ where: { id } });

      return { application: refreshed, organization, adminEmail: dto.adminEmail };
    });
  }

  /** Reject with an optional reason. Conditional flip, same race control as approve. */
  async reject(
    id: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<OrganizationApplication> {
    const application = await this.requirePending(id);

    const flip = await this.applications
      .createQueryBuilder()
      .update(OrganizationApplication)
      .set({
        status: OrgApplicationStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: () => 'now()',
        decisionReason: reason ?? '',
      })
      .where('id = :id AND status = :pending', { id, pending: OrgApplicationStatus.PENDING })
      .execute();
    if (flip.affected !== 1) {
      throw new ConflictException({
        reason: 'application_already_reviewed',
        message: 'This application has already been reviewed',
      });
    }

    await this.mail.enqueue({
      to: application.contactEmail,
      template: MailTemplate.ORG_APPLICATION_REJECTED,
      params: {
        firstName: firstNameOf(application.contactName),
        lastName: lastNameOf(application.contactName),
        organizationName: application.organizationName,
        reason: reason ?? null,
      },
    });

    return this.applications.findOneOrFail({ where: { id } });
  }

  /**
   * Mails the outcome of an approval. Called AFTER the transaction commits.
   *
   * The admin invite mail is sent by the invite machinery itself. This adds the
   * contact-facing note, and ONLY when the contact is not the admin: if they are the
   * same person they already have the invite, and a second mail about one event —
   * one of which looks like it needs an action it does not — is worse than silence.
   */
  async notifyApproved(outcome: ApprovalOutcome): Promise<void> {
    const { application, adminEmail } = outcome;
    if (application.contactEmail.toLowerCase() === adminEmail.toLowerCase()) return;

    await this.mail.enqueue({
      to: application.contactEmail,
      template: MailTemplate.ORG_APPLICATION_APPROVED,
      params: {
        firstName: firstNameOf(application.contactName),
        lastName: lastNameOf(application.contactName),
        organizationName: application.organizationName,
        adminEmail,
      },
    });
  }

  // ---------------------------------------------------------------- helpers

  private async requirePending(id: string): Promise<OrganizationApplication> {
    const application = await this.applications.findOne({ where: { id } });
    if (!application) throw new NotFoundException({ reason: 'application_not_found' });
    if (application.status !== OrgApplicationStatus.PENDING) {
      throw new ConflictException({
        reason: 'application_already_reviewed',
        message: 'This application has already been reviewed',
      });
    }
    return application;
  }

  /**
   * Inserts the organization, deriving its slug and retrying on a collision.
   *
   * THE SAVEPOINT IS LOAD-BEARING, and its absence is the bug this comment exists to
   * prevent. In Postgres an integrity error ABORTS the whole transaction: every
   * subsequent statement fails with "current transaction is aborted" until a rollback.
   * So retrying the insert directly would not produce `acme-2` — it would kill the
   * approval outright, and the second approval of a similarly-named organization would
   * fail forever while looking like an unrelated database fault.
   *
   * A pre-flight `SELECT ... WHERE slug = ?` is not an alternative: two approvals in
   * the same moment both read "free" and the second still violates the unique index.
   * The index is the only real arbiter, so the shape has to be try-insert-and-recover.
   */
  private async insertOrganizationWithDerivedSlug(
    manager: EntityManager,
    application: OrganizationApplication,
    actor: AuthenticatedUser,
  ): Promise<Organization> {
    const base = slugifyOrgName(application.organizationName);
    const repo = manager.getRepository(Organization);
    let lastError: unknown;

    for (const slug of slugCandidates(base, MAX_SLUG_ATTEMPTS)) {
      await manager.query('SAVEPOINT org_slug_attempt');
      try {
        const organization = await repo.save(
          repo.create({
            name: application.organizationName,
            slug,
            type: application.organizationType,
            status: OrganizationStatus.ACTIVE,
            settings: {},
            createdById: actor.id,
          }),
        );
        await manager.query('RELEASE SAVEPOINT org_slug_attempt');
        return organization;
      } catch (err) {
        // Roll back to before the failed insert so the transaction is usable again.
        await manager.query('ROLLBACK TO SAVEPOINT org_slug_attempt');
        if (!isSlugConflict(err)) throw err; // not a slug clash — a real failure
        lastError = err;
      }
    }

    // Ten collisions on one name. Something is wrong that another attempt will not fix,
    // so the driver error is LOGGED (it carries the constraint detail a human needs) and
    // an actionable conflict is thrown. Rethrowing the raw error instead would surface
    // as "Database constraint violation" through the exception filter, which tells the
    // superadmin nothing about what to do.
    this.logger.error(
      `Could not derive a free slug for "${application.organizationName}" after ` +
        `${MAX_SLUG_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    throw new ConflictException({
      reason: 'slug_unavailable',
      message: 'Could not derive a unique short name for this organization',
    });
  }

  /**
   * Mails every superadmin. Best-effort by construction: `enqueue` never throws, and
   * an alert that fails must not undo an application that is already committed.
   */
  private async alertSuperAdmins(application: OrganizationApplication): Promise<void> {
    const superAdmins = await this.dataSource
      .getRepository(User)
      .find({ where: { role: Role.SUPERADMIN, isActive: true } });

    if (!superAdmins.length) {
      // Worth an error line: an application nobody is told about is an institution
      // that waits, gives up, and goes elsewhere.
      this.logger.error(
        `Organization application ${application.id} received but NO active superadmin exists to review it`,
      );
      return;
    }

    const reviewUrl = this.mail.webUrl('home/platform/organization-applications');
    for (const admin of superAdmins) {
      await this.mail.enqueue({
        to: admin.email,
        template: MailTemplate.ORG_APPLICATION_ALERT,
        params: {
          organizationName: application.organizationName,
          contactName: application.contactName,
          contactEmail: application.contactEmail,
          website: application.website,
          message: application.message || null,
          reviewUrl,
        },
      });
    }
  }
}

/** Postgres unique violation on the one-pending-application-per-address index. */
function isPendingApplicationConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; driverError?: { code?: unknown } };
  return (e.code ?? e.driverError?.code) === '23505';
}

/**
 * The application form collects ONE name field, because asking an institution's
 * procurement contact to split their name into two boxes is friction for no gain. The
 * mail templates take `firstName`/`lastName` like every other recipient, so the single
 * field is split on the first space — first token as the given name, the remainder as
 * the family name.
 *
 * Deliberately naive, and safe because of where it is used: `displayName` joins the two
 * back together for the greeting, so a mononym, a multi-part surname or a name in an
 * order this heuristic gets wrong all still render as exactly what the person typed.
 */
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}
