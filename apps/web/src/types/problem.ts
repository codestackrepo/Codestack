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

export interface CreateProblemInput {
  title: string;
  body: string;
  difficulty?: Difficulty;
  tags?: string[];
  companies?: string[];
  visibility?: ProblemVisibility;
}
