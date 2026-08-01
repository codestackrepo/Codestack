export const Difficulty = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const ProblemSource = {
  HUMAN: 'human',
  AI: 'ai',
} as const;
export type ProblemSource = (typeof ProblemSource)[keyof typeof ProblemSource];

export const ProblemVisibility = {
  PRIVATE: 'private',
  SHARED: 'shared',
} as const;
export type ProblemVisibility = (typeof ProblemVisibility)[keyof typeof ProblemVisibility];

export const TestCaseType = {
  SAMPLE: 'sample',
  HIDDEN: 'hidden',
} as const;
export type TestCaseType = (typeof TestCaseType)[keyof typeof TestCaseType];

export interface TestCase {
  id: string;
  inputData: string;
  expectedOutput: string;
  type: TestCaseType;
  explanation: string;
  orderIndex: number;
}

/**
 * Mirrors `ProblemScope` in
 * `apps/api/src/modules/problems/enums/problem.enums.ts`.
 *
 * `global` is the platform catalog (`organization_id IS NULL`), visible to every
 * tenant and authorable only by a SuperAdmin — `problems.global` has an empty role
 * ceiling. `org` is owned by one tenant.
 */
export const ProblemScope = {
  GLOBAL: 'global',
  ORG: 'org',
} as const;
export type ProblemScope = (typeof ProblemScope)[keyof typeof ProblemScope];

export interface Problem {
  id: string;
  title: string;
  body: string;
  difficulty: Difficulty;
  source: ProblemSource;
  visibility: ProblemVisibility;
  scope: ProblemScope;
  tags: string[];
  companies: string[];
  isJudgeReady: boolean;
  createdById: string | null;
  createdAt: string;
  testCases?: TestCase[];
}

export interface ProblemFacets {
  tags: { name: string; count: number }[];
  companies: { name: string; count: number }[];
}

/**
 * Mirrors `IoPrimitive` / `IoType` in
 * `apps/api/src/modules/code-execution/driver-synth/io-spec.types.ts`.
 *
 * Non-recursive beyond one level on purpose — the set is exactly what every
 * per-language (de)serializer in the driver synthesizer can handle.
 */
export const IO_PRIMITIVES = ['int', 'long', 'double', 'string', 'bool'] as const;
export type IoPrimitive = (typeof IO_PRIMITIVES)[number];
export type IoType = IoPrimitive | { array: IoPrimitive } | { matrix: IoPrimitive };

export interface IoParam {
  name: string;
  type: IoType;
}

/** The judged signature. Sent with `functionName` — the server rejects one without the other. */
export interface IoSpec {
  params: IoParam[];
  returns: IoType;
}

/** One test case as sent at create time — no id or ordering, the server assigns both. */
export interface TestCaseInput {
  inputData: string;
  expectedOutput: string;
  type?: TestCaseType;
  explanation?: string;
}

export interface CreateProblemInput {
  title: string;
  body: string;
  difficulty?: Difficulty;
  tags?: string[];
  companies?: string[];
  visibility?: ProblemVisibility;
  /**
   * `global` is SuperAdmin-only — `problems.global` has an empty role ceiling — and
   * the server enforces that. Omitted means `org`, which is what any tenant author
   * wants; sending it explicitly from a non-superadmin is what earns a 403.
   */
  scope?: ProblemScope;
  /**
   * Created in the SAME transaction as the problem. Passing them here rather than
   * POSTing each afterwards is what stops a half-authored problem existing with no
   * way to judge a submission against it.
   */
  testCases?: TestCaseInput[];
  /**
   * Structured judging. BOTH OR NEITHER — the server answers 400
   * `incomplete_judge_spec` for one without the other, because a problem carrying
   * half a signature reports itself as authored while being unjudgeable.
   */
  functionName?: string;
  ioSpec?: IoSpec;
}
