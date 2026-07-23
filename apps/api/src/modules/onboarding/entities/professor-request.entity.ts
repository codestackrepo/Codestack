import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { RequestStatus } from '../enums/onboarding.enums';

/**
 * A self-service request from a signed-in user to be granted the professor
 * role. An admin approves (which elevates the user's role) or rejects (with a
 * reason). At most one PENDING request per user is enforced by a partial
 * unique index (see the AddOnboardingTables migration) and in the service.
 */
@Entity('professor_requests')
export class ProfessorRequest extends BaseEntity {
  @Index('idx_prof_request_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Index('idx_prof_request_status')
  @Column({ type: 'varchar', length: 20, default: RequestStatus.PENDING })
  status!: RequestStatus;

  @Column({ type: 'text', default: '' })
  message!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by_id' })
  reviewedById!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  @Column({ type: 'text', default: '', name: 'decision_reason' })
  decisionReason!: string;
}
