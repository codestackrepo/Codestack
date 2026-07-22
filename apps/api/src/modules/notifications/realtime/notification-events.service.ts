import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { NotificationResponseDto } from '../dto/notification-response.dto';

export const NOTIFICATION_EVENTS_CHANNEL = 'notification-events';

export interface NotificationPushEvent {
  userId: string;
  notification: NotificationResponseDto;
}

/**
 * Publishes a freshly-created notification to a Redis channel. The gateway
 * (which only exists in the web process, never the judge worker) subscribes and
 * relays to the recipient's `user:{id}` socket room — so a notification created
 * in ANY process reaches the connected client, exactly like submission events.
 */
@Injectable()
export class NotificationEventsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(event: NotificationPushEvent): Promise<void> {
    await this.redis.publish(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify(event));
  }
}
