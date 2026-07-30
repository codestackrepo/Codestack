import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AssignmentKind } from '../assignments/enums/assignment-kind.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { RequestStatus } from '../onboarding/enums/onboarding.enums';
import { OrgInviteStatus } from '../invites/enums/org-invite.enums';
import { OrgInvite } from '../invites/entities/org-invite.entity';
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
    @InjectRepository(OrgInvite)
    private readonly orgInvites: Repository<OrgInvite>,
  ) {}

  /**
   * Platform (SuperAdmin) or org-scoped (org-admin) overview. Every count forks
   * on isSuperAdmin: SuperAdmin sees cross-org totals; an org-admin sees only its
   * own org. A mis-provisioned org-admin (org=null) resolves to zeros, never the
   * platform-wide numbers.
   */
  async overview(actor: AuthenticatedUser): Promise<AdminOverview> {
    // Fresh scoped users query per count (getCount consumes the builder).
    const scopedUsers = () => scopeToOrg(this.users.createQueryBuilder('u'), 'u', actor);
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
      scopedUsers().getCount(),
      scopedUsers().andWhere('u.role = :r', { r: Role.ADMIN }).getCount(),
      scopedUsers().andWhere('u.role = :r', { r: Role.PROFESSOR }).getCount(),
      scopedUsers().andWhere('u.role = :r', { r: Role.STUDENT }).getCount(),
      scopedUsers().andWhere('u.is_active = :a', { a: true }).getCount(),
      scopeToOrg(this.classrooms.createQueryBuilder('c'), 'c', actor).getCount(),
      // #56 landed organization_id + scope on problems, so this is now the same
      // scopeToOrg fork as every other count (it replaces an author-org stopgap
      // that under-counted library / SET-NULL-author problems). SuperAdmin gets the
      // platform count incl. the global catalog; an org-admin gets its own org's
      // problems only — no includeGlobal, so this stays the number quota
      // enforcement charges against MAX_PROBLEMS (global is exempt, §5.4).
      scopeToOrg(this.problems.createQueryBuilder('p'), 'p', actor).getCount(),
      scopeToOrg(this.assignments.createQueryBuilder('a'), 'a', actor).getCount(),
      scopeToOrg(
        this.assignments.createQueryBuilder('a').where('a.kind = :k', { k: AssignmentKind.TEST }),
        'a',
        actor,
      ).getCount(),
      scopeToOrg(this.submissions.createQueryBuilder('s'), 's', actor).getCount(),
      // Scope onboarding rows via the requester's / inviter's org (join alias).
      scopeToOrg(
        this.professorRequests
          .createQueryBuilder('pr')
          .innerJoin('pr.user', 'u')
          .where('pr.status = :pending', { pending: RequestStatus.PENDING }),
        'u',
        actor,
      ).getCount(),
      // org_invites carries its own organization_id, so this scopes DIRECTLY
      // instead of through a join on the inviter. That also closes the old blind
      // spot: an invite whose inviter had since been deleted (invited_by_id NULL)
      // fell out of the join and was invisible to every org admin, while still
      // holding a seat. Predicate matches countSeats exactly.
      scopeToOrg(
        this.orgInvites
          .createQueryBuilder('i')
          .where('i.status = :pending', { pending: OrgInviteStatus.PENDING })
          .andWhere('i.expiresAt > now()'),
        'i',
        actor,
      ).getCount(),
      scopeToOrg(
        this.assignments
          .createQueryBuilder('a')
          .select('a.status', 'status')
          .addSelect('COUNT(*)', 'count'),
        'a',
        actor,
      )
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
