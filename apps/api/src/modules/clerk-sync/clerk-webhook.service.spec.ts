import { ConfigService } from '@nestjs/config';
import { QueryFailedError, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { WebhookEvent } from '../billing/entities/webhook-event.entity';
import { WebhookEventStatus } from '../billing/enums/billing.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { OrgInvite } from './entities/org-invite.entity';
import { OrgInviteStatus } from './enums/org-invite.enums';
import {
  ClerkWebhookService,
  ClerkWebhookSignatureError,
  SvixHeaders,
} from './clerk-webhook.service';
import { ClerkWebhookEvent } from './clerk-webhook.types';

// svix's Webhook is stubbed so we drive verify() deterministically.
const mockVerify = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({ verify: mockVerify })),
}));

const HEADERS: SvixHeaders = { id: 'msg_1', timestamp: '1700000000', signature: 'v1,sig' };
const BODY = Buffer.from('{"raw":true}');

function pgUnique(): QueryFailedError {
  const driver = Object.assign(new Error('dup'), { code: '23505' });
  return new QueryFailedError('INSERT', [], driver as unknown as Error);
}

function setup(signingSecret = 'whsec_test') {
  const users = {
    syncFromClerkUser: jest.fn().mockResolvedValue({ id: 'u' }),
    syncClerkMembership: jest.fn().mockResolvedValue({ id: 'u' }),
    deactivateByClerkId: jest.fn().mockResolvedValue(undefined),
    findByClerkId: jest.fn().mockResolvedValue(null),
  };
  const orgs = {
    upsertFromClerk: jest.fn().mockResolvedValue({ id: 'local-org-1' }),
    suspendByClerkId: jest.fn().mockResolvedValue(undefined),
    findByClerkOrgId: jest.fn().mockResolvedValue({ id: 'local-org-1' }),
  };
  const events = {
    create: jest.fn((d) => d),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const invites = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d) => d),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn(() => ({ webhookSigningSecret: signingSecret })) };
  const svc = new ClerkWebhookService(
    config as unknown as ConfigService,
    users as unknown as UsersService,
    orgs as unknown as OrganizationsService,
    events as unknown as Repository<WebhookEvent>,
    invites as unknown as Repository<OrgInvite>,
  );
  return { svc, users, orgs, events, invites };
}

function drive(event: ClerkWebhookEvent) {
  mockVerify.mockReturnValue(event);
}

beforeEach(() => {
  mockVerify.mockReset();
});

describe('ClerkWebhookService — verification & idempotency', () => {
  it('throws a signature error (never a 500) when svix verification fails', async () => {
    const { svc, events } = setup();
    mockVerify.mockImplementation(() => {
      throw new Error('no matching signature');
    });
    await expect(svc.handle(BODY, HEADERS)).rejects.toBeInstanceOf(ClerkWebhookSignatureError);
    expect(events.save).not.toHaveBeenCalled();
  });

  it('throws a signature error when the signing secret is not configured', async () => {
    const { svc } = setup('');
    drive({ type: 'user.created', data: {} });
    await expect(svc.handle(BODY, HEADERS)).rejects.toBeInstanceOf(ClerkWebhookSignatureError);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('records the event keyed on svix-id, then marks it PROCESSED', async () => {
    const { svc, events } = setup();
    drive({ type: 'user.created', data: { id: 'user_1', email_addresses: [] } });
    await svc.handle(BODY, HEADERS);
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'clerk', eventId: 'msg_1', type: 'user.created' }),
    );
    expect(events.update).toHaveBeenCalledWith(
      { provider: 'clerk', eventId: 'msg_1' },
      expect.objectContaining({ status: WebhookEventStatus.PROCESSED }),
    );
  });

  it('is idempotent: a redelivered event (23505 on insert) does NOT dispatch', async () => {
    const { svc, events, users } = setup();
    events.save.mockRejectedValueOnce(pgUnique());
    drive({ type: 'user.deleted', data: { id: 'user_1' } });
    await expect(svc.handle(BODY, HEADERS)).resolves.toBeUndefined();
    expect(users.deactivateByClerkId).not.toHaveBeenCalled();
    expect(events.update).not.toHaveBeenCalled(); // never re-processed
  });

  it('marks the event FAILED and rethrows when a handler throws', async () => {
    const { svc, events, users } = setup();
    users.deactivateByClerkId.mockRejectedValueOnce(new Error('db down'));
    drive({ type: 'user.deleted', data: { id: 'user_1' } });
    await expect(svc.handle(BODY, HEADERS)).rejects.toThrow('db down');
    expect(events.update).toHaveBeenCalledWith(
      { provider: 'clerk', eventId: 'msg_1' },
      expect.objectContaining({ status: WebhookEventStatus.FAILED }),
    );
  });

  it('ignores an unhandled event type without touching users/orgs', async () => {
    const { svc, users, orgs } = setup();
    drive({ type: 'session.created', data: {} });
    await svc.handle(BODY, HEADERS);
    expect(users.syncFromClerkUser).not.toHaveBeenCalled();
    expect(orgs.upsertFromClerk).not.toHaveBeenCalled();
  });
});

describe('ClerkWebhookService — user events', () => {
  it('maps user.created to syncFromClerkUser (primary email, active, superadmin)', async () => {
    const { svc, users } = setup();
    drive({
      type: 'user.created',
      data: {
        id: 'user_1',
        email_addresses: [
          { id: 'e1', email_address: 'a@x.dev' },
          { id: 'e2', email_address: 'primary@x.dev' },
        ],
        primary_email_address_id: 'e2',
        first_name: 'Ada',
        last_name: 'L',
        banned: false,
        public_metadata: { role: 'superadmin' },
      },
    });
    await svc.handle(BODY, HEADERS);
    expect(users.syncFromClerkUser).toHaveBeenCalledWith({
      clerkUserId: 'user_1',
      email: 'primary@x.dev',
      firstName: 'Ada',
      lastName: 'L',
      isActive: true,
      isSuperAdmin: true,
    });
  });

  it('treats banned=true as inactive', async () => {
    const { svc, users } = setup();
    drive({
      type: 'user.updated',
      data: {
        id: 'user_1',
        email_addresses: [{ id: 'e1', email_address: 'a@x.dev' }],
        banned: true,
      },
    });
    await svc.handle(BODY, HEADERS);
    expect(users.syncFromClerkUser).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, isSuperAdmin: false }),
    );
  });

  it('skips a user with no email address', async () => {
    const { svc, users } = setup();
    drive({ type: 'user.created', data: { id: 'user_1', email_addresses: [] } });
    await svc.handle(BODY, HEADERS);
    expect(users.syncFromClerkUser).not.toHaveBeenCalled();
  });

  it('deactivates on user.deleted', async () => {
    const { svc, users } = setup();
    drive({ type: 'user.deleted', data: { id: 'user_1', deleted: true } });
    await svc.handle(BODY, HEADERS);
    expect(users.deactivateByClerkId).toHaveBeenCalledWith('user_1');
  });
});

describe('ClerkWebhookService — organization events', () => {
  it('upserts on organization.created', async () => {
    const { svc, orgs } = setup();
    drive({
      type: 'organization.created',
      data: { id: 'org_clerk_1', name: 'Acme U', slug: 'acme' },
    });
    await svc.handle(BODY, HEADERS);
    expect(orgs.upsertFromClerk).toHaveBeenCalledWith({
      clerkOrgId: 'org_clerk_1',
      name: 'Acme U',
      slug: 'acme',
    });
  });

  it('suspends on organization.deleted', async () => {
    const { svc, orgs } = setup();
    drive({ type: 'organization.deleted', data: { id: 'org_clerk_1', deleted: true } });
    await svc.handle(BODY, HEADERS);
    expect(orgs.suspendByClerkId).toHaveBeenCalledWith('org_clerk_1');
  });
});

describe('ClerkWebhookService — membership events (order tolerance)', () => {
  const membership = (role: string): ClerkWebhookEvent => ({
    type: 'organizationMembership.created',
    data: {
      role,
      organization: { id: 'org_clerk_1', name: 'Acme U', slug: 'acme' },
      public_user_data: {
        user_id: 'user_1',
        identifier: 'member@x.dev',
        first_name: 'Mem',
        last_name: 'Ber',
      },
    },
  });

  it('upserts the EMBEDDED org first, then stamps org+role on the user together', async () => {
    const { svc, orgs, users } = setup();
    drive(membership('org:admin'));
    await svc.handle(BODY, HEADERS);
    expect(orgs.upsertFromClerk).toHaveBeenCalledWith({
      clerkOrgId: 'org_clerk_1',
      name: 'Acme U',
      slug: 'acme',
    });
    expect(users.syncClerkMembership).toHaveBeenCalledWith({
      clerkUserId: 'user_1',
      email: 'member@x.dev',
      firstName: 'Mem',
      lastName: 'Ber',
      organizationId: 'local-org-1', // the upserted local org id, never the Clerk id
      role: Role.ADMIN,
    });
  });

  it('defers (no crash, no user write) when identifier is absent and no local user exists', async () => {
    const { svc, users, orgs } = setup();
    const ev = membership('org:member');
    (ev.data as { public_user_data: { identifier?: string | null } }).public_user_data.identifier =
      null;
    drive(ev);
    await svc.handle(BODY, HEADERS);
    expect(orgs.upsertFromClerk).toHaveBeenCalled(); // org still mirrored
    expect(users.syncClerkMembership).not.toHaveBeenCalled(); // deferred to user.created
  });

  it('uses the known local email when the membership omits the identifier', async () => {
    const { svc, users } = setup();
    users.findByClerkId.mockResolvedValue({
      email: 'known@x.dev',
      firstName: 'K',
      lastName: 'N',
    });
    const ev = membership('org:professor');
    (ev.data as { public_user_data: { identifier?: string | null } }).public_user_data.identifier =
      null;
    drive(ev);
    await svc.handle(BODY, HEADERS);
    expect(users.syncClerkMembership).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'known@x.dev', role: Role.PROFESSOR }),
    );
  });

  it('is log-only on membership.deleted (arrival-order safety — no local mutation)', async () => {
    const { svc, users } = setup();
    drive({
      type: 'organizationMembership.deleted',
      data: {
        organization: { id: 'org_clerk_1' },
        public_user_data: { user_id: 'user_1' },
      },
    });
    await svc.handle(BODY, HEADERS);
    expect(users.syncClerkMembership).not.toHaveBeenCalled();
    expect(users.deactivateByClerkId).not.toHaveBeenCalled();
  });
});

describe('ClerkWebhookService — invitation mirror (seat counting)', () => {
  const invitation = (): ClerkWebhookEvent => ({
    type: 'organizationInvitation.created',
    data: {
      id: 'inv_1',
      organization_id: 'org_clerk_1',
      email_address: 'Invitee@X.dev',
      public_metadata: { role: 'org:professor' },
    },
  });

  it('mirrors a new invitation as PENDING with the ticket-metadata role', async () => {
    const { svc, invites } = setup();
    drive(invitation());
    await svc.handle(BODY, HEADERS);
    expect(invites.save).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkInvitationId: 'inv_1',
        organizationId: 'local-org-1',
        email: 'invitee@x.dev', // lowercased
        role: Role.PROFESSOR,
        status: OrgInviteStatus.PENDING,
      }),
    );
  });

  it('flips an existing mirror row to ACCEPTED (idempotent, no double-count)', async () => {
    const { svc, invites } = setup();
    invites.findOne.mockResolvedValue({
      id: 'row-1',
      clerkInvitationId: 'inv_1',
      organizationId: 'local-org-1',
      email: 'invitee@x.dev',
      role: Role.PROFESSOR,
      status: OrgInviteStatus.PENDING,
    });
    const ev = invitation();
    ev.type = 'organizationInvitation.accepted';
    drive(ev);
    await svc.handle(BODY, HEADERS);
    expect(invites.create).not.toHaveBeenCalled();
    expect(invites.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'row-1', status: OrgInviteStatus.ACCEPTED }),
    );
  });

  it('skips mirroring when the referenced org is not mirrored yet (order tolerance)', async () => {
    const { svc, invites, orgs } = setup();
    orgs.findByClerkOrgId.mockResolvedValue(null);
    drive(invitation());
    await svc.handle(BODY, HEADERS);
    expect(invites.save).not.toHaveBeenCalled();
  });
});
