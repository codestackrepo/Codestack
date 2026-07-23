import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { AttemptStatus } from '../enums/attempt-status.enum';
import { Assignment } from './assignment.entity';

/**
 * A student's attempt at an assignment. `deadlineAt` is server-authoritative
 * (for kind=test it is startedAt + durationMinutes) and is the trust anchor
 * for write-time deadline enforcement (§9.9). One attempt per (assignment,
 * user); composite-unique leads with `assignment_id`.
 */
@Entity('assignment_attempts')
@Unique('uq_attempt', ['assignmentId', 'userId'])
export class AssignmentAttempt extends BaseEntity {
  @ManyToOne(() => Assignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment!: Assignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deadline_at' })
  deadlineAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'submitted_at' })
  submittedAt!: Date | null;

  @Column({ type: 'enum', enum: AttemptStatus, default: AttemptStatus.IN_PROGRESS })
  status!: AttemptStatus;
}
