import { NormalizerService } from './normalizer.service';
import { ClassifyContext, VerdictService } from './verdict.service';
import { RawRun } from '../piston/piston.types';
import { SubmissionStatus } from '../../submissions/enums/submission-status.enum';

describe('VerdictService', () => {
  let verdict: VerdictService;

  beforeEach(() => {
    verdict = new VerdictService(new NormalizerService());
  });

  const ctx = (overrides: Partial<ClassifyContext> = {}): ClassifyContext => ({
    expected: '42',
    compareConfig: { extraction: 'LAST_NON_EMPTY_LINE', structural: 'JSON' },
    memoryLimitBytes: 256_000_000,
    compiled: false,
    ...overrides,
  });

  const okRun = (stdout: string, overrides: Partial<RawRun['run']> = {}): RawRun => ({
    run: {
      status: null,
      stdout,
      stderr: '',
      code: 0,
      signal: null,
      memory: 1_000_000,
      ...overrides,
    },
    wallTimeMs: 100,
  });

  it('classifies a transport failure as Internal Error', () => {
    const raw: RawRun = {
      run: { status: null, stdout: '', stderr: '', code: null, signal: null, memory: 0 },
      wallTimeMs: 0,
      transportError: 'ECONNREFUSED',
    };
    expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.INTERNAL_ERROR);
  });

  it('classifies a nonzero compile exit (compiled language) as Compile Error', () => {
    const raw: RawRun = {
      compile: { code: 1, stdout: '', stderr: 'error: expected ;', signal: null },
      run: { status: null, stdout: '', stderr: '', code: null, signal: null, memory: 0 },
      wallTimeMs: 50,
    };
    expect(verdict.classify(raw, ctx({ compiled: true }))).toBe(SubmissionStatus.COMPILE_ERROR);
  });

  it('does not apply the compile check for interpreted languages', () => {
    const raw = okRun('42');
    expect(verdict.classify(raw, ctx({ compiled: false }))).toBe(SubmissionStatus.ACCEPTED);
  });

  it('classifies Piston TO status as Time Limit Exceeded', () => {
    const raw = okRun('', { status: 'TO' });
    expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.TIME_LIMIT_EXCEEDED);
  });

  it('classifies a SIGKILL near the memory ceiling as Memory Limit Exceeded', () => {
    const raw = okRun('', { signal: 'SIGKILL', memory: 255_000_000, code: null });
    expect(verdict.classify(raw, ctx({ memoryLimitBytes: 256_000_000 }))).toBe(
      SubmissionStatus.MEMORY_LIMIT_EXCEEDED,
    );
  });

  it('does NOT classify a SIGKILL far below the memory ceiling as MLE (falls through to RE)', () => {
    const raw = okRun('', { signal: 'SIGKILL', memory: 1_000, code: null });
    expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.RUNTIME_ERROR);
  });

  it('classifies Piston RE status as Runtime Error', () => {
    const raw = okRun('', { status: 'RE', code: 1 });
    expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.RUNTIME_ERROR);
  });

  it('classifies a nonzero exit code as Runtime Error', () => {
    const raw = okRun('', { code: 1 });
    expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.RUNTIME_ERROR);
  });

  it('classifies an interpreted-language SyntaxError signature as Syntax Error', () => {
    const raw = okRun('', {
      code: 1,
      stderr: 'File "main.py", line 2\nSyntaxError: invalid syntax',
    });
    expect(verdict.classify(raw, ctx({ compiled: false }))).toBe(SubmissionStatus.SYNTAX_ERROR);
  });

  it('classifies an interpreted-language IndentationError signature as Syntax Error', () => {
    const raw = okRun('', { code: 1, stderr: 'IndentationError: unexpected indent' });
    expect(verdict.classify(raw, ctx({ compiled: false }))).toBe(SubmissionStatus.SYNTAX_ERROR);
  });

  it('classifies matching output as Accepted', () => {
    const raw = okRun('42');
    expect(verdict.classify(raw, ctx({ expected: '42' }))).toBe(SubmissionStatus.ACCEPTED);
  });

  it('classifies mismatched output as Wrong Answer', () => {
    const raw = okRun('41');
    expect(verdict.classify(raw, ctx({ expected: '42' }))).toBe(SubmissionStatus.WRONG_ANSWER);
  });

  // Regression test: a correct program that writes to stderr (e.g. a
  // DeprecationWarning, a debug print, a JVM notice) while exiting 0 must
  // NOT be misclassified as Runtime Error — this was a real bug: the
  // classifier used to treat *any* non-empty stderr as a failure signal.
  describe('regression: non-empty stderr with a clean (0) exit', () => {
    it('is still Accepted when the output matches', () => {
      const raw = okRun('42', { stderr: 'DeprecationWarning: this API is deprecated', code: 0 });
      expect(verdict.classify(raw, ctx({ expected: '42' }))).toBe(SubmissionStatus.ACCEPTED);
    });

    it('is Wrong Answer (not Runtime Error) when the output does not match', () => {
      const raw = okRun('41', { stderr: 'Picked up JAVA_TOOL_OPTIONS: -Xmx256m', code: 0 });
      expect(verdict.classify(raw, ctx({ expected: '42' }))).toBe(SubmissionStatus.WRONG_ANSWER);
    });

    it('is still Syntax Error when stderr carries the syntax-error signature even with matching stdout noise', () => {
      const raw = okRun('', { stderr: 'SyntaxError: unexpected EOF', code: 1 });
      expect(verdict.classify(raw, ctx())).toBe(SubmissionStatus.SYNTAX_ERROR);
    });
  });
});
