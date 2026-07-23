import { z } from 'zod';

/**
 * Zod contract for an authored catalog problem. This is the single source of
 * truth the seed-catalog script validates every problem against before it
 * touches the database — a malformed problem fails fast with a path-precise
 * error instead of producing a broken, un-judgeable row.
 *
 * The io_spec / function_name drive deterministic driver synthesis + testcase
 * encoding (see code-execution/driver-synth), so a problem authored to this
 * schema is "judge-ready by synthesis": no hand-written driver code required.
 * The type set intentionally matches code-execution/driver-synth/io-spec.types.
 */
const PrimitiveIoType = z.enum(['int', 'long', 'double', 'string', 'bool']);

export const IoTypeSchema = z.union([
  PrimitiveIoType,
  z.object({ array: PrimitiveIoType }),
  z.object({ matrix: PrimitiveIoType }),
]);

export const IoParamSchema = z.object({
  name: z.string().min(1).max(64),
  type: IoTypeSchema,
});

export const IoSpecSchema = z.object({
  params: z.array(IoParamSchema).min(1).max(6),
  returns: IoTypeSchema,
});

/** One test case: JSON-encodable inputs (one per param, in order) + expected return. */
export const CatalogTestCaseSchema = z.object({
  inputs: z.array(z.unknown()).min(1).max(6),
  expected: z.unknown(),
  explanation: z.string().max(500).optional(),
});

/**
 * Reference + starter code. Python and JavaScript are the required "judge-ready
 * core" (the --validate gate runs these two through the real judge); Java/C++
 * are optional and may be filled in later.
 */
const PerLanguageRequired = z.object({
  python: z.string().min(1),
  javascript: z.string().min(1),
  java: z.string().optional(),
  cpp: z.string().optional(),
});

export const CatalogProblemSchema = z.object({
  /** Stable natural key used for idempotent upserts (kebab-case). */
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  title: z.string().min(3).max(150),
  statementMarkdown: z.string().min(20).max(8000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1).max(40)).min(1).max(8),
  companies: z.array(z.string().min(1).max(80)).max(12).default([]),
  functionName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid identifier'),
  ioSpec: IoSpecSchema,
  referenceSolution: PerLanguageRequired,
  starterCode: PerLanguageRequired,
  sampleTestcases: z.array(CatalogTestCaseSchema).min(1).max(3),
  hiddenTestcases: z.array(CatalogTestCaseSchema).min(1).max(20),
});

export const CatalogSchema = z.object({
  problems: z.array(CatalogProblemSchema).min(1),
});

export type CatalogProblem = z.infer<typeof CatalogProblemSchema>;
export type CatalogTestCase = z.infer<typeof CatalogTestCaseSchema>;
