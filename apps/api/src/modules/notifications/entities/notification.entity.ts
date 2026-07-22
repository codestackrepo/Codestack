import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * A single user-facing notification. Fan-out creates one row per recipient.
 * Indexes (see the AddNotifications migration): (user_id, created_at) for the
 * feed, a partial (user_id) WHERE read_at IS NULL for the unread count, and a
 * unique (user_id, type, entity_id) that makes fan-out idempotent.
 */
@Entity('notifications')
@Index('idx_notification_user_created', ['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Stored as varchar (not a PG enum) so new notification types are code-only
  // additions — no enum-ALTER migration needed. Values come from NotificationType.
  @Column({ type: 'varchar', length: 50 })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', default: '' })
  message!: string;

  /** Generic target discriminator, e.g. 'assignment' | 'assignment_problem'. */
  @Column({ type: 'varchar', length: 50, name: 'entity_type', nullable: true })
  entityType!: string | null;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId!: string | null;

  /** Relative frontend path the notification links to. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  link!: string | null;

  /** Null = unread. */
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt!: Date | null;
}
