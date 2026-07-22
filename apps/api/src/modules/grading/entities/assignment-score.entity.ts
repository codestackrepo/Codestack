import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Assignment } from '../../assignments/entities/assignment.entity';
import { User } from '../../users/entities/user.entity';

@Entity('assignment_scores')
@Unique('uq_assignment_score', ['assignmentId', 'userId'])
export class AssignmentScore extends BaseEntity {
  // No dedicated index here — the composite unique below (uq_assignment_score)
  // leads with assignment_id, so it already serves single-column lookups.
  @ManyToOne(() => Assignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment!: Assignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId!: string;

  @Index('idx_assignment_score_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'float', default: 0, name: 'final_score' })
  finalScore!: number;

  @Column({ type: 'text', default: '' })
  feedback!: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by_id' })
  createdById!: string | null;
}
