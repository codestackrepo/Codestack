import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { JOB_JUDGE_SUBMISSION, QUEUE_JUDGE } from '../../../queue/queue.constants';
import { AssignmentsService } from '../../assignments/assignments.service';
import { AssignmentStatus } from '../../assignments/enums/assignment-status.enum';
import { LibraryProblemTemplate } from '../../problems/entities/library-problem-template.entity';
import { ProblemsService } from '../../problems/problems.service';
import { ExecutionJob } from '../../submissions/entities/execution-job.entity';
import { Submission } from '../../submissions/entities/submission.entity';
import { SubmissionContext } from '../../submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { SubmitCodeDto } from '../dto/code-execution.dto';

export interface SubmitResult {
  submissionId: string;
  status: SubmissionStatus;
}

/** Fields shared by both target contexts, resolved before the enqueue tail. */
interface SubmissionSeed {
  context: SubmissionContext;
  assignmentProblemId?: string;
  problemId?: string;
}

@Injectable()
export class CodeExecutionService {
  constructor(
    @InjectQueue(QUEUE_JUDGE) private readonly judgeQueue: Queue,
    @InjectRepository(LibraryProblemTemplate)
    private readonly libraryTemplates: Repository<LibraryProblemTemplate>,
    private readonly assignments: AssignmentsService,
    private readonly problems: ProblemsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Enqueues a submission for async judging. Returns immediately (202). */
  async submit(dto: SubmitCodeDto, actor: AuthenticatedUser): Promise<SubmitResult> {
    const seed =
      dto.context === SubmissionContext.PRACTICE
        ? await this.resolvePracticeSeed(dto.problemId, dto.language, actor)
        : await this.resolveAssignmentSeed(dto.assignmentProblemId, dto.language, actor);

    const submissionId = await this.dataSource.transaction(async (m) => {
      const submission = m.getRepository(Submission).create({
        userId: actor.id,
        context: seed.context,
        assignmentProblemId: seed.assignmentProblemId,
        problemId: seed.problemId ?? null,
        language: dto.language,
        userCode: dto.userCode,
        status: SubmissionStatus.PENDING,
      });
      const saved = await m.getRepository(Submission).save(submission);
      await m
        .getRepository(ExecutionJob)
        .save(
          m.getRepository(ExecutionJob).create({ submissionId: saved.id, queueJobId: saved.id }),
        );
      return saved.id;
    });

    // jobId = submissionId → BullMQ dedupes; two-layer idempotency with the
    // status===PENDING guard in the worker.
    await this.judgeQueue.add(JOB_JUDGE_SUBMISSION, { submissionId }, { jobId: submissionId });

    return { submissionId, status: SubmissionStatus.PENDING };
  }

  private async resolveAssignmentSeed(
    assignmentProblemId: string,
    language: SubmitCodeDto['language'],
    actor: AuthenticatedUser,
  ): Promise<SubmissionSeed> {
    const ap = await this.assignments.getAssignmentProblem(assignmentProblemId);
    const hasTemplate = ap.languageTemplates?.some((t) => t.language === language);
    if (!hasTemplate) {
      throw new BadRequestException(`Language ${language} is not enabled for this problem`);
    }
    // findOne() already restricts a PROFESSOR actor to their own classroom, so
    // if we reach here as PROFESSOR/ADMIN it's a legitimate staff test-submission
    // — those are exempt from the deadline gate (they also never affect scores).
    const assignment = await this.assignments.findOne(ap.assignmentId, actor);
    const isStaffTestSubmission = actor.role === Role.ADMIN || actor.role === Role.PROFESSOR;
    if (!isStaffTestSubmission && assignment.status !== AssignmentStatus.ACTIVE) {
      throw new ForbiddenException('This assignment is not open for submissions');
    }
    return { context: SubmissionContext.ASSIGNMENT, assignmentProblemId: ap.id };
  }

  /**
   * Practice target: enforce problem visibility, the §9.11 judge-ready hard
   * gate, and that a library driver exists for the language. No assignment or
   * deadline gate. Owner-only is enforced downstream on read (#27).
   */
  private async resolvePracticeSeed(
    problemId: string,
    language: SubmitCodeDto['language'],
    actor: AuthenticatedUser,
  ): Promise<SubmissionSeed> {
    const problem = await this.problems.findOne(problemId, actor); // visibility (403/404)
    if (!problem.isJudgeReady) {
      throw new BadRequestException('This problem is not available for practice judging yet');
    }
    const template = await this.libraryTemplates.findOne({ where: { problemId, language } });
    if (!template) {
      throw new BadRequestException(`Language ${language} is not enabled for this problem`);
    }
    return { context: SubmissionContext.PRACTICE, problemId };
  }
}
