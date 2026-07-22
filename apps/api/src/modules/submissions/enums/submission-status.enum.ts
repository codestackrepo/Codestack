/**
 * Verdict strings — kept VERBATIM from the original platform so existing
 * clients/data remain compatible. `COMPILE_ERROR` is a new, honest verdict.
 */
export enum SubmissionStatus {
  PENDING = 'Pending',
  RUNNING = 'Running',
  ACCEPTED = 'Accepted',
  WRONG_ANSWER = 'Wrong Answer',
  TIME_LIMIT_EXCEEDED = 'Time Limit Exceeded',
  MEMORY_LIMIT_EXCEEDED = 'Memory Limit Exceeded',
  RUNTIME_ERROR = 'Runtime Error',
  SYNTAX_ERROR = 'Syntax Error',
  COMPILE_ERROR = 'Compile Error',
  INTERNAL_ERROR = 'Internal Error',
  FINISHED = 'Finished', // playground only
}

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

/** Priority order for picking the "worst"/representative failing verdict. */
export const VERDICT_PRIORITY: SubmissionStatus[] = [
  SubmissionStatus.INTERNAL_ERROR,
  SubmissionStatus.COMPILE_ERROR,
  SubmissionStatus.SYNTAX_ERROR,
  SubmissionStatus.RUNTIME_ERROR,
  SubmissionStatus.TIME_LIMIT_EXCEEDED,
  SubmissionStatus.MEMORY_LIMIT_EXCEEDED,
  SubmissionStatus.WRONG_ANSWER,
  SubmissionStatus.ACCEPTED,
];
