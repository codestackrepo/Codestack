// Feature-local grading types. const-object enums per the codebase convention
// (tsconfig `erasableSyntaxOnly` forbids real TS `enum`).

/** One assignment-problem's score for a single student (from GET .../my-score and .../students-scores). */
export interface ProblemScore {
  assignmentProblemId: string;
  problemId: string;
  title: string;
  maxScore: number;
  score: number;
  submissionCount: number;
  solved: boolean;
  feedback: string;
}

/** Assignment-level rollup embedded in a StudentScore. */
export interface AssignmentScoreSummary {
  finalScore: number;
  /** Sum of every assignment-problem's max points. */
  maxScore: number;
  feedback: string;
}

/** Shape returned per student by GET .../my-score (single) and .../students-scores (array). */
export interface StudentScore {
  userId: string;
  assignmentScore: AssignmentScoreSummary;
  problems: ProblemScore[];
}

/**
 * GET .../score — INCONSISTENT SHAPE: a missing row returns only
 * { finalScore, feedback }; an existing row serializes the full entity. Treat
 * everything beyond finalScore/feedback as optional.
 */
export interface AssignmentScoreRow {
  finalScore: number;
  feedback: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  assignmentId?: string;
  userId?: string;
  createdById?: string | null;
}

/** PATCH body for a manual score override. */
export interface UpdateScoreInput {
  /** Must be >= 0 and <= the problem's max points (server-validated). */
  score: number;
  feedback?: string;
}

/**
 * PATCH .../problems/:apId/students/:studentId response — the saved ProblemScore
 * entity. `submission` may be a nested object, null, or ABSENT for a fresh row.
 */
export interface ProblemScoreEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  assignmentProblemId: string;
  userId: string;
  submission?: unknown | null;
  submissionId: string | null;
  score: number;
  submissionCount: number;
  feedback: string;
  createdById: string | null;
}

/** finalScore/score/maxScore are floats — render at most 2 decimals, trimmed. */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/** Percentage of max, clamped to [0, 100]; 0 when max is 0. */
export function scorePercent(score: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, (score / max) * 100));
}
