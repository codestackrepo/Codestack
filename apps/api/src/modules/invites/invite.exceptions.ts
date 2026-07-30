import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Invite failures carry a machine-readable `reason` so the frontend can branch
 * without string-matching a message. Every one is a deliberate, enumerated
 * outcome of the accept/claim state machine.
 */

/** The invite exists but is not in a state that can be consumed. */
export class InviteNotPendingException extends ConflictException {
  constructor(reason: 'invite_already_accepted' | 'invite_revoked' | 'invite_expired') {
    super({ reason, message: 'This invitation can no longer be used' });
  }
}

/**
 * An account already holds this address and cannot take the invite.
 *
 * `email_unavailable` is deliberately OPAQUE on the org path: telling an org
 * admin "that address is in another organization" is a cross-tenant existence
 * oracle, so every out-of-reach case collapses to one code.
 */
export class AccountConflictException extends ConflictException {
  constructor(
    reason:
      | 'account_exists'
      | 'account_ineligible'
      | 'account_disabled'
      | 'email_unavailable'
      | 'invite_already_pending',
    extra: Record<string, unknown> = {},
  ) {
    super({ reason, ...extra });
  }
}

/**
 * Resend is rate-limited per INVITE, which the global throttler cannot express —
 * it buckets by `user:{id}` / `ip:{ip}`, so one admin resending twenty different
 * invites is legitimate while resending one invite twenty times is not.
 */
export class InviteResendCooldownException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        reason: 'invite_resend_cooldown',
        retryAfterSeconds,
        message: `Please wait ${retryAfterSeconds}s before resending this invitation`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
