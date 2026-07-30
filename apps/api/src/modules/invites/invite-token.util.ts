import { createHash, randomBytes } from 'crypto';

/** Bytes of entropy in a raw invite token. 256 bits. */
const TOKEN_BYTES = 32;

/**
 * Mints a raw invite token and its storage hash.
 *
 * The raw value is returned ONCE and exists thereafter only as a local variable,
 * a mail body, a URL and a request body — never a column, never a log line, never
 * a response field. `hashToken` is the only thing persisted.
 *
 * sha256, not argon2, and that is deliberate rather than an oversight: a password
 * hash is slow to defeat dictionary and reuse attacks against LOW-entropy human
 * input. This input is 256 bits of uniform CSPRNG output — there is no dictionary
 * to try and no reuse to exploit, so the slow KDF would buy nothing and would put
 * ~100ms on the accept path, which runs inside a transaction holding the org's
 * quota row lock.
 */
export function mintInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url'); // 43 URL-safe chars
  return { token, tokenHash: hashToken(token) };
}

/**
 * sha256 hex of a raw token — 64 lowercase chars, matching
 * `chk_org_invites_token_hash`.
 *
 * Lookup is `WHERE token_hash = $1` against `uq_org_invites_token_hash`, so the
 * comparison happens in the index, not in application code. There is no
 * string equality to make constant-time, and a timing side channel on an index
 * probe would leak nothing usable about a 256-bit value anyway.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
