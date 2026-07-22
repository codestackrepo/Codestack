import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { WebhookEventStatus } from '../enums/billing.enums';

/**
 * Idempotency ledger for inbound provider webhooks: `(provider, event_id)` is
 * unique, so a redelivered event is a no-op `INSERT ... ON CONFLICT DO
 * NOTHING` rather than double-applying a subscription mutation.
 */
@Entity('webhook_events')
@Index('idx_webhook_event_provider_event', ['provider', 'eventId'], { unique: true })
export class WebhookEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  @Column({ type: 'varchar', length: 255, name: 'event_id' })
  eventId!: string;

  @Index('idx_webhook_event_type')
  @Column({ type: 'varchar', length: 100 })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'enum', enum: WebhookEventStatus, default: WebhookEventStatus.RECEIVED })
  status!: WebhookEventStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'processed_at' })
  processedAt!: Date | null;
}
