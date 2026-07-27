import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/enums/role.enum';
import { ClerkService } from '../auth/clerk/clerk.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationCache } from '../organizations/organization-cache.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { QuotaUsageDto } from './dto/platform-organization-detail.dto';
import { OrgCountsDto } from './dto/platform-overview.dto';
import { PlatformMetricsService } from './platform-metrics.service';
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
  const metrics = {
    census: jest
      .fn()
      .mockResolvedValue({ byOrg: {}, platform: { superAdmins: 0, globalProblems: 0 } }),
    countsForOrg: jest.fn().mockResolvedValue(OrgCountsDto.zero()),
  };
  const svc = new PlatformService(
    orgs as unknown as OrganizationsService,
    orgCache as unknown as OrganizationCache,
    clerk as unknown as ClerkService,
    users as unknown as UsersService,
    metrics as unknown as PlatformMetricsService,
  );
  return { svc, orgs, orgCache, clerk, users, metrics };
}

const counts = (patch: Partial<OrgCountsDto>): OrgCountsDto => ({
  ...OrgCountsDto.zero(),
  ...patch,
});

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

describe('PlatformService.overview (#63)', () => {
  const orgA = {
    id: 'org-A',
    name: 'Acme U',
    slug: 'acme',
    status: OrganizationStatus.ACTIVE,
    clerkOrgId: 'org_clerk_1',
  } as Organization;
  const orgB = {
    id: 'org-B',
    name: 'Beta Poly',
    slug: 'beta',
    status: OrganizationStatus.SUSPENDED,
    clerkOrgId: null,
  } as Organization;

  function withCensus() {
    const { svc, orgs, metrics } = setup();
    orgs.list.mockResolvedValue([orgA, orgB]);
    metrics.census.mockResolvedValue({
      byOrg: {
        'org-A': counts({
          users: 12,
          admins: 2,
          professors: 3,
          students: 7,
          activeUsers: 10,
          inactiveUsers: 2,
          pendingInvites: 4,
          classrooms: 5,
          problems: 6,
          assignments: 7,
          submissions: 8,
        }),
        // org-B is deliberately absent from byOrg below to cover the zero-fill.
      },
      platform: { superAdmins: 2, globalProblems: 30 },
    });
    return { svc, orgs, metrics };
  }

  it('emits one tile per org, zero-filling an org with no rows', async () => {
    const { svc } = withCensus();
    const out = await svc.overview();
    expect(out.tiles.map((t) => t.id)).toEqual(['org-A', 'org-B']);
    expect(out.tiles[0]).toEqual(expect.objectContaining({ name: 'Acme U', clerkLinked: true }));
    expect(out.tiles[1].clerkLinked).toBe(false);
    expect(out.tiles[1].counts).toEqual(OrgCountsDto.zero());
  });

  it('totals agree with the tiles and fold in the org-less platform buckets', async () => {
    const { svc } = withCensus();
    const out = await svc.overview();
    expect(out.organizations).toEqual({
      total: 2,
      active: 1,
      suspended: 1,
      clerkLinked: 1,
    });
    expect(out.users).toEqual({
      total: 14, // 12 org members + 2 org-less SuperAdmins
      superAdmins: 2,
      admins: 2,
      professors: 3,
      students: 7,
      active: 12,
      inactive: 2,
      pendingInvites: 4,
    });
    // active + inactive must reconcile to total, SuperAdmins included.
    expect(out.users.active + out.users.inactive).toBe(out.users.total);
    expect(out.content.problems).toEqual({ total: 36, global: 30, org: 6 });
    expect(out.content).toEqual(
      expect.objectContaining({ classrooms: 5, assignments: 7, submissions: 8 }),
    );
  });

  it('runs the org list and the census concurrently, one census for any org count', async () => {
    const { svc, metrics } = withCensus();
    await svc.overview();
    expect(metrics.census).toHaveBeenCalledTimes(1);
    expect(metrics.census).toHaveBeenCalledWith(); // unscoped — every org
  });
});

describe('PlatformService.detail (#63)', () => {
  it('returns the org row plus its census and quota usage', async () => {
    const { svc, metrics } = setup();
    metrics.countsForOrg.mockResolvedValue(
      counts({ activeUsers: 10, pendingInvites: 4, problems: 6, assignments: 7 }),
    );
    const out = await svc.detail('org-1');
    expect(out).toEqual(expect.objectContaining({ id: 'org-1', slug: 'acme' }));
    expect(metrics.countsForOrg).toHaveBeenCalledWith('org-1');
    expect(out.counts.activeUsers).toBe(10);
  });

  it('charges a seat per pending invite so accepting an invite is net-zero (§5.4)', async () => {
    const { svc, metrics } = setup();
    metrics.countsForOrg.mockResolvedValue(counts({ activeUsers: 10, pendingInvites: 4 }));
    const before = await svc.detail('org-1');
    expect(before.usage.users.used).toBe(14);

    // invite accepted: pending -1, active member +1 => identical seat usage.
    metrics.countsForOrg.mockResolvedValue(counts({ activeUsers: 11, pendingInvites: 3 }));
    const after = await svc.detail('org-1');
    expect(after.usage.users.used).toBe(14);
  });

  it('reports every resource as unlimited until quotas land (#66) — never 0', async () => {
    const { svc, metrics } = setup();
    metrics.countsForOrg.mockResolvedValue(counts({ activeUsers: 3, problems: 2, assignments: 1 }));
    const out = await svc.detail('org-1');
    for (const usage of Object.values(out.usage)) {
      expect(usage.limit).toBeNull(); // null = unlimited; 0 would mean blocked
      expect(usage.remaining).toBeNull();
      expect(usage.exceeded).toBe(false);
    }
  });

  it('404s before counting when the org id is unknown', async () => {
    const { svc, orgs, metrics } = setup();
    orgs.getById.mockRejectedValue(new NotFoundException('Organization not found'));
    await expect(svc.detail('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(metrics.countsForOrg).not.toHaveBeenCalled();
  });
});

describe('QuotaUsageDto.of', () => {
  it('treats null as unlimited and 0 as fully blocked (never coalesced)', () => {
    expect(QuotaUsageDto.of(5, null)).toEqual({
      used: 5,
      limit: null,
      remaining: null,
      exceeded: false,
    });
    expect(QuotaUsageDto.of(0, 0)).toEqual({
      used: 0,
      limit: 0,
      remaining: 0,
      exceeded: false,
    });
    expect(QuotaUsageDto.of(1, 0)).toEqual(
      expect.objectContaining({ limit: 0, remaining: 0, exceeded: true }),
    );
  });

  it('floors remaining at 0 and flags a lowered limit as exceeded', () => {
    expect(QuotaUsageDto.of(12, 10)).toEqual({
      used: 12,
      limit: 10,
      remaining: 0,
      exceeded: true,
    });
    expect(QuotaUsageDto.of(4, 10).remaining).toBe(6);
  });
});
