import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Webhook } from 'svix';
import { ClerkConfig } from '../../config/configuration';
import { WebhookEvent } from '../billing/entities/webhook-event.entity';
import { WebhookEventStatus } from '../billing/enums/billing.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { OrgInvite } from './entities/org-invite.entity';
import { OrgInviteStatus } from './enums/org-invite.enums';
import {
  ClerkDeletedData,
  ClerkInvitationData,
  ClerkMembershipData,
  ClerkOrganizationData,
  ClerkUserData,
  ClerkWebhookEvent,
  isSuperAdminMetadata,
  mapClerkOrgRole,
  primaryEmailOf,
} from './clerk-webhook.types';

const PROVIDER = 'clerk';
const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface SvixHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

/** Thrown when the inbound webhook fails svix signature verification — a malformed request, not a server fault. */
export class ClerkWebhookSignatureError extends Error {}

/**
 * Verifies + idempotently dedupes inbound Clerk webhooks, then reconciles the
 * local mirror (users / organizations / memberships / invitations). Mirrors the
 * Stripe BillingWebhookService: `@Public`, svix over the RAW body, dedup via the
 * shared `webhook_events` ledger (`provider='clerk'`, `event_id=svix-id`).
 *
 * Every handler is an idempotent upsert keyed on a STABLE Clerk id
 * (clerkUserId / clerkOrgId / clerkInvitationId) and arrival-order tolerant: the
 * membership handler embeds enough to provision the org + user together, so a
 * membership arriving before `user.created` never deadlocks on
 * chk_users_org_required. Clerk is the single write-authority for role/org
 * (Clerk -> webhook -> DB).
 */
@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);
  private readonly signingSecret: string;

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly orgs: OrganizationsService,
    @InjectRepository(WebhookEvent) private readonly events: Repository<WebhookEvent>,
    @InjectRepository(OrgInvite) private readonly invites: Repository<OrgInvite>,
  ) {
    this.signingSecret = config.get<ClerkConfig>('clerk')?.webhookSigningSecret ?? '';
  }

  async handle(rawBody: Buffer, headers: SvixHeaders): Promise<void> {
    const event = this.verify(rawBody, headers);

    const inserted = await this.tryRecordEvent(headers.id, event);
    if (!inserted) {
      this.logger.log(`Ignoring redelivered Clerk webhook ${headers.id} (${event.type})`);
      return;
    }

    try {
      await this.dispatch(event);
      await this.events.update(
        { provider: PROVIDER, eventId: headers.id },
        { status: WebhookEventStatus.PROCESSED, processedAt: new Date() },
      );
    } catch (err) {
      await this.events.update(
        { provider: PROVIDER, eventId: headers.id },
        { status: WebhookEventStatus.FAILED, processedAt: new Date() },
      );
      throw err;
    }
  }

  private verify(rawBody: Buffer, headers: SvixHeaders): ClerkWebhookEvent {
    if (!this.signingSecret) {
      throw new ClerkWebhookSignatureError('Clerk webhook signing secret not configured');
    }
    try {
      const wh = new Webhook(this.signingSecret);
      return wh.verify(rawBody.toString('utf8'), {
        'svix-id': headers.id,
        'svix-timestamp': headers.timestamp,
        'svix-signature': headers.signature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      throw new ClerkWebhookSignatureError((err as Error).message);
    }
  }

  /** Returns false (no-op) when this svix-id was already recorded — the idempotency gate. */
  private async tryRecordEvent(svixId: string, event: ClerkWebhookEvent): Promise<boolean> {
    try {
      const row = this.events.create({
        provider: PROVIDER,
        eventId: svixId,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
      });
      await this.events.save(row);
      return true;
    } catch (err) {
      if (this.isUniqueViolation(err)) return false;
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as { driverError?: { code?: string } }).driverError?.code === POSTGRES_UNIQUE_VIOLATION
    );
  }

  private async dispatch(event: ClerkWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        return this.handleUserUpserted(event.data as unknown as ClerkUserData);
      case 'user.deleted':
        return this.handleUserDeleted(event.data as unknown as ClerkDeletedData);
      case 'organization.created':
      case 'organization.updated':
        return this.handleOrganizationUpserted(event.data as unknown as ClerkOrganizationData);
      case 'organization.deleted':
        return this.handleOrganizationDeleted(event.data as unknown as ClerkDeletedData);
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        return this.handleMembershipUpserted(event.data as unknown as ClerkMembershipData);
      case 'organizationMembership.deleted':
        // Deliberately log-only. A hard demotion here is NOT arrival-order safe
        // (a deleted-then-recreated reorder would wrongly strip access), so
        // membership removal is owned by the org admin console (#62), which
        // mutates Clerk + reconciles deterministically.
        this.logger.log(
          `organizationMembership.deleted for user ${(event.data as unknown as ClerkMembershipData).public_user_data?.user_id} — no local mutation (owned by #62)`,
        );
        return;
      case 'organizationInvitation.created':
        return this.handleInvitationUpserted(
          event.data as unknown as ClerkInvitationData,
          OrgInviteStatus.PENDING,
        );
      case 'organizationInvitation.accepted':
        return this.handleInvitationUpserted(
          event.data as unknown as ClerkInvitationData,
          OrgInviteStatus.ACCEPTED,
        );
      case 'organizationInvitation.revoked':
        return this.handleInvitationUpserted(
          event.data as unknown as ClerkInvitationData,
          OrgInviteStatus.REVOKED,
        );
      default:
        // Clerk sends many event types to one destination; ignore the ones we
        // don't act on so the endpoint stays forward-compatible.
        this.logger.debug(`Ignoring unhandled Clerk event ${event.type}`);
        return;
    }
  }

  private async handleUserUpserted(data: ClerkUserData): Promise<void> {
    const email = primaryEmailOf(data);
    if (!email) {
      this.logger.warn(`Clerk user ${data.id} has no email address — skipping`);
      return;
    }
    await this.users.syncFromClerkUser({
      clerkUserId: data.id,
      email,
      firstName: data.first_name ?? '',
      lastName: data.last_name ?? '',
      isActive: data.banned !== true,
      isSuperAdmin: isSuperAdminMetadata(data.public_metadata),
    });
  }

  private async handleUserDeleted(data: ClerkDeletedData): Promise<void> {
    await this.users.deactivateByClerkId(data.id);
  }

  private async handleOrganizationUpserted(data: ClerkOrganizationData): Promise<void> {
    await this.orgs.upsertFromClerk({
      clerkOrgId: data.id,
      name: data.name ?? '',
      slug: data.slug ?? '',
    });
  }

  private async handleOrganizationDeleted(data: ClerkDeletedData): Promise<void> {
    await this.orgs.suspendByClerkId(data.id);
  }

  private async handleMembershipUpserted(data: ClerkMembershipData): Promise<void> {
    // Upsert the org from the EMBEDDED organization first (order tolerance: the
    // org may not have been mirrored by an organization.created yet).
    const org = await this.orgs.upsertFromClerk({
      clerkOrgId: data.organization.id,
      name: data.organization.name ?? '',
      slug: data.organization.slug ?? '',
    });

    const pud = data.public_user_data;
    const known = await this.users.findByClerkId(pud.user_id);
    const email = pud.identifier ?? known?.email ?? null;
    if (!email) {
      // Can't provision a brand-new user without an email; user.created carries
      // it, and a later membership.updated re-stamps org+role. Stay order-tolerant.
      this.logger.warn(
        `membership for ${pud.user_id} has no identifier and no local user yet — deferring to user.created`,
      );
      return;
    }

    await this.users.syncClerkMembership({
      clerkUserId: pud.user_id,
      email,
      firstName: pud.first_name ?? known?.firstName ?? '',
      lastName: pud.last_name ?? known?.lastName ?? '',
      organizationId: org.id,
      role: mapClerkOrgRole(data.role),
    });
  }

  private async handleInvitationUpserted(
    data: ClerkInvitationData,
    status: OrgInviteStatus,
  ): Promise<void> {
    const clerkOrgId = data.organization_id ?? null;
    const org = clerkOrgId ? await this.orgs.findByClerkOrgId(clerkOrgId) : null;
    if (!org) {
      // Order tolerance: the invitation references an org we haven't mirrored yet
      // (Clerk doesn't resend invitations). The reconciliation job backfills it.
      this.logger.warn(
        `invitation ${data.id} references unmirrored org ${clerkOrgId ?? '(none)'} — skipping mirror`,
      );
      return;
    }

    // The invitation ticket metadata is authoritative for the role the invitee
    // will hold (our custom field), falling back to the Clerk org role.
    const role = mapClerkOrgRole(
      data.public_metadata?.role ?? data.private_metadata?.role ?? data.role ?? null,
    );
    const email = (data.email_address ?? '').toLowerCase();

    const existing = await this.invites.findOne({ where: { clerkInvitationId: data.id } });
    const row =
      existing ??
      this.invites.create({ clerkInvitationId: data.id, organizationId: org.id, email });
    row.organizationId = org.id;
    if (email) row.email = email;
    row.role = role;
    row.status = status;

    try {
      await this.invites.save(row);
    } catch (err) {
      // Race on uq_org_invites_clerk_invitation — re-load and re-apply the status.
      if (this.isUniqueViolation(err)) {
        const raced = await this.invites.findOne({ where: { clerkInvitationId: data.id } });
        if (raced) {
          raced.status = status;
          await this.invites.save(raced);
          return;
        }
      }
      throw err;
    }
  }
}
