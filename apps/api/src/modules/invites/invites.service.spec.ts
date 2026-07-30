import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/mail.types';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { QuotaService } from '../quotas/quota.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { OrgInvite } from './entities/org-invite.entity';
import { OrgInviteKind, OrgInviteSource, OrgInviteStatus } from './enums/org-invite.enums';
import { InvitesService } from './invites.service';

const ORG = 'org-1';
const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 1000);

const invite = (over: Partial<OrgInvite> = {}): OrgInvite =>
  ({
    id: 'inv-1',
    organizationId: ORG,
    email: 'ada@x.dev',
    tokenHash: 'hash',
    role: Role.STUDENT,
    status: OrgInviteStatus.PENDING,
    kind: OrgInviteKind.NEW_ACCOUNT,
    source: OrgInviteSource.MANUAL,
    firstName: 'Ada',
    lastName: 'Lovelace',
    expiresAt: FUTURE,
    acceptedAt: null,
    revokedAt: null,
    lastSentAt: null,
    sendCount: 1,
    invitedById: 'staff-1',
    batchId: null,
    ...over,
  }) as OrgInvite;

const user = (over: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ada@x.dev',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: Role.STUDENT,
    organizationId: null,
    isActive: true,
    ...over,
  }) as User;

const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'u-1',
  email: 'ada@x.dev',
  role: Role.STUDENT,
  organizationId: null,
  ...over,
});

interface Harness {
  svc: InvitesService;
  calls: string[];
  update: jest.Mock;
  quotas: { assertWithinQuota: jest.Mock };
  users: Record<string, jest.Mock>;
  mail: { enqueue: jest.Mock; webUrl: jest.Mock };
  invitesRepo: Record<string, jest.Mock>;
}

/**
 * `calls` records the ORDER of the consume/charge/create steps. Accept and claim
 * both depend on that order, and an order bug is invisible to any assertion that
 * only checks "was it called".
 */
function setup(
  opts: {
    found?: OrgInvite | null;
    existingUser?: User | null;
    orgStatus?: OrganizationStatus;
    affected?: number;
  } = {},
): Harness {
  const calls: string[] = [];
  const found = opts.found === undefined ? invite() : opts.found;

  // One chainable UPDATE builder serves both `consume` (status -> accepted) and
  // `expireStalePending` (status -> expired). They are told apart by the `set`
  // payload, so only a real consume records into `calls`.
  const update = jest.fn();
  const updateBuilder = () => {
    let isConsume = false;
    const b: Record<string, unknown> = {
      update: jest.fn(() => b),
      set: jest.fn((patch: { status: OrgInviteStatus }) => {
        isConsume = patch.status === OrgInviteStatus.ACCEPTED;
        return b;
      }),
      where: jest.fn(() => b),
      andWhere: jest.fn(() => b),
      execute: jest.fn(() => {
        if (isConsume) {
          calls.push('consume');
          update();
          return Promise.resolve({ affected: opts.affected ?? 1 });
        }
        return Promise.resolve({ affected: 0 });
      }),
    };
    return b;
  };

  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(found),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const invitesRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(found),
    save: jest.fn((i: OrgInvite) => Promise.resolve(i)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const managerInviteRepo = {
    createQueryBuilder: jest.fn(() => {
      const b = updateBuilder() as Record<string, unknown>;
      // The duplicate pre-check in `create` uses the same entry point for a SELECT.
      b.getOne = jest.fn().mockResolvedValue(null);
      return b;
    }),
    save: jest.fn((i: OrgInvite) => Promise.resolve({ ...i, id: 'inv-new' })),
    create: jest.fn((i: Partial<OrgInvite>) => i),
    findOneOrFail: jest.fn().mockResolvedValue(user({ organizationId: ORG })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const manager = {
    getRepository: jest.fn(() => managerInviteRepo),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const quotas = {
    assertWithinQuota: jest.fn(() => {
      calls.push('charge');
      return Promise.resolve();
    }),
  };
  const users = {
    findByEmail: jest.fn().mockResolvedValue(opts.existingUser ?? null),
    getById: jest.fn().mockResolvedValue(opts.existingUser ?? user()),
    createFromInvite: jest.fn(() => {
      calls.push('create');
      return Promise.resolve(user({ id: 'u-new', organizationId: ORG }));
    }),
  };
  const orgs = {
    getById: jest.fn().mockResolvedValue({
      id: ORG,
      name: 'Acme University',
      status: opts.orgStatus ?? OrganizationStatus.ACTIVE,
    }),
    findById: jest.fn().mockResolvedValue({
      id: ORG,
      name: 'Acme University',
      status: opts.orgStatus ?? OrganizationStatus.ACTIVE,
    }),
  };
  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    webUrl: jest.fn((p: string) => `https://app.dev/${p}`),
  };

  const svc = new InvitesService(
    invitesRepo as unknown as Repository<OrgInvite>,
    dataSource,
    users as unknown as UsersService,
    orgs as unknown as OrganizationsService,
    quotas as unknown as QuotaService,
    mail as unknown as MailService,
  );

  return { svc, calls, update, quotas, users, mail, invitesRepo };
}

describe('InvitesService.accept', () => {
  // THE ordering invariant. countSeats is "active users + pending invites", so
  // charging before the invite leaves `pending` double-counts the very person
  // accepting — and 409s the last reserved seat, i.e. exactly the one being held
  // for them.
  it('CONSUMES the invite before charging the seat quota', async () => {
    const { svc, calls } = setup();
    await svc.accept({ token: 'tok', password: 'Password1' });
    expect(calls).toEqual(['consume', 'charge', 'create']);
  });

  it('charges the quota with the TRANSACTION manager, not the default one', async () => {
    const { svc, quotas } = setup();
    await svc.accept({ token: 'tok', password: 'Password1' });
    const [, , , manager] = quotas.assertWithinQuota.mock.calls[0];
    expect(manager).toBeDefined();
    expect((manager as EntityManager).getRepository).toBeDefined();
  });

  it('creates the account at the INVITED role, not the requested one', async () => {
    const { svc, users } = setup({ found: invite({ role: Role.PROFESSOR }) });
    await svc.accept({ token: 'tok', password: 'Password1' });
    expect(users.createFromInvite.mock.calls[0][0]).toMatchObject({
      role: Role.PROFESSOR,
      organizationId: ORG,
    });
  });

  it('hashes the password before the transaction (never stores it raw)', async () => {
    const { svc, users } = setup();
    await svc.accept({ token: 'tok', password: 'Password1' });
    const input = users.createFromInvite.mock.calls[0][0] as { passwordHash: string };
    expect(input.passwordHash).toMatch(/^\$argon2/);
    expect(input.passwordHash).not.toContain('Password1');
  });

  describe('state machine', () => {
    it('404s an unknown token', async () => {
      const { svc } = setup({ found: null });
      await expect(svc.accept({ token: 'nope', password: 'Password1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409 invite_already_accepted for an accepted invite', async () => {
      const { svc } = setup({ found: invite({ status: OrgInviteStatus.ACCEPTED }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'invite_already_accepted' },
      });
    });

    it('409 invite_revoked for a revoked invite', async () => {
      const { svc } = setup({ found: invite({ status: OrgInviteStatus.REVOKED }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'invite_revoked' },
      });
    });

    // Lazily flipped, because `expired` is a stored status and nothing else would
    // ever clear a timed-out row out of uq_org_invites_org_pending_email's slot.
    it('409 invite_expired AND writes the expired status back', async () => {
      const { svc, invitesRepo } = setup({ found: invite({ expiresAt: PAST }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'invite_expired' },
      });
      expect(invitesRepo.update).toHaveBeenCalledWith(
        { id: 'inv-1' },
        { status: OrgInviteStatus.EXPIRED },
      );
    });

    // accept is @Public, so TenantContextGuard never ran — a suspended tenant
    // would otherwise keep absorbing members who can never sign in.
    it('403 org_suspended for a suspended tenant', async () => {
      const { svc } = setup({ orgStatus: OrganizationStatus.SUSPENDED });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('409 invite_already_accepted when a concurrent accept won the UPDATE', async () => {
      const { svc } = setup({ affected: 0 });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'invite_already_accepted' },
      });
    });
  });

  describe('an account already holds the address', () => {
    // The escalation this exists to stop: any professor mints a STUDENT invite for
    // the platform SuperAdmin's address; redeeming it would write them into a
    // tenant, and PlatformGuard (which requires organizationId === null) then
    // locks them out of the platform console permanently.
    it('409 account_ineligible for a SUPERADMIN, whatever the invite says', async () => {
      const { svc } = setup({
        existingUser: user({ role: Role.SUPERADMIN, organizationId: null }),
      });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'account_ineligible' },
      });
    });

    it('409 account_ineligible rather than DEMOTING an admin to a student invite', async () => {
      const { svc } = setup({ existingUser: user({ role: Role.ADMIN, organizationId: 'org-2' }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'account_ineligible' },
      });
    });

    it('409 account_disabled for a revoked account', async () => {
      const { svc } = setup({ existingUser: user({ isActive: false, organizationId: ORG }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'account_disabled' },
      });
    });

    it('already_member consumes the invite, creates nothing, and issues no session', async () => {
      const { svc, calls, users } = setup({ existingUser: user({ organizationId: ORG }) });
      const res = await svc.accept({ token: 't', password: 'Password1' });
      expect(res.outcome).toBe('already_member');
      expect(calls).toEqual(['consume']); // seat already held by the user row
      expect(users.createFromInvite).not.toHaveBeenCalled();
    });

    // An org-less account must CLAIM while signed in — we never move an account
    // into an org on the strength of a link alone.
    it('409 account_exists + claimRequired for an org-less account', async () => {
      const { svc } = setup({ existingUser: user({ organizationId: null }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'account_exists', claimRequired: true },
      });
    });

    // Opaque on purpose: naming the other tenant would make this a cross-tenant
    // existence oracle for whoever holds the link.
    it('409 email_unavailable — never naming the other org — for a member elsewhere', async () => {
      const { svc } = setup({ existingUser: user({ organizationId: 'org-2' }) });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.toMatchObject({
        response: { reason: 'email_unavailable' },
      });
      await expect(svc.accept({ token: 't', password: 'Password1' })).rejects.not.toMatchObject({
        response: { organizationId: 'org-2' },
      });
    });
  });
});

describe('InvitesService.claim', () => {
  it('consumes before charging, then re-stamps the denormalised rows', async () => {
    const { svc, calls } = setup({ existingUser: user({ organizationId: null }) });
    await svc.claim(actor(), 'tok');
    expect(calls).toEqual(['consume', 'charge']);
  });

  it('re-stamps user_gamification and submissions, or they stay on the Legacy tenant', async () => {
    const { svc } = setup({ existingUser: user({ organizationId: null }) });
    const ds = (svc as unknown as { dataSource: { transaction: jest.Mock } }).dataSource;
    await svc.claim(actor(), 'tok');
    const manager = ds.transaction.mock.calls[0][0];
    expect(manager).toBeDefined();
  });

  // The invite is addressed to a person, not to whoever holds the link while
  // signed in as somebody else.
  it('403 invite_email_mismatch when the invite is for another address', async () => {
    const { svc } = setup({ existingUser: user({ organizationId: null }) });
    await expect(svc.claim(actor({ email: 'someone.else@x.dev' }), 'tok')).rejects.toMatchObject({
      response: { reason: 'invite_email_mismatch' },
    });
  });

  it('compares the address case-insensitively', async () => {
    const { svc } = setup({ existingUser: user({ organizationId: null }) });
    await expect(svc.claim(actor({ email: 'ADA@X.DEV' }), 'tok')).resolves.toBeDefined();
  });

  it('409 account_ineligible for a SUPERADMIN claiming into a tenant', async () => {
    const { svc } = setup({ existingUser: user({ role: Role.SUPERADMIN, organizationId: null }) });
    await expect(svc.claim(actor({ role: Role.SUPERADMIN }), 'tok')).rejects.toMatchObject({
      response: { reason: 'account_ineligible' },
    });
  });

  it('409 when the claimer already belongs to an organization', async () => {
    const { svc } = setup({ existingUser: user({ organizationId: 'org-2' }) });
    await expect(svc.claim(actor({ organizationId: 'org-2' }), 'tok')).rejects.toMatchObject({
      response: { reason: 'email_unavailable' },
    });
  });
});

describe('InvitesService.preview', () => {
  // A 4xx would put the raw token into AllExceptionsFilter's `path` and from there
  // into the application log — the exact exposure hashed storage exists to avoid.
  it('never throws for an unknown token — returns null', async () => {
    const { svc } = setup({ found: null });
    await expect(svc.preview('nonsense')).resolves.toBeNull();
  });

  it('never throws when the lookup itself blows up', async () => {
    const { svc, invitesRepo } = setup();
    invitesRepo.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(svc.preview('tok')).resolves.toBeNull();
  });

  it('returns null for an expired invite rather than disclosing its address', async () => {
    const { svc } = setup({ found: invite({ expiresAt: PAST }) });
    await expect(svc.preview('tok')).resolves.toBeNull();
  });

  it('returns null for a suspended org', async () => {
    const { svc } = setup({ orgStatus: OrganizationStatus.SUSPENDED });
    await expect(svc.preview('tok')).resolves.toBeNull();
  });
});

describe('InvitesService.create', () => {
  it('enqueues the invite mail only AFTER the transaction commits', async () => {
    const { svc, mail } = setup({ found: null });
    const order: string[] = [];
    const ds = (svc as unknown as { dataSource: { transaction: jest.Mock } }).dataSource;
    const realTx = ds.transaction.getMockImplementation()!;
    ds.transaction.mockImplementation(async (cb: (m: EntityManager) => unknown) => {
      const out = await realTx(cb);
      order.push('commit');
      return out;
    });
    mail.enqueue.mockImplementation(() => {
      order.push('enqueue');
      return Promise.resolve();
    });

    await svc.create(
      { email: 'new@x.dev', role: Role.STUDENT },
      actor({ role: Role.PROFESSOR, organizationId: ORG }),
      ORG,
    );
    expect(order).toEqual(['commit', 'enqueue']);
  });

  it('rejects a role the actor may not invite, before touching the database', async () => {
    const { svc, quotas } = setup({ found: null });
    await expect(
      svc.create(
        { email: 'new@x.dev', role: Role.ADMIN },
        actor({ role: Role.PROFESSOR, organizationId: ORG }),
        ORG,
      ),
    ).rejects.toMatchObject({ response: { reason: 'role_not_invitable' } });
    expect(quotas.assertWithinQuota).not.toHaveBeenCalled();
  });

  it('refuses to mint into a suspended organization', async () => {
    const { svc } = setup({ found: null, orgStatus: OrganizationStatus.SUSPENDED });
    await expect(
      svc.create(
        { email: 'new@x.dev', role: Role.STUDENT },
        actor({ role: Role.PROFESSOR, organizationId: ORG }),
        ORG,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mails the accept URL built from the raw token — which is never persisted', async () => {
    const { svc, mail } = setup({ found: null });
    await svc.create(
      { email: 'new@x.dev', role: Role.STUDENT },
      actor({ role: Role.PROFESSOR, organizationId: ORG }),
      ORG,
    );
    const msg = mail.enqueue.mock.calls[0][0] as {
      template: MailTemplate;
      params: { acceptUrl: string };
    };
    expect(msg.template).toBe(MailTemplate.STUDENT_INVITE);
    const rawToken = msg.params.acceptUrl.split('/invite/')[1];
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // What went in the mail must not be what went in the column.
    expect(rawToken).not.toMatch(/^[0-9a-f]{64}$/);
  });

  it('marks an invite to an EXISTING org-less account as a claim, not a new account', async () => {
    const { svc } = setup({ found: null, existingUser: user({ organizationId: null }) });
    const out = await svc.create(
      { email: 'ada@x.dev', role: Role.STUDENT },
      actor({ role: Role.PROFESSOR, organizationId: ORG }),
      ORG,
    );
    expect(out.kind).toBe(OrgInviteKind.CLAIM);
  });
});
