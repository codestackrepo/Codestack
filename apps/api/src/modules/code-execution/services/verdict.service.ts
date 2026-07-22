import { Injectable } from '@nestjs/common';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { RawRun } from '../piston/piston.types';
import { CompareConfig, NormalizerService } from './normalizer.service';

export interface RunOutcomeContext {
  memoryLimitBytes: number;
  /** true for compiled languages — enables real compile-stage verdicts. */
  compiled: boolean;
}

export interface ClassifyContext extends RunOutcomeContext {
  expected: string;
  compareConfig: CompareConfig;
}

/**
 * Pure verdict classifier: maps a Piston run into a verdict. Order of checks
 * mirrors and generalizes the original, but uses Piston's real compile block
 * (language-aware) instead of a Python-centric stderr substring heuristic.
 */
@Injectable()
export class VerdictService {
  constructor(private readonly normalizer: NormalizerService) {}

  /** Full judge classification: failure checks, then output comparison. */
  classify(raw: RawRun, ctx: ClassifyContext): SubmissionStatus {
    const outcome = this.classifyRunOutcome(raw, ctx);
    if (outcome) return outcome;
    const ok = this.normalizer.compare(raw.run.stdout, ctx.expected, ctx.compareConfig);
    return ok ? SubmissionStatus.ACCEPTED : SubmissionStatus.WRONG_ANSWER;
  }

  /**
   * Classifies transport/compile/timeout/memory/runtime failures common to
   * any Piston run — shared by the judge (which then compares output) and
   * the playground (which has no "expected" to compare against). Returns
   * `null` when the process completed cleanly.
   */
  classifyRunOutcome(raw: RawRun, ctx: RunOutcomeContext): SubmissionStatus | null {
    if (raw.transportError) return SubmissionStatus.INTERNAL_ERROR;

    // 1. Compile stage (compiled languages only).
    if (ctx.compiled && raw.compile && raw.compile.code !== 0 && raw.compile.code !== null) {
      return SubmissionStatus.COMPILE_ERROR;
    }

    const run = raw.run;

    // 2. Timeout.
    if (run.status === 'TO') return SubmissionStatus.TIME_LIMIT_EXCEEDED;

    // 3. Memory-limit (honest MLE: killed by signal near the memory ceiling).
    if (run.signal === 'SIGKILL' && run.memory > 0 && run.memory >= ctx.memoryLimitBytes * 0.98) {
      return SubmissionStatus.MEMORY_LIMIT_EXCEEDED;
    }

    // 4. Runtime error — gated on the actual exit signal, NOT on stderr being
    // non-empty. Many correct programs legitimately write to stderr (Python
    // DeprecationWarning, Node warnings, JVM "Picked up JAVA_TOOL_OPTIONS",
    // debug prints, ...) while still exiting 0; treating any stderr output as
    // a failure would mislabel those accepted solutions as Runtime Error.
    // A process killed by any signal (fork-bomb protection, external limits,
    // a non-memory-related kill that didn't meet the MLE threshold above)
    // never produces a normal exit code — `run.code` stays null — so it must
    // be checked explicitly, not just inferred from a nonzero code.
    if (run.status === 'RE' || run.signal !== null || (run.code !== null && run.code !== 0)) {
      // Interpreted-language syntax errors surface here; keep the historical
      // Syntax Error label for that specific signature.
      if (!ctx.compiled && /SyntaxError|IndentationError/.test(run.stderr)) {
        return SubmissionStatus.SYNTAX_ERROR;
      }
      return SubmissionStatus.RUNTIME_ERROR;
    }

    return null;
  }
}
