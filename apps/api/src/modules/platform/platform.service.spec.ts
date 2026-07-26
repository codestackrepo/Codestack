import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/enums/role.enum';
import { ClerkService } from '../auth/clerk/clerk.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationCache } from '../organizations/organization-cache.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { PlatformService } from './platform.service';

const actor: AuthenticatedUser = {
  id: 'sa',
  email: 'sa@x.dev',
  role: Role.SUPERADMIN,
  organizationId: null,
};

function setup(clerkConfigured = true, adminClerkId: string | null = 'user_admin') {
  const org = { id: 'org-1', name: 'Acme U', slug: 'acme', clerkOrgId: null } as Organization;
  const orgs = {
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue(org),
    create: jest.fn().mockResolvedValue(org),
    update: jest.fn((_id: string, p: object) => Promise.resolve({ ...org, ...p })),
    setStatus: jest.fn((_id: string, status: OrganizationStatus) =>
      Promise.resolve({ ...org, status }),
    ),
    attachClerkOrgId: jest.fn().mockResolvedValue({ ...org, clerkOrgId: 'org_clerk_1' }),
  };
  const orgCache = { reload: jest.fn().mockResolvedValue(undefined) };
  const clerk = {
    isConfigured: jest.fn().mockReturnValue(clerkConfigured),
    createOrganization: jest.fn().mockResolvedValue({ id: 'org_clerk_1' }),
  };
  const users = { findById: jest.fn().mockResolvedValue({ id: 'sa', clerkUserId: adminClerkId }) };
  const svc = new PlatformService(
    orgs as unknown as OrganizationsService,
    orgCache as unknown as OrganizationCache,
    clerk as unknown as ClerkService,
    users as unknown as UsersService,
  );
  return { svc, orgs, orgCache, clerk, users };
}

describe('PlatformService.create', () => {
  it('persists the local org, mirrors it to Clerk, links the id, and reloads the cache', async () => {
    const { svc, orgs, orgCache, clerk } = setup();
    await svc.create({ name: 'Acme U', slug: 'acme' }, actor);
    expect(orgs.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme U', slug: 'acme', createdById: 'sa' }),
    );
    expect(clerk.createOrganization).toHaveBeenCalledWith({
      name: 'Acme U',
      slug: 'acme',
      createdBy: 'user_admin',
    });
    expect(orgs.attachClerkOrgId).toHaveBeenCalledWith('org-1', 'org_clerk_1');
    expect(orgCache.reload).toHaveBeenCalled();
  });

  it('skips Clerk when unconfigured — the local org is still created', async () => {
    const { svc, orgs, clerk } = setup(false);
    await svc.create({ name: 'Acme U' }, actor);
    expect(orgs.create).toHaveBeenCalled();
    expect(clerk.createOrganization).not.toHaveBeenCalled();
    expect(orgs.attachClerkOrgId).not.toHaveBeenCalled();
  });

  it('skips Clerk when the acting SuperAdmin has no clerk_user_id yet', async () => {
    const { svc, clerk, orgs } = setup(true, null);
    await svc.create({ name: 'Acme U' }, actor);
    expect(clerk.createOrganization).not.toHaveBeenCalled();
    expect(orgs.attachClerkOrgId).not.toHaveBeenCalled();
  });

  it('does not fail the request when Clerk org creation throws (local org stands)', async () => {
    const { svc, clerk, orgs } = setup();
    clerk.createOrganization.mockRejectedValue(new Error('clerk down'));
    await expect(svc.create({ name: 'Acme U' }, actor)).resolves.toBeDefined();
    expect(orgs.attachClerkOrgId).not.toHaveBeenCalled();
  });
});

describe('PlatformService suspend/activate', () => {
  it('suspend sets SUSPENDED and reloads the status cache', async () => {
    const { svc, orgs, orgCache } = setup();
    await svc.suspend('org-1');
    expect(orgs.setStatus).toHaveBeenCalledWith('org-1', OrganizationStatus.SUSPENDED);
    expect(orgCache.reload).toHaveBeenCalled();
  });

  it('activate sets ACTIVE and reloads the status cache', async () => {
    const { svc, orgs, orgCache } = setup();
    await svc.activate('org-1');
    expect(orgs.setStatus).toHaveBeenCalledWith('org-1', OrganizationStatus.ACTIVE);
    expect(orgCache.reload).toHaveBeenCalled();
  });
});
