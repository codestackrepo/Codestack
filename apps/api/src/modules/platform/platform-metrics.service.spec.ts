import { Role } from '../../common/enums/role.enum';
import { OrgInviteStatus } from '../clerk-sync/enums/org-invite.enums';
import { PlatformMetricsService } from './platform-metrics.service';

/**
 * Chainable QueryBuilder stub returning preset raw group-by rows and recording the
 * bound params (so the single-org narrowing can be asserted).
 */
function makeQb(rawMany: unknown[]) {
  const params: Record<string, unknown> = {};
  const qb: Record<string, jest.Mock> = {};
  const ret = (): Record<string, jest.Mock> => qb;
  qb.select = jest.fn(ret);
  qb.addSelect = jest.fn(ret);
  qb.groupBy = jest.fn(ret);
  qb.addGroupBy = jest.fn(ret);
  qb.andWhere = jest.fn((_sql: string, p?: Record<string, unknown>) => {
    if (p) Object.assign(params, p);
    return qb;
  });
  qb.getRawMany = jest.fn(async () => rawMany);
  (qb as unknown as { params: Record<string, unknown> }).params = params;
  return qb;
}

function repo(rawMany: unknown[]) {
  return { createQueryBuilder: jest.fn(() => makeQb(rawMany)) };
}

const USER_ROWS = [
  { orgId: 'org-A', role: Role.ADMIN, isActive: true, count: '2' },
  { orgId: 'org-A', role: Role.PROFESSOR, isActive: true, count: '3' },
  { orgId: 'org-A', role: Role.STUDENT, isActive: true, count: '10' },
  { orgId: 'org-A', role: Role.STUDENT, isActive: false, count: '4' },
  { orgId: 'org-B', role: Role.STUDENT, isActive: true, count: '1' },
  { orgId: null, role: Role.SUPERADMIN, isActive: true, count: '2' },
];

function build(overrides: Partial<Record<string, ReturnType<typeof repo>>> = {}) {
  const repos = {
    users: repo(USER_ROWS),
    invites: repo([{ orgId: 'org-A', count: '3' }]),
    classrooms: repo([{ orgId: 'org-A', count: '5' }]),
    problems: repo([
      { orgId: 'org-A', count: '7' },
      { orgId: null, count: '30' }, // the global catalog
    ]),
    assignments: repo([{ orgId: 'org-A', count: '9' }]),
    submissions: repo([{ orgId: 'org-B', count: '11' }]),
    ...overrides,
  };
  const service = new PlatformMetricsService(
    repos.users as never,
    repos.invites as never,
    repos.classrooms as never,
    repos.problems as never,
    repos.assignments as never,
    repos.submissions as never,
  );
  return { service, repos };
}

describe('PlatformMetricsService.census', () => {
  it('folds every group-by into per-org buckets', async () => {
    const { service } = build();
    const { byOrg } = await service.census();

    expect(byOrg['org-A']).toEqual({
      users: 19,
      admins: 2,
      professors: 3,
      students: 14,
      activeUsers: 15,
      inactiveUsers: 4,
      pendingInvites: 3,
      classrooms: 5,
      problems: 7,
      assignments: 9,
      submissions: 0, // the fixture's submissions all belong to org-B
    });
    expect(byOrg['org-B']).toEqual(
      expect.objectContaining({ users: 1, students: 1, activeUsers: 1, submissions: 11 }),
    );
  });

  it('attributes org-less rows to the platform, never to an org', async () => {
    const { service } = build();
    const { byOrg, platform } = await service.census();
    expect(platform).toEqual({ superAdmins: 2, globalProblems: 30 });
    // The global catalog must not inflate any tenant's problem count.
    expect(byOrg['org-A'].problems).toBe(7);
    expect(Object.keys(byOrg).sort()).toEqual(['org-A', 'org-B']);
  });

  it('ignores an org-less non-superadmin instead of attributing it somewhere', async () => {
    const { service } = build({
      users: repo([{ orgId: null, role: Role.ADMIN, isActive: true, count: '1' }]),
    });
    const { byOrg, platform } = await service.census();
    expect(platform.superAdmins).toBe(0);
    expect(byOrg['org-A']?.users ?? 0).toBe(0);
  });

  it('narrows every aggregate to one tenant when orgId is given', async () => {
    const { service, repos } = build();
    await service.census('org-A');
    for (const r of Object.values(repos)) {
      const qb = r.createQueryBuilder.mock.results[0].value;
      expect(qb.params).toEqual(expect.objectContaining({ __censusOrg: 'org-A' }));
    }
  });

  it('counts only pending invites — accepted/revoked hold no seat', async () => {
    const { service, repos } = build();
    await service.census();
    const qb = repos.invites.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('i.status'), {
      pending: OrgInviteStatus.PENDING,
    });
  });
});

describe('PlatformMetricsService.countsForOrg', () => {
  it('returns the tenant bucket', async () => {
    const { service } = build();
    await expect(service.countsForOrg('org-A')).resolves.toEqual(
      expect.objectContaining({ users: 19, problems: 7, pendingInvites: 3 }),
    );
  });

  it('returns zeros for an org with no rows anywhere (never undefined)', async () => {
    const { service } = build({
      users: repo([]),
      invites: repo([]),
      classrooms: repo([]),
      problems: repo([]),
      assignments: repo([]),
      submissions: repo([]),
    });
    const counts = await service.countsForOrg('brand-new');
    expect(counts.users).toBe(0);
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });
});
