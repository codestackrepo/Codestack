/** BullMQ queue names. */
export const QUEUE_JUDGE = 'judge';
export const QUEUE_PLAYGROUND = 'playground';
export const QUEUE_AI_GENERATE = 'ai-generate';
export const QUEUE_ASSIGNMENT_SWEEP = 'assignment-sweep';

/** Job names within queues. */
export const JOB_JUDGE_SUBMISSION = 'judge-submission';
export const JOB_PLAYGROUND_RUN = 'playground-run';
export const JOB_AI_GENERATE = 'ai-generate';
export const JOB_ASSIGNMENT_SWEEP = 'assignment-sweep';

/** Stable scheduler id so process restarts never stack duplicate repeatables. */
export const ASSIGNMENT_SWEEP_SCHEDULER_ID = 'assignment-sweep-scheduler';
