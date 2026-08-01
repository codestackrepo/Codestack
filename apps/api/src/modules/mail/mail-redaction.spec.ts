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

const verification = () =>
  ({
    to: 'student@codestack.dev',
    template: MailTemplate.VERIFY_EMAIL,
    params: {
      firstName: 'A',
      lastName: 'B',
      verifyUrl: 'http://localhost:5173/verify-email/RAW_VERIFY_TOKEN',
      expiresInHours: 24,
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

  it('removes the email-verification token', () => {
    const out = redactMailPayload(verification()) as unknown as {
      params: Record<string, unknown>;
    };
    expect(JSON.stringify(out)).not.toContain('RAW_VERIFY_TOKEN');
    expect(out.params.verifyUrl).toBe(REDACTED);
    expect(out.params.expiresInHours).toBe(24);
  });
});

/**
 * The credential census.
 *
 * Enumerating `MailTemplate` is what makes this a gate rather than a set of
 * examples. The previous tests each name a template they already know carries a
 * token; none of them notices a NEW template that mails one and was never added to
 * `CREDENTIAL_PARAMS`. That omission is invisible — the mail sends correctly, the
 * tests stay green, and the credential simply sits in Redis for the 24 hours of
 * `removeOnFail`.
 *
 * So: every template is built with representative params and classified. Adding a
 * template forces a decision here, and getting it wrong fails loudly with the
 * template's own name.
 */
describe('credential census over every MailTemplate', () => {
  /** Templates whose params carry a URL that is, by itself, a working credential. */
  const CREDENTIAL_BEARING = new Set<MailTemplate>([
    MailTemplate.ORG_ADMIN_INVITE,
    MailTemplate.PROFESSOR_INVITE,
    MailTemplate.STUDENT_INVITE,
    MailTemplate.INVITE_REMINDER,
    MailTemplate.PASSWORD_RESET,
    MailTemplate.VERIFY_EMAIL,
    // The approved open-professor mail IS an invite — it carries `acceptUrl` and goes
    // out through the invite machinery with only its copy overridden. Exactly the case
    // this census exists to catch: it looks like an "application" mail and is in fact a
    // live credential.
    MailTemplate.PROFESSOR_APPLICATION_APPROVED,
  ]);

  const inviteParams = {
    orgName: 'Acme U',
    firstName: 'A',
    lastName: 'B',
    inviterName: null,
    acceptUrl: 'http://localhost:5173/invite/CENSUS_TOKEN',
    expiresInDays: 14,
  };

  /**
   * One representative payload per template. A `Record` over the enum rather than a
   * builder with a default, so a new enum member is a COMPILE error here — the point
   * is that it cannot be skipped.
   */
  const SAMPLES: Record<MailTemplate, unknown> = {
    [MailTemplate.ORG_ADMIN_INVITE]: inviteParams,
    [MailTemplate.PROFESSOR_INVITE]: inviteParams,
    [MailTemplate.STUDENT_INVITE]: inviteParams,
    [MailTemplate.INVITE_REMINDER]: inviteParams,
    [MailTemplate.WELCOME]: {
      firstName: 'A',
      lastName: 'B',
      orgName: 'Acme U',
      loginUrl: '/login',
    },
    [MailTemplate.ACCESS_REVOKED]: { firstName: 'A', lastName: 'B' },
    [MailTemplate.ACCESS_RESTORED]: { firstName: 'A', lastName: 'B' },
    [MailTemplate.ORG_ASSIGNED]: {
      firstName: 'A',
      lastName: 'B',
      orgName: 'Acme U',
      loginUrl: '/login',
    },
    [MailTemplate.PASSWORD_RESET]: {
      firstName: 'A',
      lastName: 'B',
      resetUrl: 'http://localhost:5173/reset-password/CENSUS_TOKEN',
      expiresInMinutes: 60,
    },
    [MailTemplate.VERIFY_EMAIL]: {
      firstName: 'A',
      lastName: 'B',
      verifyUrl: 'http://localhost:5173/verify-email/CENSUS_TOKEN',
      expiresInHours: 24,
    },
    [MailTemplate.WELCOME_OPEN]: { firstName: 'A', lastName: 'B', loginUrl: '/login' },
    // Page links, never a token — anyone who can type an address can trigger this
    // mail, so it must not be a way to send a live credential to another inbox.
    [MailTemplate.ACCOUNT_EXISTS]: {
      firstName: 'A',
      lastName: 'B',
      loginUrl: '/login',
      forgotPasswordUrl: '/forgot-password',
    },
    // The organization-application mails carry no credential at all — the one mail in
    // that flow that does is the ordinary `org-admin-invite`, minted by the existing
    // invite machinery and already covered above.
    [MailTemplate.ORG_APPLICATION_RECEIVED]: {
      firstName: 'A',
      lastName: 'B',
      organizationName: 'Acme U',
    },
    [MailTemplate.ORG_APPLICATION_ALERT]: {
      organizationName: 'Acme U',
      contactName: 'A B',
      contactEmail: 'a@b.dev',
      website: null,
      message: null,
      reviewUrl: '/home/platform/organization-applications',
    },
    [MailTemplate.ORG_APPLICATION_APPROVED]: {
      firstName: 'A',
      lastName: 'B',
      organizationName: 'Acme U',
      adminEmail: 'admin@acme.edu',
    },
    [MailTemplate.ORG_APPLICATION_REJECTED]: {
      firstName: 'A',
      lastName: 'B',
      organizationName: 'Acme U',
      reason: null,
    },
    [MailTemplate.PROFESSOR_APPLICATION_RECEIVED]: { firstName: 'A', lastName: 'B' },
    [MailTemplate.PROFESSOR_APPLICATION_ALERT]: {
      applicantName: 'A B',
      applicantEmail: 'a@b.dev',
      institution: null,
      message: null,
      reviewUrl: '/home/platform/professor-applications',
    },
    // InviteParams — credential-bearing.
    [MailTemplate.PROFESSOR_APPLICATION_APPROVED]: inviteParams,
    [MailTemplate.PROFESSOR_APPLICATION_REJECTED]: {
      firstName: 'A',
      lastName: 'B',
      reason: null,
    },
  };

  it.each(Object.values(MailTemplate))('%s is classified correctly', (template) => {
    const message = { to: 'a@b.dev', template, params: SAMPLES[template] } as never;
    expect(hasCredential(message)).toBe(CREDENTIAL_BEARING.has(template));
  });

  // Classification is only half of it: a template listed as credential-bearing must
  // actually come out clean, or the census would pass while the scrub missed a field.
  it.each([...CREDENTIAL_BEARING])('%s has no raw token left after redaction', (template) => {
    const message = { to: 'a@b.dev', template, params: SAMPLES[template] } as never;
    expect(JSON.stringify(redactMailPayload(message))).not.toContain('CENSUS_TOKEN');
  });
});
