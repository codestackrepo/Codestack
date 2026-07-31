import { MailTemplate } from './mail.types';
import { REDACTED, hasCredential, redactMailPayload } from './mail-redaction';

const invite = () =>
  ({
    to: 'student@codestack.dev',
    template: MailTemplate.STUDENT_INVITE,
    params: {
      orgName: 'Acme U',
      firstName: 'A',
      lastName: 'B',
      inviterName: null,
      acceptUrl: 'http://localhost:5173/invite/RAW_TOKEN_VALUE',
      expiresInDays: 14,
    },
  }) as never;

const reset = () =>
  ({
    to: 'student@codestack.dev',
    template: MailTemplate.PASSWORD_RESET,
    params: {
      firstName: 'A',
      lastName: 'B',
      resetUrl: 'http://localhost:5173/reset-password/RAW_RESET_TOKEN',
      expiresInMinutes: 60,
    },
  }) as never;

describe('mail payload redaction (#118)', () => {
  it('removes the invite token and leaves everything diagnostic intact', () => {
    const out = redactMailPayload(invite()) as unknown as {
      to: string;
      params: Record<string, unknown>;
    };
    expect(JSON.stringify(out)).not.toContain('RAW_TOKEN_VALUE');
    expect(out.params.acceptUrl).toBe(REDACTED);
    // What a person reading a failed job actually needs still survives.
    expect(out.to).toBe('student@codestack.dev');
    expect(out.params.orgName).toBe('Acme U');
    expect(out.params.expiresInDays).toBe(14);
  });

  it('removes the password-reset token too', () => {
    const out = redactMailPayload(reset()) as unknown as { params: Record<string, unknown> };
    expect(JSON.stringify(out)).not.toContain('RAW_RESET_TOKEN');
    expect(out.params.resetUrl).toBe(REDACTED);
  });

  it('does not mutate the original — a retry must still send the real URL', () => {
    const original = invite() as unknown as { params: { acceptUrl: string } };
    redactMailPayload(original as never);
    expect(original.params.acceptUrl).toContain('RAW_TOKEN_VALUE');
  });

  it('returns the SAME object when there is no credential, so no Redis write happens', () => {
    const plain = {
      to: 'a@b.dev',
      template: MailTemplate.WELCOME,
      params: { firstName: 'A', lastName: 'B' },
    } as never;
    expect(redactMailPayload(plain)).toBe(plain);
    expect(hasCredential(plain)).toBe(false);
  });

  it('is idempotent — redacting twice is not a second write', () => {
    const once = redactMailPayload(invite());
    expect(hasCredential(once)).toBe(false);
    expect(redactMailPayload(once)).toBe(once);
  });

  it('hasCredential is true for both token-bearing templates', () => {
    expect(hasCredential(invite())).toBe(true);
    expect(hasCredential(reset())).toBe(true);
  });
});
