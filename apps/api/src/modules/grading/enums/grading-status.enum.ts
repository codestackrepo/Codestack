/**
 * Grading progress of a per-student, per-item score under the professor-driven
 * grading model (docs/REDESIGN.md §5.3/§10). Replaces the implicit
 * award-on-accept signal: a score is `graded` only once a professor (or the
 * MCQ auto-scorer) has finalized it.
 */
export enum GradingStatus {
  NOT_STARTED = 'not_started',
  SUBMITTED = 'submitted',
  GRADED = 'graded',
}
