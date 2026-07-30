import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'fs';
import { DriverSynthService } from '../../../modules/code-execution/driver-synth/driver-synth.service';
import { DriverMergeService } from '../../../modules/code-execution/services/driver-merge.service';
import {
  encodeStdin,
  encodeExpectedOutput,
} from '../../../modules/code-execution/driver-synth/io-codec';
import { Language } from '../../../common/enums/language.enum';
import { LANGUAGE_RUNTIMES } from '../../../modules/code-execution/executors/runtime-config';
import type { IoSpec } from '../../../modules/code-execution/driver-synth/io-spec.types';
import { CatalogProblemSchema, type CatalogProblem } from './schema';

/**
 * Standalone Piston validator for catalog candidates. Runs the EXACT judge path
 * — synthesize driver (repo's DriverSynthService) -> merge (DriverMergeService)
 * -> encode stdin (io-codec) -> execute on the real Piston sandbox -> compare to
 * encoded expected output — for Python + JavaScript, for every sample + hidden
 * testcase. Unlike `seed-catalog --validate` it does NOT boot Nest or touch the
 * DB, so it can gate candidate problems fast and offline-of-DB.
 *
 *   ts-node -r tsconfig-paths/register src/database/seeds/catalog/validate-piston.ts <candidates.json> [reportOut.json]
 *
 * Input JSON: an array of CatalogProblem, or { problems: CatalogProblem[] }.
 * Exit code 0 iff every problem passes every testcase in both languages.
 */

const PISTON_URL =
  (process.env.PISTON_URLS || '').split(',')[0].trim() || 'http://localhost:2000/api/v2/execute';
const VERSION: Record<string, string> = {
  [Language.PYTHON]: process.env.PYTHON_VERSION || '3.11.0',
  [Language.JAVASCRIPT]: process.env.JS_VERSION || '20.11.1',
};
const RUN_TIMEOUT_MS = Number(process.env.DEFAULT_RUN_TIMEOUT_MS || 3000);
const RUN_MEM = Number(process.env.DEFAULT_RUN_MEMORY_LIMIT || 256000000);
const CONCURRENCY = Number(process.env.VALIDATE_CONCURRENCY || 6);

const synth = new DriverSynthService();
const merge = new DriverMergeService();

interface PistonRun {
  run: { stdout: string; stderr: string; code: number | null; signal: string | null };
  compile?: { stdout: string; stderr: string; code: number | null };
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pistonExecute(lang: Language, code: string, stdin: string): Promise<PistonRun> {
  const rt = LANGUAGE_RUNTIMES[lang];
  const body = JSON.stringify({
    language: rt.pistonLanguage,
    version: VERSION[lang],
    files: [{ name: rt.mainFilename, content: code }],
    stdin,
    run_timeout: RUN_TIMEOUT_MS,
    run_memory_limit: RUN_MEM,
    compile_timeout: 10000,
  });
  // Retry transient Piston failures (5xx / network) — these are load hiccups,
  // not solution defects, and would otherwise cause false negatives.
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(PISTON_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return (await res.json()) as PistonRun;
      const text = await res.text();
      // 4xx (except 429) is a real, deterministic request error — do not retry.
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Piston HTTP ${res.status}: ${text}`);
      }
      lastErr = `Piston HTTP ${res.status}: ${text}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (lastErr.startsWith('Piston HTTP 4')) throw e;
    }
    await sleep(250 * attempt);
  }
  throw new Error(lastErr || 'Piston: exhausted retries');
}

interface CaseFailure {
  lang: string;
  kind: 'sample' | 'hidden';
  index: number;
  inputs: unknown[];
  expected: string;
  got: string;
  stderr?: string;
}

interface ProblemReport {
  slug: string;
  title: string;
  difficulty: string;
  ok: boolean;
  schemaError?: string;
  failures: CaseFailure[];
}

async function validateProblem(raw: unknown): Promise<ProblemReport> {
  const parsed = CatalogProblemSchema.safeParse(raw);
  if (!parsed.success) {
    const slug = (raw as any)?.slug ?? '(unknown)';
    return {
      slug,
      title: (raw as any)?.title ?? '',
      difficulty: (raw as any)?.difficulty ?? '',
      ok: false,
      schemaError: JSON.stringify(parsed.error.issues.slice(0, 6)),
      failures: [],
    };
  }
  const cp: CatalogProblem = parsed.data;
  const ioSpec = cp.ioSpec as IoSpec;
  const langs: { key: 'python' | 'javascript'; lang: Language }[] = [
    { key: 'python', lang: Language.PYTHON },
    { key: 'javascript', lang: Language.JAVASCRIPT },
  ];
  const cases = [
    ...cp.sampleTestcases.map((t, i) => ({ t, kind: 'sample' as const, i })),
    ...cp.hiddenTestcases.map((t, i) => ({ t, kind: 'hidden' as const, i })),
  ];

  const failures: CaseFailure[] = [];
  for (const { key, lang } of langs) {
    const driver = synth.synthesize(lang, cp.functionName, ioSpec);
    const fullCode = merge.merge(driver, cp.referenceSolution[key]!);
    // Bounded-concurrency execution of this language's cases.
    let cursor = 0;
    async function worker() {
      while (cursor < cases.length) {
        const { t, kind, i } = cases[cursor++];
        const expected = encodeExpectedOutput(t.expected);
        let got = '';
        let stderr = '';
        try {
          const stdin = encodeStdin(ioSpec, t.inputs);
          const r = await pistonExecute(lang, fullCode, stdin);
          if (r.compile && r.compile.code !== 0) {
            got = `<compile error> ${r.compile.stderr}`.trim();
          } else {
            got = (r.run.stdout ?? '').replace(/\s+$/g, '');
            stderr = (r.run.stderr ?? '').trim();
          }
        } catch (e) {
          got = `<piston error> ${e instanceof Error ? e.message : String(e)}`;
        }
        if (got !== expected) {
          failures.push({ lang: key, kind, index: i, inputs: t.inputs, expected, got, stderr });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));
  }

  return {
    slug: cp.slug,
    title: cp.title,
    difficulty: cp.difficulty,
    ok: failures.length === 0,
    failures,
  };
}

async function main(): Promise<void> {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath) throw new Error('usage: validate-piston.ts <candidates.json> [reportOut.json]');
  const rawJson = JSON.parse(readFileSync(inPath, 'utf8'));
  const problems: unknown[] = Array.isArray(rawJson) ? rawJson : rawJson.problems;
  if (!Array.isArray(problems)) throw new Error('input must be an array or { problems: [...] }');

  console.log(
    `Validating ${problems.length} candidate problem(s) against Piston at ${PISTON_URL}\n`,
  );
  const reports: ProblemReport[] = [];
  // Validate problems sequentially (each already fans its own cases out); keeps
  // total Piston in-flight bounded and output readable.
  for (const p of problems) {
    const rep = await validateProblem(p);
    reports.push(rep);
    const mark = rep.ok ? 'PASS' : 'FAIL';
    const detail = rep.schemaError
      ? ` schema: ${rep.schemaError}`
      : rep.ok
        ? ''
        : ` (${rep.failures.length} case failure(s))`;
    console.log(`  [${mark}] ${rep.slug} [${rep.difficulty}]${detail}`);
    for (const f of rep.failures.slice(0, 4)) {
      console.log(
        `        ${f.lang} ${f.kind}#${f.index} inputs=${JSON.stringify(f.inputs)} expected=${f.expected} got=${JSON.stringify(f.got)}${f.stderr ? ` stderr=${JSON.stringify(f.stderr.slice(0, 200))}` : ''}`,
      );
    }
  }

  const passed = reports.filter((r) => r.ok);
  console.log(
    `\n==== ${passed.length}/${reports.length} problems PASS all cases in Python + JavaScript ====`,
  );
  const byDiff = passed.reduce<Record<string, number>>((acc, r) => {
    acc[r.difficulty] = (acc[r.difficulty] || 0) + 1;
    return acc;
  }, {});
  console.log(`passing by difficulty: ${JSON.stringify(byDiff)}`);

  if (outPath) {
    writeFileSync(
      outPath,
      JSON.stringify({ reports, passingSlugs: passed.map((r) => r.slug) }, null, 2),
    );
    console.log(`report written to ${outPath}`);
  }
  process.exit(passed.length === reports.length ? 0 : 1);
}

main().catch((err) => {
  console.error('validate-piston failed:', err instanceof Error ? err.message : err);
  process.exit(2);
});
