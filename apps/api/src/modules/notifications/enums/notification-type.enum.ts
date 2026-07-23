export enum NotificationType {
  /** A new assignment became available (DRAFT → ACTIVE). */
  NEW_ASSIGNMENT = 'new_assignment',
  /** A problem was added to an already-visible assignment. */
  ASSIGNMENT_UPDATED = 'assignment_updated',
  /** Grades + feedback were published (final announcement). */
  GRADES_PUBLISHED = 'grades_published',
  /** A student submitted a solution — sent to the classroom's staff/graders. */
  SUBMISSION_RECEIVED = 'submission_received',
  /** A professor/grader reviewed a student's work (score/feedback saved). */
  FEEDBACK_RECEIVED = 'feedback_received',
  /** An admin approved the recipient's professor-access request. */
  PROFESSOR_REQUEST_APPROVED = 'professor_request_approved',
  /** An admin declined the recipient's professor-access request. */
  PROFESSOR_REQUEST_REJECTED = 'professor_request_rejected',
}
