import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ModuleAccessService } from '../module-access/module-access.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SessionContextService } from './session-context.service';

function makeService(user: Partial<User>, org: Organization | null = null) {
  const users = { getById: jest.fn().mockResolvedValue(user as User) };
  const moduleAccess = {
    effectiveMapForRole: jest.fn().mockReturnValue({ problems: true, grading: false }),
  };
  const organizations = { findById: jest.fn().mockResolvedValue(org) };
  const svc = new SessionContextService(
    users as unknown as UsersService,
    moduleAccess as unknown as ModuleAccessService,
    organizations as unknown as OrganizationsService,
  );
  return { svc, users, moduleAccess, organizations };
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

  it('exposes stable-but-empty features/quotas placeholders (filled by #64/#66)', async () => {
    const { svc } = makeService({ id: 'local-1', role: Role.STUDENT, organizationId: 'org-1' });
    const ctx = await svc.build(actor);
    expect(ctx.features).toEqual({});
    expect(ctx.quotas).toBeNull();
  });
});
