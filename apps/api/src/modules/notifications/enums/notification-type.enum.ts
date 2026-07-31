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
  /** Staff turned the recipient's access off / back on (#105). */
  ACCESS_REVOKED = 'access_revoked',
  ACCESS_RESTORED = 'access_restored',
  /** The recipient was placed into an organization, leaving the holding state. */
  ORGANIZATION_ASSIGNED = 'organization_assigned',
  /**
   * A student raised a DOUBT on a problem — sent to the author's own org staff
   * (#75). Issues and suggestions deliberately do not fan out; they sit in the
   * inbox, because paging every professor for a typo report is how staff learn to
   * ignore notifications.
   */
  PROBLEM_FEEDBACK_RECEIVED = 'problem_feedback_received',
  /** Staff resolved the recipient's problem feedback (#75). */
  PROBLEM_FEEDBACK_RESOLVED = 'problem_feedback_resolved',
  /**
   * A student asked a question on a topic (#76) — sent to the ASKER's own org
   * staff, so a question on a global topic never pages another tenant.
   */
  TOPIC_DOUBT_RAISED = 'topic_doubt_raised',
  /** Staff marked the recipient's topic question resolved (#76). */
  TOPIC_DOUBT_RESOLVED = 'topic_doubt_resolved',
}
// NOTE: no migration needed — `notifications.type` is varchar(50) with no CHECK
// (1784600000000 converted it off the PG enum precisely so new types are
// code-only).
