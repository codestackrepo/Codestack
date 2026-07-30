import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailConfig } from '../../config/configuration';

/**
 * Builds the pooled SMTP transport.
 *
 * The one line that matters is `secure`/`requireTLS`, and it derives from the
 * PORT, never from `EMAIL_USE_TLS` alone:
 *
 *  - 465 is implicit TLS — encrypted from the first byte, so `secure: true`.
 *  - 587 is STARTTLS — the connection OPENS IN PLAINTEXT and upgrades. Without
 *    `requireTLS`, nodemailer will happily continue unencrypted when the server
 *    does not advertise STARTTLS (or when a MITM strips it), and it does so
 *    SILENTLY. Credentials and a live invite token then cross the wire in the
 *    clear. Setting `secure: true` on 587 is not the fix either — that hangs,
 *    because the server expects plaintext first.
 *
 * `auth` is undefined rather than `{user: '', pass: ''}` when no user is set:
 * an empty-string user still makes nodemailer attempt an AUTH command, which
 * relays that accept anonymous submission will reject outright.
 */
export function createMailTransport(cfg: EmailConfig): Transporter {
  const implicitTls = cfg.port === 465;

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: implicitTls,
    // Only meaningful on a non-465 port; forces the STARTTLS upgrade and fails
    // the send instead of downgrading to plaintext.
    requireTLS: !implicitTls && cfg.useTls,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    tls: { minVersion: 'TLSv1.2' },
    // Pooled: invites arrive in bursts (a bulk roster commit is one burst), and
    // a fresh TCP+TLS handshake per message is the dominant cost.
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
