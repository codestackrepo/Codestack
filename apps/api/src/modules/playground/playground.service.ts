import { Injectable } from '@nestjs/common';
import { Language } from '../../common/enums/language.enum';
import { ExecutorService } from '../code-execution/executors/executor.service';
import { VerdictService } from '../code-execution/services/verdict.service';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';

export interface PlaygroundResult {
  status: SubmissionStatus;
  stdout: string;
  error: string;
  runtimeMs: number;
}

/**
 * Public, stateless code runner (like a TS/Namaste playground). Runs RAW user
 * code (no driver merge, no expected-output comparison) through the shared
 * Piston pool. No persistence. Failure classification reuses
 * VerdictService.classifyRunOutcome so compile/timeout/memory/runtime-error
 * handling never drifts from the judge's rules.
 */
@Injectable()
export class PlaygroundService {
  constructor(
    private readonly executor: ExecutorService,
    private readonly verdict: VerdictService,
  ) {}

  async run(language: Language, userCode: string, stdin: string): Promise<PlaygroundResult> {
    const rt = this.executor.getRuntime(language);
    const opts = this.executor.defaultOptions();
    const raw = await this.executor.execute(language, userCode, stdin, opts);

    const outcome = this.verdict.classifyRunOutcome(raw, {
      memoryLimitBytes: opts.memoryLimitBytes,
      compiled: rt.compiled,
    });
    const status = outcome ?? SubmissionStatus.FINISHED;
    return {
      status,
      stdout: raw.run.stdout,
      error:
        status === SubmissionStatus.FINISHED ? '' : raw.run.stderr || (raw.transportError ?? ''),
      runtimeMs: Math.round(raw.wallTimeMs),
    };
  }
}
