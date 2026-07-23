/**
 * In-process domain events that fan out to user notifications. Emitted by the
 * owning service (e.g. AssignmentsService) and handled by NotificationsListener,
 * mirroring the SUBMISSION_FINALIZED → GradingService pattern.
 */
export const ASSIGNMENT_PUBLISHED = 'assignment.published';
export const ASSIGNMENT_PROBLEM_ADDED = 'assignment.problem-added';
export const ASSIGNMENT_GRADES_PUBLISHED = 'assignment.grades-published';

/**
 * `studentRecipientIds`, when present, restricts the student fan-out to exactly
 * these ids (used for batch-targeted assignments — §9.10). Left undefined for
 * classroom-targeted assignments, where the listener keeps its all-students
 * behavior. Graders are unioned in separately by the listener when applicable.
 */
export interface AssignmentPublishedEvent {
  assignmentId: string;
  classroomId: string;
  title: string;
  /** The acting user — excluded from recipients so they don't notify themselves. */
  actorId: string;
  studentRecipientIds?: string[];
}

export interface AssignmentProblemAddedEvent {
  assignmentId: string;
  assignmentProblemId: string;
  classroomId: string;
  assignmentTitle: string;
  problemTitle: string;
  actorId: string;
  studentRecipientIds?: string[];
}

export interface AssignmentGradesPublishedEvent {
  assignmentId: string;
  classroomId: string;
  title: string;
  actorId: string;
  studentRecipientIds?: string[];
}
