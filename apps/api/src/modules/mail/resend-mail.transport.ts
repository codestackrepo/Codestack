import { Logger } from '@nestjs/common';
import { request } from 'undici';
import type { Dispatcher } from 'undici';
import { EmailConfig } from '../../config/configuration';
import { MailDeliveryError, MailTransport, OutboundMail, SendMeta } from './mail.transport';

/**
 * Resend delivery over the HTTP API (#118).
 *
 * NAMING — this file is about **Resend the email provider** (resend.com). It has
 * nothing to do with re-sending an invite (`POST /invites/:id/resend`,
 * `resendPending`, `InviteResendCooldownException`), which is an unrelated domain
 * surface. The `Resend`/`RESEND_*` prefix on provider code exists so the two stay
 * distinguishable at a glance, and so a grep for "resend" cannot silently conflate
 * them.
 *
 * The HTTP API is used rather than Resend's SMTP relay, which would have been a
 * zero-code change (`EMAIL_HOST=smtp.resend.com`, `EMAIL_USER=resend`,
 * `EMAIL_PASSWORD=<key>`) and remains the documented fallback. The API earns the
 * extra code because it returns a message id to correlate against delivery, it
 * distinguishes permanent failures from transient ones, and it survives hosts
 * that block outbound 587/465.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Statuses worth trying again, and nothing else is.
 *
 * `429` is the rate limiter — the backoff exists precisely for this. `408` is a
 * server-side request timeout, which is the same transient shape. Everything at
 * `5xx` is Resend having a bad moment.
 *
 * Every OTHER 4xx is terminal, which is the deliberate extension of #118's locked
 * list (`422` invalid recipient, `403` unverified sending domain). A `400`
 * malformed payload and a `401` bad key cannot be fixed by waiting either, and
 * burning five attempts over eight minutes on them delays the error reaching a
 * human without ever changing the outcome.
 */
const RETRYABLE_STATUSES = new Set([408, 429]);

export class ResendMailTransport implements MailTransport {
  private readonly logger = new Logger(ResendMailTransport.name);
  private readonly apiKey: string;
  /** The account's real send limit is only knowable from a live send — logged once. */
  private rateLimitLogged = false;

  constructor(cfg: EmailConfig) {
    // Fail at boot, not at the first invite. Joi already requires the key when
    // EMAIL_ENABLED=true and EMAIL_PROVIDER=resend, so reaching this means the
    // validation and this constructor disagree — worth a loud stop either way.
    if (!cfg.resendApiKey) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set');
    }
    this.apiKey = cfg.resendApiKey;
  }

  async send(mail: OutboundMail, meta?: SendMeta): Promise<void> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };
    // Resend honours this for 24h, which comfortably covers MAIL_JOB_OPTIONS'
    // ~9-minute retry window, so an accepted-but-response-lost send is collapsed
    // by the provider instead of arriving twice.
    if (meta?.idempotencyKey) headers['idempotency-key'] = meta.idempotencyKey;

    let response: Dispatcher.ResponseData;
    try {
      response = await request(RESEND_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: mail.from,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });
    } catch (err) {
      // DNS failure, connection reset, timeout — transient by nature, so retryable.
      // Built from the error alone: `headers` above holds the API key, and
      // interpolating the request into a message is how a key reaches a log.
      throw new MailDeliveryError(`Resend request failed: ${describeError(err)}`, false);
    }

    const { statusCode, headers: resHeaders, body } = response;
    const payload = await readBody(body);

    if (statusCode >= 200 && statusCode < 300) {
      this.logAccepted(payload, resHeaders);
      return;
    }

    const retryable = RETRYABLE_STATUSES.has(statusCode) || statusCode >= 500;
    throw new MailDeliveryError(
      `Resend rejected the send (HTTP ${statusCode})${describeRejection(payload, resHeaders, statusCode)}`,
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
   * The id is the correlation handle for a later bounce/complaint webhook (out of
   * scope for #118, which is why logging it now is what makes that work possible).
   * Subject and recipient are already logged by `MailProcessor`; repeating the
   * body here would put rendered mail — and therefore accept URLs — in the log.
   */
  private logAccepted(payload: unknown, headers: unknown): void {
    const id =
      typeof payload === 'object' && payload !== null
        ? (payload as { id?: unknown }).id
        : undefined;
    // Scrubbed for the same reason the failure path is: the id is provider-supplied
    // text, and a uniform rule is cheaper to keep true than a case-by-case one.
    this.logger.log(
      `Resend accepted ${typeof id === 'string' ? redactKeyLike(id) : '(no id returned)'}`,
    );

    // One-shot, because the operator cannot learn the real POST /emails limit any
    // other way: it is not the limit the account page shows, and it differs from
    // the one the read endpoints report. This line is what `EMAIL_RATE_MAX` should
    // be set from — at half or less, since the BullMQ limiter is Redis-global and
    // any other Resend API traffic shares the same account budget.
    if (!this.rateLimitLogged) {
      const limit = headerValue(headers, 'ratelimit-limit');
      const policy = headerValue(headers, 'ratelimit-policy');
      if (limit || policy) {
        this.rateLimitLogged = true;
        this.logger.log(
          `Resend send rate limit observed: limit=${limit ?? '?'} policy=${policy ?? '?'} — ` +
            `set EMAIL_RATE_MAX to at most half of this (the limiter is Redis-global across all worker pods)`,
        );
      }
    }
  }
}

/**
 * Reads the response body to completion and parses it when it is JSON.
 *
 * Always consumed, even on a status we are about to throw for: an undici body
 * left unread keeps its socket checked out of the pool, and under a burst of
 * rejected sends that leaks the pool rather than the memory.
 */
async function readBody(body: Dispatcher.ResponseData['body']): Promise<unknown> {
  try {
    const text = await body.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A proxy or WAF between us and Resend can answer HTML. Keep it as text so
      // the failure is still describable, truncated so a whole error page cannot
      // land in the log.
      return text.slice(0, 300);
    }
  } catch {
    return undefined;
  }
}

/**
 * Resend's error shape is `{name, message}`. Only those two fields are surfaced —
 * never the request, never a header, so the API key has no path into the message.
 */
function describeRejection(payload: unknown, headers: unknown, statusCode: number): string {
  const parts: string[] = [];
  if (typeof payload === 'string') {
    parts.push(payload);
  } else if (typeof payload === 'object' && payload !== null) {
    const { name, message } = payload as { name?: unknown; message?: unknown };
    if (typeof name === 'string') parts.push(name);
    if (typeof message === 'string') parts.push(message);
  }
  // Surfaced so the retry delay in the log matches what the provider asked for;
  // BullMQ's own backoff is what actually governs the wait.
  if (statusCode === 429) {
    const retryAfter = headerValue(headers, 'retry-after');
    if (retryAfter) parts.push(`retry-after=${retryAfter}`);
  }
  // Scrubbed because every part above is upstream text — see `redactKeyLike`.
  return parts.length ? `: ${redactKeyLike(parts.join(' — '))}` : '';
}

/** Never includes a stack: these messages are logged, and a stack adds no signal here. */
function describeError(err: unknown): string {
  return redactKeyLike(err instanceof Error ? err.message : String(err));
}

/**
 * Removes anything shaped like a Resend API key from provider-supplied text.
 *
 * "Never interpolate the key" is necessary and NOT sufficient. Every string that
 * reaches a log line here originates upstream — Resend's own `message` field, a
 * proxy's HTML error page, an undici socket error — and any of them can echo the
 * credential back at us. An auth failure quoting the rejected key is the obvious
 * case; a WAF echoing the request headers is the one nobody predicts. Interpolating
 * that verbatim defeats the whole discipline, so untrusted text is scrubbed on the
 * way out rather than trusted on the way in.
 *
 * The replacement deliberately contains no `re_` substring, so the issue's runtime
 * gate (`grep -ri "re_"` over the logs) stays a meaningful check instead of matching
 * our own redaction marker. The 8-character floor keeps ordinary prose starting with
 * "re_" from being mangled.
 */
export function redactKeyLike(text: string): string {
  return text.replace(/re_[A-Za-z0-9_-]{8,}/g, '[redacted]');
}

/** undici lower-cases header names; a repeated header arrives as an array. */
function headerValue(headers: unknown, name: string): string | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined;
  const raw = (headers as Record<string, unknown>)[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}
