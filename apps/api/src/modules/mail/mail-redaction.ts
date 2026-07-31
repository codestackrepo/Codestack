import { AnyMailMessage } from './mail.types';

/**
 * Param keys whose value is a URL carrying a live single-use credential.
 *
 * `acceptUrl` embeds an invite token (14-day TTL) and `resetUrl` a password-reset
 * token (60-minute TTL). Both are the ONLY thing standing between a holder of the
 * string and an account.
 */
const CREDENTIAL_PARAMS = ['acceptUrl', 'resetUrl'] as const;

export const REDACTED = '[redacted]';

/**
 * Strips credential-bearing URLs from a mail job payload (#118).
 *
 * WHY THIS EXISTS. `MAIL_JOB_OPTIONS` says, in a comment:
 *
 *   "removeOnFail: {age: 86400} keeps a day of failures for diagnosis. This is
 *    exactly why the payload carries {template, params} and never the rendered
 *    html/text: a retained failed job must not hold a live accept URL."
 *
 * The payload DID hold one. `params.acceptUrl` is the full URL including the raw
 * token — the invite path builds it with `mail.webUrl(\`invite/${token}\`)` — so a
 * failed delivery parked a redeemable 14-day credential in Redis for 24 hours, and a
 * completed one for 5 minutes. The comment described the intent, not the behaviour.
 *
 * Redaction happens only once a job is FINISHED. An in-flight job still needs the
 * real URL: BullMQ replays `job.data` on every retry, so scrubbing earlier would make
 * attempts 2..5 send a mail containing the word "[redacted]".
 *
 * Everything useful for diagnosis survives — recipient, template, org name, the
 * failure reason BullMQ records separately. What goes is the one field that is
 * dangerous to keep and useless to read.
 */
export function redactMailPayload(data: AnyMailMessage): AnyMailMessage {
  // The params union is a discriminated set of concrete shapes, so index it through
  // `unknown` rather than widening every template's interface with an index
  // signature just to satisfy this one reader.
  const params = (data as unknown as { params?: Record<string, unknown> }).params;
  if (!params) return data;

  let touched = false;
  const scrubbed: Record<string, unknown> = { ...params };
  for (const key of CREDENTIAL_PARAMS) {
    if (typeof scrubbed[key] === 'string' && scrubbed[key] !== REDACTED) {
      scrubbed[key] = REDACTED;
      touched = true;
    }
  }
  // Returning the SAME object when nothing matched lets the caller skip a Redis
  // write for the mail templates that carry no credential at all.
  if (!touched) return data;
  return { ...data, params: scrubbed } as unknown as AnyMailMessage;
}

/** True when the payload still carries a credential — the caller's write guard. */
export function hasCredential(data: AnyMailMessage): boolean {
  return redactMailPayload(data) !== data;
}
