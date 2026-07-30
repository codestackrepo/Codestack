import { createHash } from 'crypto';
import { hashToken, mintInviteToken } from './invite-token.util';

describe('invite token', () => {
  it('mints a URL-safe token with no characters needing escaping in a path', () => {
    const { token } = mintInviteToken();
    // base64url: the accept URL is `{WEB_APP_URL}/invite/{token}`, so a '+' or '/'
    // would need encoding and would survive a copy-paste differently than it was
    // mailed.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43); // 32 bytes, base64url, unpadded
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 500 }, () => mintInviteToken().token));
    expect(seen.size).toBe(500);
  });

  // The storage invariant: what is persisted must not be what was mailed. If these
  // were ever equal, a database read would hand an attacker working invite links.
  it('returns a hash that is NOT the token', () => {
    const { token, tokenHash } = mintInviteToken();
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).not.toContain(token);
  });

  it('hashes to 64 lowercase hex, matching chk_org_invites_token_hash', () => {
    const { tokenHash } = mintInviteToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so a presented token finds its row by index lookup', () => {
    const { token, tokenHash } = mintInviteToken();
    expect(hashToken(token)).toBe(tokenHash);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('is plain sha256 — no salt, because lookup must be by equality', () => {
    const token = 'a-known-token';
    expect(hashToken(token)).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  });

  it('gives different tokens different hashes', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});
