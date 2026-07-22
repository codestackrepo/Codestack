import { GenerationRequest } from '../entities/generation-request.entity';
import { GeneratedProblemLinkStatus, GenerationStatus } from '../enums/ai.enums';
import { GeneratedProblem } from '../llm/schemas/generated-problem.schema';
import { GenerationService } from './generation.service';

type MockRepo = { findOneByOrFail: jest.Mock; save: jest.Mock; create: jest.Mock };

function mockRepo(): MockRepo {
  return {
    findOneByOrFail: jest.fn(),
    save: jest.fn((x) => Promise.resolve(x)),
    create: jest.fn((x) => x),
  };
}

const baseProblem: GeneratedProblem = {
  title: 'Second Largest',
  statement_markdown: 'Find the second largest element in an array of distinct integers.',
  difficulty: 'easy',
  tags: ['arrays'],
  constraints: ['2 <= n <= 100000'],
  function_name: 'secondLargest',
  io_spec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
  reference_solution: {
    python: 'def secondLargest(nums): return 0\n',
    javascript: 'function secondLargest(nums) { return 0; }\n',
    java: 'class Solution { static int secondLargest(int[] nums) { return 0; } }\n',
    cpp: 'int secondLargest(std::vector<int> nums) { return 0; }\n',
  },
  starter_code: {
    python: 'def secondLargest(nums): pass\n',
    javascript: 'function secondLargest(nums) {}\n',
    java: 'class Solution { static int secondLargest(int[] nums) { return 0; } }\n',
    cpp: 'int secondLargest(std::vector<int> nums) { return 0; }\n',
  },
  sample_testcases: [{ inputs: [[3, 1, 4]], expected: 3 }],
  hidden_testcases: [
    { inputs: [[9, 2, 6]], expected: 6 },
    { inputs: [[10, 20, 30]], expected: 20 },
    { inputs: [[5, 5, 5, 4]], expected: 4 },
  ],
};

const problemSet = { problems: [baseProblem] };
const usage = { inputTokens: 10, outputTokens: 5, costUsd: 0.01, model: 'test-model' };

function makeConfig() {
  return {
    getOrThrow: () => ({
      maxOutputTokens: 8000,
      timeoutMs: 60_000,
      model: 'test-model',
    }),
  };
}

function makePromptBuilder() {
  return {
    buildMessages: jest.fn(() => [{ role: 'system', content: 's' }]),
    buildRepairMessages: jest.fn((msgs) => [...msgs, { role: 'user', content: 'repair' }]),
  };
}

describe('GenerationService', () => {
  let requests: MockRepo;
  let links: MockRepo;

  beforeEach(() => {
    requests = mockRepo();
    links = mockRepo();
    requests.findOneByOrFail.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      topic: 'arrays',
      requestedCount: 1,
    } as GenerationRequest);
  });

  it('marks the request READY when the LLM output validates and self-validation passes on the first try', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({ data: problemSet, usage, raw: '{}' }),
    };
    const selfValidation = {
      validate: jest.fn().mockResolvedValue({
        perLanguagePass: { python: true, javascript: true, java: true, cpp: true },
        failureReason: null,
      }),
      isReady: jest.fn(() => true),
    };
    const materializer = { materialize: jest.fn().mockResolvedValue({ id: 'problem-1' }) };

    const service = new GenerationService(
      makeConfig() as any,
      makePromptBuilder() as any,
      llm as any,
      selfValidation as any,
      materializer as any,
      requests as any,
      links as any,
    );

    await service.run('req-1', 'study material');

    expect(llm.generateStructured).toHaveBeenCalledTimes(1);
    expect(materializer.materialize).toHaveBeenCalledTimes(1);
    expect(links.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: GeneratedProblemLinkStatus.VALIDATED,
        problemId: 'problem-1',
      }),
    );

    const finalSave = requests.save.mock.calls.at(-1)[0];
    expect(finalSave.status).toBe(GenerationStatus.READY);
    expect(finalSave.tokenUsage).toEqual(usage);
    expect(finalSave.errorReason).toBeNull();
  });

  it('repairs once when the first LLM response fails schema validation, then succeeds', async () => {
    const llm = {
      generateStructured: jest
        .fn()
        .mockResolvedValueOnce({ data: { problems: [] }, usage, raw: '{}' }) // empty array fails min(1)
        .mockResolvedValueOnce({ data: problemSet, usage, raw: '{}' }),
    };
    const selfValidation = {
      validate: jest.fn().mockResolvedValue({
        perLanguagePass: { python: true, javascript: true },
        failureReason: null,
      }),
      isReady: jest.fn(() => true),
    };
    const materializer = { materialize: jest.fn().mockResolvedValue({ id: 'problem-1' }) };

    const service = new GenerationService(
      makeConfig() as any,
      makePromptBuilder() as any,
      llm as any,
      selfValidation as any,
      materializer as any,
      requests as any,
      links as any,
    );

    await service.run('req-1', 'study material');

    expect(llm.generateStructured).toHaveBeenCalledTimes(2);
    const finalSave = requests.save.mock.calls.at(-1)[0];
    expect(finalSave.status).toBe(GenerationStatus.READY);
  });

  it('fails the request when schema validation never succeeds within the repair budget', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({ data: { problems: [] }, usage, raw: '{}' }),
    };
    const selfValidation = { validate: jest.fn(), isReady: jest.fn() };
    const materializer = { materialize: jest.fn() };

    const service = new GenerationService(
      makeConfig() as any,
      makePromptBuilder() as any,
      llm as any,
      selfValidation as any,
      materializer as any,
      requests as any,
      links as any,
    );

    await expect(service.run('req-1', 'study material')).rejects.toThrow();

    // 1 initial + 2 repair attempts = 3 total calls, then give up.
    expect(llm.generateStructured).toHaveBeenCalledTimes(3);
    expect(selfValidation.validate).not.toHaveBeenCalled();
    const finalSave = requests.save.mock.calls.at(-1)[0];
    expect(finalSave.status).toBe(GenerationStatus.FAILED);
    expect(finalSave.errorReason).toBeTruthy();
  });

  it('discards a candidate that never self-validates within the regeneration budget, and marks FAILED when nothing survives', async () => {
    const llm = {
      generateStructured: jest
        .fn()
        // initial generation call
        .mockResolvedValueOnce({ data: problemSet, usage, raw: '{}' })
        // 2 regeneration attempts, each still schema-valid but never passes self-validation
        .mockResolvedValueOnce({ data: baseProblem, usage, raw: '{}' })
        .mockResolvedValueOnce({ data: baseProblem, usage, raw: '{}' }),
    };
    const selfValidation = {
      validate: jest.fn().mockResolvedValue({
        perLanguagePass: { python: false, javascript: false },
        failureReason: '[python] testcase #1: reference solution produced Wrong Answer',
      }),
      isReady: jest.fn(() => false),
    };
    const materializer = { materialize: jest.fn() };

    const service = new GenerationService(
      makeConfig() as any,
      makePromptBuilder() as any,
      llm as any,
      selfValidation as any,
      materializer as any,
      requests as any,
      links as any,
    );

    await service.run('req-1', 'study material');

    // 1 initial generation + 2 regeneration attempts = 3 calls total.
    expect(llm.generateStructured).toHaveBeenCalledTimes(3);
    // validate() runs once per attempt (initial candidate + 2 regenerated drafts) = 3 calls.
    expect(selfValidation.validate).toHaveBeenCalledTimes(3);
    expect(materializer.materialize).not.toHaveBeenCalled();
    expect(links.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: GeneratedProblemLinkStatus.DISCARDED, problemId: null }),
    );

    const finalSave = requests.save.mock.calls.at(-1)[0];
    expect(finalSave.status).toBe(GenerationStatus.FAILED);
    expect(finalSave.errorReason).toContain('failed self-validation');
  });
});
