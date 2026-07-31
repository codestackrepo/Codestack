import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { JOB_SEND_MAIL, MAIL_JOB_OPTIONS, QUEUE_MAIL } from '../../../queue/queue.constants';
import { MailService } from '../../mail/mail.service';
import { MailTemplate } from '../../mail/mail.types';
import { OrganizationsService } from '../../organizations/organizations.service';
import { QuotaResource } from '../../quotas/enums/quota-resource.enum';
import { QuotaService } from '../../quotas/quota.service';
import { OrgInviteKind, OrgInviteSource, OrgInviteStatus } from '../enums/org-invite.enums';
import { mintInviteToken } from '../invite-token.util';
import { BulkInviteResultDto, CommitBulkInviteDto, RosterPreviewDto } from './dto/bulk-invite.dto';
import { classifyRoster, summarize } from './roster-classifier';
import { parseRoster } from './roster-parser';
import { RosterStagingService } from './roster-staging.service';
import {
  ClassifiedRosterRow,
  ConflictUser,
  RosterAction,
  RosterConflicts,
  RosterReason,
  StagedRosterRow,
} from './roster.types';

/** Postgres caps parameters per statement; chunk the `= ANY($1)` lookups well under it. */
const LOOKUP_CHUNK = 1000;
const INVITE_TTL_DAYS = 14;
const DAY_MS = 86_400_000;

@Injectable()
export class BulkInviteService {
  private readonly logger = new Logger(BulkInviteService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_MAIL) private readonly mailQueue: Queue,
    private readonly staging: RosterStagingService,
    private readonly quotas: QuotaService,
    private readonly orgs: OrganizationsService,
    private readonly mail: MailService,
  ) {}

  /**
   * Parse -> classify -> quota pre-flight -> stage.
   *
   * Performs ZERO Postgres mutations. Everything an admin sees before pressing
   * commit is a read, so an abandoned preview leaves nothing behind and a preview
   * of a hostile file cannot change any state.
   */
  async preview(
    file: Express.Multer.File,
    actor: AuthenticatedUser,
    organizationId: string,
  ): Promise<RosterPreviewDto> {
    const parsed = await parseRoster(file.buffer);
    const conflicts = await this.loadConflicts(
      parsed.rows.map((r) => r.email),
      organizationId,
      this.dataSource.manager,
    );
    const rows = classifyRoster(parsed.rows, conflicts, actor);
    const summary = summarize(rows, parsed.errors.length);

    // Advisory only — documented lock-free. It exists so the admin is never shown
    // a preview they cannot commit; `assertWithinQuota` inside the commit
    // transaction is what makes the limit an invariant.
    const seatsAvailable = await this.quotas.checkHeadroom(organizationId, QuotaResource.MAX_USERS);

    const accepted: StagedRosterRow[] = rows
      .filter(
        (r): r is ClassifiedRosterRow & { action: RosterAction.INVITE | RosterAction.CLAIM } =>
          r.action === RosterAction.INVITE || r.action === RosterAction.CLAIM,
      )
      .map((r) => ({
        rowNumber: r.rowNumber,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        action: r.action,
      }));

    const pendingResendable = rows
      .filter((r) => r.reason === RosterReason.INVITE_ALREADY_PENDING)
      .map((r) => r.email);

    const stagingKey = await this.staging.stage(accepted, pendingResendable, actor, organizationId);

    return {
      stagingKey,
      summary,
      rows,
      errors: parsed.errors,
      warnings: parsed.warnings,
      // null means UNLIMITED, end to end. Coalescing it to 0 here would turn
      // every uncapped org into a blocked one.
      seatsAvailable,
      canCommit: seatsAvailable === null || summary.seatsRequired <= seatsAvailable,
    };
  }

  /**
   * Re-validate, charge, insert, then mail.
   *
   * A file that is 100% skips commits successfully with `invited: 0` — "everyone
   * in this file is already a member" is a valid outcome, not an error.
   */
  async commit(
    dto: CommitBulkInviteDto,
    actor: AuthenticatedUser,
    organizationId: string,
  ): Promise<BulkInviteResultDto> {
    // Authorized BEFORE anything is deleted or written.
    const staged = await this.staging.load(dto.stagingKey, actor, organizationId);
    const org = await this.orgs.getById(organizationId);

    const excluded = new Set(dto.excludeRowNumbers ?? []);
    const candidates = staged.rows.filter((r) => !excluded.has(r.rowNumber));

    let minted: {
      id: string;
      email: string;
      token: string;
      firstName: string;
      lastName: string;
    }[] = [];
    let warnings: string[] = [];
    let skipped = staged.rows.length - candidates.length;

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        // (1) Re-classify against CURRENT state inside the transaction. The world
        // moved on between preview and commit — someone accepted an invite, an
        // admin added a member by hand.
        const conflicts = await this.loadConflicts(
          candidates.map((r) => r.email),
          organizationId,
          manager,
        );
        const reclassified = classifyRoster(
          candidates.map((r) => ({
            rowNumber: r.rowNumber,
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
          })),
          conflicts,
          actor,
        );

        const stillActionable = reclassified.filter(
          (r) => r.action === RosterAction.INVITE || r.action === RosterAction.CLAIM,
        );
        const drifted = reclassified.filter(
          (r) => r.action !== RosterAction.INVITE && r.action !== RosterAction.CLAIM,
        );

        // Benign drift — the row became `already_member`, i.e. the batch's intent
        // for that person is ALREADY ACHIEVED — is a warning, not a failure.
        // Aborting there would make a concurrent single-invite acceptance blow up
        // an unrelated 2000-row commit.
        const seatAffecting = drifted.filter((r) => r.action === RosterAction.ERROR);
        if (seatAffecting.length) {
          throw new ConflictException({
            reason: 'roster_state_changed',
            changedRows: seatAffecting.map((r) => ({
              rowNumber: r.rowNumber,
              email: r.email,
              reason: r.reason,
            })),
            message: 'Some rows changed since the preview. Review the file and upload it again.',
          });
        }
        const driftWarnings = drifted.map(
          (r) => `Row ${r.rowNumber} (${r.email}) was skipped: ${r.reason}`,
        );

        // (2) Charge for what is ACTUALLY left, recomputed after exclusion and
        // after drift — not the number the preview happened to show.
        await this.quotas.assertWithinQuota(
          organizationId,
          QuotaResource.MAX_USERS,
          stillActionable.length,
          manager,
        );

        // (3) One multi-row insert. ON CONFLICT DO NOTHING against the partial
        // unique index is what makes this safe for an UNCAPPED org, where
        // assertWithinQuota returns early holding no lock and two concurrent
        // commits could otherwise both insert the same address.
        const inserted = await this.insertInvites(manager, stillActionable, organizationId, actor);

        // (4) Optional resend. Rotates the token on the EXISTING pending row —
        // never a second insert, which uq_org_invites_org_pending_email would
        // reject anyway. Costs no seat: the row already holds one.
        const resent = dto.resendPending
          ? await this.resendPending(manager, staged.pendingResendable, organizationId)
          : [];

        return { inserted: [...inserted, ...resent], driftWarnings, driftSkipped: drifted.length };
      });

      minted = result.inserted;
      warnings = result.driftWarnings;
      skipped += result.driftSkipped;
    } catch (err) {
      // Keep the staged roster alive: the usual failure is `quota_exceeded`, which
      // the admin fixes by raising the cap. Losing the key would force a
      // re-upload and re-review to change one number.
      await this.staging.extend(dto.stagingKey);
      throw err;
    }

    // Only now — a rollback cannot unsend mail.
    await this.staging.discard(dto.stagingKey);
    await this.enqueueInviteMails(minted, org.name);

    const claimedRows = new Set(
      staged.rows.filter((r) => r.action === RosterAction.CLAIM).map((r) => r.email),
    );
    const claimed = minted.filter((m) => claimedRows.has(m.email)).length;

    return { invited: minted.length - claimed, claimed, skipped, warnings };
  }

  // ------------------------------------------------------------------ internals

  /**
   * Two batched lookups, chunked.
   *
   * `email = ANY($1::text[])` on already-lowercased input, NOT
   * `lower(email) = ANY(...)`. Three reasons: writes are already lowercase, so the
   * comparison is equivalent; `idx_user_email` is on the raw column and `lower()`
   * would not use it; and `lower()` matching can return MORE THAN ONE row for a
   * single roster address, which the classifier's `Map` assumes cannot happen.
   */
  private async loadConflicts(
    emails: string[],
    organizationId: string,
    manager: EntityManager,
  ): Promise<RosterConflicts> {
    const usersByEmail = new Map<string, ConflictUser>();
    const pendingInThisOrg = new Set<string>();
    if (!emails.length) return { usersByEmail, pendingInThisOrg };

    const unique = [...new Set(emails.map((e) => e.toLowerCase()))];

    for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
      const chunk = unique.slice(i, i + LOOKUP_CHUNK);

      // Never selects another tenant's `email` into the service layer beyond what
      // the classifier needs to say "not available" — id/role/org/active only.
      const users = (await manager.query(
        `SELECT id, email, role, organization_id, is_active
           FROM users WHERE email = ANY($1::text[])`,
        [chunk],
      )) as {
        id: string;
        email: string;
        role: string;
        organization_id: string | null;
        is_active: boolean;
      }[];
      for (const u of users) {
        usersByEmail.set(u.email, {
          id: u.id,
          role: u.role,
          organizationId: u.organization_id,
          isActive: u.is_active,
        });
      }

      // Scoped to THIS org: a pending invite elsewhere is deliberately invisible,
      // since "another tenant is recruiting them" is not this tenant's business.
      const invites = (await manager.query(
        `SELECT lower(email) AS email FROM org_invites
          WHERE organization_id = $1
            AND lower(email) = ANY($2::text[])
            AND status = $3
            AND expires_at > now()`,
        [organizationId, chunk, OrgInviteStatus.PENDING],
      )) as { email: string }[];
      for (const i2 of invites) pendingInThisOrg.add(i2.email);
    }

    return { usersByEmail, pendingInThisOrg };
  }

  /**
   * Re-mints the token on invites that are already pending for this org.
   *
   * An UPDATE, never an INSERT: the row exists and holds its seat, so a second
   * row would both double-charge and violate the partial unique index. The old
   * link dies the moment the hash is replaced — that is the accepted trade for
   * never storing a reversible token.
   */
  private async resendPending(
    manager: EntityManager,
    emails: string[],
    organizationId: string,
  ): Promise<{ id: string; email: string; token: string; firstName: string; lastName: string }[]> {
    if (!emails.length) return [];

    const out: { id: string; email: string; token: string; firstName: string; lastName: string }[] =
      [];
    for (const email of emails) {
      const { token, tokenHash } = mintInviteToken();
      const rows = (await manager.query(
        `UPDATE org_invites
            SET token_hash = $1,
                send_count = send_count + 1,
                last_sent_at = now(),
                expires_at = now() + ($2 || ' days')::interval
          WHERE organization_id = $3
            AND lower(email) = $4
            AND status = $5
          RETURNING id, email, first_name, last_name`,
        [
          tokenHash,
          String(INVITE_TTL_DAYS),
          organizationId,
          email.toLowerCase(),
          OrgInviteStatus.PENDING,
        ],
      )) as { id: string; email: string; first_name: string | null; last_name: string | null }[];

      for (const r of rows) {
        out.push({
          id: r.id,
          email: r.email,
          token,
          firstName: r.first_name ?? '',
          lastName: r.last_name ?? '',
        });
      }
    }
    return out;
  }

  /** One statement for the whole batch. Returns only the rows that actually landed. */
  private async insertInvites(
    manager: EntityManager,
    rows: ClassifiedRosterRow[],
    organizationId: string,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; email: string; token: string; firstName: string; lastName: string }[]> {
    if (!rows.length) return [];

    const batchId = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS);
    const tokens = rows.map(() => mintInviteToken());

    const values: unknown[] = [];
    const tuples = rows.map((row, i) => {
      const base = i * 12;
      values.push(
        organizationId,
        row.email,
        tokens[i].tokenHash,
        Role.STUDENT, // bulk mints students only; the parser rejects any other role
        OrgInviteStatus.PENDING,
        row.action === RosterAction.CLAIM ? OrgInviteKind.CLAIM : OrgInviteKind.NEW_ACCOUNT,
        OrgInviteSource.BULK,
        row.firstName || null,
        row.lastName || null,
        actor.id,
        expiresAt,
        batchId,
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},1,now())`;
    });

    const inserted = (await manager.query(
      `INSERT INTO org_invites
         (organization_id, email, token_hash, role, status, kind, source,
          first_name, last_name, invited_by_id, expires_at, batch_id, send_count, last_sent_at)
       VALUES ${tuples.join(',')}
       ON CONFLICT (organization_id, lower(email)) WHERE status = 'pending'
       DO NOTHING
       RETURNING id, email`,
      values,
    )) as { id: string; email: string }[];

    // Re-pair the returned rows with their raw tokens. RETURNING order is not
    // guaranteed to match VALUES order, and a conflict drops rows entirely, so
    // matching by index would mail the wrong token to the wrong person.
    const tokenByEmail = new Map(rows.map((r, i) => [r.email, tokens[i].token]));
    const nameByEmail = new Map(rows.map((r) => [r.email, r]));
    return inserted.map((r) => ({
      id: r.id,
      email: r.email,
      token: tokenByEmail.get(r.email) as string,
      firstName: nameByEmail.get(r.email)?.firstName ?? '',
      lastName: nameByEmail.get(r.email)?.lastName ?? '',
    }));
  }

  /**
   * One job per recipient via `addBulk`.
   *
   * `jobId: invite-mail:${inviteId}` is never undefined — a undefined jobId makes
   * BullMQ generate one, and the dedupe that protects against a double-clicked
   * commit silently stops working.
   */
  private async enqueueInviteMails(
    minted: { id: string; email: string; token: string; firstName: string; lastName: string }[],
    orgName: string,
  ): Promise<void> {
    if (!minted.length) return;
    try {
      await this.mailQueue.addBulk(
        minted.map((m) => ({
          name: JOB_SEND_MAIL,
          data: {
            to: m.email,
            template: MailTemplate.STUDENT_INVITE,
            params: {
              orgName,
              firstName: m.firstName,
              lastName: m.lastName,
              inviterName: null,
              acceptUrl: this.mail.webUrl(`invite/${m.token}`),
              expiresInDays: INVITE_TTL_DAYS,
            },
          },
          opts: { ...MAIL_JOB_OPTIONS, jobId: `invite-mail:${m.id}` },
        })),
      );
    } catch (err) {
      // The invites are COMMITTED. A Redis blip must not turn a successful commit
      // into a 500 that invites the admin to re-upload — Resend recovers a mail,
      // nothing recovers from duplicate invites.
      this.logger.error(`Failed to enqueue ${minted.length} bulk invite mails: ${String(err)}`);
    }
  }
}
