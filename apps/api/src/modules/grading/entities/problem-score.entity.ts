import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AssignmentProblem } from '../../assignments/entities/assignment-problem.entity';
import { Submission } from '../../submissions/entities/submission.entity';
import { User } from '../../users/entities/user.entity';

@Entity('problem_scores')
@Unique('uq_problem_score', ['assignmentProblemId', 'userId'])
export class ProblemScore extends BaseEntity {
  // No dedicated index on assignment_problem_id alone: the composite unique
  // constraint below (uq_problem_score) leads with this column, so Postgres
  // already serves single-column lookups from it — a separate index would
  // just double the write cost on this hot (every-submission) table.
  @ManyToOne(() => AssignmentProblem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_problem_id' })
  assignmentProblem!: AssignmentProblem;

  @Column({ type: 'uuid', name: 'assignment_problem_id' })
  assignmentProblemId!: string;

  @Index('idx_problem_score_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Submission, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'submission_id' })
  submission!: Submission | null;

  @Column({ type: 'uuid', nullable: true, name: 'submission_id' })
  submissionId!: string | null;

  @Column({ type: 'float', default: 0 })
  score!: number;

  @Column({ type: 'int', default: 0, name: 'submission_count' })
  submissionCount!: number;

  @Column({ type: 'text', default: '' })
  feedback!: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by_id' })
  createdById!: string | null;
}
