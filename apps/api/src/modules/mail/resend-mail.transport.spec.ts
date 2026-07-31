import { EmailConfig } from '../../config/configuration';
import { MailDeliveryError, OutboundMail } from './mail.transport';
import { redactKeyLike, ResendMailTransport } from './resend-mail.transport';

jest.mock('undici', () => ({ request: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { request } = require('undici') as { request: jest.Mock };

/**
 * A key-shaped value. Every assertion about leakage greps for `re_`, which is also
 * the runtime gate the issue specifies (`grep -ri "re_"` over the logs), so a
 * realistic prefix is load-bearing rather than cosmetic.
 */
const API_KEY = 're_TESTKEY_abcdef1234567890';

const MAIL: OutboundMail = {
  from: 'no-reply@codestack.dev',
  to: 'ada@example.com',
  subject: "You're invited to join Acme University on CodeStack",
  html: '<p>Accept: https://app.codestack.dev/invite/secret-token</p>',
  text: 'Accept: https://app.codestack.dev/invite/secret-token',
};

function cfg(over: Partial<EmailConfig> = {}): EmailConfig {
  return {
    enabled: true,
    provider: 'resend',
    resendApiKey: API_KEY,
    host: '',
    port: 587,
    user: '',
    password: '',
    useTls: true,
    from: 'no-reply@codestack.dev',
    notificationEmails: [],
    workerConcurrency: 4,
    rateMax: 4,
    rateDurationMs: 1000,
    ...over,
  } as EmailConfig;
}

/** `readBody` always consumes the stream, so every mock must offer `text()`. */
function reply(statusCode: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers,
    body: {
      text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    },
  };
}

function build(over: Partial<EmailConfig> = {}) {
  const t = new ResendMailTransport(cfg(over));
  const log = jest.spyOn(t['logger'], 'log').mockImplementation(() => undefined);
  return { t, log };
}

beforeEach(() => request.mockReset());

describe('ResendMailTransport — construction', () => {
  // Joi already requires the key for this provider; this is the second lock, and it
  // fails at boot rather than at the first invite of the day.
  it('refuses to construct without an API key', () => {
    expect(() => new ResendMailTransport(cfg({ resendApiKey: '' }))).toThrow(/RESEND_API_KEY/);
  });
});

describe('ResendMailTransport — the request it makes', () => {
  it('posts the rendered mail to the Resend send endpoint as the configured sender', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(200, { id: 'msg-1' }));

    await t.send(MAIL);

    const [url, opts] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      from: MAIL.from,
      to: MAIL.to,
      subject: MAIL.subject,
      html: MAIL.html,
      text: MAIL.text,
    });
  });

  it('authenticates with a bearer token', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(200, { id: 'msg-1' }));
    await t.send(MAIL);
    const headers = (request.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  // BullMQ replays job.data on every retry. Without this, a send that Resend
  // accepted but whose response we never saw arrives twice.
  it('forwards an idempotency key when one is supplied', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(200, { id: 'msg-1' }));
    await t.send(MAIL, { idempotencyKey: 'mail-42' });
    const headers = (request.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers['idempotency-key']).toBe('mail-42');
  });

  it('omits the idempotency header entirely when none is supplied', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(200, { id: 'msg-1' }));
    await t.send(MAIL);
    const headers = (request.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers).not.toHaveProperty('idempotency-key');
  });
});

describe('ResendMailTransport — success', () => {
  it('resolves and logs the provider message id for later delivery correlation', async () => {
    const { t, log } = build();
    request.mockResolvedValue(reply(200, { id: 'a1b2c3' }));

    await expect(t.send(MAIL)).resolves.toBeUndefined();
    expect(log.mock.calls.map(String).join('\n')).toContain('a1b2c3');
  });

  // The subject and body carry the invite URL; the processor already logs to/template.
  it('logs neither the recipient, the subject, nor the body', async () => {
    const { t, log } = build();
    request.mockResolvedValue(reply(200, { id: 'a1b2c3' }));
    await t.send(MAIL);
    const logged = log.mock.calls.map(String).join('\n');
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('ada@example.com');
    expect(logged).not.toContain('Acme University');
  });

  // The real POST /emails limit is not the one the account page or the read
  // endpoints report, so this log line is the only way an operator can discover
  // the number that EMAIL_RATE_MAX has to respect.
  it('surfaces the observed rate limit once, not on every send', async () => {
    const { t, log } = build();
    request.mockResolvedValue(
      reply(200, { id: 'x' }, { 'ratelimit-limit': '10', 'ratelimit-policy': '10;w=1' }),
    );

    await t.send(MAIL);
    await t.send(MAIL);

    const rateLines = log.mock.calls.map(String).filter((l) => l.includes('rate limit observed'));
    expect(rateLines).toHaveLength(1);
    expect(rateLines[0]).toContain('EMAIL_RATE_MAX');
  });
});

/**
 * The classification table, one case per class (#118 locked decision 4).
 *
 * `terminal` is what decides retry-vs-complete, so each case asserts the flag and
 * not merely that something was thrown.
 */
describe('ResendMailTransport — retryable failures throw with terminal=false', () => {
  it.each([
    ['429 rate limited', 429],
    ['500 provider error', 500],
    ['502 bad gateway', 502],
    ['503 unavailable', 503],
    ['408 request timeout', 408],
  ])('%s is retryable', async (_label, status) => {
    const { t } = build();
    request.mockResolvedValue(reply(status, { name: 'error', message: 'boom' }));

    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect(err.terminal).toBe(false);
    expect(err.status).toBe(status);
  });

  it('treats a network/timeout failure as retryable', async () => {
    const { t } = build();
    request.mockRejectedValue(new Error('UND_ERR_HEADERS_TIMEOUT'));

    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect(err.terminal).toBe(false);
    expect(err.message).toContain('UND_ERR_HEADERS_TIMEOUT');
  });

  it('reports the provider retry-after on a 429 so the log matches what was asked', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(429, { message: 'Too many requests' }, { 'retry-after': '7' }));
    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err.message).toContain('retry-after=7');
  });
});

describe('ResendMailTransport — terminal failures throw with terminal=true', () => {
  it.each([
    ['422 invalid recipient', 422],
    ['403 unverified sending domain', 403],
    ['401 bad api key', 401],
    ['400 malformed payload', 400],
    ['404 wrong endpoint', 404],
  ])('%s is terminal', async (_label, status) => {
    const { t } = build();
    request.mockResolvedValue(reply(status, { name: 'validation_error', message: 'nope' }));

    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect(err.terminal).toBe(true);
    expect(err.status).toBe(status);
  });

  it("includes Resend's own error name and message so the cause is actionable", async () => {
    const { t } = build();
    request.mockResolvedValue(
      reply(403, { name: 'validation_error', message: 'The codestack.dev domain is not verified' }),
    );
    const err = (await t.send(MAIL).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('validation_error');
    expect(err.message).toContain('not verified');
  });
});

/**
 * Locked decision 7, asserted rather than assumed.
 *
 * There is no log-redaction layer in this app (nestjs-pino is a dependency but is
 * never registered), so the key is protected only by never being interpolated
 * anywhere. That is a property of the code, and this is the test that holds it.
 */
describe('ResendMailTransport — the API key never escapes', () => {
  it.each([200, 400, 401, 403, 422, 429, 500])(
    'leaks no key into thrown errors or logs on HTTP %s',
    async (status) => {
      const { t, log } = build();
      const err = jest.spyOn(t['logger'], 'error').mockImplementation(() => undefined);
      // Echo the key back in the provider's own error body — the nastiest realistic
      // case, and the one where a naive "include the whole response" would leak it.
      request.mockResolvedValue(reply(status, { name: 'e', message: `bad key ${API_KEY}` }));

      const thrown = await t.send(MAIL).catch((e: unknown) => e);

      const surfaces = [
        ...log.mock.calls.map(String),
        ...err.mock.calls.map(String),
        thrown instanceof Error ? thrown.message : '',
        thrown instanceof Error ? (thrown.stack ?? '') : '',
      ].join('\n');
      expect(surfaces).not.toContain(API_KEY);
      expect(surfaces).not.toContain('re_');
    },
  );

  // An undici error can quote the request it was sending, headers included.
  it('leaks no key when the transport layer itself throws', async () => {
    const { t } = build();
    request.mockRejectedValue(new Error(`socket closed while sending Bearer ${API_KEY}`));
    const thrown = (await t.send(MAIL).catch((e: unknown) => e)) as Error;
    expect(thrown.message).not.toContain(API_KEY);
    expect(thrown.message).not.toContain('re_');
    // The rest of the diagnostic survives — scrubbing is surgical, not a blanket drop.
    expect(thrown.message).toContain('socket closed');
  });

  it('redacts with a marker that the grep gate itself would not match', () => {
    // If the placeholder contained "re_", the issue's `grep -ri "re_"` log gate would
    // match our own redaction and report a leak on every scrubbed line.
    expect(redactKeyLike(`key ${API_KEY} here`)).toBe('key [redacted] here');
    expect(redactKeyLike(`key ${API_KEY} here`)).not.toContain('re_');
  });

  it('leaves ordinary prose beginning with re_ alone', () => {
    expect(redactKeyLike('re_try the request')).toBe('re_try the request');
  });
});

describe('ResendMailTransport — response body handling', () => {
  // An unread undici body keeps its socket checked out of the pool; under a burst
  // of rejected sends that exhausts the pool rather than the memory.
  it('consumes the body even on a failure it is about to throw for', async () => {
    const { t } = build();
    const res = reply(422, { message: 'bad recipient' });
    request.mockResolvedValue(res);

    await t.send(MAIL).catch(() => undefined);

    expect(res.body.text).toHaveBeenCalled();
  });

  it('survives a non-JSON body from a proxy or WAF', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(502, '<html>Bad Gateway</html>'));

    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err.terminal).toBe(false);
    expect(err.message).toContain('Bad Gateway');
  });

  it('still resolves when a success response has no parseable body', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(200, ''));
    await expect(t.send(MAIL)).resolves.toBeUndefined();
  });
});
