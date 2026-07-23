import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { AssignmentItem } from './assignment-item.entity';

/**
 * A student's free-text answer to a quiz item. `awardedPoints` is null until a
 * professor grades it (issue #21). Composite-unique leads with `item_id`.
 */
@Entity('quiz_responses')
@Unique('uq_quiz_response', ['itemId', 'userId'])
export class QuizResponse extends BaseEntity {
  @ManyToOne(() => AssignmentItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item!: AssignmentItem;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'text', default: '', name: 'answer_text' })
  answerText!: string;

  @Column({ type: 'float', nullable: true, name: 'awarded_points' })
  awardedPoints!: number | null;

  @Column({ type: 'text', default: '' })
  feedback!: string;

  @Column({ type: 'uuid', nullable: true, name: 'graded_by_id' })
  gradedById!: string | null;
}
