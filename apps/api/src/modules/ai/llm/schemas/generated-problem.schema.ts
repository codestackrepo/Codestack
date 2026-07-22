import { z } from 'zod';

/**
 * Zod is the single source of truth for the AI module's structured-output
 * contract: the same schema drives runtime validation, the TS types below
 * (via z.infer), and the provider-facing JSON Schema (via zod-to-json-schema)
 * that Anthropic/OpenAI's structured-output APIs are asked to conform to.
 *
 * The io type set is intentionally small and non-recursive beyond one level
 * (primitive | array-of-primitive | matrix-of-primitive) — this keeps every
 * per-language driver's (de)serializer finite and keeps the schema itself
 * safe for providers that reject deeply recursive JSON Schemas.
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

const LANGUAGES = ['python', 'javascript', 'java', 'cpp'] as const;

const PerLanguageCodeSchema = z.object({
  python: z.string(),
  javascript: z.string(),
  java: z.string(),
  cpp: z.string(),
});

export const TestCaseIoSchema = z.object({
  inputs: z.array(z.unknown()).min(1).max(6),
  expected: z.unknown(),
  explanation: z.string().max(500).optional(),
});

export const GeneratedProblemSchema = z.object({
  title: z.string().min(3).max(150),
  statement_markdown: z.string().min(20).max(8000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1).max(40)).min(1).max(6),
  constraints: z.array(z.string().min(1).max(200)).min(1).max(8),
  function_name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid identifier'),
  io_spec: IoSpecSchema,
  reference_solution: PerLanguageCodeSchema,
  starter_code: PerLanguageCodeSchema,
  sample_testcases: z.array(TestCaseIoSchema).min(1).max(3),
  hidden_testcases: z.array(TestCaseIoSchema).min(3).max(10),
});

export const GeneratedProblemSetSchema = z.object({
  problems: z.array(GeneratedProblemSchema).min(1).max(3),
});

export type IoType = z.infer<typeof IoTypeSchema>;
export type IoParam = z.infer<typeof IoParamSchema>;
export type IoSpec = z.infer<typeof IoSpecSchema>;
export type TestCaseIo = z.infer<typeof TestCaseIoSchema>;
export type GeneratedProblem = z.infer<typeof GeneratedProblemSchema>;
export type GeneratedProblemSet = z.infer<typeof GeneratedProblemSetSchema>;
export type SupportedLanguageKey = (typeof LANGUAGES)[number];
