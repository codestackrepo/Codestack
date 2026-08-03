import { Logger } from '@nestjs/common';
import { request } from 'undici';
import type { Dispatcher } from 'undici';
import { EmailConfig } from '../../config/configuration';
import { MailDeliveryError, MailTransport, OutboundMail, SendMeta } from './mail.transport';

/**
 * Brevo delivery over its transactional HTTP API (Railway free-tier SMTP egress
 * is blocked, which is what forced this off the SMTP relay in the first place —
 * see the `smtp` provider's Brevo section for that path, kept as the documented
 * fallback for any host that does not block outbound 587/465).
 *
 * Modelled directly on `ResendMailTransport`: same containment discipline for the
 * key, same terminal/retryable split, same "build every log line from the response
 * alone" rule. The two are intentionally similar rather than sharing code, because
 * each provider's error shape and retry semantics are its own and a shared base
 * class would blur which provider a given branch belongs to.
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * `429` is Brevo's rate limiter. `402` is Brevo-specific — the account is out of
 * send credits — and is deliberately NOT here: no amount of waiting fixes it, so
 * it is terminal like every other 4xx that retrying cannot resolve.
 */
const RETRYABLE_STATUSES = new Set([429]);

export class BrevoApiMailTransport implements MailTransport {
  private readonly logger = new Logger(BrevoApiMailTransport.name);
  private readonly apiKey: string;

  constructor(cfg: EmailConfig) {
    // Fail at boot, not at the first invite. Joi already requires the key when
    // EMAIL_ENABLED=true and EMAIL_PROVIDER=brevo, so reaching this means the
    // validation and this constructor disagree — worth a loud stop either way.
    if (!cfg.brevoApiKey) {
      throw new Error('EMAIL_PROVIDER=brevo requires BREVO_API_KEY to be set');
    }
    this.apiKey = cfg.brevoApiKey;
  }

  async send(mail: OutboundMail, meta?: SendMeta): Promise<void> {
    const headers: Record<string, string> = {
      'api-key': this.apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    };
    // Brevo honours this the same way Resend does — an accepted-but-response-lost
    // send is collapsed by the provider instead of arriving twice on BullMQ retry.
    if (meta?.idempotencyKey) headers['idempotency-key'] = meta.idempotencyKey;

    let response: Dispatcher.ResponseData;
    try {
      response = await request(BREVO_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sender: parseAddress(mail.from),
          to: [parseAddress(mail.to)],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
        }),
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });
    } catch (err) {
      // DNS failure, connection reset, timeout — transient by nature, so retryable.
      // Built from the error alone: `headers` above holds the API key, and
      // interpolating the request into a message is how a key reaches a log.
      throw new MailDeliveryError(`Brevo request failed: ${describeError(err)}`, false);
    }

    const { statusCode, body } = response;
    const payload = await readBody(body);

    if (statusCode >= 200 && statusCode < 300) {
      this.logAccepted(payload);
      return;
    }

    const retryable = RETRYABLE_STATUSES.has(statusCode) || statusCode >= 500;
    throw new MailDeliveryError(
      `Brevo rejected the send (HTTP ${statusCode})${describeRejection(payload)}`,
      !retryable,
      statusCode,
    );
  }

  close(): void {
    /* stateless — undici's global pool is shared and outlives this object */
  }

  /**
   * Logs the provider's message id, and nothing about the message itself.
   *
   * Subject and recipient are already logged by `MailProcessor`; repeating the
   * body here would put rendered mail — and therefore accept URLs — in the log.
   */
  private logAccepted(payload: unknown): void {
    const id =
      typeof payload === 'object' && payload !== null
        ? (payload as { messageId?: unknown }).messageId
        : undefined;
    this.logger.log(
      `Brevo accepted ${typeof id === 'string' ? redactKeyLike(id) : '(no id returned)'}`,
    );
  }
}

async function readBody(body: Dispatcher.ResponseData['body']): Promise<unknown> {
  try {
    const text = await body.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A proxy or WAF between us and Brevo can answer HTML. Keep it as text so
      // the failure is still describable, truncated so a whole error page cannot
      // land in the log.
      return text.slice(0, 300);
    }
  } catch {
    return undefined;
  }
}

/** Brevo's error shape is `{code, message}`. Only those two fields are surfaced. */
function describeRejection(payload: unknown): string {
  if (typeof payload === 'string') return `: ${redactKeyLike(payload)}`;
  if (typeof payload === 'object' && payload !== null) {
    const { code, message } = payload as { code?: unknown; message?: unknown };
    const parts = [code, message].filter((p): p is string => typeof p === 'string');
    if (parts.length) return `: ${redactKeyLike(parts.join(' — '))}`;
  }
  return '';
}

/** Never includes a stack: these messages are logged, and a stack adds no signal here. */
function describeError(err: unknown): string {
  return redactKeyLike(err instanceof Error ? err.message : String(err));
}

/**
 * Removes anything shaped like a Brevo API key from provider-supplied text — the
 * same discipline `resend-mail.transport.ts` applies to `re_…` keys, for the same
 * reason: an auth failure quoting the rejected key is the obvious leak path, and a
 * WAF echoing request headers is the one nobody predicts.
 *
 * The replacement contains no `xkeysib` substring, so a log grep for that prefix
 * cannot match our own redaction marker.
 */
export function redactKeyLike(text: string): string {
  return text.replace(/xkeysib-[A-Za-z0-9-]{8,}/g, '[redacted]');
}

/**
 * Brevo's `sender`/`to` fields are `{email, name?}` objects, but `OutboundMail`
 * carries plain `"Name <addr@x>"` strings (the shape nodemailer and Resend both
 * accept directly) — so this is the one place that shape gets split apart.
 */
function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const [, name, email] = match;
  return name.trim() ? { email: email.trim(), name: name.trim() } : { email: email.trim() };
}
