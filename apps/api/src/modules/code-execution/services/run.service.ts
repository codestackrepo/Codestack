import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AssignmentsService } from '../../assignments/assignments.service';
import { ProblemTemplate } from '../../assignments/entities/problem-template.entity';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { RunCodeDto } from '../dto/code-execution.dto';
import { ExecutorService } from '../executors/executor.service';
import { DEFAULT_COMPARE_CONFIG } from './normalizer.service';
import { VerdictService } from './verdict.service';
import { DriverMergeService } from './driver-merge.service';

export interface RunResult {
  status: SubmissionStatus;
  results: Array<{
    input: string;
    expected: string;
    output: string;
    error: string;
    status: SubmissionStatus;
  }>;
}

/**
 * Synchronous "run against sample testcases" path (no persistence, no queue).
 * Still routed through the shared Piston pool so it can't overwhelm the judge.
 */
@Injectable()
export class RunService {
  constructor(
    @InjectRepository(ProblemTemplate) private readonly templates: Repository<ProblemTemplate>,
    private readonly assignments: AssignmentsService,
    private readonly executor: ExecutorService,
    private readonly verdict: VerdictService,
    private readonly driverMerge: DriverMergeService,
  ) {}

  async run(dto: RunCodeDto, actor: AuthenticatedUser): Promise<RunResult> {
    const ap = await this.assignments.getAssignmentProblem(dto.assignmentProblemId);
    await this.assignments.findOne(ap.assignmentId, actor);

    const template = await this.templates.findOne({
      where: { assignmentProblemId: ap.id, language: dto.language },
    });
    const fullCode = this.driverMerge.merge(template?.driverCode ?? '', dto.userCode);
    const rt = this.executor.getRuntime(dto.language);
    const opts = this.executor.defaultOptions();

    const results: RunResult['results'] = [];
    for (const tc of dto.sampleTestcases) {
      const raw = await this.executor.execute(dto.language, fullCode, tc.input, opts);
      const status = this.verdict.classify(raw, {
        expected: tc.expected,
        compareConfig: DEFAULT_COMPARE_CONFIG,
        memoryLimitBytes: opts.memoryLimitBytes,
        compiled: rt.compiled,
      });
      results.push({
        input: tc.input,
        expected: tc.expected,
        output: raw.run.stdout,
        error: raw.run.stderr,
        status,
      });
    }

    // Overall status reflects the actual failure kind (matching
    // JudgeService's "lowest-ordinal failing testcase" rule) instead of
    // collapsing every non-pass into Wrong Answer — a Compile Error or TLE
    // sample run should not be misreported as a wrong answer.
    const firstFailure = results.find((r) => r.status !== SubmissionStatus.ACCEPTED);
    const overall = firstFailure ? firstFailure.status : SubmissionStatus.ACCEPTED;
    return { status: overall, results };
  }
}
