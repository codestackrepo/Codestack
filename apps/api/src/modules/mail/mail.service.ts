import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AppConfig, EmailConfig } from '../../config/configuration';
import { JOB_SEND_MAIL, MAIL_JOB_OPTIONS, QUEUE_MAIL } from '../../queue/queue.constants';
import { AnyMailMessage } from './mail.types';
import { MAIL_TRANSPORT, MailTransport, SendMeta } from './mail.transport';
import { renderMail } from './templates';

/**
 * Transactional mail (#103).
 *
 * The split between `enqueue` and `deliver` is the whole design:
 *
 *   enqueue()  request path, in the API process. NEVER throws.
 *   deliver()  worker path, in MailProcessor. ALWAYS throws on failure.
 *
 * `enqueue` cannot throw because by the time it is called the caller's write has
 * already COMMITTED — the invite row exists, the seat is charged. A Redis blip
 * must not turn that into a 500 on a request that already succeeded, leaving the
 * client to retry an operation that is no longer idempotent. A mail that was not
 * queued is recoverable (Resend); a phantom duplicate invite is not.
 *
 * `deliver` must throw for the opposite reason: BullMQ decides to retry from the
 * thrown error, so swallowing one turns a transient SMTP failure into silent
 * non-delivery.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly emailCfg: EmailConfig;
  private readonly appCfg: AppConfig;

  constructor(
    @InjectQueue(QUEUE_MAIL) private readonly queue: Queue,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    config: ConfigService,
  ) {
    this.emailCfg = config.getOrThrow<EmailConfig>('email');
    this.appCfg = config.getOrThrow<AppConfig>('app');
  }

  async onModuleDestroy(): Promise<void> {
    // An SMTP pool holds open TCP connections; without this a worker shutdown
    // waits on them and the process lingers past its termination grace period.
    // Provider-agnostic now — the Resend transport has nothing to close.
    await this.transport.close();
  }

  /**
   * Absolute URL into the WEB app. The single reader of `WEB_APP_URL` — every
   * other caller goes through here, so there is exactly one place that can be
   * wrong, and `main.ts` fails closed on it in production.
   */
  webUrl(path: string): string {
    return `${this.appCfg.webAppUrl}/${path.replace(/^\/+/, '')}`;
  }

  /**
   * Queue a message. Renders eagerly — in the API process, where a bad params
   * object is a loud developer error at the call site rather than five silent
   * retries on the worker — then discards the render and queues only
   * `{template, params}`.
   *
   * `jobId` deduplicates: two clicks of Resend within `removeOnComplete`'s window
   * produce one mail.
   */
  async enqueue(message: AnyMailMessage, jobId?: string): Promise<void> {
    try {
      renderMail(message); // fail fast on malformed params; the output is dropped
      await this.queue.add(JOB_SEND_MAIL, message, { ...MAIL_JOB_OPTIONS, jobId });
    } catch (err) {
      // Deliberately swallowed — see the class comment. Logged with the template
      // and recipient only; never the params, which carry the token.
      this.logger.error(
        `Failed to queue ${message.template} to ${message.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Deliver one message. Called only by MailProcessor. Re-renders from the
   * payload, because the payload never carried the bodies.
   *
   * With the mailer disabled this logs the TEXT body instead of sending — but
   * only outside production. In production a disabled mailer stays silent: the
   * alternative would make "every invite token in the application log" the
   * default posture of any deployment that forgot to set EMAIL_ENABLED.
   */
  async deliver(message: AnyMailMessage, meta?: SendMeta): Promise<void> {
    const { subject, html, text } = renderMail(message);

    if (!this.emailCfg.enabled) {
      if (!this.appCfg.isProd) {
        this.logger.log(`[mail disabled] to=${message.to} subject="${subject}"\n${text}`.trimEnd());
      }
      return;
    }

    // Whatever the transport throws travels straight out — including
    // `MailDeliveryError`, whose `terminal` flag the processor reads. Catching and
    // rewrapping here would erase the one bit that decides retry vs complete.
    await this.transport.send(
      {
        from: this.emailCfg.from,
        to: message.to,
        subject,
        html,
        text,
      },
      meta,
    );
  }
}
