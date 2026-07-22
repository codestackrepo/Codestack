import { Injectable } from '@nestjs/common';
import { Language } from '../../../common/enums/language.enum';
import { DriverMergeService } from '../../code-execution/services/driver-merge.service';
import { ExecutorService } from '../../code-execution/executors/executor.service';
import { DEFAULT_COMPARE_CONFIG } from '../../code-execution/services/normalizer.service';
import { VerdictService } from '../../code-execution/services/verdict.service';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';
import { DriverSynthService } from '../driver-synth/driver-synth.service';
import { encodeExpectedOutput, encodeStdin } from '../driver-synth/io-codec';
import { PerLanguagePass } from '../entities/generated-problem-link.entity';
import { GeneratedProblem, TestCaseIo } from '../llm/schemas/generated-problem.schema';

const ALL_LANGUAGES: Language[] = [
  Language.PYTHON,
  Language.JAVASCRIPT,
  Language.JAVA,
  Language.CPP,
];

export interface ValidationResult {
  perLanguagePass: PerLanguagePass;
  /** First failure reason encountered, across any language — feeds the repair loop. */
  failureReason: string | null;
}

/**
 * Renders each language's `reference_solution` into a deterministically
 * synthesized driver and runs it through the real judge pieces
 * (DriverMergeService → ExecutorService → VerdictService) against every
 * declared testcase. This is what makes a generated problem "solvable" by
 * construction rather than by the LLM's say-so: a generated problem is only
 * materialized once its own reference solution actually passes its own
 * testcases through the same pipeline a student's submission would run
 * through. Python and JavaScript are required (the schema's baseline
 * languages); Java/C++ are best-effort — a failing one is simply omitted
 * from the materialized problem rather than failing the whole generation.
 */
@Injectable()
export class SelfValidationService {
  constructor(
    private readonly driverSynth: DriverSynthService,
    private readonly driverMerge: DriverMergeService,
    private readonly executor: ExecutorService,
    private readonly verdict: VerdictService,
  ) {}

  async validate(problem: GeneratedProblem): Promise<ValidationResult> {
    const perLanguagePass: PerLanguagePass = {};
    let failureReason: string | null = null;
    const testcases = [...problem.sample_testcases, ...problem.hidden_testcases];

    for (const language of ALL_LANGUAGES) {
      const outcome = await this.validateLanguage(language, problem, testcases);
      perLanguagePass[language] = outcome.pass;
      if (!outcome.pass && !failureReason) {
        failureReason = `[${language}] ${outcome.reason}`;
      }
    }

    return { perLanguagePass, failureReason };
  }

  isReady(perLanguagePass: PerLanguagePass): boolean {
    return Boolean(perLanguagePass.python && perLanguagePass.javascript);
  }

  private async validateLanguage(
    language: Language,
    problem: GeneratedProblem,
    testcases: TestCaseIo[],
  ): Promise<{ pass: boolean; reason: string }> {
    let driverCode: string;
    try {
      driverCode = this.driverSynth.synthesize(language, problem.function_name, problem.io_spec);
    } catch (err) {
      return { pass: false, reason: `driver synthesis failed: ${(err as Error).message}` };
    }

    const fullCode = this.driverMerge.merge(driverCode, problem.reference_solution[language]);
    const runtime = this.executor.getRuntime(language);
    const opts = this.executor.defaultOptions();

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      let stdin: string;
      let expected: string;
      try {
        stdin = encodeStdin(problem.io_spec, tc.inputs);
        expected = encodeExpectedOutput(tc.expected);
      } catch (err) {
        return { pass: false, reason: `testcase #${i + 1}: ${(err as Error).message}` };
      }

      const raw = await this.executor.execute(language, fullCode, stdin, opts);
      const status = this.verdict.classify(raw, {
        memoryLimitBytes: opts.memoryLimitBytes,
        compiled: runtime.compiled,
        expected,
        compareConfig: DEFAULT_COMPARE_CONFIG,
      });

      if (status !== SubmissionStatus.ACCEPTED) {
        return {
          pass: false,
          reason: `testcase #${i + 1}: reference solution produced ${status} (expected Accepted)`,
        };
      }
    }

    return { pass: true, reason: '' };
  }
}
