import * as nodemailer from 'nodemailer';
import { EmailConfig } from '../../config/configuration';
import { createMailTransport } from './mail.transport';

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
