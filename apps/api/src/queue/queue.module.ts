import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisConfig } from '../config/configuration';

/**
 * Global BullMQ root: shares a single Redis connection config across all
 * registered queues. Feature modules call BullModule.registerQueue({ name }).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.getOrThrow<RedisConfig>('redis');
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
          },
          defaultJobOptions: {
            attempts: 2,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 86400 },
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
