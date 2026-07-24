import { Role } from '../../common/enums/role.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { AdminService } from './admin.service';

describe('AdminService.overview', () => {
  it('shapes the KPI object with per-role split, byStatus, and onboarding counts', async () => {
    const users = {
      count: jest.fn(async (opts?: { where?: { role?: Role; isActive?: boolean } }) => {
        if (!opts?.where) return 10;
        if (opts.where.role === Role.ADMIN) return 1;
        if (opts.where.role === Role.PROFESSOR) return 3;
        if (opts.where.role === Role.STUDENT) return 6;
        if (opts.where.isActive === true) return 8;
        return 0;
      }),
    };
    const classrooms = { count: jest.fn().mockResolvedValue(4) };
    const problems = { count: jest.fn().mockResolvedValue(20) };
    const statusQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: AssignmentStatus.ACTIVE, count: '2' },
        { status: AssignmentStatus.DRAFT, count: '1' },
      ]),
    };
    const assignments = {
      count: jest.fn(async (opts?: { where?: { kind?: string } }) => (opts?.where?.kind ? 2 : 5)),
      createQueryBuilder: jest.fn(() => statusQb),
    };
    const submissions = { count: jest.fn().mockResolvedValue(42) };
    const professorRequests = { count: jest.fn().mockResolvedValue(3) };
    const inviteQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
    };
    const professorInvites = { createQueryBuilder: jest.fn(() => inviteQb) };

    const service = new AdminService(
      users as never,
      classrooms as never,
      problems as never,
      assignments as never,
      submissions as never,
      professorRequests as never,
      professorInvites as never,
    );

    const o = await service.overview();

    expect(o.users).toEqual({
      total: 10,
      admins: 1,
      professors: 3,
      students: 6,
      active: 8,
      inactive: 2,
    });
    expect(o.classrooms.total).toBe(4);
    expect(o.problems.total).toBe(20);
    expect(o.assignments.total).toBe(5);
    expect(o.assignments.tests).toBe(2);
    expect(o.assignments.byStatus[AssignmentStatus.ACTIVE]).toBe(2);
    expect(o.assignments.byStatus[AssignmentStatus.DRAFT]).toBe(1);
    expect(o.assignments.byStatus[AssignmentStatus.COMPLETED]).toBe(0);
    expect(o.submissions.total).toBe(42);
    expect(o.onboarding).toEqual({ pendingRequests: 3, activeInvites: 2 });
  });
});
