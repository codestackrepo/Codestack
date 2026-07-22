import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Submission } from './entities/submission.entity';
import { TestCaseResult } from './entities/test-case-result.entity';

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
    const submission = await this.submissions.findOne({ where: { id } });
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
    return this.submissions.find({
      where: { assignmentProblemId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  private async assertCanView(actor: AuthenticatedUser, submission: Submission): Promise<void> {
    if (submission.userId === actor.id) return;
    if (actor.role === Role.STUDENT) {
      throw new ForbiddenException('You cannot view this submission');
    }
    await this.assertStaffOrGraderForProblem(actor, submission.assignmentProblemId);
  }

  /** Admin bypasses; professor/grader must belong to the owning classroom. */
  private async assertStaffOrGraderForProblem(
    actor: AuthenticatedUser,
    assignmentProblemId: string,
  ): Promise<void> {
    if (actor.role === Role.ADMIN) return;
    const ap = await this.assignmentProblems.findOne({
      where: { id: assignmentProblemId },
      relations: { assignment: true },
    });
    if (!ap) throw new NotFoundException('Assignment problem not found');
    const classroom = await this.classrooms.getDetail(ap.assignment.classroomId);
    this.classrooms.assertStaffOrGrader(actor, classroom);
  }
}
