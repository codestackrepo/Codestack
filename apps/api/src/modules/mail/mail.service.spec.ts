import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MAIL_JOB_OPTIONS } from '../../queue/queue.constants';
import { MailService } from './mail.service';
import { AnyMailMessage, MailTemplate } from './mail.types';
import * as transport from './mail.transport';

jest.mock('./mail.transport', () => ({ createMailTransport: jest.fn() }));
const createMailTransport = transport.createMailTransport as jest.Mock;

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

function setup(
  over: { emailEnabled?: boolean; isProd?: boolean; webAppUrl?: string; queueAdd?: jest.Mock } = {},
) {
  const add = over.queueAdd ?? jest.fn().mockResolvedValue(undefined);
  const queue = { add } as unknown as Queue;
  const email = {
    enabled: over.emailEnabled ?? false,
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
  };
  const app = {
    env: 'test',
    port: 3000,
    apiPrefix: 'api/v1',
    corsOrigins: [],
    isProd: over.isProd ?? false,
    webAppUrl: over.webAppUrl ?? 'https://app.codestack.dev',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'email' ? email : app)),
  } as unknown as ConfigService;

  return { svc: new MailService(queue, config), add };
}

describe('MailService.webUrl', () => {
  it('joins the configured web origin with a path', () => {
    const { svc } = setup();
    expect(svc.webUrl('invite/tok')).toBe('https://app.codestack.dev/invite/tok');
  });

  it('never doubles the slash, whichever side supplies it', () => {
    const { svc } = setup({ webAppUrl: 'https://app.codestack.dev' });
    expect(svc.webUrl('/invite/tok')).toBe('https://app.codestack.dev/invite/tok');
  });
});

describe('MailService.enqueue', () => {
  it('queues only {to, template, params} — never the rendered bodies', async () => {
    // The retained-payload rule: a FAILED job lives for 24h, and html/text
    // contain a live accept URL. The processor re-renders instead.
    const { svc, add } = setup();
    await svc.enqueue(MESSAGE);
    const [, payload] = add.mock.calls[0];
    expect(payload).toEqual(MESSAGE);
    expect(payload).not.toHaveProperty('html');
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('subject');
  });

  it('applies the mail retry/retention options', async () => {
    const { svc, add } = setup();
    await svc.enqueue(MESSAGE);
    expect(add.mock.calls[0][2]).toMatchObject(MAIL_JOB_OPTIONS);
  });

  it('passes jobId through so a double-clicked Resend dedupes', async () => {
    const { svc, add } = setup();
    await svc.enqueue(MESSAGE, 'invite-42');
    expect(add.mock.calls[0][2]).toMatchObject({ jobId: 'invite-42' });
  });

  // The contract that matters. By the time enqueue is called the invite row is
  // COMMITTED and the seat is charged; a Redis blip must not 500 a request that
  // already succeeded and invite the client to retry a non-idempotent operation.
  it('NEVER throws when the queue is down', async () => {
    const add = jest.fn().mockRejectedValue(new Error('ECONNREFUSED redis'));
    const { svc } = setup({ queueAdd: add });
    await expect(svc.enqueue(MESSAGE)).resolves.toBeUndefined();
  });

  it('NEVER throws on malformed params, and does not queue them either', async () => {
    const { svc, add } = setup();
    const bad = { to: 'a@b.dev', template: 'not-a-template', params: {} } as unknown;
    await expect(svc.enqueue(bad as AnyMailMessage)).resolves.toBeUndefined();
    expect(add).not.toHaveBeenCalled();
  });
});

describe('MailService.deliver', () => {
  it('sends through the transport with a rendered subject, html and text', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createMailTransport.mockReturnValue({ sendMail, close: jest.fn() });
    const { svc } = setup({ emailEnabled: true });

    await svc.deliver(MESSAGE);

    const sent = sendMail.mock.calls[0][0] as Record<string, string>;
    expect(sent.to).toBe('ada@example.com');
    expect(sent.from).toBe('no-reply@codestack.dev');
    expect(sent.subject).toContain('Acme University');
    expect(sent.html).toContain('https://app.codestack.dev/invite/secret-token');
    expect(sent.text).toContain('https://app.codestack.dev/invite/secret-token');
  });

  // BullMQ decides to retry from the thrown error, so swallowing one here turns a
  // transient SMTP failure into permanent silent non-delivery.
  it('THROWS on send failure so BullMQ retries', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('550 mailbox unavailable'));
    createMailTransport.mockReturnValue({ sendMail, close: jest.fn() });
    const { svc } = setup({ emailEnabled: true });
    await expect(svc.deliver(MESSAGE)).rejects.toThrow('550 mailbox unavailable');
  });

  it('reuses one pooled transport across sends', async () => {
    createMailTransport.mockClear();
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createMailTransport.mockReturnValue({ sendMail, close: jest.fn() });
    const { svc } = setup({ emailEnabled: true });
    await svc.deliver(MESSAGE);
    await svc.deliver(MESSAGE);
    expect(createMailTransport).toHaveBeenCalledTimes(1);
  });

  describe('disabled mode', () => {
    it('builds no transport and sends nothing', async () => {
      createMailTransport.mockClear();
      const { svc } = setup({ emailEnabled: false });
      await svc.deliver(MESSAGE);
      expect(createMailTransport).not.toHaveBeenCalled();
    });

    it('logs the text body outside production, so links are reachable in dev', async () => {
      const { svc } = setup({ emailEnabled: false, isProd: false });
      const log = jest.spyOn(svc['logger'], 'log').mockImplementation(() => undefined);
      await svc.deliver(MESSAGE);
      expect(log).toHaveBeenCalled();
      expect(String(log.mock.calls[0][0])).toContain('invite/secret-token');
      log.mockRestore();
    });

    // Otherwise the default posture of a fresh production deploy that forgot
    // EMAIL_ENABLED is "every invite token in the application log".
    it('logs NOTHING in production, even with the mailer disabled', async () => {
      const { svc } = setup({ emailEnabled: false, isProd: true });
      const log = jest.spyOn(svc['logger'], 'log').mockImplementation(() => undefined);
      await svc.deliver(MESSAGE);
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });
  });
});
