import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PlanInterval } from '../enums/billing.enums';

@Entity('plans')
export class Plan extends BaseEntity {
  @Index('idx_plan_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: PlanInterval })
  interval!: PlanInterval;

  // Minor currency units (e.g. cents) — never a float, to avoid money rounding drift.
  @Column({ type: 'int', name: 'price_minor_units' })
  priceMinorUnits!: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency!: string;

  @Index('idx_plan_stripe_price', { unique: true })
  @Column({ type: 'varchar', length: 255, name: 'stripe_price_id' })
  stripePriceId!: string;

  @Column({ type: 'jsonb', default: {} })
  features!: Record<string, boolean>;

  @Index('idx_plan_active')
  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
