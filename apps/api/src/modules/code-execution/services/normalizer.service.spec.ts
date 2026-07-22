import { NormalizerService } from './normalizer.service';
import { CompareConfig } from './normalizer.service';

describe('NormalizerService', () => {
  let normalizer: NormalizerService;

  beforeEach(() => {
    normalizer = new NormalizerService();
  });

  const cfg = (overrides: Partial<CompareConfig> = {}): CompareConfig => ({
    extraction: 'LAST_NON_EMPTY_LINE',
    structural: 'JSON',
    ...overrides,
  });

  describe('extraction', () => {
    it('extracts the last non-empty line by default', () => {
      const out = normalizer.extract('debug line 1\ndebug line 2\n42\n', 'LAST_NON_EMPTY_LINE');
      expect(out).toBe('42');
    });

    it('ignores trailing blank lines', () => {
      const out = normalizer.extract('42\n\n\n', 'LAST_NON_EMPTY_LINE');
      expect(out).toBe('42');
    });

    it('extracts the full output when configured', () => {
      const out = normalizer.extract('line1\nline2', 'FULL_OUTPUT');
      expect(out).toBe('line1\nline2');
    });

    it('normalizes CRLF to LF before extracting', () => {
      const out = normalizer.extract('a\r\nb\r\n42\r\n', 'LAST_NON_EMPTY_LINE');
      expect(out).toBe('42');
    });

    it('trims trailing whitespace per line', () => {
      const out = normalizer.extract('42   \n', 'LAST_NON_EMPTY_LINE');
      expect(out).toBe('42');
    });
  });

  describe('compare — exact match', () => {
    it('matches identical strings', () => {
      expect(normalizer.compare('7\n', '7', cfg())).toBe(true);
    });

    it('matches across whitespace/CRLF differences', () => {
      expect(normalizer.compare('debug\r\n7   \r\n', '7', cfg())).toBe(true);
    });
  });

  describe('compare — JSON structural', () => {
    it('treats differently-spaced JSON arrays as equal', () => {
      expect(normalizer.compare('[1, 2, 3]', '[1,2,3]', cfg())).toBe(true);
    });

    it('treats object key order as irrelevant', () => {
      expect(normalizer.compare('{"b":2,"a":1}', '{"a":1,"b":2}', cfg())).toBe(true);
    });

    it('rejects genuinely different structures', () => {
      expect(normalizer.compare('[1,2,3]', '[1,2,4]', cfg())).toBe(false);
    });

    it('falls back to string equality when not valid JSON', () => {
      expect(normalizer.compare('hello world', 'hello world', cfg())).toBe(true);
      expect(normalizer.compare('hello world', 'goodbye world', cfg())).toBe(false);
    });
  });

  describe('compare — PYTHON_LITERAL (migrated legacy expected outputs)', () => {
    it('matches Python True/False/None against JSON equivalents', () => {
      expect(normalizer.compare('True', 'true', cfg({ structural: 'PYTHON_LITERAL' }))).toBe(true);
      expect(normalizer.compare('None', 'null', cfg({ structural: 'PYTHON_LITERAL' }))).toBe(true);
    });

    it('matches Python single-quoted strings against double-quoted JSON', () => {
      expect(
        normalizer.compare("['a', 'b']", '["a","b"]', cfg({ structural: 'PYTHON_LITERAL' })),
      ).toBe(true);
    });
  });

  describe('compare — NUMERIC_TOLERANT', () => {
    it('accepts small floating point differences within tolerance', () => {
      expect(
        normalizer.compare(
          '3.14159265',
          '3.14159266',
          cfg({ structural: 'NUMERIC_TOLERANT', numericTolerance: 1e-6 }),
        ),
      ).toBe(true);
    });

    it('rejects differences beyond tolerance', () => {
      expect(
        normalizer.compare(
          '3.1',
          '3.2',
          cfg({ structural: 'NUMERIC_TOLERANT', numericTolerance: 1e-6 }),
        ),
      ).toBe(false);
    });
  });

  describe('compare — NONE (strict string)', () => {
    it('requires exact string match after whitespace normalization only', () => {
      expect(normalizer.compare('[1,2,3]', '[1, 2, 3]', cfg({ structural: 'NONE' }))).toBe(false);
      expect(normalizer.compare('[1,2,3]', '[1,2,3]', cfg({ structural: 'NONE' }))).toBe(true);
    });
  });
});
