import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Per-local-day practice activity: heatmap intensity (`submissionCount`) + the
 * streak source. One row per (user, local calendar day). Upserted atomically on
 * every finalized practice submission.
 */
@Entity('daily_activity')
@Unique('uq_daily_activity_user_date', ['userId', 'activityDate'])
export class DailyActivity extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Local calendar day in the user's timezone (pg `date` → 'YYYY-MM-DD' string).
  @Column({ type: 'date', name: 'activity_date' })
  activityDate!: string;

  @Column({ type: 'int', default: 0, name: 'submission_count' })
  submissionCount!: number;

  @Column({ type: 'int', default: 0, name: 'solved_count' })
  solvedCount!: number;
}
