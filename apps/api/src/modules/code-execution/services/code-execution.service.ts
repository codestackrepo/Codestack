import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { JOB_JUDGE_SUBMISSION, QUEUE_JUDGE } from '../../../queue/queue.constants';
import { AssignmentsService } from '../../assignments/assignments.service';
import { AssignmentStatus } from '../../assignments/enums/assignment-status.enum';
import { ExecutionJob } from '../../submissions/entities/execution-job.entity';
import { Submission } from '../../submissions/entities/submission.entity';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { SubmitCodeDto } from '../dto/code-execution.dto';

export interface SubmitResult {
  submissionId: string;
  status: SubmissionStatus;
}

@Injectable()
export class CodeExecutionService {
  constructor(
    @InjectQueue(QUEUE_JUDGE) private readonly judgeQueue: Queue,
    private readonly assignments: AssignmentsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Enqueues a submission for async judging. Returns immediately (202). */
  async submit(dto: SubmitCodeDto, actor: AuthenticatedUser): Promise<SubmitResult> {
    const ap = await this.assignments.getAssignmentProblem(dto.assignmentProblemId);
    const hasTemplate = ap.languageTemplates?.some((t) => t.language === dto.language);
    if (!hasTemplate) {
      throw new BadRequestException(`Language ${dto.language} is not enabled for this problem`);
    }
    // Enforce the actor may access this assignment (membership + visibility).
    // findOne() already restricts a PROFESSOR actor to their own classroom,
    // so if we reach this point as PROFESSOR/ADMIN it's a legitimate staff
    // test-submission — those are exempt from the deadline gate below (they
    // also never affect scores; see GradingService.onSubmissionFinalized).
    const assignment = await this.assignments.findOne(ap.assignmentId, actor);
    const isStaffTestSubmission = actor.role === Role.ADMIN || actor.role === Role.PROFESSOR;
    if (!isStaffTestSubmission && assignment.status !== AssignmentStatus.ACTIVE) {
      throw new ForbiddenException('This assignment is not open for submissions');
    }

    const submissionId = await this.dataSource.transaction(async (m) => {
      const submission = m.getRepository(Submission).create({
        userId: actor.id,
        assignmentProblemId: ap.id,
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
}
