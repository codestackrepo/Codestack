import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuthConfig } from '../../../config/configuration';
import { JwtPayload } from '../../../common/types/authenticated-user';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { Submission } from '../../submissions/entities/submission.entity';
import { SUBMISSION_EVENTS_CHANNEL, SubmissionEvent } from './submission-events.service';

/**
 * Socket.IO gateway for live submission verdicts. Auth via JWT (cookie or
 * handshake token). Relays judge events published to Redis by the worker.
 */
@WebSocketGateway({ namespace: '/ws/submissions', cors: { credentials: true } })
export class SubmissionsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionsGateway.name);
  private readonly authCfg: AuthConfig;
  private subscriber?: Redis;

  @WebSocketServer()
  server!: Server;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
  ) {
    this.authCfg = config.getOrThrow<AuthConfig>('auth');
  }

  afterInit(): void {
    // Dedicated subscriber connection relays judge events to socket rooms.
    this.subscriber = this.redis.duplicate();
    void this.subscriber.subscribe(SUBMISSION_EVENTS_CHANNEL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as SubmissionEvent;
        this.server
          .to(`submission:${event.submissionId}`)
          .to(`user:${event.userId}`)
          .emit(`submission.${event.type}`, event.payload);
      } catch (err) {
        this.logger.warn(`Bad submission event: ${String(err)}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    // The duplicated pub/sub connection is never torn down by Nest itself
    // (ioredis doesn't implement lifecycle hooks) — without this, every
    // shutdown/restart leaked one Redis connection.
    await this.subscriber?.quit();
  }

  handleConnection(client: Socket): void {
    const user = this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.data.userId = user.sub;
    void client.join(`user:${user.sub}`);
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(client: Socket, payload: { submissionId?: string }): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const submissionId = payload?.submissionId;
    if (!userId || !submissionId) return;

    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission || submission.userId !== userId) return;

    await client.join(`submission:${submissionId}`);
    // Immediate snapshot so late-joiners/reconnects still get the verdict.
    client.emit('submission.status', {
      submissionId: submission.id,
      status: submission.status,
      passedTestcaseCount: submission.passedTestcaseCount,
      totalTestcaseCount: submission.totalTestcaseCount,
      runtimeMs: submission.runtimeMs,
      memoryBytes: submission.memoryBytes,
    });
  }

  @SubscribeMessage('unsubscribe')
  async onUnsubscribe(client: Socket, payload: { submissionId?: string }): Promise<void> {
    if (payload?.submissionId) await client.leave(`submission:${payload.submissionId}`);
  }

  private authenticate(client: Socket): JwtPayload | null {
    const token = this.extractToken(client);
    if (!token) return null;
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { secret: this.authCfg.accessSecret });
      return payload.type === 'access' ? payload : null;
    } catch {
      return null;
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const cookie = client.handshake.headers.cookie;
    if (!cookie) return null;
    const match = /(?:^|;\s*)access_token=([^;]+)/.exec(cookie);
    return match ? decodeURIComponent(match[1]) : null;
  }
}
