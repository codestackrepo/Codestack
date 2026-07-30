import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailConfig } from '../../config/configuration';
import { QUEUE_MAIL } from '../../queue/queue.constants';
import { MailService } from './mail.service';
import { AnyMailMessage } from './mail.types';

/**
 * Delivers queued mail.
 *
 * Imports no domain code on purpose — it has no repositories, no entities and no
 * services beyond MailService. A processor that reached into the domain would
 * make the mail queue a second, unguarded write path.
 *
 * It logs `to`, `template` and `job.id` and NOTHING else. `job.data.params`
 * carries the accept/reset URL, so logging the payload — the reflex when a
 * delivery fails — would put live tokens in the application log, which is the
 * exact exposure the `{template, params}` payload split exists to prevent.
 *
 * `limiter` is baked into Worker construction and cannot be changed afterwards,
 * so it mirrors the .env.sample defaults here; `concurrency` IS live-configurable
 * and is set from config in onModuleInit, matching JudgeProcessor.
 */
@Processor(QUEUE_MAIL, { concurrency: 4, limiter: { max: 20, duration: 1000 } })
export class MailProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onModuleInit(): void {
    const cfg = this.config.getOrThrow<EmailConfig>('email');
    this.worker.concurrency = cfg.workerConcurrency;
  }

  async process(job: Job<AnyMailMessage>): Promise<void> {
    const { to, template } = job.data;
    this.logger.log(`Sending ${template} to ${to} (job ${job.id})`);
    // Intentionally unguarded: a throw is how BullMQ learns to retry.
    await this.mail.deliver(job.data);
  }
}
