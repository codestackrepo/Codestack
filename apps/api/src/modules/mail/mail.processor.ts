import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailConfig } from '../../config/configuration';
import { QUEUE_MAIL } from '../../queue/queue.constants';
import { MailService } from './mail.service';
import { hasCredential, redactMailPayload } from './mail-redaction';
import { AnyMailMessage } from './mail.types';
import { MailDeliveryError } from './mail.transport';

/**
 * The rate limit, read from the environment at CLASS-DECORATION time.
 *
 * This is the only way the value can reach the Worker. BullMQ reads `limiter`
 * once, inside the Worker constructor, and @nestjs/bullmq constructs it from this
 * decorator's metadata — all of which happens before any `ConfigService` exists.
 * `concurrency` is different: it stays mutable on the worker instance, which is why
 * it alone is set from config in `onApplicationBootstrap` below.
 *
 * Before #118 this was the literal `{max: 20, duration: 1000}` while
 * `EMAIL_RATE_MAX` was parsed into config that nothing read — so setting the env
 * var to 5 still ran the worker at 20, and the config actively lied. Reading
 * `process.env` here is what makes the documented knob the real one.
 *
 * The catch, stated plainly: this runs at import time, so it depends on the
 * environment already being populated. In production it is (the platform injects
 * real env vars before node starts). Locally it is because `ConfigModule.forRoot`
 * loads `.env` synchronously and `app.module.ts` imports `AppConfigModule` before
 * `MailModule`. That ordering is not something to rely on silently, so
 * `assertLimiterMatchesConfig` re-checks it at boot and complains if it ever
 * stops holding. Deliberately NOT `dotenv/config` here: dotenv is a
 * devDependency, and importing it from runtime code breaks a production install.
 */
function toPositiveInt(raw: string | number | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function mailLimiter(): { max: number; duration: number } {
  return {
    max: toPositiveInt(process.env.EMAIL_RATE_MAX, 20),
    duration: toPositiveInt(process.env.EMAIL_RATE_DURATION_MS, 1000),
  };
}

/** Captured once so the boot-time cross-check compares against what was really baked in. */
const BAKED_LIMITER = mailLimiter();

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
 * `limiter` comes from the environment (see `mailLimiter`); `concurrency` IS
 * live-configurable and is set from config in `onApplicationBootstrap`, matching
 * JudgeProcessor.
 */
@Processor(QUEUE_MAIL, { concurrency: 4, limiter: BAKED_LIMITER })
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
    this.assertLimiterMatchesConfig(cfg);
  }

  /**
   * Verifies that the limiter the Worker actually got matches what the
   * environment asked for.
   *
   * `mailLimiter()` runs at import time; `ConfigService` reads the same two vars
   * later, through a path that is guaranteed to see a loaded `.env`. If the two
   * disagree, the env file was not yet loaded when this module was imported — the
   * limiter is then silently running at the fallback, which is the exact class of
   * bug #118 set out to kill. It cannot be repaired at this point (BullMQ has
   * already constructed the Worker), so the only useful move is to say so loudly
   * with the numbers that matter.
   */
  private assertLimiterMatchesConfig(cfg: EmailConfig): void {
    // Both sides are normalised the SAME way before comparing. `configuration.ts`
    // parses with a bare `Number()`, so `EMAIL_RATE_MAX=20.5` would arrive as 20.5
    // there while the limiter floors it to 20 — comparing raw would log a mismatch
    // on every boot for a value that is, in substance, correctly applied. A warning
    // that cries wolf is one people learn to scroll past, which would cost exactly
    // the signal this check exists to provide.
    const want = {
      max: toPositiveInt(cfg.rateMax, 20),
      duration: toPositiveInt(cfg.rateDurationMs, 1000),
    };
    if (BAKED_LIMITER.max === want.max && BAKED_LIMITER.duration === want.duration) {
      return;
    }
    this.logger.error(
      `Mail rate limiter MISMATCH — the worker is running at ` +
        `${BAKED_LIMITER.max}/${BAKED_LIMITER.duration}ms but configuration says ` +
        `${cfg.rateMax}/${cfg.rateDurationMs}ms. The limiter is fixed at Worker ` +
        `construction and cannot be changed now. This means EMAIL_RATE_MAX was not in ` +
        `the environment when MailModule was imported — check that config is imported ` +
        `before MailModule in app.module.ts, or set the variable in the real environment ` +
        `rather than only in a .env file.`,
    );
  }

  async process(job: Job<AnyMailMessage>): Promise<void> {
    const { to, template } = job.data;
    this.logger.log(`Sending ${template} to ${to} (job ${job.id})`);

    try {
      // `jobId` is stable across retries, which is what makes it usable as the
      // provider's idempotency key: a send Resend accepted but whose response was
      // lost must be collapsed by the provider, not mailed twice.
      await this.mail.deliver(job.data, { idempotencyKey: `mail-${job.id}` });
    } catch (err) {
      if (err instanceof MailDeliveryError && err.terminal) {
        // Terminal: the provider will never accept this message. An unverified
        // sending domain or a malformed recipient does not become valid by waiting,
        // so consuming the remaining attempts over eight minutes only delays the
        // error reaching a human. Complete the job instead, having logged it.
        this.logger.error(
          `Terminal delivery failure for ${template} to ${to} (job ${job.id}): ${err.message}`,
        );
        // Scrub BEFORE completing, and this is the case PR #133 could not have
        // covered. Its reasoning for leaving COMPLETED jobs alone was that after a
        // successful send the token is already in the recipient's mailbox, so the
        // queue's copy adds nothing. Here the mail never arrived — Redis holds the
        // ONLY copy of a live accept URL — so that argument inverts. The e2e
        // harness is unaffected: it reads tokens from successfully completed jobs.
        await this.scrub(job);
        return;
      }
      // Everything else: a throw is how BullMQ learns to retry.
      throw err;
    }
  }

  /*
   * NOT scrubbed on 'completed', deliberately — with one exception, handled above.
   *
   * The exception is a TERMINAL delivery failure, which also completes its job but
   * whose mail never arrived; `process` scrubs that one explicitly, because the
   * reasoning below depends on a mailbox copy existing and there is none.
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
