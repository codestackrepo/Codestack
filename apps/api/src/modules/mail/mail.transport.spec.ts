import * as nodemailer from 'nodemailer';
import { EmailConfig } from '../../config/configuration';
import {
  createMailTransport,
  DisabledMailTransport,
  MailDeliveryError,
  SmtpMailTransport,
} from './mail.transport';

jest.mock('nodemailer', () => ({ createTransport: jest.fn().mockReturnValue({}) }));

const createTransport = nodemailer.createTransport as unknown as jest.Mock;

const cfg = (over: Partial<EmailConfig> = {}): EmailConfig =>
  ({
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    user: '',
    password: '',
    useTls: true,
    from: 'no-reply@codestack.dev',
    notificationEmails: [],
    workerConcurrency: 4,
    rateMax: 20,
    rateDurationMs: 1000,
    ...over,
  }) as EmailConfig;

describe('createMailTransport', () => {
  beforeEach(() => createTransport.mockClear());

  const optionsFor = (c: EmailConfig): Record<string, unknown> => {
    createMailTransport(c);
    return createTransport.mock.calls[0][0] as Record<string, unknown>;
  };

  // The regression this whole file exists for. Port 587 opens in PLAINTEXT and
  // upgrades via STARTTLS; without requireTLS, nodemailer silently continues
  // unencrypted when the server doesn't advertise it (or a MITM strips it), and
  // credentials plus a live invite token cross the wire in the clear.
  it('forces STARTTLS on 587 — requireTLS true, secure false', () => {
    const o = optionsFor(cfg({ port: 587, useTls: true }));
    expect(o.secure).toBe(false);
    expect(o.requireTLS).toBe(true);
  });

  // secure:true on 587 would HANG — the server expects plaintext first — so the
  // flag must key off the port, never off useTls alone.
  it('uses implicit TLS on 465 — secure true, and requireTLS is not set on top', () => {
    const o = optionsFor(cfg({ port: 465, useTls: true }));
    expect(o.secure).toBe(true);
    expect(o.requireTLS).toBe(false);
  });

  it('leaves 465 secure even when useTls is somehow false', () => {
    // useTls only governs the STARTTLS upgrade; 465 is encrypted from byte 0
    // regardless, and honouring the flag here would produce a broken connection.
    const o = optionsFor(cfg({ port: 465, useTls: false }));
    expect(o.secure).toBe(true);
  });

  it('does not force TLS on a plain port when useTls is off (local mailpit)', () => {
    const o = optionsFor(cfg({ port: 1025, useTls: false }));
    expect(o.secure).toBe(false);
    expect(o.requireTLS).toBe(false);
  });

  // An empty-string user still makes nodemailer attempt an AUTH command, which
  // anonymous-submission relays (and mailpit) reject outright.
  it('omits auth entirely when no user is configured', () => {
    expect(optionsFor(cfg({ user: '' })).auth).toBeUndefined();
  });

  it('passes auth through when a user is configured', () => {
    const o = optionsFor(cfg({ user: 'bot', password: 'pw' }));
    expect(o.auth).toEqual({ user: 'bot', pass: 'pw' });
  });

  it('pins a modern TLS floor and pools connections', () => {
    const o = optionsFor(cfg());
    expect(o.tls).toEqual({ minVersion: 'TLSv1.2' });
    expect(o.pool).toBe(true);
  });
});

const OUTBOUND = {
  from: 'no-reply@codestack.dev',
  to: 'ada@example.com',
  subject: 'Subject',
  html: '<p>Body</p>',
  text: 'Body',
};

describe('SmtpMailTransport', () => {
  beforeEach(() => createTransport.mockClear());

  it('hands the rendered mail straight to nodemailer', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail, close: jest.fn() });

    await new SmtpMailTransport(cfg()).send(OUTBOUND);

    expect(sendMail).toHaveBeenCalledWith(OUTBOUND);
  });

  // The pool is the dominant cost saving for a bulk roster burst: one TCP+TLS
  // handshake instead of one per message.
  it('builds the pool once and reuses it across sends', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({ sendMail, close: jest.fn() });
    const t = new SmtpMailTransport(cfg());

    await t.send(OUTBOUND);
    await t.send(OUTBOUND);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  // The DI factory constructs this at module init, including in the API process
  // which may never send anything. Nothing should be built until it is needed.
  it('builds nothing at construction time', () => {
    new SmtpMailTransport(cfg());
    expect(createTransport).not.toHaveBeenCalled();
  });

  // Otherwise a worker shutdown waits on open sockets and outlives its grace period.
  it('closes the pool, and closing before any send is harmless', () => {
    const close = jest.fn();
    createTransport.mockReturnValue({ sendMail: jest.fn(), close });

    const never = new SmtpMailTransport(cfg());
    expect(() => never.close()).not.toThrow();
    expect(close).not.toHaveBeenCalled();
  });

  // Deliberately NOT classified: pre-#118 behaviour is that every SMTP failure is
  // retryable, and a relay's permanent-vs-transient replies are not reliably
  // distinguishable. Only Resend's HTTP API earns a terminal signal.
  it('leaves SMTP errors unclassified so they stay retryable', async () => {
    const boom = new Error('550 mailbox unavailable');
    createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(boom),
      close: jest.fn(),
    });

    const thrown = await new SmtpMailTransport(cfg()).send(OUTBOUND).catch((e: unknown) => e);

    expect(thrown).toBe(boom);
    expect(thrown).not.toBeInstanceOf(MailDeliveryError);
  });
});

describe('DisabledMailTransport', () => {
  // Unreachable in practice — `deliver()` returns before touching the transport when
  // the mailer is off. It exists so DI never resolves the token to null, and it
  // throws rather than silently resolving: getting here means the `enabled`
  // short-circuit was bypassed, which is a bug, not a mail to quietly drop.
  it('rejects rather than silently swallowing a send', async () => {
    await expect(new DisabledMailTransport().send()).rejects.toThrow(/disabled/i);
  });

  // Counter-intuitive on purpose. A terminal error makes the processor scrub the
  // payload and COMPLETE the job — reaching this branch would then destroy the mail
  // outright, with no token left in Redis to recover or diagnose from. Retryable
  // instead parks it in the failed set with five error lines pointing at the bug.
  it('is retryable, so a bug that reaches it cannot silently destroy the mail', async () => {
    const err = (await new DisabledMailTransport()
      .send()
      .catch((e: unknown) => e)) as MailDeliveryError;
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect(err.terminal).toBe(false);
  });

  it('closes without error, having opened nothing', () => {
    expect(() => new DisabledMailTransport().close()).not.toThrow();
  });
});
