import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailConfig } from '../../config/configuration';
import { QUEUE_MAIL } from '../../queue/queue.constants';
import { MailService } from './mail.service';
import { hasCredential, redactMailPayload } from './mail-redaction';
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
export class MailProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /**
   * `onApplicationBootstrap`, NOT `onModuleInit`.
   *
   * @nestjs/bullmq attaches the Worker from its OWN `onModuleInit`, so reading
   * `this.worker` from another `onModuleInit` is a race decided by module
   * registration order — it throws "Worker has not yet been initialized" whenever
   * this module happens to initialise first. `onApplicationBootstrap` runs strictly
   * after every `onModuleInit`, so the worker always exists by then.
   */
  onApplicationBootstrap(): void {
    const cfg = this.config.getOrThrow<EmailConfig>('email');
    this.worker.concurrency = cfg.workerConcurrency;
  }

  async process(job: Job<AnyMailMessage>): Promise<void> {
    const { to, template } = job.data;
    this.logger.log(`Sending ${template} to ${to} (job ${job.id})`);
    // Intentionally unguarded: a throw is how BullMQ learns to retry.
    await this.mail.deliver(job.data);
  }

  /*
   * NOT scrubbed on 'completed', deliberately.
   *
   * The two retention windows are not equivalent. After a SUCCESSFUL send the token
   * is already in the recipient's mailbox, so the queue's copy for
   * `removeOnComplete: {age: 300}` adds five minutes to an exposure that exists
   * anyway — a bound this file already documented and accepted. After a FAILED send
   * the mail never arrived, so Redis holds the ONLY copy, unwatched, for the 24 hours
   * of `removeOnFail` — and the invite it unlocks is valid for fourteen days. That
   * asymmetry is the bug; the five minutes is a trade-off.
   *
   * It is also load-bearing for the test harness: the raw token exists only in the
   * mail, so `invites.e2e-spec` and `password-reset.e2e-spec` read it back out of the
   * completed job. Scrubbing there would leave no way to exercise accept or reset
   * end-to-end at all. If that window is ever judged unacceptable, the harness needs
   * a different way to observe the token BEFORE this hook could run.
   */

  /**
   * Strip the credential from a job that has FINISHED failing.
   *
   * `removeOnFail: {age: 86400}` retains a day of failures for diagnosis, and
   * `MAIL_JOB_OPTIONS.attempts` is 5 — so this must run only once the last attempt is
   * spent. BullMQ replays `job.data` on every retry, so scrubbing earlier would make
   * attempts 2..5 mail the literal string "[redacted]" to the invitee.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AnyMailMessage> | undefined): Promise<void> {
    if (!job) return; // BullMQ passes undefined when the job could not be loaded
    const attempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < attempts) return; // more retries to come; keep the URL
    await this.scrub(job);
  }

  /**
   * Never throws. This runs in an event handler, outside the job's own error
   * handling, and a Redis hiccup while redacting must not become an unhandled
   * rejection that takes the worker down — the mail itself already succeeded or
   * already exhausted its retries.
   */
  private async scrub(job: Job<AnyMailMessage>): Promise<void> {
    try {
      if (!hasCredential(job.data)) return; // most templates carry none
      await job.updateData(redactMailPayload(job.data));
    } catch (err) {
      this.logger.warn(
        `Could not redact mail job ${job.id}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
