import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../common/enums/role.enum';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { OrganizationCache } from '../organizations/organization-cache.service';
import { OrganizationsService } from '../organizations/organizations.service';
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

function setup() {
  const org = { id: 'org-1', name: 'Acme U', slug: 'acme' } as Organization;
  const orgs = {
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue(org),
    create: jest.fn().mockResolvedValue(org),
    update: jest.fn((_id: string, p: object) => Promise.resolve({ ...org, ...p })),
    setStatus: jest.fn((_id: string, status: OrganizationStatus) =>
      Promise.resolve({ ...org, status }),
    ),
  };
  const orgCache = { reload: jest.fn().mockResolvedValue(undefined) };
  const metrics = {
    census: jest
      .fn()
      .mockResolvedValue({ byOrg: {}, platform: { superAdmins: 0, globalProblems: 0 } }),
    countsForOrg: jest.fn().mockResolvedValue(OrgCountsDto.zero()),
  };
  const quotas = {
    getUsageSummary: jest.fn().mockResolvedValue({
      max_users: { used: 0, limit: null },
      max_problems: { used: 0, limit: null },
      max_assignments: { used: 0, limit: null },
    }),
  };
  const svc = new PlatformService(
    orgs as unknown as OrganizationsService,
    orgCache as unknown as OrganizationCache,
    metrics as unknown as PlatformMetricsService,
    quotas as never,
  );
  return { svc, orgs, orgCache, metrics, quotas };
}

const counts = (patch: Partial<OrgCountsDto>): OrgCountsDto => ({
  ...OrgCountsDto.zero(),
  ...patch,
});

describe('PlatformService.create', () => {
  it('persists the local org and reloads the status cache', async () => {
    const { svc, orgs, orgCache } = setup();
    const out = await svc.create({ name: 'Acme U', slug: 'acme' }, actor);
    expect(orgs.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme U', slug: 'acme', createdById: 'sa' }),
    );
    // Without the reload, TenantContextGuard's OrganizationCache has no entry for
    // the new org — it treats unknown as not-suspended today, so this is about the
    // cache being correct rather than about the guard failing.
    expect(orgCache.reload).toHaveBeenCalled();
    expect(out.id).toBe('org-1');
  });

  it('returns the created row without a second read', async () => {
    // The re-read existed only to pick up a linkage written after create(); with
    // no linkage step there is nothing to re-read.
    const { svc, orgs } = setup();
    await svc.create({ name: 'Acme U' }, actor);
    expect(orgs.getById).not.toHaveBeenCalled();
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
  } as Organization;
  const orgB = {
    id: 'org-B',
    name: 'Beta Poly',
    slug: 'beta',
    status: OrganizationStatus.SUSPENDED,
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
    expect(out.tiles[0]).toEqual(expect.objectContaining({ name: 'Acme U' }));
    expect(out.tiles[1].counts).toEqual(OrgCountsDto.zero());
  });

  it('totals agree with the tiles and fold in the org-less platform buckets', async () => {
    const { svc } = withCensus();
    const out = await svc.overview();
    expect(out.organizations).toEqual({
      total: 2,
      active: 1,
      suspended: 1,
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

  it('takes usage from QuotaService, not the census — one definition of "used" (#66)', async () => {
    const { svc, metrics, quotas } = setup();
    // The census says 3 problems; the quota service says 6. Enforcement charges
    // against the quota service, so that is the number the console must show.
    metrics.countsForOrg.mockResolvedValue(counts({ problems: 3 }));
    quotas.getUsageSummary.mockResolvedValue({
      max_users: { used: 14, limit: 20 },
      max_problems: { used: 6, limit: null },
      max_assignments: { used: 1, limit: 0 },
    });
    const out = await svc.detail('org-1');
    expect(quotas.getUsageSummary).toHaveBeenCalledWith('org-1');
    expect(out.usage.problems.used).toBe(6);
    expect(out.counts.problems).toBe(3); // the census still reports its own count
  });

  it('maps limits without ever coalescing null (unlimited) into 0 (blocked)', async () => {
    const { svc, quotas } = setup();
    quotas.getUsageSummary.mockResolvedValue({
      max_users: { used: 14, limit: 20 },
      max_problems: { used: 6, limit: null },
      max_assignments: { used: 1, limit: 0 },
    });
    const out = await svc.detail('org-1');
    expect(out.usage.users).toEqual({ used: 14, limit: 20, remaining: 6, exceeded: false });
    // null => unlimited: no remaining, never exceeded.
    expect(out.usage.problems).toEqual({ used: 6, limit: null, remaining: null, exceeded: false });
    // 0 => fully blocked, and already over by one.
    expect(out.usage.assignments).toEqual({ used: 1, limit: 0, remaining: 0, exceeded: true });
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
