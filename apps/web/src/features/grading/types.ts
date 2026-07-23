// Feature-local grading types. Mirrors the generalized item-model backend
// (issue #21): one line per assignment ITEM (coding / mcq / quiz), a per-item
// gradingStatus, and reveal-gated nullable scores for the student view.

/** Item grading progress (mirrors backend GradingStatus). */
export type GradingStatus = 'not_started' | 'submitted' | 'graded';
export type ItemKind = 'coding' | 'mcq' | 'quiz';

/**
 * One assignment item's score line (from GET .../my-score and
 * .../students-scores). `score`/`finalScore` are `null` for a student before
 * GRADE_PUBLISHED (§9.2) — render a status chip, never a number.
 */
export interface ItemScore {
  itemId: string;
  kind: ItemKind;
  assignmentProblemId?: string | null;
  title: string;
  maxScore: number;
  score: number | null;
  gradingStatus: GradingStatus;
  feedback: string;
  solved?: boolean | null;
}

/** Assignment-level rollup embedded in a StudentScore. */
export interface AssignmentScoreSummary {
  /** null for a student pre-publish; the true total for staff. */
  finalScore: number | null;
  /** Sum of every item's max points. */
  maxScore: number;
  feedback: string;
}

/** Shape returned per student by GET .../my-score (single) and .../students-scores (array). */
export interface StudentScore {
  userId: string;
  assignmentScore: AssignmentScoreSummary;
  items: ItemScore[];
}

/** Staff item-review payload — GET /grading/items/:itemId/students/:studentId. */
export interface ItemReview {
  itemId: string;
  kind: ItemKind;
  maxPoints: number;
  title?: string;
  prompt?: string;
  // coding
  submission?: {
    id: string;
    userCode: string;
    language: string;
    status: string;
    passedTestcaseCount: number;
    totalTestcaseCount: number;
    failedTestcaseDetail?: unknown;
  } | null;
  score?: number;
  feedback?: string;
  gradingStatus?: GradingStatus;
  // mcq
  options?: { id: string; text: string; isCorrect: boolean; orderIndex: number }[];
  selectedOptionIds?: string[];
  awardedPoints?: number | null;
  // quiz
  answerText?: string;
  gradedById?: string | null;
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

/**
 * finalScore/score/maxScore are floats — render at most 2 decimals, trimmed.
 * Null-safe: a hidden (pre-publish) score renders as an em dash, never 0.
 */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/** Percentage of max, clamped to [0, 100]; 0 when max is 0 or the score is hidden. */
export function scorePercent(score: number | null | undefined, max: number): number {
  if (score === null || score === undefined || !max || max <= 0) return 0;
  return Math.max(0, Math.min(100, (score / max) * 100));
}

/** Human label for a per-item grading status. */
export const GRADING_STATUS_LABEL: Record<GradingStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  graded: 'Graded',
};

/** Short badge label for an item kind. */
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  coding: 'Coding',
  mcq: 'MCQ',
  quiz: 'Quiz',
};
