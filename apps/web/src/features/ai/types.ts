// Feature-local types for the AI question-generation module. Enum-like sets use
// the const-object pattern (tsconfig `erasableSyntaxOnly` forbids real TS enums).
// Field names mirror the backend DTOs byte-for-byte: the wrapping DTOs are
// camelCase, the LLM `draft` payload is snake_case — do not mix the two.

export const GenerationStatus = {
  QUEUED: 'queued',
  GENERATING: 'generating',
  VALIDATING: 'validating',
  READY: 'ready',
  FAILED: 'failed',
} as const;
export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

/** Statuses at which polling should stop. */
export const TERMINAL_GENERATION_STATUSES: GenerationStatus[] = [
  GenerationStatus.READY,
  GenerationStatus.FAILED,
];

export const GenerationSourceType = {
  PROMPT: 'prompt',
  PDF: 'pdf',
  TXT: 'txt',
  MD: 'md',
  DOCX: 'docx',
} as const;
export type GenerationSourceType = (typeof GenerationSourceType)[keyof typeof GenerationSourceType];

export const GeneratedProblemLinkStatus = {
  VALIDATED: 'validated',
  DISCARDED: 'discarded',
  SAVED: 'saved',
} as const;
export type GeneratedProblemLinkStatus =
  (typeof GeneratedProblemLinkStatus)[keyof typeof GeneratedProblemLinkStatus];

export const Difficulty = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Keys of perLanguagePass / reference_solution / starter_code. */
export const SupportedLanguageKey = {
  PYTHON: 'python',
  JAVASCRIPT: 'javascript',
  JAVA: 'java',
  CPP: 'cpp',
} as const;
export type SupportedLanguageKey = (typeof SupportedLanguageKey)[keyof typeof SupportedLanguageKey];

export type IoPrimitive = 'int' | 'long' | 'double' | 'string' | 'bool';
export type IoType = IoPrimitive | { array: IoPrimitive } | { matrix: IoPrimitive };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

/** GenerationRequestResponseDto (POST / list / get-by-id all return this shape). */
export interface GenerationRequest {
  id: string;
  topic: string;
  sourceType: GenerationSourceType;
  status: GenerationStatus;
  errorReason: string | null;
  requestedCount: number;
  tokenUsage: TokenUsage | null;
  createdAt: string;
  completedAt: string | null;
}

export interface IoParam {
  name: string;
  type: IoType;
}

export interface Testcase {
  inputs: unknown[];
  expected: unknown;
  explanation?: string;
}

/** The structured LLM output (`draft`). snake_case, mirrors the backend. */
export interface GeneratedProblem {
  title: string;
  statement_markdown: string;
  difficulty: Difficulty;
  tags: string[];
  constraints: string[];
  function_name: string;
  io_spec: { params: IoParam[]; returns: IoType };
  reference_solution: Record<SupportedLanguageKey, string>;
  starter_code: Record<SupportedLanguageKey, string>;
  sample_testcases: Testcase[];
  // hidden_testcases is present on the wire but intentionally NOT surfaced in the UI.
  hidden_testcases?: Testcase[];
}

export type PerLanguagePass = Partial<Record<SupportedLanguageKey, boolean>>;

/** GeneratedProblemLinkResponseDto. */
export interface GeneratedProblemLink {
  id: string;
  status: GeneratedProblemLinkStatus;
  problemId: string | null;
  perLanguagePass: PerLanguagePass;
  draft: GeneratedProblem;
}

/** Payload the form collects before it is turned into multipart FormData. */
export interface CreateGenerationInput {
  topic: string;
  count: number;
  prompt?: string;
  file?: File | null;
}
