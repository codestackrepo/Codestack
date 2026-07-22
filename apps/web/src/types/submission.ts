import type { Language } from './common';

export const SubmissionStatus = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  TIME_LIMIT_EXCEEDED: 'Time Limit Exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory Limit Exceeded',
  RUNTIME_ERROR: 'Runtime Error',
  SYNTAX_ERROR: 'Syntax Error',
  COMPILE_ERROR: 'Compile Error',
  INTERNAL_ERROR: 'Internal Error',
  FINISHED: 'Finished',
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const TERMINAL_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.TIME_LIMIT_EXCEEDED,
  SubmissionStatus.MEMORY_LIMIT_EXCEEDED,
  SubmissionStatus.RUNTIME_ERROR,
  SubmissionStatus.SYNTAX_ERROR,
  SubmissionStatus.COMPILE_ERROR,
  SubmissionStatus.INTERNAL_ERROR,
];

export interface TestCaseResult {
  ordinal: number;
  verdict: SubmissionStatus;
  runtimeMs: number;
  memoryBytes: string;
  isSample: boolean;
}

export interface Submission {
  submissionId: string;
  status: SubmissionStatus;
  language: Language;
  passedTestcaseCount: number;
  totalTestcaseCount: number;
  runtimeMs: number | null;
  memoryBytes: string | null;
  failedTestcaseDetail: {
    input: string;
    expected: string;
    output: string;
    error: string;
    stdout: string;
  } | null;
  userCode: string;
  createdAt: string;
  testCaseResults?: TestCaseResult[];
}

export interface SubmitResult {
  submissionId: string;
  status: SubmissionStatus;
}

export interface SampleTestcase {
  inputData: string;
  expectedOutput: string;
  explanation: string;
}

export interface LanguageTemplate {
  language: Language;
  starterCode: string;
}

export interface EditorBootstrap {
  id: string;
  assignmentId: string;
  problemId: string;
  title: string;
  body: string;
  difficulty: string;
  tags: string[];
  score: number;
  sampleTestCases: SampleTestcase[];
  templates: LanguageTemplate[];
}

export interface RunResultCase {
  input: string;
  expected: string;
  output: string;
  error: string;
  status: SubmissionStatus;
}

export interface RunResult {
  status: SubmissionStatus;
  results: RunResultCase[];
}

/** Live status/testcase payloads relayed over the /ws/submissions gateway. */
export interface SubmissionStatusEvent {
  submissionId: string;
  status: SubmissionStatus;
  passedTestcaseCount: number;
  totalTestcaseCount: number;
  runtimeMs: number | null;
  memoryBytes: string | null;
}

export interface SubmissionTestcaseEvent {
  submissionId: string;
  ordinal: number;
  verdict: SubmissionStatus;
}
