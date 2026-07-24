import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One aggregate row per user holding the denormalized gamification counters
 * (practice-only, §5.6). Mutated only by the award path (#35) under a
 * SELECT … FOR UPDATE lock; reads compute the *effective* streak at query time.
 */
@Entity('user_gamification')
export class UserGamification extends BaseEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('uq_user_gamification_user', { unique: true })
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Denormalized tenant FK (derived from the user; this row is created in the
  // actor-less SUBMISSION_FINALIZED worker path, #58).
  @Index('idx_user_gamification_organization')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'int', default: 0, name: 'total_points' })
  totalPoints!: number;

  @Column({ type: 'int', default: 0, name: 'easy_solved' })
  easySolved!: number;

  @Column({ type: 'int', default: 0, name: 'medium_solved' })
  mediumSolved!: number;

  @Column({ type: 'int', default: 0, name: 'hard_solved' })
  hardSolved!: number;

  @Column({ type: 'int', default: 0, name: 'current_streak' })
  currentStreak!: number;

  @Column({ type: 'int', default: 0, name: 'longest_streak' })
  longestStreak!: number;

  // Postgres `date` → 'YYYY-MM-DD' string in the pg driver (no time/zone drift).
  @Column({ type: 'date', nullable: true, name: 'last_activity_date' })
  lastActivityDate!: string | null;

  // Denormalized copy of users.timezone so the hot award path avoids a join.
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;
}
