import { Role } from '../../common/enums/role.enum';
import { AssignmentKind } from '../assignments/enums/assignment-kind.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminService } from './admin.service';

/**
 * Chainable QueryBuilder stub. Records where/andWhere params (so scopeToOrg's
 * org predicate and role filters can drive getCount), returns configurable
 * counts / raw rows. Methods assigned after `qb` is created to avoid a
 * self-referential type-inference cycle.
 */
function makeQb(count: (p: Record<string, unknown>) => number, rawMany: unknown[] = []) {
  const params: Record<string, unknown> = {};
  const qb: Record<string, jest.Mock> = {};
  const ret = (): Record<string, jest.Mock> => qb;
  const record = (_sql: string, p?: Record<string, unknown>): Record<string, jest.Mock> => {
    if (p) Object.assign(params, p);
    return qb;
  };
  qb.where = jest.fn(record);
  qb.andWhere = jest.fn(record);
  qb.innerJoin = jest.fn(ret);
  qb.leftJoin = jest.fn(ret);
  qb.select = jest.fn(ret);
  qb.addSelect = jest.fn(ret);
  qb.groupBy = jest.fn(ret);
  qb.getCount = jest.fn(async () => count(params));
  qb.getRawMany = jest.fn(async () => rawMany);
  return qb;
}

const STATUS_ROWS = [
  { status: AssignmentStatus.ACTIVE, count: '2' },
  { status: AssignmentStatus.DRAFT, count: '1' },
];

function build() {
  const users = {
    createQueryBuilder: jest.fn(() =>
      makeQb((p) => {
        if (p.r === Role.ADMIN) return 1;
        if (p.r === Role.PROFESSOR) return 3;
        if (p.r === Role.STUDENT) return 6;
        if (p.a === true) return 8;
        return 10; // total
      }),
    ),
  };
  const classrooms = { createQueryBuilder: jest.fn(() => makeQb(() => 4)) };
  const problems = {
    // Kept mocked purely so a regression to an unscoped `problems.count()` fails.
    count: jest.fn().mockResolvedValue(20),
    // scopeToOrg binds __scopeActorOrg only for a non-superadmin, so the stub can
    // tell an org-scoped read (7) from the unfiltered platform read (20).
    createQueryBuilder: jest.fn(() => makeQb((p) => (p.__scopeActorOrg ? 7 : 20))),
  };
  const assignments = {
    createQueryBuilder: jest.fn(() =>
      makeQb((p) => (p.k === AssignmentKind.TEST ? 2 : 5), STATUS_ROWS),
    ),
  };
  const submissions = { createQueryBuilder: jest.fn(() => makeQb(() => 42)) };
  const professorRequests = { createQueryBuilder: jest.fn(() => makeQb(() => 3)) };
  const professorInvites = { createQueryBuilder: jest.fn(() => makeQb(() => 2)) };

  const service = new AdminService(
    users as never,
    classrooms as never,
    problems as never,
    assignments as never,
    submissions as never,
    professorRequests as never,
    professorInvites as never,
  );
  return { service, problems };
}

const superAdmin: AuthenticatedUser = {
  id: 'sa',
  email: 'sa@x.io',
  role: Role.SUPERADMIN,
  organizationId: null,
};
const orgAdmin: AuthenticatedUser = {
  id: 'a',
  email: 'a@x.io',
  role: Role.ADMIN,
  organizationId: 'org-A',
};

describe('AdminService.overview', () => {
  it('shapes the KPI object with per-role split, byStatus, and onboarding counts', async () => {
    const { service } = build();
    const o = await service.overview(orgAdmin);

    expect(o.users).toEqual({
      total: 10,
      admins: 1,
      professors: 3,
      students: 6,
      active: 8,
      inactive: 2,
    });
    expect(o.classrooms.total).toBe(4);
    expect(o.assignments.total).toBe(5);
    expect(o.assignments.tests).toBe(2);
    expect(o.assignments.byStatus[AssignmentStatus.ACTIVE]).toBe(2);
    expect(o.assignments.byStatus[AssignmentStatus.DRAFT]).toBe(1);
    expect(o.assignments.byStatus[AssignmentStatus.COMPLETED]).toBe(0);
    expect(o.submissions.total).toBe(42);
    expect(o.onboarding).toEqual({ pendingRequests: 3, activeInvites: 2 });
  });

  it('org-admin problemsTotal is org-scoped via problems.organization_id (NOT platform-wide)', async () => {
    const { service, problems } = build();
    const o = await service.overview(orgAdmin);
    expect(o.problems.total).toBe(7); // own org only
    expect(problems.count).not.toHaveBeenCalled(); // never an unscoped read
    const qb = problems.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('p.organizationId'),
      expect.objectContaining({ __scopeActorOrg: 'org-A' }),
    );
  });

  it('superadmin problemsTotal spans every org plus the global catalog', async () => {
    const { service, problems } = build();
    const o = await service.overview(superAdmin);
    expect(o.problems.total).toBe(20);
    const qb = problems.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).not.toHaveBeenCalled(); // unfiltered by design
  });
});
