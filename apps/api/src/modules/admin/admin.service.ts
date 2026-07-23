import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AssignmentKind } from '../assignments/enums/assignment-kind.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { InviteStatus, RequestStatus } from '../onboarding/enums/onboarding.enums';
import { ProfessorInvite } from '../onboarding/entities/professor-invite.entity';
import { ProfessorRequest } from '../onboarding/entities/professor-request.entity';
import { Problem } from '../problems/entities/problem.entity';
import { Submission } from '../submissions/entities/submission.entity';
import { User } from '../users/entities/user.entity';

export interface AdminOverview {
  users: {
    total: number;
    admins: number;
    professors: number;
    students: number;
    active: number;
    inactive: number;
  };
  classrooms: { total: number };
  problems: { total: number };
  assignments: {
    total: number;
    byStatus: Record<AssignmentStatus, number>;
    tests: number;
  };
  submissions: { total: number };
  onboarding: { pendingRequests: number; activeInvites: number };
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Classroom) private readonly classrooms: Repository<Classroom>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(ProfessorRequest)
    private readonly professorRequests: Repository<ProfessorRequest>,
    @InjectRepository(ProfessorInvite)
    private readonly professorInvites: Repository<ProfessorInvite>,
  ) {}

  async overview(): Promise<AdminOverview> {
    const [
      usersTotal,
      admins,
      professors,
      students,
      activeUsers,
      classroomsTotal,
      problemsTotal,
      assignmentsTotal,
      tests,
      submissionsTotal,
      pendingRequests,
      activeInvites,
      statusRows,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { role: Role.ADMIN } }),
      this.users.count({ where: { role: Role.PROFESSOR } }),
      this.users.count({ where: { role: Role.STUDENT } }),
      this.users.count({ where: { isActive: true } }),
      this.classrooms.count(),
      this.problems.count(),
      this.assignments.count(),
      this.assignments.count({ where: { kind: AssignmentKind.TEST } }),
      this.submissions.count(),
      this.professorRequests.count({ where: { status: RequestStatus.PENDING } }),
      this.professorInvites
        .createQueryBuilder('i')
        .where('i.status = :pending', { pending: InviteStatus.PENDING })
        .andWhere('(i.expires_at IS NULL OR i.expires_at > now())')
        .getCount(),
      this.assignments
        .createQueryBuilder('a')
        .select('a.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.status')
        .getRawMany<{ status: AssignmentStatus; count: string }>(),
    ]);

    const byStatus: Record<AssignmentStatus, number> = {
      [AssignmentStatus.DRAFT]: 0,
      [AssignmentStatus.SCHEDULED]: 0,
      [AssignmentStatus.ACTIVE]: 0,
      [AssignmentStatus.COMPLETED]: 0,
      [AssignmentStatus.GRADE_PUBLISHED]: 0,
    };
    for (const row of statusRows) byStatus[row.status] = Number(row.count);

    return {
      users: {
        total: usersTotal,
        admins,
        professors,
        students,
        active: activeUsers,
        inactive: usersTotal - activeUsers,
      },
      classrooms: { total: classroomsTotal },
      problems: { total: problemsTotal },
      assignments: { total: assignmentsTotal, byStatus, tests },
      submissions: { total: submissionsTotal },
      onboarding: { pendingRequests, activeInvites },
    };
  }
}
