import { EmailConfig } from '../../config/configuration';
import { BrevoApiMailTransport, redactKeyLike } from './brevo-mail.transport';
import { MailDeliveryError, OutboundMail } from './mail.transport';

jest.mock('undici', () => ({ request: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { request } = require('undici') as { request: jest.Mock };

/** A key-shaped value, matching the real `xkeysib-…` prefix Brevo issues. */
const API_KEY = 'xkeysib-testkey1234567890abcdef';

const MAIL: OutboundMail = {
  from: 'codestack <no-reply@codestack.dev>',
  to: 'ada@example.com',
  subject: "You're invited to join Acme University on CodeStack",
  html: '<p>Accept: https://app.codestack.dev/invite/secret-token</p>',
  text: 'Accept: https://app.codestack.dev/invite/secret-token',
};

function cfg(over: Partial<EmailConfig> = {}): EmailConfig {
  return {
    enabled: true,
    provider: 'brevo',
    resendApiKey: '',
    brevoApiKey: API_KEY,
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
function reply(statusCode: number, body: unknown = {}) {
  return {
    statusCode,
    headers: {},
    body: {
      text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    },
  };
}

function build(over: Partial<EmailConfig> = {}) {
  const t = new BrevoApiMailTransport(cfg(over));
  const log = jest.spyOn(t['logger'], 'log').mockImplementation(() => undefined);
  return { t, log };
}

beforeEach(() => request.mockReset());

describe('BrevoApiMailTransport — construction', () => {
  it('refuses to construct without an API key', () => {
    expect(() => new BrevoApiMailTransport(cfg({ brevoApiKey: '' }))).toThrow(/BREVO_API_KEY/);
  });
});

describe('BrevoApiMailTransport — the request it makes', () => {
  it('posts the rendered mail to the Brevo send endpoint, splitting from/to into email+name', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(201, { messageId: 'msg-1' }));

    await t.send(MAIL);

    const [url, opts] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      sender: { name: 'codestack', email: 'no-reply@codestack.dev' },
      to: [{ email: MAIL.to }],
      subject: MAIL.subject,
      htmlContent: MAIL.html,
      textContent: MAIL.text,
    });
  });

  it('authenticates with the api-key header, not a bearer token', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(201, { messageId: 'msg-1' }));
    await t.send(MAIL);
    const headers = (request.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers['api-key']).toBe(API_KEY);
    expect(headers.authorization).toBeUndefined();
  });

  it('forwards an idempotency key when one is supplied', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(201, { messageId: 'msg-1' }));
    await t.send(MAIL, { idempotencyKey: 'mail-42' });
    const headers = (request.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers['idempotency-key']).toBe('mail-42');
  });

  it('splits a bare address with no display name into email only', async () => {
    const { t } = build();
    request.mockResolvedValue(reply(201, { messageId: 'msg-1' }));
    await t.send({ ...MAIL, from: 'no-reply@codestack.dev' });
    const body = JSON.parse(
      (request.mock.calls[0][1] as { body: string }).body,
    ) as { sender: unknown };
    expect(body.sender).toEqual({ email: 'no-reply@codestack.dev' });
  });
});

describe('BrevoApiMailTransport — success', () => {
  it('resolves and logs the provider message id for later delivery correlation', async () => {
    const { t, log } = build();
    request.mockResolvedValue(reply(201, { messageId: 'a1b2c3' }));

    await expect(t.send(MAIL)).resolves.toBeUndefined();
    expect(log.mock.calls.map(String).join('\n')).toContain('a1b2c3');
  });

  it('logs neither the recipient, the subject, nor the body', async () => {
    const { t, log } = build();
    request.mockResolvedValue(reply(201, { messageId: 'a1b2c3' }));
    await t.send(MAIL);
    const logged = log.mock.calls.map(String).join('\n');
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('ada@example.com');
  });
});

describe('BrevoApiMailTransport — retryable failures throw with terminal=false', () => {
  it.each([
    ['429 rate limited', 429],
    ['500 provider error', 500],
    ['502 bad gateway', 502],
    ['503 unavailable', 503],
  ])('%s is retryable', async (_label, status) => {
    const { t } = build();
    request.mockResolvedValue(reply(status, { code: 'error', message: 'boom' }));

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
});

describe('BrevoApiMailTransport — terminal failures throw with terminal=true', () => {
  it.each([
    ['400 malformed payload', 400],
    ['401 bad api key', 401],
    ['402 out of send credits', 402],
    ['403 unrecognised sender', 403],
    ['404 wrong endpoint', 404],
  ])('%s is terminal', async (_label, status) => {
    const { t } = build();
    request.mockResolvedValue(reply(status, { code: 'invalid_parameter', message: 'nope' }));

    const err = (await t.send(MAIL).catch((e: unknown) => e)) as MailDeliveryError;
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect(err.terminal).toBe(true);
    expect(err.status).toBe(status);
  });

  it("includes Brevo's own error code and message so the cause is actionable", async () => {
    const { t } = build();
    request.mockResolvedValue(
      reply(401, { code: 'unauthorized', message: 'Key not found' }),
    );
    const err = (await t.send(MAIL).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('unauthorized');
    expect(err.message).toContain('Key not found');
  });
});

describe('BrevoApiMailTransport — the API key never escapes', () => {
  it.each([201, 400, 401, 402, 403, 429, 500])(
    'leaks no key into thrown errors or logs on HTTP %s',
    async (status) => {
      const { t, log } = build();
      const err = jest.spyOn(t['logger'], 'error').mockImplementation(() => undefined);
      // Echo the key back in the provider's own error body — the nastiest realistic
      // case, and the one where a naive "include the whole response" would leak it.
      request.mockResolvedValue(reply(status, { code: 'e', message: `bad key ${API_KEY}` }));

      const thrown = await t.send(MAIL).catch((e: unknown) => e);

      const surfaces = [
        ...log.mock.calls.map(String),
        ...err.mock.calls.map(String),
        thrown instanceof Error ? thrown.message : '',
        thrown instanceof Error ? (thrown.stack ?? '') : '',
      ].join('\n');
      expect(surfaces).not.toContain(API_KEY);
      expect(surfaces).not.toContain('xkeysib-');
    },
  );

  it('leaks no key when the transport layer itself throws', async () => {
    const { t } = build();
    request.mockRejectedValue(new Error(`socket closed while sending api-key: ${API_KEY}`));
    const thrown = (await t.send(MAIL).catch((e: unknown) => e)) as Error;
    expect(thrown.message).not.toContain(API_KEY);
    expect(thrown.message).not.toContain('xkeysib-');
    expect(thrown.message).toContain('socket closed');
  });

  it('redacts with a marker that a key-prefix grep gate would not match', () => {
    expect(redactKeyLike(`key ${API_KEY} here`)).toBe('key [redacted] here');
    expect(redactKeyLike(`key ${API_KEY} here`)).not.toContain('xkeysib-');
  });
});

describe('BrevoApiMailTransport — response body handling', () => {
  it('consumes the body even on a failure it is about to throw for', async () => {
    const { t } = build();
    const res = reply(400, { message: 'bad recipient' });
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
    request.mockResolvedValue(reply(201, ''));
    await expect(t.send(MAIL)).resolves.toBeUndefined();
  });
});
