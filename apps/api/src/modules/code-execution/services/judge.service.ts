import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SUBMISSION_FINALIZED,
  SubmissionFinalizedEvent,
} from '../../../common/events/submission-events';
import { AssignmentProblem } from '../../assignments/entities/assignment-problem.entity';
import { ProblemTemplate } from '../../assignments/entities/problem-template.entity';
import { TestCase } from '../../problems/entities/test-case.entity';
import { ExecutionJob, ExecutionJobStatus } from '../../submissions/entities/execution-job.entity';
import { Submission } from '../../submissions/entities/submission.entity';
import { TestCaseResult } from '../../submissions/entities/test-case-result.entity';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { RawRun } from '../piston/piston.types';
import { DriverMergeService } from './driver-merge.service';
import { ExecutorService } from '../executors/executor.service';
import { DEFAULT_COMPARE_CONFIG } from './normalizer.service';
import { SubmissionEventsService } from '../realtime/submission-events.service';
import { VerdictService } from './verdict.service';

const OUTPUT_CAP = 8192;
const PER_SUBMISSION_CONCURRENCY = 4;

interface TcOutcome {
  ordinal: number;
  testCase: TestCase;
  verdict: SubmissionStatus;
  raw: RawRun;
}

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(TestCaseResult) private readonly results: Repository<TestCaseResult>,
    @InjectRepository(ExecutionJob) private readonly jobs: Repository<ExecutionJob>,
    @InjectRepository(ProblemTemplate) private readonly templates: Repository<ProblemTemplate>,
    @InjectRepository(TestCase) private readonly testCases: Repository<TestCase>,
    @InjectRepository(AssignmentProblem)
    private readonly assignmentProblems: Repository<AssignmentProblem>,
    private readonly executor: ExecutorService,
    private readonly verdict: VerdictService,
    private readonly driverMerge: DriverMergeService,
    private readonly events: SubmissionEventsService,
    private readonly emitter: EventEmitter2,
  ) {}

  async judge(submissionId: string): Promise<void> {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) {
      this.logger.warn(`Submission ${submissionId} not found`);
      return;
    }
    // Idempotency: only PENDING submissions are judged.
    if (submission.status !== SubmissionStatus.PENDING) {
      this.logger.log(`Submission ${submissionId} already ${submission.status}, skipping`);
      return;
    }

    await this.markRunning(submission);

    try {
      const ap = await this.assignmentProblems.findOne({
        where: { id: submission.assignmentProblemId },
      });
      if (!ap) return this.finalize(submission, SubmissionStatus.INTERNAL_ERROR, [], 0);

      const template = await this.templates.findOne({
        where: { assignmentProblemId: ap.id, language: submission.language },
      });
      const cases = await this.testCases.find({
        where: { problemId: ap.problemId, isActive: true },
        order: { orderIndex: 'ASC' },
      });

      const fullCode = this.driverMerge.merge(template?.driverCode ?? '', submission.userCode);
      const outcomes = await this.runAll(submission, cases, fullCode);

      // Compile/syntax errors short-circuit the aggregate to that verdict.
      const compileFail = outcomes.find(
        (o) =>
          o.verdict === SubmissionStatus.COMPILE_ERROR ||
          o.verdict === SubmissionStatus.SYNTAX_ERROR,
      );
      await this.persistResults(submission.id, outcomes);
      await this.finalize(
        submission,
        this.aggregate(outcomes),
        outcomes,
        cases.length,
        compileFail,
      );
    } catch (err) {
      this.logger.error(`Judge failed for ${submissionId}: ${String(err)}`);
      await this.finalize(submission, SubmissionStatus.INTERNAL_ERROR, [], 0);
    }
  }

  private async markRunning(submission: Submission): Promise<void> {
    submission.status = SubmissionStatus.RUNNING;
    await this.submissions.save(submission);
    await this.jobs.update(
      { submissionId: submission.id },
      { status: ExecutionJobStatus.RUNNING, startedAt: new Date() },
    );
    await this.emitStatus(submission);
  }

  private async runAll(
    submission: Submission,
    cases: TestCase[],
    fullCode: string,
  ): Promise<TcOutcome[]> {
    const rt = this.executor.getRuntime(submission.language);
    const defaults = this.executor.defaultOptions();

    const runOne = async (tc: TestCase, index: number): Promise<TcOutcome> => {
      const opts = {
        timeoutMs: tc.timeLimitMs ?? defaults.timeoutMs,
        memoryLimitBytes: tc.memoryLimitBytes
          ? Number(tc.memoryLimitBytes)
          : defaults.memoryLimitBytes,
        maxProcessCount: defaults.maxProcessCount,
      };
      const raw = await this.executor.execute(submission.language, fullCode, tc.inputData, opts);
      const verdict = this.verdict.classify(raw, {
        expected: tc.expectedOutput,
        compareConfig: DEFAULT_COMPARE_CONFIG,
        memoryLimitBytes: opts.memoryLimitBytes,
        compiled: rt.compiled,
      });
      const outcome: TcOutcome = { ordinal: index, testCase: tc, verdict, raw };
      await this.emitTestcase(submission, index, verdict);
      return outcome;
    };

    return this.mapWithConcurrency(cases, PER_SUBMISSION_CONCURRENCY, runOne);
  }

  private aggregate(outcomes: TcOutcome[]): SubmissionStatus {
    if (!outcomes.length) return SubmissionStatus.ACCEPTED;
    if (outcomes.every((o) => o.verdict === SubmissionStatus.ACCEPTED)) {
      return SubmissionStatus.ACCEPTED;
    }
    // Representative failing verdict = the lowest-ordinal failing testcase.
    const failing = outcomes
      .filter((o) => o.verdict !== SubmissionStatus.ACCEPTED)
      .sort((a, b) => a.ordinal - b.ordinal);
    return failing[0].verdict;
  }

  private async persistResults(submissionId: string, outcomes: TcOutcome[]): Promise<void> {
    // Idempotent on retry: replace prior results for this submission.
    await this.results.delete({ submissionId });
    if (!outcomes.length) return;
    const rows = outcomes.map((o) => {
      const stdout = this.cap(o.raw.run.stdout);
      const stderr = this.cap(o.raw.run.stderr);
      return this.results.create({
        submissionId,
        testCaseId: o.testCase.id,
        ordinal: o.ordinal,
        verdict: o.verdict,
        runtimeMs: Math.round(o.raw.wallTimeMs),
        memoryBytes: String(o.raw.run.memory ?? 0),
        exitCode: o.raw.run.code,
        stdout: stdout.value,
        stderr: stderr.value,
        outputExtracted: this.cap(o.raw.run.stdout).value,
        truncated: stdout.truncated || stderr.truncated,
        isSample: o.testCase.type === 'sample',
      });
    });
    await this.results.save(rows);
  }

  private async finalize(
    submission: Submission,
    status: SubmissionStatus,
    outcomes: TcOutcome[],
    total: number,
    compileFail?: TcOutcome,
  ): Promise<void> {
    const passed = outcomes.filter((o) => o.verdict === SubmissionStatus.ACCEPTED).length;
    const maxRuntime = outcomes.reduce((m, o) => Math.max(m, o.raw.wallTimeMs), 0);
    const maxMemory = outcomes.reduce((m, o) => Math.max(m, o.raw.run.memory ?? 0), 0);

    submission.status = status;
    submission.passedTestcaseCount = passed;
    submission.totalTestcaseCount = total;
    submission.runtimeMs = outcomes.length ? Math.round(maxRuntime) : null;
    submission.memoryBytes = outcomes.length ? String(maxMemory) : null;

    if (status !== SubmissionStatus.ACCEPTED) {
      const failed =
        compileFail ??
        outcomes
          .filter((o) => o.verdict !== SubmissionStatus.ACCEPTED)
          .sort((a, b) => a.ordinal - b.ordinal)[0];
      if (failed) {
        submission.failedTestcaseDetail = {
          input: failed.testCase.inputData,
          expected: failed.testCase.expectedOutput,
          output: this.cap(failed.raw.run.stdout).value,
          error: this.cap(failed.raw.run.stderr).value,
          stdout: this.cap(failed.raw.run.stdout).value,
        };
      }
    } else {
      submission.failedTestcaseDetail = null;
    }

    await this.submissions.save(submission);
    await this.jobs.update(
      { submissionId: submission.id },
      { status: ExecutionJobStatus.COMPLETED, finishedAt: new Date() },
    );
    await this.emitStatus(submission);
    this.emitter.emit(SUBMISSION_FINALIZED, {
      submissionId: submission.id,
    } as SubmissionFinalizedEvent);
  }

  // ---- helpers ----

  private async emitStatus(submission: Submission): Promise<void> {
    const payload = {
      submissionId: submission.id,
      status: submission.status,
      passedTestcaseCount: submission.passedTestcaseCount,
      totalTestcaseCount: submission.totalTestcaseCount,
      runtimeMs: submission.runtimeMs,
      memoryBytes: submission.memoryBytes,
    };
    await this.events.cacheSnapshot(submission.id, payload);
    await this.events.publish({
      type: 'status',
      submissionId: submission.id,
      userId: submission.userId,
      payload,
    });
  }

  private async emitTestcase(
    submission: Submission,
    ordinal: number,
    verdict: SubmissionStatus,
  ): Promise<void> {
    await this.events.publish({
      type: 'testcase',
      submissionId: submission.id,
      userId: submission.userId,
      payload: { submissionId: submission.id, ordinal, verdict },
    });
  }

  private cap(s: string): { value: string; truncated: boolean } {
    if (!s) return { value: '', truncated: false };
    if (s.length <= OUTPUT_CAP) return { value: s, truncated: false };
    return { value: s.slice(0, OUTPUT_CAP), truncated: true };
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }
}
