import { Injectable } from '@nestjs/common';

export type OutputExtraction = 'LAST_NON_EMPTY_LINE' | 'FULL_OUTPUT';
export type StructuralCompare = 'NONE' | 'JSON' | 'NUMERIC_TOLERANT' | 'PYTHON_LITERAL';

export interface CompareConfig {
  extraction: OutputExtraction;
  structural: StructuralCompare;
  numericTolerance?: number;
}

export const DEFAULT_COMPARE_CONFIG: CompareConfig = {
  extraction: 'LAST_NON_EMPTY_LINE',
  structural: 'JSON',
};

/**
 * Language-aware output comparison. Replaces the original's Python-only
 * `ast.literal_eval` on the last stdout line with configurable, deterministic
 * normalization + structural equality.
 */
@Injectable()
export class NormalizerService {
  compare(actualStdout: string, expected: string, config: CompareConfig): boolean {
    const actual = this.extract(actualStdout, config.extraction);
    const exp = this.normalizeWhitespace(expected).trim();
    const act = actual.trim();
    if (act === exp) return true;

    switch (config.structural) {
      case 'JSON':
        return this.jsonEqual(act, exp) ?? act === exp;
      case 'PYTHON_LITERAL':
        return this.jsonEqual(this.pythonToJson(act), this.pythonToJson(exp)) ?? act === exp;
      case 'NUMERIC_TOLERANT':
        return this.numericEqual(act, exp, config.numericTolerance ?? 1e-6);
      case 'NONE':
      default:
        return act === exp;
    }
  }

  /** The comparable output slice per the extraction strategy. */
  extract(stdout: string, mode: OutputExtraction): string {
    const normalized = this.normalizeWhitespace(stdout);
    if (mode === 'FULL_OUTPUT') return normalized.trim();
    const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
    return lines.length ? lines[lines.length - 1] : '';
  }

  private normalizeWhitespace(s: string): string {
    return s
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n+$/g, '');
  }

  private jsonEqual(a: string, b: string): boolean | null {
    try {
      const pa = JSON.parse(a);
      const pb = JSON.parse(b);
      return this.deepEqual(pa, pb);
    } catch {
      return null;
    }
  }

  private numericEqual(a: string, b: string, tol: number): boolean {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
    return Math.abs(na - nb) <= tol;
  }

  /** Best-effort Python-literal → JSON (True/False/None, single quotes, tuples). */
  private pythonToJson(s: string): string {
    return s
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/\(/g, '[')
      .replace(/\)/g, ']')
      .replace(/'/g, '"');
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.deepEqual(v, b[i]));
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a as object).sort();
      const kb = Object.keys(b as object).sort();
      if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false;
      return ka.every((k) =>
        this.deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      );
    }
    return false;
  }
}
