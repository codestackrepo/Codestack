import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { InvoiceStatus } from '../enums/billing.enums';
import { Subscription } from './subscription.entity';

@Entity('invoices')
export class Invoice extends BaseEntity {
  @Index('idx_invoice_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Subscription, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: Subscription | null;

  @Column({ type: 'uuid', nullable: true, name: 'subscription_id' })
  subscriptionId!: string | null;

  @Index('idx_invoice_provider_invoice', { unique: true })
  @Column({ type: 'varchar', length: 255, name: 'provider_invoice_id' })
  providerInvoiceId!: string;

  @Column({ type: 'int', name: 'amount_paid' })
  amountPaid!: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency!: string;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status!: InvoiceStatus;

  @Column({ type: 'timestamptz', name: 'period_start' })
  periodStart!: Date;

  @Column({ type: 'timestamptz', name: 'period_end' })
  periodEnd!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'hosted_invoice_url' })
  hostedInvoiceUrl!: string | null;
}
