import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrg, isSuperAdmin, scopeToOrg } from '../../common/tenancy/tenant-scope.util';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Submission } from './entities/submission.entity';
import { TestCaseResult } from './entities/test-case-result.entity';
import { SubmissionContext } from './enums/submission-context.enum';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(TestCaseResult) private readonly results: Repository<TestCaseResult>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    private readonly classrooms: ClassroomsService,
  ) {}

  async getById(id: string, actor: AuthenticatedUser): Promise<Submission> {
    // Org-scoped so a cross-org id 404s with no existence disclosure.
    const qb = this.submissions.createQueryBuilder('s').where('s.id = :id', { id });
    scopeToOrg(qb, 's', actor);
    const submission = await qb.getOne();
    if (!submission) throw new NotFoundException('Submission not found');
    await this.assertCanView(actor, submission);
    return submission;
  }

  async getResults(submissionId: string): Promise<TestCaseResult[]> {
    return this.results.find({
      where: { submissionId },
      order: { ordinal: 'ASC' },
    });
  }

  async listForProblem(
    assignmentProblemId: string,
    userId: string,
    actor: AuthenticatedUser,
  ): Promise<Submission[]> {
    if (userId !== actor.id) {
      // Viewing someone else's submissions requires staff/grader standing in
      // the owning classroom — not just "any professor/admin" (cross-tenant
      // access was previously ungated here).
      await this.assertStaffOrGraderForProblem(actor, assignmentProblemId);
    }
    const qb = this.submissions
      .createQueryBuilder('s')
      .where('s.assignmentProblemId = :assignmentProblemId', { assignmentProblemId })
      .andWhere('s.userId = :userId', { userId })
      .orderBy('s.createdAt', 'DESC');
    scopeToOrg(qb, 's', actor);
    return qb.getMany();
  }

  private async assertCanView(actor: AuthenticatedUser, submission: Submission): Promise<void> {
    if (submission.userId === actor.id) return;
    if (actor.role === Role.STUDENT) {
      throw new ForbiddenException('You cannot view this submission');
    }
    await this.assertStaffOrGraderForProblem(actor, submission.assignmentProblemId);
  }

  /**
   * Whether the actor may read the FULL verdict/per-test detail of a submission
   * (§9.1). True for admin, for staff/graders of an assignment submission's
   * classroom, and for the owner of a PRACTICE submission. False for a student
   * viewing their own ASSIGNMENT submission (blind submit).
   */
  async canViewFullDetail(actor: AuthenticatedUser, submission: Submission): Promise<boolean> {
    if (isSuperAdmin(actor)) return true;
    if (submission.context === SubmissionContext.PRACTICE) {
      return submission.userId === actor.id; // practice owner sees full
    }
    // Assignment: staff/grader of the classroom see full; the student does not.
    try {
      await this.assertStaffOrGraderForProblem(actor, submission.assignmentProblemId);
      return true;
    } catch {
      return false;
    }
  }

  /** Admin bypasses; professor/grader must belong to the owning classroom. */
  private async assertStaffOrGraderForProblem(
    actor: AuthenticatedUser,
    assignmentProblemId: string,
  ): Promise<void> {
    if (isSuperAdmin(actor)) return;
    const ap = await this.assignmentProblems.findOne({
      where: { id: assignmentProblemId },
      relations: { assignment: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    assertSameOrg(actor, ap.assignment.organizationId); // bound before loading the classroom
    const classroom = await this.classrooms.getDetail(ap.assignment.classroomId);
    this.classrooms.assertStaffOrGrader(actor, classroom);
  }
}
