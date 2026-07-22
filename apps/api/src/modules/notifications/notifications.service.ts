import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationEventsService } from './realtime/notification-events.service';

export interface CreateForRecipientsInput {
  recipientIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  /** Excluded from recipients so an acting staff/grader never notifies themselves. */
  actorId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly events: NotificationEventsService,
  ) {}

  /**
   * Fan out one notification per recipient, idempotently. Recipients that
   * already have a notification for the same (type, entityId) are skipped, so
   * repeated events never double-notify. Newly created rows are pushed live via
   * Redis → the notifications gateway.
   */
  async createForRecipients(input: CreateForRecipientsInput): Promise<Notification[]> {
    const recipients = [...new Set(input.recipientIds)].filter(
      (id) => !!id && id !== input.actorId,
    );
    if (!recipients.length) return [];

    const existing = await this.repo.find({
      where: { type: input.type, entityId: input.entityId, userId: In(recipients) },
      select: { userId: true },
    });
    const already = new Set(existing.map((e) => e.userId));
    const fresh = recipients.filter((id) => !already.has(id));
    if (!fresh.length) return [];

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(
        fresh.map((userId) => ({
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          entityType: input.entityType,
          entityId: input.entityId,
          link: input.link,
        })),
      )
      .orIgnore() // ON CONFLICT DO NOTHING — the unique index is the backstop
      .execute();

    const created = await this.repo.find({
      where: { type: input.type, entityId: input.entityId, userId: In(fresh) },
    });
    for (const n of created) {
      try {
        await this.events.publish({
          userId: n.userId,
          notification: NotificationResponseDto.from(n),
        });
      } catch (err) {
        this.logger.warn(`Failed to push notification ${n.id}: ${String(err)}`);
      }
    }
    return created;
  }

  async list(
    actor: AuthenticatedUser,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationResponseDto>> {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: actor.id })
      .orderBy('n.created_at', 'DESC');
    if (query.unread) qb.andWhere('n.read_at IS NULL');
    const [rows, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return PaginatedResult.of(rows.map(NotificationResponseDto.from), total, query);
  }

  async unreadCount(actor: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.repo.count({ where: { userId: actor.id, readAt: IsNull() } });
    return { count };
  }

  async markRead(id: string, actor: AuthenticatedUser): Promise<void> {
    const res = await this.repo.update({ id, userId: actor.id }, { readAt: new Date() });
    if (!res.affected) throw new NotFoundException('Notification not found');
  }

  async markAllRead(actor: AuthenticatedUser): Promise<{ updated: number }> {
    const res = await this.repo.update(
      { userId: actor.id, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }
}
