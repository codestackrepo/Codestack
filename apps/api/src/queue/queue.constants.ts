/** BullMQ queue names. */
export const QUEUE_JUDGE = 'judge';
export const QUEUE_PLAYGROUND = 'playground';
export const QUEUE_AI_GENERATE = 'ai-generate';
export const QUEUE_ASSIGNMENT_SWEEP = 'assignment-sweep';
export const QUEUE_MAIL = 'mail';

/** Job names within queues. */
export const JOB_JUDGE_SUBMISSION = 'judge-submission';
export const JOB_PLAYGROUND_RUN = 'playground-run';
export const JOB_AI_GENERATE = 'ai-generate';
export const JOB_ASSIGNMENT_SWEEP = 'assignment-sweep';
export const JOB_SEND_MAIL = 'send-mail';

/** Stable scheduler id so process restarts never stack duplicate repeatables. */
export const ASSIGNMENT_SWEEP_SCHEDULER_ID = 'assignment-sweep-scheduler';

/**
 * Mail delivery job options (#103). Deliberately NOT the root defaults:
 *
 * - `attempts: 5` with exponential backoff from 30s spans roughly 30s -> 8m, which
 *   covers the realistic SMTP outage (a relay restart, a brief DNS failure)
 *   without hammering a provider that is rate-limiting us.
 * - `removeOnComplete: {age: 300}` is a TOKEN-EXPOSURE bound, not a storage one.
 *   Five minutes is long enough for a `jobId` to still dedupe a double-clicked
 *   Resend, and short enough that a completed job's params stop being an
 *   interesting thing to read out of Redis.
 * - `removeOnFail: {age: 86400}` keeps a day of failures for diagnosis. This is
 *   exactly why the payload carries `{template, params}` and never the rendered
 *   `html`/`text`: a retained failed job must not hold a live accept URL.
 */
export const MAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 300 },
  removeOnFail: { age: 86_400 },
};
