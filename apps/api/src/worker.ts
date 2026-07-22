import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Worker process entrypoint. Boots the Nest application context (no HTTP
 * server) so BullMQ processors (judge, ai-generate, playground) start
 * consuming jobs. Scale horizontally by running more of these.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  new Logger('Worker').log('CodeStack worker started — consuming queues');
}

void bootstrap();
