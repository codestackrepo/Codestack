import { Column, Entity, Index, JoinColumn, ManyToMany, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Problem } from './problem.entity';

@Entity('user_problem_lists')
@Unique('uq_user_list_name', ['userId', 'listName'])
export class UserProblemList extends BaseEntity {
  @Index('idx_problem_list_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, name: 'list_name' })
  listName!: string;

  @ManyToMany(() => Problem, (problem) => problem.lists)
  problems!: Problem[];
}
