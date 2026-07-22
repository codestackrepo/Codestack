import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { AuthConfig } from '../../../config/configuration';
import { JwtPayload } from '../../../common/types/authenticated-user';
import { REDIS_CLIENT } from '../../../redis/redis.module';
import { NOTIFICATION_EVENTS_CHANNEL, NotificationPushEvent } from './notification-events.service';

/**
 * Socket.IO gateway for live notifications. Auth mirrors SubmissionsGateway
 * (JWT via cookie or handshake token); each socket auto-joins its `user:{id}`
 * room, and the gateway relays notifications published to Redis into that room.
 */
@WebSocketGateway({ namespace: '/ws/notifications', cors: { credentials: true } })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly authCfg: AuthConfig;
  private subscriber?: Redis;

  @WebSocketServer()
  server!: Server;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.authCfg = config.getOrThrow<AuthConfig>('auth');
  }

  afterInit(): void {
    this.subscriber = this.redis.duplicate();
    void this.subscriber.subscribe(NOTIFICATION_EVENTS_CHANNEL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as NotificationPushEvent;
        this.server.to(`user:${event.userId}`).emit('notification.created', event.notification);
      } catch (err) {
        this.logger.warn(`Bad notification event: ${String(err)}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Mirror SubmissionsGateway: ioredis has no lifecycle hook, so the
    // duplicated pub/sub connection must be closed explicitly.
    await this.subscriber?.quit();
  }

  handleConnection(client: Socket): void {
    const user = this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    void client.join(`user:${user.sub}`);
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
