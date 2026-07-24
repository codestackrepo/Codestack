import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Append-only points ledger. The unique (user_id, reason, ref_key) makes point
 * awards exactly-once — a re-fired event's duplicate insert is a no-op, so
 * totals never double-count. e.g. reason='first_solve', refKey=problemId.
 */
@Entity('points_ledger')
@Unique('uq_points_ledger_dedupe', ['userId', 'reason', 'refKey'])
export class PointsLedger extends BaseEntity {
  @Index('idx_points_ledger_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'int' })
  points!: number;

  @Column({ type: 'varchar', length: 64 })
  reason!: string;

  @Column({ type: 'varchar', length: 128, name: 'ref_key' })
  refKey!: string;
}
