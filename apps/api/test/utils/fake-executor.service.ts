import { Language } from '../../src/common/enums/language.enum';
import { ExecOptions } from '../../src/modules/code-execution/executors/executor.service';
import { RawRun } from '../../src/modules/code-execution/piston/piston.types';

/**
 * Test double for ExecutorService — the real judge/queue/DB/WS pipeline runs
 * for real in e2e tests; only the sandboxed Piston call itself is faked, so
 * tests are fast and deterministic without needing a real Piston container.
 */
export class FakeExecutorService {
  private queued: RawRun[] = [];
  private defaultStdout = '42\n';

  /** Queue a canned response for the next execute() call (FIFO). */
  queueResponse(raw: RawRun): void {
    this.queued.push(raw);
  }

  setDefaultStdout(stdout: string): void {
    this.defaultStdout = stdout;
  }

  getRuntime(language: Language) {
    return {
      pistonLanguage: language,
      version: '1.0.0',
      mainFilename: 'main',
      compiled: false,
    };
  }

  defaultOptions(): ExecOptions {
    return { timeoutMs: 3000, memoryLimitBytes: 256_000_000, maxProcessCount: 64 };
  }

  async execute(
    _language: Language,
    _fullCode: string,
    _stdin: string,
    _opts: ExecOptions,
  ): Promise<RawRun> {
    const next = this.queued.shift();
    if (next) return next;
    return {
      run: {
        status: null,
        stdout: this.defaultStdout,
        stderr: '',
        code: 0,
        signal: null,
        memory: 1_000_000,
      },
      wallTimeMs: 5,
    };
  }
}
