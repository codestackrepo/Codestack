import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { SubscriptionStatus } from '../enums/billing.enums';
import { Plan } from './plan.entity';

/**
 * The partial unique index enforces "at most one live subscription per user"
 * at the database level (active/trialing only — a user can accumulate many
 * canceled/incomplete rows over time without violating it).
 */
@Entity('subscriptions')
@Index('idx_subscription_one_active_per_user', ['userId'], {
  unique: true,
  where: `status IN ('active', 'trialing')`,
})
export class Subscription extends BaseEntity {
  @Index('idx_subscription_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ type: 'uuid', name: 'plan_id' })
  planId!: string;

  @Index('idx_subscription_status')
  @Column({ type: 'enum', enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @Column({ type: 'varchar', length: 20, default: 'stripe' })
  provider!: string;

  @Index('idx_subscription_provider_sub', { unique: true })
  @Column({ type: 'varchar', length: 255, name: 'provider_subscription_id' })
  providerSubscriptionId!: string;

  @Index('idx_subscription_provider_customer')
  @Column({ type: 'varchar', length: 255, name: 'provider_customer_id' })
  providerCustomerId!: string;

  @Column({ type: 'timestamptz', name: 'current_period_start' })
  currentPeriodStart!: Date;

  @Index('idx_subscription_period_end')
  @Column({ type: 'timestamptz', name: 'current_period_end' })
  currentPeriodEnd!: Date;

  @Column({ type: 'boolean', default: false, name: 'cancel_at_period_end' })
  cancelAtPeriodEnd!: boolean;
}
