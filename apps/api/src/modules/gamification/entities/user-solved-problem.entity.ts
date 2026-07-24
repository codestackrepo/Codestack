import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Problem } from '../../problems/entities/problem.entity';
import { User } from '../../users/entities/user.entity';

/**
 * First-solve guard: one row per (user, problem). The unique constraint makes
 * the award path idempotent — a second Accept of the same problem inserts
 * nothing and re-awards nothing. `difficulty` is a snapshot at solve time so the
 * history/breakdown can be rebuilt without joining `problems`.
 */
@Entity('user_solved_problems')
@Unique('uq_user_solved_problem', ['userId', 'problemId'])
export class UserSolvedProblem extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Problem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem;

  @Column({ type: 'uuid', name: 'problem_id' })
  problemId!: string;

  @Column({ type: 'varchar', length: 16 })
  difficulty!: string;

  @Column({ type: 'timestamptz', name: 'first_solved_at', default: () => 'now()' })
  firstSolvedAt!: Date;
}
