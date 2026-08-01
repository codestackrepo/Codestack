import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailConfig } from '../../config/configuration';
import { QUEUE_MAIL } from '../../queue/queue.constants';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import {
  DisabledMailTransport,
  MAIL_TRANSPORT,
  MailTransport,
  SmtpMailTransport,
} from './mail.transport';
import { ResendMailTransport } from './resend-mail.transport';

/**
 * Transactional mail (#103, provider seam #118).
 *
 * Both the producer (MailService) and the consumer (MailProcessor) are registered
 * in one module with no environment branch, because `worker.ts` boots the SAME
 * AppModule as `main.ts`. A solo developer running only `start:dev` therefore
 * still gets delivery — splitting them behind a flag would make mail silently
 * stop working in exactly the setup most likely to be in use.
 *
 * MailService is exported; MailProcessor deliberately is not — nothing outside
 * this module should reach the worker directly.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_MAIL })],
  providers: [
    MailService,
    MailProcessor,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      /**
       * Provider selection, in the one order that matters.
       *
       * The `enabled` check comes FIRST and returns before any real provider is
       * constructed. That is what lets `EMAIL_ENABLED=false` boot with no
       * `RESEND_API_KEY` at all — `ResendMailTransport`'s constructor throws on a
       * missing key, so constructing it eagerly and only then checking `enabled`
       * would turn a deliberately-disabled mailer into a failed boot.
       */
      useFactory: (config: ConfigService): MailTransport => {
        const cfg = config.getOrThrow<EmailConfig>('email');
        const logger = new Logger('MailTransport');

        if (!cfg.enabled) {
          logger.log('Mailer disabled (EMAIL_ENABLED=false) — no provider constructed');
          return new DisabledMailTransport();
        }
        if (cfg.provider === 'resend') {
          // The key itself is never logged, here or anywhere. Only the fact that
          // this branch was taken, and the from-address, which must be on a domain
          // verified in Resend or every send answers 403.
          logger.log(`Mail provider: resend (HTTP API), from=${cfg.from}`);
          return new ResendMailTransport(cfg);
        }
        logger.log(`Mail provider: smtp ${cfg.host}:${cfg.port}, from=${cfg.from}`);
        return new SmtpMailTransport(cfg);
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}
