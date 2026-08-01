import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailConfig } from '../../config/configuration';

/**
 * DI token for the delivery provider.
 *
 * Declared HERE rather than in `mail.module.ts` on purpose: the module imports
 * `MailService`, so a token exported from the module and imported by the service
 * would be a circular import — and the failure mode is not a build error but an
 * `undefined` token at decoration time, which surfaces as an unresolvable
 * dependency at boot.
 */
export const MAIL_TRANSPORT = 'MAIL_TRANSPORT';

/** One rendered message, ready to hand to a provider. */
export interface OutboundMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Per-send hints a provider may use. Optional so SMTP can ignore them. */
export interface SendMeta {
  /**
   * Stable per-job key. BullMQ replays `job.data` on every retry, so a send that
   * the provider ACCEPTED but whose response we never saw would otherwise become a
   * duplicate mail on the next attempt.
   */
  idempotencyKey?: string;
}

/**
 * The provider seam (#118).
 *
 * `send` throws on failure and returns on success — `MailService.deliver`'s
 * contract, unchanged, because BullMQ decides to retry from the thrown error.
 * A transport therefore never retries internally: two backoff schedules would
 * fight, and the queue's is the one with the attempt budget.
 */
export interface MailTransport {
  send(mail: OutboundMail, meta?: SendMeta): Promise<void>;
  close(): void | Promise<void>;
}

/**
 * A delivery failure that knows whether trying again could ever help.
 *
 * `terminal` is the whole point. Before this existed every failure looked alike
 * and burned all five attempts over ~8 minutes — wasteful for an unverified
 * sending domain (which no amount of retrying fixes) and indistinguishable from
 * the transient relay blip that retries exist for.
 *
 * `status` is carried for the log line only. It is deliberately NOT used to
 * re-derive `terminal` at the call site: the classification lives in exactly one
 * place, next to the provider that produced it.
 */
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly terminal: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

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

/**
 * The default provider — the pooled nodemailer path, behaviour-identical to what
 * `MailService.deliver` did inline before the seam existed.
 *
 * It deliberately does NOT classify errors. Every SMTP failure stays retryable,
 * which is the pre-#118 behaviour and the right default for a relay: a 5xx SMTP
 * reply is usually transient, and the permanent ones (a 550 bad mailbox) are not
 * reliably distinguishable across relays. Resend's HTTP API is what gives a
 * trustworthy terminal signal, so only that transport claims one.
 *
 * The transporter is built on first send rather than in the constructor: the DI
 * factory constructs the transport at module init, and a pool built there would
 * hold configuration for a process (the API) that may never send anything.
 * nodemailer opens no socket until the first send either way — this just keeps the
 * object graph honest about when the resource is really needed.
 */
export class SmtpMailTransport implements MailTransport {
  private transporter?: Transporter;

  constructor(private readonly cfg: EmailConfig) {}

  async send(mail: OutboundMail): Promise<void> {
    this.transporter ??= createMailTransport(this.cfg);
    await this.transporter.sendMail(mail);
  }

  close(): void {
    // The pool holds open TCP connections; without this a worker shutdown waits
    // on them and the process lingers past its termination grace period.
    this.transporter?.close();
    this.transporter = undefined;
  }
}

/**
 * Stands in when `EMAIL_ENABLED=false`.
 *
 * `deliver()` returns before ever reaching the transport in that case, so `send`
 * here is unreachable in practice. It exists so the DI token never resolves to
 * `null` — a null transport would push an `if (!this.transport)` check into the
 * one method whose contract is "throw on failure", where a silent return is
 * exactly the wrong branch to add.
 *
 * The throw is the honest response to being called: reaching it means the
 * `enabled` short-circuit was bypassed, which is a bug worth surfacing rather
 * than a mail worth silently dropping.
 *
 * `terminal: false` is deliberate, and it is the opposite of what "this will never
 * succeed" would suggest. A TERMINAL error makes `MailProcessor` scrub the payload
 * and complete the job — so if a bug ever did reach here, the mail would be
 * destroyed: token gone from Redis, nothing left to retry or diagnose. Retryable
 * instead means it exhausts its attempts and lands in the failed set with the
 * payload intact (redacted, per the failed-job hook) and five error lines pointing
 * at the bug. For an unreachable branch, the recoverable failure mode is worth more
 * than the technically-accurate flag.
 */
export class DisabledMailTransport implements MailTransport {
  send(): Promise<void> {
    return Promise.reject(new MailDeliveryError('Mailer is disabled (EMAIL_ENABLED=false)', false));
  }

  close(): void {
    /* nothing to close — no provider was ever constructed */
  }
}
