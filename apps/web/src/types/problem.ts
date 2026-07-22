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

export interface Problem {
  id: string;
  title: string;
  body: string;
  difficulty: Difficulty;
  source: ProblemSource;
  visibility: ProblemVisibility;
  tags: string[];
  createdById: string | null;
  createdAt: string;
  testCases?: TestCase[];
}

export interface CreateProblemInput {
  title: string;
  body: string;
  difficulty?: Difficulty;
  tags?: string[];
  visibility?: ProblemVisibility;
}
