import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_MAIL } from '../../queue/queue.constants';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

/**
 * Transactional mail (#103).
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
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
