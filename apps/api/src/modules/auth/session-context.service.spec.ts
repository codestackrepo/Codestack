import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SYSTEM_MODULES, TOGGLEABLE_MODULES } from '../module-access/enums/app-module-key.enum';
import { ModuleAccessService } from '../module-access/module-access.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SessionContextService } from './session-context.service';

function makeService(user: Partial<User>, org: Organization | null = null) {
  const users = { getById: jest.fn().mockResolvedValue(user as User) };
  const moduleAccess = {
    effectiveMapForRole: jest.fn().mockResolvedValue({ problems: true, grading: false }),
    effectiveFeatureMap: jest
      .fn()
      .mockResolvedValue({ 'problems.author': false, 'topics.comment': true }),
    allFalseFeatureMap: jest.fn().mockReturnValue({ 'problems.author': false }),
  };
  const organizations = { findById: jest.fn().mockResolvedValue(org) };
  const quotas = {
    getUsageSummary: jest.fn().mockResolvedValue({
      max_users: { used: 5, limit: 10 },
      max_problems: { used: 2, limit: null },
      max_assignments: { used: 1, limit: 0 },
    }),
  };
  const svc = new SessionContextService(
    users as unknown as UsersService,
    moduleAccess as unknown as ModuleAccessService,
    organizations as unknown as OrganizationsService,
    quotas as never,
  );
  return { svc, users, moduleAccess, organizations, quotas };
}

const actor: AuthenticatedUser = {
  id: 'local-1',
  email: 'a@x.dev',
  role: Role.STUDENT,
  organizationId: 'org-1',
};

describe('SessionContextService.build', () => {
  it('re-reads identity fresh from the DB (never trusts the token role/org)', async () => {
    const { svc, users } = makeService({
      id: 'local-1',
      role: Role.ADMIN, // DB says ADMIN even though the token actor says STUDENT
      organizationId: 'org-1',
    });
    const ctx = await svc.build(actor);
    expect(users.getById).toHaveBeenCalledWith('local-1');
    expect(ctx.user.role).toBe(Role.ADMIN);
    expect(ctx.modules).toEqual({ problems: true, grading: false });
    expect(ctx.isValid).toBe(true);
  });

  it('includes the org summary when the user has an organization', async () => {
    const org = {
      id: 'org-1',
      name: 'Acme U',
      slug: 'acme',
      type: 'university',
      status: 'active',
    } as Organization;
    const { svc } = makeService(
      { id: 'local-1', role: Role.STUDENT, organizationId: 'org-1' },
      org,
    );
    const ctx = await svc.build(actor);
    expect(ctx.organization).toEqual({
      id: 'org-1',
      name: 'Acme U',
      slug: 'acme',
      type: 'university',
      status: 'active',
    });
    expect(ctx.isSuperAdmin).toBe(false);
  });

  it('returns a null org and isSuperAdmin=true for a SuperAdmin (no org lookup)', async () => {
    const { svc, organizations } = makeService({
      id: 'sa',
      role: Role.SUPERADMIN,
      organizationId: null,
    });
    const ctx = await svc.build(actor);
    expect(ctx.organization).toBeNull();
    expect(ctx.isSuperAdmin).toBe(true);
    expect(organizations.findById).not.toHaveBeenCalled();
  });

  it('fills features (#64) and quotas (#66) for an org member', async () => {
    const { svc, quotas } = makeService({
      id: 'local-1',
      role: Role.STUDENT,
      organizationId: 'org-1',
    });
    const ctx = await svc.build(actor);
    expect(ctx.features).toEqual({ 'problems.author': false, 'topics.comment': true });
    expect(quotas.getUsageSummary).toHaveBeenCalledWith('org-1');
    // The session now returns the DERIVED shape (#71), the same one the platform
    // console reads, so `remaining`/`exceeded` are computed in one place instead of
    // by every consumer. These three cases are exactly where that arithmetic goes
    // wrong if it is duplicated:
    //   capped + headroom -> remaining counts down
    //   limit null        -> UNLIMITED: remaining null, never 0
    //   limit 0, used 1   -> BLOCKED and already over: remaining floors at 0
    expect(ctx.quotas).toEqual({
      max_users: { used: 5, limit: 10, remaining: 5, exceeded: false },
      max_problems: { used: 2, limit: null, remaining: null, exceeded: false },
      max_assignments: { used: 1, limit: 0, remaining: 0, exceeded: true },
    });
  });

  it('sends quotas: null for a SuperAdmin — org-less, so charged nothing', async () => {
    const { svc, quotas } = makeService({ id: 'sa', role: Role.SUPERADMIN, organizationId: null });
    const ctx = await svc.build(actor);
    expect(ctx.quotas).toBeNull();
    expect(quotas.getUsageSummary).not.toHaveBeenCalled();
  });

  it('resolves both maps against the DB org, never the token org', async () => {
    // The token actor claims org-1; the DB row is the authority and says org-2.
    const { svc, moduleAccess } = makeService({
      id: 'local-1',
      role: Role.PROFESSOR,
      organizationId: 'org-2',
    });
    await svc.build(actor);
    expect(moduleAccess.effectiveMapForRole).toHaveBeenCalledWith(Role.PROFESSOR, 'org-2');
    expect(moduleAccess.effectiveFeatureMap).toHaveBeenCalledWith(Role.PROFESSOR, 'org-2');
  });
});

/**
 * The org-less holding state (#105). Resolving MODULE_ACCESS_DEFAULTS for these
 * users would report classrooms/problems/assignments/playground/topics as
 * enabled, so the nav would advertise five areas that every request 403s
 * `no_organization` on — the app reading as broken rather than as awaiting setup.
 */
describe('SessionContextService.build — unassigned projection', () => {
  const unassigned = { id: 'u-1', role: Role.STUDENT, organizationId: null } as User;

  it('flags isUnassigned for a non-superadmin with no org', async () => {
    const { svc } = makeService(unassigned);
    const out = await svc.build({ ...actor, organizationId: null });
    expect(out.isUnassigned).toBe(true);
    expect(out.organization).toBeNull();
    expect(out.quotas).toBeNull();
  });

  it('reports every toggleable module FALSE and the SYSTEM ones true', async () => {
    const { svc } = makeService(unassigned);
    const out = await svc.build({ ...actor, organizationId: null });
    for (const key of TOGGLEABLE_MODULES) expect(out.modules[key]).toBe(false);
    // Somewhere to land, and a way to sign out.
    for (const key of SYSTEM_MODULES) expect(out.modules[key]).toBe(true);
  });

  it('bypasses the resolver entirely rather than filtering its output', async () => {
    const { svc, moduleAccess } = makeService(unassigned);
    await svc.build({ ...actor, organizationId: null });
    // The projection lives HERE, not in ModuleAccessService.resolveModule —
    // pushing it into the resolver would make getMatrix(null), the platform
    // console's own defaults view, render all-false.
    expect(moduleAccess.effectiveMapForRole).not.toHaveBeenCalled();
    expect(moduleAccess.effectiveFeatureMap).not.toHaveBeenCalled();
    expect(moduleAccess.allFalseFeatureMap).toHaveBeenCalled();
  });

  // A SuperAdmin is org-less BY DEFINITION and must keep full access.
  it('does NOT flag an org-less SUPERADMIN as unassigned', async () => {
    const { svc, moduleAccess } = makeService({
      id: 'sa',
      role: Role.SUPERADMIN,
      organizationId: null,
    } as User);
    const out = await svc.build({ ...actor, role: Role.SUPERADMIN, organizationId: null });
    expect(out.isUnassigned).toBe(false);
    expect(out.isSuperAdmin).toBe(true);
    expect(moduleAccess.effectiveMapForRole).toHaveBeenCalled();
  });

  it('does not flag a normal org member', async () => {
    const { svc } = makeService({ id: 'u', role: Role.STUDENT, organizationId: 'org-1' } as User);
    const out = await svc.build(actor);
    expect(out.isUnassigned).toBe(false);
  });
});
