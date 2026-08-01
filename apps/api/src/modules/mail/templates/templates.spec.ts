import { MailTemplate, RenderedMail } from '../mail.types';
import { displayName, escapeHtml, oneLine, setMailWebOrigin } from './layout';
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
  [MailTemplate.VERIFY_EMAIL]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    verifyUrl: 'https://app.codestack.dev/verify-email/xyz',
    expiresInHours: 24,
  },
  [MailTemplate.WELCOME_OPEN]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    loginUrl: 'https://app.codestack.dev/login',
  },
  [MailTemplate.ACCOUNT_EXISTS]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    loginUrl: 'https://app.codestack.dev/login',
    forgotPasswordUrl: 'https://app.codestack.dev/forgot-password',
  },
  [MailTemplate.ORG_APPLICATION_RECEIVED]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Acme University',
  },
  [MailTemplate.ORG_APPLICATION_ALERT]: {
    organizationName: 'Acme University',
    contactName: 'Ada Lovelace',
    contactEmail: 'ada@acme.edu',
    website: 'https://acme.edu',
    message: 'We teach 400 CS students.',
    reviewUrl: 'https://app.codestack.dev/home/platform/organization-applications',
  },
  [MailTemplate.ORG_APPLICATION_APPROVED]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Acme University',
    adminEmail: 'admin@acme.edu',
  },
  [MailTemplate.ORG_APPLICATION_REJECTED]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Acme University',
    reason: 'We could not verify the institution.',
  },
  [MailTemplate.PROFESSOR_APPLICATION_RECEIVED]: { firstName: 'Ada', lastName: 'Lovelace' },
  [MailTemplate.PROFESSOR_APPLICATION_ALERT]: {
    applicantName: 'Ada Lovelace',
    applicantEmail: 'ada@lovelace.dev',
    institution: 'Independent',
    message: 'I teach algorithms.',
    reviewUrl: 'https://app.codestack.dev/home/platform/professor-applications',
  },
  // InviteParams: this mail IS the invite, with only its copy overridden.
  [MailTemplate.PROFESSOR_APPLICATION_APPROVED]: INVITE_PARAMS,
  [MailTemplate.PROFESSOR_APPLICATION_REJECTED]: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    reason: 'Not at this time.',
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

/**
 * Co-branding (#118).
 *
 * The property that matters most is the NEGATIVE one: an organization with no branding
 * must get exactly the mail it got before. Co-branding is opt-in, and a change that
 * quietly restyled every existing tenant's invites would be a change nobody asked for.
 */
describe('co-branded invite mail', () => {
  const withBranding = (branding: unknown) =>
    renderMail({
      to: 'ada@example.com',
      template: MailTemplate.STUDENT_INVITE,
      params: { ...INVITE_PARAMS, branding },
    } as never);

  it('renders byte-for-byte the same as before when the org has no branding', () => {
    const plain = render(MailTemplate.STUDENT_INVITE);
    expect(withBranding(undefined).html).toBe(plain.html);
    expect(withBranding(null).html).toBe(plain.html);
  });

  /*
   * The shell every template shares. These assert the PROPERTIES that make a mail
   * usable in a real client, not the markup — the markup is expected to change.
   */
  describe('shell', () => {
    it('draws the brand mark instead of fetching it', () => {
      const out = render(MailTemplate.STUDENT_INVITE);
      // A remote <img> logo is blocked by default in most clients, so the mark is a
      // styled table cell. With no partner branding there must be no image at all.
      expect(out.html).not.toContain('<img');
      expect(out.html).toContain('&lt;/&gt;');
      expect(out.html).toContain('Stack');
    });

    it('carries a hidden preheader so the inbox preview is not just the brand name', () => {
      const out = render(MailTemplate.STUDENT_INVITE);
      expect(out.html).toContain('mso-hide:all');
    });

    it('links the footer at the CONFIGURED web origin, not a hardcoded one', () => {
      setMailWebOrigin('https://codestack.example.com/');
      const deployed = render(MailTemplate.STUDENT_INVITE);
      expect(deployed.html).toContain('href="https://codestack.example.com"');
      // The trailing slash is normalised away, so the footer never emits a `//` URL.
      expect(deployed.html).not.toContain('https://codestack.example.com//');

      setMailWebOrigin('http://localhost:5173');
      expect(render(MailTemplate.STUDENT_INVITE).html).toContain('href="http://localhost:5173"');
    });

    it('repeats a call-to-action URL as copyable text', () => {
      // Corporate gateways rewrite link hrefs; without the visible copy a recipient
      // whose button was mangled has no way to reach the app at all.
      const out = render(MailTemplate.STUDENT_INVITE);
      const url = INVITE_PARAMS.acceptUrl;
      expect(out.html.split(url).length - 1).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders the CodeStack × organization lockup when branding is present', () => {
    const out = withBranding({ logoUrl: 'https://acme.edu/logo.png' });
    expect(out.html).toContain('&times;');
    expect(out.html).toContain('Acme University');
    expect(out.html).toContain('https://acme.edu/logo.png');
  });

  // Mail clients block remote images by default, so a logo-only header would be a
  // broken icon and nothing else for most recipients. The name always renders.
  it('still names the organization when there is no logo URL', () => {
    const out = withBranding({});
    expect(out.html).toContain('&times;');
    expect(out.html).toContain('Acme University');
    expect(out.html).not.toContain('<img');
  });

  // The org name reaches an HTML attribute-adjacent context and a subject line, and it
  // is admin-controlled varchar(200).
  it('escapes an organization name in the lockup', () => {
    const out = renderMail({
      to: 'ada@example.com',
      template: MailTemplate.STUDENT_INVITE,
      params: {
        ...INVITE_PARAMS,
        orgName: '<script>alert(1)</script>',
        branding: { logoUrl: 'https://acme.edu/l.png' },
      },
    } as never);
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes a logo URL before it reaches the src attribute', () => {
    const out = withBranding({ logoUrl: 'https://acme.edu/l.png?a=1&b="x"' });
    expect(out.html).toContain('&amp;');
    expect(out.html).not.toContain('b="x"');
  });
});
