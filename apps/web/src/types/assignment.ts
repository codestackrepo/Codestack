import type { Language } from './common';

export const AssignmentStatus = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  GRADE_PUBLISHED: 'grade_published',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

/**
 * Regular (untimed) assignment vs. a timed test. Mirrors the backend
 * AssignmentKind enum; a test additionally requires `durationMinutes`.
 */
export const AssignmentKind = {
  ASSIGNMENT: 'assignment',
  TEST: 'test',
} as const;
export type AssignmentKind = (typeof AssignmentKind)[keyof typeof AssignmentKind];

/**
 * Who an assignment is visible to within its classroom: the whole class
 * (`classroom`) or only members of the linked batches (`batch`). Mirrors the
 * backend AssignmentTargetType enum.
 */
export const AssignmentTargetType = {
  CLASSROOM: 'classroom',
  BATCH: 'batch',
} as const;
export type AssignmentTargetType = (typeof AssignmentTargetType)[keyof typeof AssignmentTargetType];

export interface Assignment {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  classroomId: string;
  createdById: string;
  status: AssignmentStatus;
  publishedAt: string | null;
  kind: AssignmentKind;
  targetType: AssignmentTargetType;
  durationMinutes: number | null;
  targetBatchIds: string[];
}

export interface CreateAssignmentInput {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  classroomId: string;
  /** Create hidden (never auto-activates by date; opened via publish). */
  asDraft?: boolean;
  kind?: AssignmentKind;
  targetType?: AssignmentTargetType;
  /** Required when kind=test. */
  durationMinutes?: number;
  /** Required (>=1) when targetType=batch; must belong to classroomId. */
  targetBatchIds?: string[];
}

export type UpdateAssignmentInput = Partial<CreateAssignmentInput>;

export interface AssignmentProblem {
  id: string;
  assignmentId: string;
  problemId: string;
  title: string;
  difficulty: string;
  tags: string[];
  score: number;
  isImported: boolean;
  languages: Language[];
}

// ---- Mixed items (#22) ----

/** A single assignment item: a coding problem, an MCQ, or a free-text quiz. */
export const AssignmentItemKind = {
  CODING: 'coding',
  MCQ: 'mcq',
  QUIZ: 'quiz',
} as const;
export type AssignmentItemKind = (typeof AssignmentItemKind)[keyof typeof AssignmentItemKind];

/** Lifecycle of a student's timed-test attempt (mirrors backend AttemptStatus). */
export const AttemptStatus = {
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  AUTO_SUBMITTED: 'auto_submitted',
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

// Staff builder shapes (mirror AssignmentItemStaffDto — includes isCorrect).
export interface McqOptionStaff {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface AssignmentItemStaff {
  id: string;
  kind: AssignmentItemKind;
  orderIndex: number;
  maxPoints: number;
  prompt: string;
  gradingMode: string;
  allowMultiple: boolean;
  assignmentProblemId: string | null;
  options?: McqOptionStaff[];
  // Coding summary (present for kind=coding).
  title?: string;
  difficulty?: string;
  languages?: Language[];
}

export interface McqOptionInput {
  text: string;
  isCorrect: boolean;
  orderIndex?: number;
}

export interface CreateAssignmentItemInput {
  kind: AssignmentItemKind;
  orderIndex?: number;
  prompt?: string;
  /** Points for mcq/quiz (coding uses `score`). */
  maxPoints?: number;
  options?: McqOptionInput[];
  allowMultiple?: boolean;
  // Coding
  sourceProblemId?: string;
  score?: number;
  languages?: Language[];
}

export interface UpdateAssignmentItemInput {
  prompt?: string;
  orderIndex?: number;
  maxPoints?: number;
  allowMultiple?: boolean;
  /** MCQ: replaces all options. */
  options?: McqOptionInput[];
}

// Student take shapes (mirror AssignmentItemStudentDto — NO isCorrect/scores).
export interface McqOptionView {
  id: string;
  text: string;
  orderIndex: number;
}

/** A student's own saved answer, for rehydration — never any score/correctness. */
export interface MyItemResponse {
  selectedOptionIds?: string[];
  answerText?: string;
}

export interface AssignmentTakeItem {
  itemId: string;
  kind: AssignmentItemKind;
  orderIndex: number;
  maxPoints: number;
  prompt?: string;
  allowMultiple?: boolean;
  options?: McqOptionView[];
  // Coding link target for /solve/:apId.
  assignmentProblemId?: string | null;
  title?: string;
  difficulty?: string;
  languages?: Language[];
  /** The problem statement, so requirements are visible without opening the editor. */
  statement?: string;
  /**
   * SAMPLE cases only — the server filters to `type === 'sample' && isActive`.
   * Hidden cases belong to the judge and never reach a student.
   */
  sampleTestCases?: { inputData: string; expectedOutput: string; explanation: string }[];
  myResponse?: MyItemResponse;
}

export interface AssignmentTake {
  assignmentId: string;
  kind: AssignmentKind;
  status: AssignmentStatus;
  items: AssignmentTakeItem[];
  attempt: { deadlineAt: string | null; status: AttemptStatus } | null;
}
