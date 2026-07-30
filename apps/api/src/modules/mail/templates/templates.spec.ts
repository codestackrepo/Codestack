import { MailTemplate, RenderedMail } from '../mail.types';
import { displayName, escapeHtml, oneLine } from './layout';
import { renderMail, TEMPLATES } from './index';

const INVITE_PARAMS = {
  orgName: 'Acme University',
  firstName: 'Ada',
  lastName: 'Lovelace',
  inviterName: 'Grace Hopper',
  acceptUrl: 'https://app.codestack.dev/invite/abc123',
  expiresInDays: 7,
};

/** Minimal valid params per template, for the registry-wide sweeps below. */
const PARAMS: Record<MailTemplate, unknown> = {
  [MailTemplate.ORG_ADMIN_INVITE]: INVITE_PARAMS,
  [MailTemplate.PROFESSOR_INVITE]: INVITE_PARAMS,
  [MailTemplate.STUDENT_INVITE]: INVITE_PARAMS,
  [MailTemplate.INVITE_REMINDER]: INVITE_PARAMS,
  [MailTemplate.WELCOME]: {
    orgName: 'Acme University',
    firstName: 'Ada',
    lastName: 'Lovelace',
    loginUrl: 'https://app.codestack.dev/login',
  },
  [MailTemplate.ACCESS_REVOKED]: { firstName: 'Ada', lastName: 'Lovelace' },
  [MailTemplate.ACCESS_RESTORED]: { firstName: 'Ada', lastName: 'Lovelace' },
  [MailTemplate.ORG_ASSIGNED]: {
    orgName: 'Acme University',
    firstName: 'Ada',
    lastName: 'Lovelace',
    loginUrl: 'https://app.codestack.dev/login',
  },
  [MailTemplate.PASSWORD_RESET]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    resetUrl: 'https://app.codestack.dev/reset/xyz',
    expiresInMinutes: 30,
  },
};

const render = (t: MailTemplate): RenderedMail =>
  renderMail({ to: 'ada@example.com', template: t, params: PARAMS[t] } as never);

describe('layout primitives', () => {
  describe('escapeHtml', () => {
    it('neutralises every HTML-significant character', () => {
      expect(escapeHtml(`<script>alert("x")&'`)).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;',
      );
    });

    it('renders null/undefined as empty, not as the string "null"', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('oneLine', () => {
    // The point of this function: orgName is admin-controlled varchar(200) and
    // reaches SUBJECT lines, which are SMTP headers. A bare CR/LF terminates the
    // header and lets the rest be parsed as new headers — an injected Bcc.
    it('strips CR and LF so a subject cannot carry an injected header', () => {
      expect(oneLine('Acme\r\nBcc: attacker@evil.dev')).toBe('Acme Bcc: attacker@evil.dev');
      expect(oneLine('Acme\nX-Injected: 1')).not.toContain('\n');
    });

    it('strips the unicode line separators some clients fold on', () => {
      expect(oneLine('Acme University Ltd')).toBe('Acme University Ltd');
    });

    it('collapses runs of whitespace and trims', () => {
      expect(oneLine('  Acme    University  ')).toBe('Acme University');
    });
  });

  describe('displayName', () => {
    it('falls back to a neutral greeting when both parts are missing', () => {
      expect(displayName(null, null)).toBe('there');
      expect(displayName('', '   ')).toBe('there');
    });

    it('joins what it has', () => {
      expect(displayName('Ada', null)).toBe('Ada');
      expect(displayName('Ada', 'Lovelace')).toBe('Ada Lovelace');
    });
  });
});

describe('mail templates', () => {
  const ALL = Object.values(MailTemplate);

  it('the registry covers every template key', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)('%s renders a non-empty subject, html and text', (t) => {
    const out = render(t);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain('<html');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it.each(ALL)('%s produces a single-line subject (SMTP header safety)', (t) => {
    expect(render(t).subject).not.toMatch(/[\r\n]/);
  });

  describe('untrusted interpolation', () => {
    const HOSTILE = {
      ...INVITE_PARAMS,
      orgName: '<img src=x onerror=alert(1)>\r\nBcc: attacker@evil.dev',
      firstName: '<script>steal()</script>',
      inviterName: '"><b>oops</b>',
    };

    it('escapes org, name and inviter in the HTML body', () => {
      const out = renderMail({
        to: 'ada@example.com',
        template: MailTemplate.ORG_ADMIN_INVITE,
        params: HOSTILE,
      } as never);
      expect(out.html).not.toContain('<img src=x');
      expect(out.html).not.toContain('<script>steal()');
      expect(out.html).toContain('&lt;img src=x');
      expect(out.html).toContain('&lt;script&gt;steal()');
    });

    it('keeps the injected header out of the subject line', () => {
      const out = renderMail({
        to: 'ada@example.com',
        template: MailTemplate.ORG_ADMIN_INVITE,
        params: HOSTILE,
      } as never);
      expect(out.subject).not.toMatch(/[\r\n]/);
      expect(out.subject).toContain('Bcc: attacker@evil.dev'); // present, but inert on one line
    });
  });

  describe('invite mails', () => {
    it.each([
      MailTemplate.ORG_ADMIN_INVITE,
      MailTemplate.PROFESSOR_INVITE,
      MailTemplate.STUDENT_INVITE,
      MailTemplate.INVITE_REMINDER,
    ])('%s carries the accept URL in BOTH html and text', (t) => {
      // The text part is not decoration — plain-text-only clients, and users who
      // copy the link out, both depend on it.
      const out = render(t);
      expect(out.html).toContain(INVITE_PARAMS.acceptUrl);
      expect(out.text).toContain(INVITE_PARAMS.acceptUrl);
    });

    it('pluralises the expiry line correctly', () => {
      const one = renderMail({
        to: 'a@b.dev',
        template: MailTemplate.STUDENT_INVITE,
        params: { ...INVITE_PARAMS, expiresInDays: 1 },
      } as never);
      expect(one.text).toContain('expires in 1 day.');
      expect(render(MailTemplate.STUDENT_INVITE).text).toContain('expires in 7 days.');
    });

    it('omits the inviter clause entirely when there is no inviter name', () => {
      const out = renderMail({
        to: 'a@b.dev',
        template: MailTemplate.STUDENT_INVITE,
        params: { ...INVITE_PARAMS, inviterName: null },
      } as never);
      expect(out.text).not.toContain(' by ');
      expect(out.text).toContain('been invited to join');
    });
  });

  // Locked by the issue: a revoked user must not be handed a person to escalate
  // at, and neither mail should disclose the organization.
  describe('access-change mails name neither the actor nor the org', () => {
    it.each([MailTemplate.ACCESS_REVOKED, MailTemplate.ACCESS_RESTORED])('%s', (t) => {
      const out = renderMail({
        to: 'ada@example.com',
        template: t,
        params: { firstName: 'Ada', lastName: 'Lovelace' },
      } as never);
      for (const body of [out.subject, out.html, out.text]) {
        expect(body).not.toContain('Acme');
        expect(body).not.toContain('Grace');
      }
    });

    // Revocation binds on the account's NEXT request (the auth guard re-reads
    // the row), so promising an immediate sign-out would be false on a page the
    // user still has open.
    it('revoke copy does not promise an immediate sign-out', () => {
      const out = render(MailTemplate.ACCESS_REVOKED);
      expect(out.text.toLowerCase()).not.toContain('signed out');
      expect(out.text).toContain('next action');
    });
  });

  it('password reset states a minutes-scale, single-use expiry', () => {
    const out = render(MailTemplate.PASSWORD_RESET);
    expect(out.text).toContain('expires in 30 minutes and can be used once');
    expect(out.html).toContain('https://app.codestack.dev/reset/xyz');
  });

  it('renderMail rejects an unknown template rather than returning undefined', () => {
    expect(() =>
      renderMail({ to: 'a@b.dev', template: 'nope' as MailTemplate, params: {} } as never),
    ).toThrow(/Unknown mail template/);
  });
});
