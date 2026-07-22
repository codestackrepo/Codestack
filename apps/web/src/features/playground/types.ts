import type { Language } from '@/types/common';
import type { SubmissionStatus } from '@/types/submission';

/**
 * Request body for POST /playground/run. Field names match the backend DTO
 * byte-for-byte: `userCode` (NOT `code`/`source`) and an optional `stdin`.
 * The global ValidationPipe has `forbidNonWhitelisted: true`, so any extra
 * field would 400 — keep this to exactly these three keys.
 */
export interface PlaygroundRunInput {
  language: Language;
  userCode: string;
  stdin?: string;
}

/**
 * Response from POST /playground/run (200), returned inline — this route is
 * fully synchronous, so there is no submissionId / polling. `status` is a
 * SubmissionStatus value, but only the "playground-observable" subset can
 * actually appear here.
 */
export interface PlaygroundResult {
  status: SubmissionStatus;
  stdout: string;
  error: string;
  runtimeMs: number;
}

/** Max chars the backend accepts for `userCode` and `stdin` (@MaxLength). */
export const PLAYGROUND_MAX_LENGTH = 65536;
