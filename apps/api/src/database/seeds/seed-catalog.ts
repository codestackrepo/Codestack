import 'reflect-metadata';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import defaultDataSource from '../data-source';
import { Role } from '../../common/enums/role.enum';
import { Language } from '../../common/enums/language.enum';
import { User } from '../../modules/users/entities/user.entity';
import { Problem } from '../../modules/problems/entities/problem.entity';
import { Tag } from '../../modules/problems/entities/tag.entity';
import { Company } from '../../modules/problems/entities/company.entity';
import { TestCase } from '../../modules/problems/entities/test-case.entity';
import { LibraryProblemTemplate } from '../../modules/problems/entities/library-problem-template.entity';
import {
  Difficulty,
  ProblemScope,
  ProblemSource,
  ProblemVisibility,
  TestCaseType,
} from '../../modules/problems/enums/problem.enums';
import { DriverSynthService } from '../../modules/code-execution/driver-synth/driver-synth.service';
import {
  encodeExpectedOutput,
  encodeStdin,
} from '../../modules/code-execution/driver-synth/io-codec';
import type { IoSpec } from '../../modules/code-execution/driver-synth/io-spec.types';
import { catalogProblems } from './catalog/problems';
import { CatalogSchema, type CatalogProblem } from './catalog/schema';

/**
 * Seeds the authored problem catalog (src/database/seeds/catalog).
 *
 *   pnpm --filter @codestack/api seed:catalog             # idempotent seed
 *   pnpm --filter @codestack/api seed:catalog -- --validate   # gate first, then seed
 *
 * Every problem is validated against the Zod schema first (always). With
 * --validate, each problem's reference solution is additionally run through the
 * REAL judge (driver synth → merge → execute on Piston → verdict) for Python +
 * JavaScript; if any reference solution fails its own test cases the script
 * aborts WITHOUT seeding (the gate). --validate therefore needs a Nest context
 * (DB + Redis + a reachable Piston); plain seeding needs only the database.
 */

// Catalog lang key -> Language enum. Only synth/seed languages present in the data.
const LANG_MAP: Record<string, Language> = {
  python: Language.PYTHON,
  javascript: Language.JAVASCRIPT,
  java: Language.JAVA,
  cpp: Language.CPP,
};

function difficultyOf(d: CatalogProblem['difficulty']): Difficulty {
  return d as Difficulty; // enum string values match ('easy'|'medium'|'hard')
}

function languagesOf(cp: CatalogProblem): { key: string; lang: Language }[] {
  return Object.keys(cp.referenceSolution)
    .filter((k) => cp.referenceSolution[k as keyof typeof cp.referenceSolution])
    .map((key) => ({ key, lang: LANG_MAP[key] }));
}

async function main(): Promise<void> {
  const shouldValidate = process.argv.includes('--validate');

  // Zod gate — always. Fails fast with a path-precise error on malformed data.
  const catalog = CatalogSchema.parse({ problems: catalogProblems });
  console.log(`Catalog: ${catalog.problems.length} problems passed schema validation.`);

  if (shouldValidate) {
    await validateThenSeed(catalog.problems);
  } else {
    await defaultDataSource.initialize();
    try {
      await seedAll(catalog.problems, defaultDataSource);
    } finally {
      await defaultDataSource.destroy();
    }
  }
}

/** --validate: boot a Nest context, run the real judge on every reference solution, then seed. */
async function validateThenSeed(problems: CatalogProblem[]): Promise<void> {
  // Imported lazily so plain seeding never pulls in the whole Nest app graph.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module');
  const { DriverMergeService } =
    await import('../../modules/code-execution/services/driver-merge.service');
  const { ExecutorService } =
    await import('../../modules/code-execution/executors/executor.service');
  const { VerdictService } = await import('../../modules/code-execution/services/verdict.service');
  const { DEFAULT_COMPARE_CONFIG } =
    await import('../../modules/code-execution/services/normalizer.service');
  const { SubmissionStatus } =
    await import('../../modules/submissions/enums/submission-status.enum');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const driverSynth = app.get(DriverSynthService);
    const driverMerge = app.get(DriverMergeService);
    const executor = app.get(ExecutorService);
    const verdict = app.get(VerdictService);

    const failures: string[] = [];
    for (const cp of problems) {
      for (const { key, lang } of languagesOf(cp)) {
        const driver = driverSynth.synthesize(lang, cp.functionName, cp.ioSpec as IoSpec);
        const fullCode = driverMerge.merge(driver, cp.referenceSolution[key as 'python']!);
        const runtime = executor.getRuntime(lang);
        const opts = executor.defaultOptions();
        const cases = [...cp.sampleTestcases, ...cp.hiddenTestcases];
        for (let i = 0; i < cases.length; i++) {
          const stdin = encodeStdin(cp.ioSpec as IoSpec, cases[i].inputs);
          const expected = encodeExpectedOutput(cases[i].expected);
          const raw = await executor.execute(lang, fullCode, stdin, opts);
          const status = verdict.classify(raw, {
            memoryLimitBytes: opts.memoryLimitBytes,
            compiled: runtime.compiled,
            expected,
            compareConfig: DEFAULT_COMPARE_CONFIG,
          });
          if (status !== SubmissionStatus.ACCEPTED) {
            failures.push(`${cp.slug} [${key}] testcase #${i + 1}: ${status} (expected Accepted)`);
          }
        }
      }
      console.log(`  validated ${cp.slug}`);
    }

    if (failures.length) {
      console.error(`\n--validate FAILED (${failures.length}):`);
      failures.forEach((f) => console.error(`  ✗ ${f}`));
      throw new Error('Catalog validation failed — not seeding.');
    }
    console.log('\n--validate passed for every reference solution.');

    await seedAll(problems, app.get(DataSource));
  } finally {
    await app.close();
  }
}

async function seedAll(problems: CatalogProblem[], ds: DataSource): Promise<void> {
  const driverSynth = new DriverSynthService(); // dependency-free
  const author = await resolveAuthor(ds);

  for (const cp of problems) {
    await upsertCatalogProblem(cp, ds, driverSynth, author.id);
    console.log(`  seeded ${cp.slug}`);
  }
  console.log(`\nCatalog seed complete: ${problems.length} problems.`);
}

async function resolveAuthor(ds: DataSource): Promise<User> {
  const users = ds.getRepository(User);
  const existing = await users.findOne({ where: { role: Role.ADMIN } });
  if (existing) return existing;
  return users.save(
    users.create({
      email: 'catalog@codestack.dev',
      firstName: 'Catalog',
      lastName: 'Author',
      role: Role.ADMIN,
      passwordHash: await argon2.hash(randomBytes(24).toString('base64url')),
    }),
  );
}

async function upsertCatalogProblem(
  cp: CatalogProblem,
  ds: DataSource,
  driverSynth: DriverSynthService,
  authorId: string,
): Promise<void> {
  const problemRepo = ds.getRepository(Problem);
  const testCaseRepo = ds.getRepository(TestCase);
  const templateRepo = ds.getRepository(LibraryProblemTemplate);

  const tags = await resolveTags(
    ds,
    cp.tags.map((t) => t.toLowerCase()),
  );
  const companies = await resolveCompanies(ds, cp.companies);

  let problem = await problemRepo.findOne({ where: { title: cp.title } });
  if (!problem) {
    problem = problemRepo.create({ title: cp.title, createdById: authorId });
  }
  problem.body = cp.statementMarkdown;
  problem.difficulty = difficultyOf(cp.difficulty);
  problem.source = ProblemSource.HUMAN;
  problem.visibility = ProblemVisibility.SHARED;
  // Seed catalog is the platform-global pool (published = scope=global + shared).
  problem.scope = ProblemScope.GLOBAL;
  problem.organizationId = null;
  problem.functionName = cp.functionName;
  problem.ioSpec = cp.ioSpec as IoSpec;
  problem.tags = tags;
  problem.companies = companies;
  problem = await problemRepo.save(problem);

  // Test cases: replace wholesale so re-seeding always reflects the source data.
  await testCaseRepo.delete({ problemId: problem.id });
  const encoded: Partial<TestCase>[] = [];
  const push = (tc: CatalogProblem['sampleTestcases'][number], type: TestCaseType, i: number) =>
    encoded.push({
      problemId: problem!.id,
      inputData: encodeStdin(cp.ioSpec as IoSpec, tc.inputs),
      expectedOutput: encodeExpectedOutput(tc.expected),
      type,
      explanation: tc.explanation ?? '',
      isActive: true,
      orderIndex: i,
    });
  let idx = 0;
  cp.sampleTestcases.forEach((tc) => push(tc, TestCaseType.SAMPLE, idx++));
  cp.hiddenTestcases.forEach((tc) => push(tc, TestCaseType.HIDDEN, idx++));
  await testCaseRepo.save(encoded.map((e) => testCaseRepo.create(e)));

  // Per-language library templates: synthesized driver + authored starter.
  for (const { key, lang } of languagesOf(cp)) {
    const driverCode = driverSynth.synthesize(lang, cp.functionName, cp.ioSpec as IoSpec);
    const starterCode = cp.starterCode[key as 'python'] ?? '';
    let tpl = await templateRepo.findOne({ where: { problemId: problem.id, language: lang } });
    if (!tpl) {
      tpl = templateRepo.create({ problemId: problem.id, language: lang, createdById: authorId });
    }
    tpl.driverCode = driverCode;
    tpl.starterCode = starterCode;
    await templateRepo.save(tpl);
  }
}

/** Find-or-create tags by (lowercased) name. */
async function resolveTags(ds: DataSource, names: string[]): Promise<Tag[]> {
  const repo = ds.getRepository(Tag);
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const out: Tag[] = [];
  for (const name of clean) {
    let row = await repo.findOne({ where: { name } });
    if (!row) row = await repo.save(repo.create({ name }));
    out.push(row);
  }
  return out;
}

/** Find-or-create companies by name. */
async function resolveCompanies(ds: DataSource, names: string[]): Promise<Company[]> {
  const repo = ds.getRepository(Company);
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const out: Company[] = [];
  for (const name of clean) {
    let row = await repo.findOne({ where: { name } });
    if (!row) row = await repo.save(repo.create({ name }));
    out.push(row);
  }
  return out;
}

main().catch((err) => {
  console.error('Catalog seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
