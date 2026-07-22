import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module';

export type SubmissionEventType = 'status' | 'testcase' | 'error';

export interface SubmissionEvent {
  type: SubmissionEventType;
  submissionId: string;
  userId: string;
  payload: Record<string, unknown>;
}

export const SUBMISSION_EVENTS_CHANNEL = 'submission-events';

/**
 * Publishes judge progress to a Redis channel. The WS gateway (possibly in a
 * different process/replica) subscribes and relays to socket rooms — this is
 * what lets the worker push live "Judging…" updates to connected clients.
 */
@Injectable()
export class SubmissionEventsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(event: SubmissionEvent): Promise<void> {
    await this.redis.publish(SUBMISSION_EVENTS_CHANNEL, JSON.stringify(event));
  }

  async cacheSnapshot(submissionId: string, payload: Record<string, unknown>): Promise<void> {
    await this.redis.set(`sub:last:${submissionId}`, JSON.stringify(payload), 'EX', 300);
  }
}
