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
