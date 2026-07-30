import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  // create() wraps its insert in repo.manager.transaction so the #66 quota check
  // holds the org's row lock across the insert.
  manager?: { transaction: jest.Mock };
};

const noQuota = () => ({ assertWithinQuota: jest.fn().mockResolvedValue(undefined) });
const noEvents = () => ({ emit: jest.fn() });

describe('UsersService.create — role assignment', () => {
  let repo: MockRepo;
  let quotas: { assertWithinQuota: jest.Mock };
  let service: UsersService;

  const dto = (role?: Role): CreateUserDto => ({
    email: 'new-user@codestack.dev',
    password: 'Password1',
    firstName: 'New',
    lastName: 'User',
    role,
  });

  const actor = (role: Role): AuthenticatedUser => ({
    id: 'actor-id',
    email: 'actor@x.dev',
    role,
    organizationId: 'org-test',
  });

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null), // no existing user by default
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: 'new-id' } as User)),
    };
    // create() now runs inside repo.manager.transaction so the quota check holds a
    // row lock for the insert (#66); the stub just runs the callback inline.
    repo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({ getRepository: () => repo })),
    };
    quotas = { assertWithinQuota: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(
      repo as unknown as import('typeorm').Repository<User>,
      quotas as never,
      noEvents() as never,
    );
  });

  it('rejects when the email is already registered', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.create(dto(), actor(Role.ADMIN))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('defaults to STUDENT when no role is requested', async () => {
    const user = await service.create(dto(), actor(Role.ADMIN));
    expect(user.role).toBe(Role.STUDENT);
  });

  it('charges MAX_USERS inside the transaction, before the insert (#66)', async () => {
    const order: string[] = [];
    quotas.assertWithinQuota.mockImplementation(async () => void order.push('quota'));
    repo.save.mockImplementation(async (e: unknown) => {
      order.push('save');
      return e;
    });
    await service.create(dto(), actor(Role.ADMIN));
    expect(repo.manager!.transaction).toHaveBeenCalled();
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(
      'org-test',
      'max_users',
      1,
      expect.anything(),
    );
    // A check after the insert would be decorative — the row would already exist.
    expect(order).toEqual(['quota', 'save']);
  });

  it('propagates a quota breach and never inserts the user', async () => {
    quotas.assertWithinQuota.mockRejectedValue(new ConflictException({ reason: 'quota_exceeded' }));
    await expect(service.create(dto(), actor(Role.ADMIN))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('charges nothing for an org-less self-registration (no actor)', async () => {
    await service.create(dto());
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(null, 'max_users', 1, expect.anything());
  });

  // Escalation regression. This used to silently DOWNGRADE an over-reaching
  // request to STUDENT, which hid the attempt; now it is an explicit 403, so a
  // caller cannot mistake a rejected escalation for a successful create.
  describe('regression: privilege escalation via role in the request body', () => {
    // The one that mattered: an org ADMIN minting a platform SUPERADMIN, who then
    // inherits every isSuperAdmin() bypass in tenant-scope.util and can read and
    // write every tenant.
    it('REJECTS superadmin from an ADMIN actor', async () => {
      await expect(service.create(dto(Role.SUPERADMIN), actor(Role.ADMIN))).rejects.toMatchObject({
        response: { reason: 'role_not_assignable' },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('REJECTS superadmin even from a SUPERADMIN actor — the seed is the only path', async () => {
      await expect(
        service.create(dto(Role.SUPERADMIN), actor(Role.SUPERADMIN)),
      ).rejects.toMatchObject({ response: { reason: 'role_not_assignable' } });
    });

    it('REJECTS an elevated role from a PROFESSOR actor', async () => {
      await expect(service.create(dto(Role.ADMIN), actor(Role.PROFESSOR))).rejects.toMatchObject({
        response: { reason: 'role_not_assignable' },
      });
    });

    // Rank-monotonic: nobody mints their own level, or one compromised account
    // propagates sideways without limit.
    it('REJECTS a PROFESSOR minting a PROFESSOR', async () => {
      await expect(
        service.create(dto(Role.PROFESSOR), actor(Role.PROFESSOR)),
      ).rejects.toMatchObject({ response: { reason: 'role_not_assignable' } });
    });

    it('REJECTS an ADMIN minting another ADMIN', async () => {
      await expect(service.create(dto(Role.ADMIN), actor(Role.ADMIN))).rejects.toMatchObject({
        response: { reason: 'role_not_assignable' },
      });
    });

    it('allows an ADMIN to assign PROFESSOR (strictly below them)', async () => {
      const user = await service.create(dto(Role.PROFESSOR), actor(Role.ADMIN));
      expect(user.role).toBe(Role.PROFESSOR);
    });

    it('allows a SUPERADMIN to assign ADMIN', async () => {
      const user = await service.create(dto(Role.ADMIN), actor(Role.SUPERADMIN));
      expect(user.role).toBe(Role.ADMIN);
    });
  });

  it('refuses a non-student role on the no-actor self-registration path', async () => {
    // AuthService.register forces STUDENT already; this is the backstop so a
    // future caller of create() cannot reintroduce a role-granting signup.
    await expect(service.create(dto(Role.PROFESSOR))).rejects.toMatchObject({
      response: { reason: 'role_not_assignable' },
    });
  });
});

describe('UsersService.verifyPassword', () => {
  const service = new UsersService(
    { findOne: jest.fn() } as unknown as Repository<User>,
    noQuota() as unknown as ConstructorParameters<typeof UsersService>[1],
    noEvents() as never,
  );

  it('returns false for an account with no local hash (never calls argon2)', async () => {
    // An invited-but-unaccepted account has passwordHash NULL. argon2.verify on a
    // null hash throws, so the guard has to come first.
    await expect(service.verifyPassword({ passwordHash: null } as User, 'x')).resolves.toBe(false);
  });
});

/**
 * The user-administration surface (#105): setAccess, the unassigned pool and
 * assignment. `calls` records ORDER, because the seat charge must happen inside
 * the transaction and before the write.
 */
describe('UsersService — admin surface (#105)', () => {
  const ORG = 'org-test';

  const admin = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
    id: 'admin-1',
    email: 'a@x.io',
    role: Role.ADMIN,
    organizationId: ORG,
    ...over,
  });

  const row = (over: Partial<User> = {}): User =>
    ({
      id: 'u-1',
      email: 'u@x.io',
      firstName: 'U',
      lastName: 'Ser',
      role: Role.STUDENT,
      organizationId: ORG,
      isActive: true,
      ...over,
    }) as User;

  function build(target: User, opts: { assignRow?: Record<string, unknown> | null } = {}) {
    const calls: string[] = [];
    const repo: Record<string, jest.Mock> & { manager?: Record<string, unknown> } = {
      findOne: jest.fn().mockResolvedValue(target),
      save: jest.fn((e: User) => {
        calls.push('save');
        return Promise.resolve(e);
      }),
      update: jest.fn(() => {
        calls.push('write');
        return Promise.resolve({ affected: 1 });
      }),
      findOneOrFail: jest.fn().mockResolvedValue(target),
      create: jest.fn(),
    };
    const managerQuery = jest.fn((sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return Promise.resolve(
          opts.assignRow === undefined
            ? [{ id: target.id, role: target.role, organization_id: target.organizationId }]
            : opts.assignRow
              ? [opts.assignRow]
              : [],
        );
      }
      calls.push('restamp');
      return Promise.resolve(undefined);
    });
    repo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) =>
        cb({ getRepository: () => repo, query: managerQuery }),
      ),
    };
    const quotas = {
      assertWithinQuota: jest.fn(() => {
        calls.push('quota');
        return Promise.resolve();
      }),
    };
    const events = { emit: jest.fn() };
    const service = new UsersService(
      repo as unknown as Repository<User>,
      quotas as never,
      events as never,
    );
    return { service, repo, quotas, events, calls, managerQuery };
  }

  describe('setAccess', () => {
    it('is idempotent — no write, no event, no mail when nothing changes', async () => {
      const { service, repo, events } = build(row({ isActive: true }));
      await service.setAccess('u-1', true, admin());
      expect(repo.save).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('revoking emits USER_ACCESS_REVOKED after the write', async () => {
      const { service, events } = build(row({ isActive: true }));
      const out = await service.setAccess('u-1', false, admin());
      expect(out.isActive).toBe(false);
      expect(events.emit).toHaveBeenCalledWith(
        'user.access-revoked',
        expect.objectContaining({ userId: 'u-1', actorId: 'admin-1' }),
      );
    });

    // The loophole this closes: at the cap, deactivate a member, invite a
    // replacement (the invite reserves the freed seat), then re-activate the
    // first — permanently over cap, with every individual step having passed.
    it('CHARGES a seat on false -> true, inside the transaction, before the save', async () => {
      const { service, quotas, calls } = build(row({ isActive: false }));
      await service.setAccess('u-1', true, admin());
      expect(quotas.assertWithinQuota).toHaveBeenCalledWith(ORG, 'max_users', 1, expect.anything());
      expect(calls).toEqual(['quota', 'save']);
    });

    it('charges NOTHING when revoking — that frees a seat, it does not take one', async () => {
      const { service, quotas } = build(row({ isActive: true }));
      await service.setAccess('u-1', false, admin());
      expect(quotas.assertWithinQuota).not.toHaveBeenCalled();
    });

    it('refuses self-revocation', async () => {
      const { service } = build(row({ id: 'admin-1', isActive: true }));
      await expect(service.setAccess('admin-1', false, admin())).rejects.toMatchObject({
        response: { reason: 'cannot_revoke_self' },
      });
    });

    it('a professor may toggle a student but not another professor', async () => {
      const prof = admin({ id: 'p-1', role: Role.PROFESSOR });
      const ok = build(row({ isActive: true }));
      await expect(ok.service.setAccess('u-1', false, prof)).resolves.toBeDefined();

      const nope = build(row({ role: Role.PROFESSOR, isActive: true }));
      await expect(nope.service.setAccess('u-1', false, prof)).rejects.toMatchObject({
        response: { reason: 'insufficient_rank' },
      });
    });
  });

  describe('update() routes isActive through setAccess', () => {
    // DEFECT: the old gate was `actor.role === Role.ADMIN`, which a SUPERADMIN
    // FAILS — so PATCH {"isActive":false} returned 200 with the row unchanged.
    it('a SUPERADMIN can now actually revoke (was a silent 200 no-op)', async () => {
      const { service, events } = build(row({ isActive: true }));
      const sa = admin({ id: 'sa', role: Role.SUPERADMIN, organizationId: null });
      const out = await service.update('u-1', { isActive: false }, sa);
      expect(out.isActive).toBe(false);
      expect(events.emit).toHaveBeenCalledWith('user.access-revoked', expect.anything());
    });

    // Account-takeover primitive: any ADMIN could set another user's password.
    it('refuses a password change for anyone but yourself', async () => {
      const { service } = build(row({ id: 'other' }));
      await expect(
        service.update('other', { password: 'Password1' }, admin()),
      ).rejects.toMatchObject({ response: { reason: 'password_self_only' } });
    });

    it('allows a self password change', async () => {
      const { service } = build(row({ id: 'admin-1', role: Role.ADMIN }));
      await expect(
        service.update('admin-1', { password: 'Password1' }, admin()),
      ).resolves.toBeDefined();
    });

    it('rejects a superadmin role change instead of silently ignoring it', async () => {
      const { service } = build(row());
      await expect(service.update('u-1', { role: Role.SUPERADMIN }, admin())).rejects.toMatchObject(
        { response: { reason: 'role_not_assignable' } },
      );
    });
  });

  describe('assignOrganization', () => {
    it('locks the row, charges a seat, writes, then re-stamps the denormalised rows', async () => {
      const { service, calls } = build(row({ organizationId: null }));
      await service.assignOrganization('u-1', 'org-new', admin(), Role.STUDENT, 'New Org');
      // quota before the write; both re-stamps after it.
      expect(calls).toEqual(['quota', 'write', 'restamp', 'restamp']);
    });

    it('emits USER_ORGANIZATION_ASSIGNED with the org name for the mail', async () => {
      const { service, events } = build(row({ organizationId: null }));
      await service.assignOrganization('u-1', 'org-new', admin(), Role.STUDENT, 'New Org');
      expect(events.emit).toHaveBeenCalledWith(
        'user.organization-assigned',
        expect.objectContaining({ organizationId: 'org-new', organizationName: 'New Org' }),
      );
    });

    // Distinct codes here would be a cross-tenant existence/membership oracle:
    // an org admin could probe which arbitrary uuids are real and where they are.
    it('404s uniformly for a user who is already in an org', async () => {
      const { service } = build(row(), {
        assignRow: { id: 'u-1', role: Role.STUDENT, organization_id: 'someone-else' },
      });
      await expect(
        service.assignOrganization('u-1', ORG, admin(), Role.STUDENT, 'Org'),
      ).rejects.toMatchObject({ response: { reason: 'user_not_assignable' } });
    });

    it('404s uniformly for a non-student', async () => {
      const { service } = build(row(), {
        assignRow: { id: 'u-1', role: Role.PROFESSOR, organization_id: null },
      });
      await expect(
        service.assignOrganization('u-1', ORG, admin(), Role.STUDENT, 'Org'),
      ).rejects.toMatchObject({ response: { reason: 'user_not_assignable' } });
    });

    it('404s uniformly for an unknown id', async () => {
      const { service } = build(row(), { assignRow: null });
      await expect(
        service.assignOrganization('u-1', ORG, admin(), Role.STUDENT, 'Org'),
      ).rejects.toMatchObject({ response: { reason: 'user_not_assignable' } });
    });

    it('refuses to assign a role the actor may not grant', async () => {
      const { service } = build(row({ organizationId: null }));
      await expect(
        service.assignOrganization('u-1', ORG, admin(), Role.SUPERADMIN, 'Org'),
      ).rejects.toMatchObject({ response: { reason: 'role_not_assignable' } });
    });

    it('takes a FOR UPDATE lock so two concurrent assignments cannot both pass', async () => {
      const { service, managerQuery } = build(row({ organizationId: null }));
      await service.assignOrganization('u-1', 'org-new', admin(), Role.STUDENT, 'Org');
      expect(managerQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });
});
