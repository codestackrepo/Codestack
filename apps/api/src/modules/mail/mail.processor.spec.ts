import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailConfig } from '../../config/configuration';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MailDeliveryError } from './mail.transport';
import { REDACTED } from './mail-redaction';
import { AnyMailMessage, MailTemplate } from './mail.types';

const MESSAGE: AnyMailMessage = {
  to: 'ada@example.com',
  template: MailTemplate.STUDENT_INVITE,
  params: {
    orgName: 'Acme University',
    firstName: 'Ada',
    lastName: 'Lovelace',
    inviterName: 'Grace Hopper',
    acceptUrl: 'https://app.codestack.dev/invite/secret-token',
    expiresInDays: 7,
  },
};

function setup(over: { deliver?: jest.Mock; rateMax?: number; rateDurationMs?: number } = {}) {
  const deliver = over.deliver ?? jest.fn().mockResolvedValue(undefined);
  const mail = { deliver } as unknown as MailService;
  const email = {
    workerConcurrency: 4,
    rateMax: over.rateMax ?? 20,
    rateDurationMs: over.rateDurationMs ?? 1000,
  } as EmailConfig;
  const config = { getOrThrow: jest.fn().mockReturnValue(email) } as unknown as ConfigService;

  const proc = new MailProcessor(mail, config);
  const logError = jest.spyOn(proc['logger'], 'error').mockImplementation(() => undefined);
  const logWarn = jest.spyOn(proc['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(proc['logger'], 'log').mockImplementation(() => undefined);

  return { proc, deliver, logError, logWarn };
}

function job(over: Partial<Job<AnyMailMessage>> = {}): Job<AnyMailMessage> {
  return {
    id: '77',
    data: structuredClone(MESSAGE),
    attemptsMade: 0,
    opts: { attempts: 5 },
    updateData: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as Job<AnyMailMessage>;
}

describe('MailProcessor.process — retryable failures', () => {
  it('rethrows a retryable provider error so BullMQ retries on its backoff', async () => {
    const deliver = jest.fn().mockRejectedValue(new MailDeliveryError('429 rate limited', false));
    const { proc } = setup({ deliver });

    await expect(proc.process(job())).rejects.toThrow('429 rate limited');
  });

  // An unclassified error (an SMTP failure, a bug in rendering) must keep the old
  // behaviour: throw, and let the attempt budget handle it.
  it('rethrows an ordinary Error untouched', async () => {
    const boom = new Error('550 mailbox unavailable');
    const { proc } = setup({ deliver: jest.fn().mockRejectedValue(boom) });

    await expect(proc.process(job())).rejects.toBe(boom);
  });

  it('leaves the payload intact on a retryable failure — the retry still needs the URL', async () => {
    const deliver = jest.fn().mockRejectedValue(new MailDeliveryError('503', false));
    const { proc } = setup({ deliver });
    const j = job();

    await proc.process(j).catch(() => undefined);

    expect(j.updateData).not.toHaveBeenCalled();
  });
});

describe('MailProcessor.process — terminal failures', () => {
  const terminal = () =>
    jest.fn().mockRejectedValue(new MailDeliveryError('403 domain not verified', true, 403));

  // Retrying an unverified sending domain five times over eight minutes changes
  // nothing except how late a human hears about it.
  it('completes the job instead of consuming the remaining attempts', async () => {
    const { proc } = setup({ deliver: terminal() });
    await expect(proc.process(job())).resolves.toBeUndefined();
  });

  it('logs the failure at error level with the reason', async () => {
    const { proc, logError } = setup({ deliver: terminal() });
    await proc.process(job());
    expect(String(logError.mock.calls[0][0])).toContain('403 domain not verified');
  });

  // The case PR #133 could not have covered. It left completed jobs unscrubbed
  // because after a successful send the token is already in the recipient's mailbox.
  // Here the mail NEVER arrived, so Redis holds the only copy of a live accept URL.
  it('scrubs the credential before completing, because no mailbox copy exists', async () => {
    const { proc } = setup({ deliver: terminal() });
    const j = job();

    await proc.process(j);

    expect(j.updateData).toHaveBeenCalledTimes(1);
    const written = (j.updateData as jest.Mock).mock.calls[0][0] as AnyMailMessage;
    expect((written.params as { acceptUrl: string }).acceptUrl).toBe(REDACTED);
    expect(JSON.stringify(written)).not.toContain('secret-token');
  });

  it('still completes when the scrub write fails — a Redis blip must not resurrect the job', async () => {
    const { proc, logWarn } = setup({ deliver: terminal() });
    const j = job({ updateData: jest.fn().mockRejectedValue(new Error('READONLY')) });

    await expect(proc.process(j)).resolves.toBeUndefined();
    expect(logWarn).toHaveBeenCalled();
  });

  it('does not write to Redis for a template that carries no credential', async () => {
    const { proc } = setup({ deliver: terminal() });
    const j = job({
      data: {
        to: 'ada@example.com',
        template: MailTemplate.ACCESS_REVOKED,
        params: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    });

    await proc.process(j);

    expect(j.updateData).not.toHaveBeenCalled();
  });
});

describe('MailProcessor — the rate limiter is the configured one', () => {
  // #118's "tune EMAIL_RATE_MAX" was a no-op before this: the value was parsed into
  // config that nothing read, while the worker ran at a hardcoded 20/s. BullMQ fixes
  // `limiter` at Worker construction, so the decorator reads process.env directly and
  // this check is what proves the env var actually arrived.
  it('bakes the environment values into the worker options', () => {
    // `@Processor(name, workerOptions)` stores its SECOND argument under
    // WORKER_METADATA; PROCESSOR_METADATA only carries `{name}`. Reading the wrong
    // one yields undefined and the assertion silently proves nothing.
    const worker = Reflect.getMetadata('bullmq:worker_metadata', MailProcessor) as
      { concurrency?: number; limiter?: { max: number; duration: number } } | undefined;
    expect(worker?.limiter).toEqual({
      max: Number(process.env.EMAIL_RATE_MAX ?? 20),
      duration: Number(process.env.EMAIL_RATE_DURATION_MS ?? 1000),
    });
  });

  it('reports a mismatch loudly, since the limiter cannot be repaired after construction', () => {
    const { proc, logError } = setup({ rateMax: 3, rateDurationMs: 1000 });
    // Pretend the worker exists; only `concurrency` is assignable at this point.
    Object.defineProperty(proc, 'worker', { value: { concurrency: 0 }, configurable: true });

    proc.onApplicationBootstrap();

    const logged = logError.mock.calls.map(String).join('\n');
    expect(logged).toContain('MISMATCH');
    expect(logged).toContain('EMAIL_RATE_MAX');
  });

  // configuration.ts parses with a bare Number(), so a fractional value would differ
  // from the floored limiter and cry wolf at every boot.
  it('does not cry wolf when the config value is fractional but substantively equal', () => {
    const baked = Number(process.env.EMAIL_RATE_MAX ?? 20);
    const { proc, logError } = setup({ rateMax: baked + 0.4, rateDurationMs: 1000 });
    Object.defineProperty(proc, 'worker', { value: { concurrency: 0 }, configurable: true });

    proc.onApplicationBootstrap();

    expect(logError).not.toHaveBeenCalled();
  });

  it('stays silent when the baked limiter and the config agree', () => {
    const baked = {
      max: Number(process.env.EMAIL_RATE_MAX ?? 20),
      duration: Number(process.env.EMAIL_RATE_DURATION_MS ?? 1000),
    };
    const { proc, logError } = setup({ rateMax: baked.max, rateDurationMs: baked.duration });
    Object.defineProperty(proc, 'worker', { value: { concurrency: 0 }, configurable: true });

    proc.onApplicationBootstrap();

    expect(logError).not.toHaveBeenCalled();
  });
});
