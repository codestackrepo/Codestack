import { DriverMergeService } from '../../code-execution/services/driver-merge.service';
import { NormalizerService } from '../../code-execution/services/normalizer.service';
import { VerdictService } from '../../code-execution/services/verdict.service';
import { DriverSynthService } from '../driver-synth/driver-synth.service';
import { GeneratedProblem } from '../llm/schemas/generated-problem.schema';
import { SelfValidationService } from './self-validation.service';

/** FIFO fake mirroring test/utils/fake-executor.service.ts's shape, local to
 * unit tests so this suite has no dependency on the e2e-only test/ tree. */
class FakeExecutor {
  private queued: any[] = [];
  queueResponse(raw: any): void {
    this.queued.push(raw);
  }
  getRuntime() {
    return { pistonLanguage: 'x', version: '1', mainFilename: 'main', compiled: false };
  }
  defaultOptions() {
    return { timeoutMs: 3000, memoryLimitBytes: 256_000_000, maxProcessCount: 64 };
  }
  async execute(): Promise<any> {
    const next = this.queued.shift();
    if (next) return next;
    return {
      run: { status: null, stdout: '', stderr: '', code: 0, signal: null, memory: 0 },
      wallTimeMs: 1,
    };
  }
}

const okRun = (stdout: string) => ({
  run: { status: null, stdout, stderr: '', code: 0, signal: null, memory: 1_000_000 },
  wallTimeMs: 5,
});

const problem: GeneratedProblem = {
  title: 'Second Largest',
  statement_markdown: 'Find the second largest element in an array of distinct integers.',
  difficulty: 'easy',
  tags: ['arrays'],
  constraints: ['2 <= n <= 100000'],
  function_name: 'secondLargest',
  io_spec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
  reference_solution: {
    python: 'def secondLargest(nums):\n    return sorted(set(nums))[-2]\n',
    javascript:
      'function secondLargest(nums) { return [...new Set(nums)].sort((a,b)=>a-b).at(-2); }\n',
    java: 'class Solution { static int secondLargest(int[] nums) { return 0; } }\n',
    cpp: 'int secondLargest(std::vector<int> nums) { return 0; }\n',
  },
  starter_code: {
    python: 'def secondLargest(nums):\n    pass\n',
    javascript: 'function secondLargest(nums) {}\n',
    java: 'class Solution { static int secondLargest(int[] nums) { return 0; } }\n',
    cpp: 'int secondLargest(std::vector<int> nums) { return 0; }\n',
  },
  sample_testcases: [{ inputs: [[3, 1, 4]], expected: 3 }],
  hidden_testcases: [{ inputs: [[9, 2, 6]], expected: 6 }],
};

function makeService(executor: FakeExecutor) {
  const normalizer = new NormalizerService();
  return new SelfValidationService(
    new DriverSynthService(),
    new DriverMergeService(),
    executor as any,
    new VerdictService(normalizer),
  );
}

describe('SelfValidationService', () => {
  it('passes every language when every testcase produces the expected output', async () => {
    const executor = new FakeExecutor();
    // 2 testcases x 4 languages = 8 execute() calls, all matching expected.
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));

    const service = makeService(executor);
    const result = await service.validate(problem);

    expect(result.perLanguagePass).toEqual({
      python: true,
      javascript: true,
      java: true,
      cpp: true,
    });
    expect(result.failureReason).toBeNull();
    expect(service.isReady(result.perLanguagePass)).toBe(true);
  });

  it('marks only the failing language as failed and still reports ready (python+js baseline)', async () => {
    const executor = new FakeExecutor();
    // python: pass, pass
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));
    // javascript: pass, pass
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));
    // java: first testcase wrong answer — validateLanguage returns immediately
    // on the first failing testcase, so no second execute() call happens here.
    executor.queueResponse(okRun('999'));
    // cpp: pass, pass
    executor.queueResponse(okRun('3'));
    executor.queueResponse(okRun('6'));

    const service = makeService(executor);
    const result = await service.validate(problem);

    expect(result.perLanguagePass).toEqual({
      python: true,
      javascript: true,
      java: false,
      cpp: true,
    });
    expect(result.failureReason).toContain('[java]');
    expect(service.isReady(result.perLanguagePass)).toBe(true);
  });

  it('is not ready when the python baseline fails, even if every other language passes', async () => {
    const executor = new FakeExecutor();
    // python: wrong answer on the first testcase (early return — only 1 call)
    executor.queueResponse(okRun('999'));
    // javascript, java, cpp: pass, pass
    for (let i = 0; i < 3; i++) {
      executor.queueResponse(okRun('3'));
      executor.queueResponse(okRun('6'));
    }

    const service = makeService(executor);
    const result = await service.validate(problem);

    expect(result.perLanguagePass.python).toBe(false);
    expect(service.isReady(result.perLanguagePass)).toBe(false);
  });

  it('reports a driver-synthesis failure without ever calling the executor', async () => {
    const executor = new FakeExecutor();
    const executeSpy = jest.spyOn(executor, 'execute');
    const brokenDriverSynth = {
      synthesize: jest.fn(() => {
        throw new Error('unsupported io type');
      }),
    };
    const service = new SelfValidationService(
      brokenDriverSynth as any,
      new DriverMergeService(),
      executor as any,
      new VerdictService(new NormalizerService()),
    );

    const result = await service.validate(problem);

    expect(result.perLanguagePass).toEqual({
      python: false,
      javascript: false,
      java: false,
      cpp: false,
    });
    expect(result.failureReason).toContain('driver synthesis failed');
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
