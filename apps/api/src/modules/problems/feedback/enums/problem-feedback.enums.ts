/**
 * Mirrors `chk_problem_feedback_kind` / `chk_problem_feedback_status`
 * (migration 1785560000000). Both columns are `varchar` + `CHECK`, so adding a
 * value means editing the CHECK in a new migration AND this enum — the DB is the
 * authority, and a value here without one there fails on INSERT.
 */
export enum ProblemFeedbackKind {
  /** "I don't understand" — the only kind that fans out as a doubt. */
  DOUBT = 'doubt',
  /** "Something is wrong with this problem" (bad test case, wrong statement). */
  ISSUE = 'issue',
  SUGGESTION = 'suggestion',
}

export enum ProblemFeedbackStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}
