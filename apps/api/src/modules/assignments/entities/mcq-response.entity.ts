import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { AssignmentItem } from './assignment-item.entity';

/**
 * A student's answer to an MCQ item. `awardedPoints` is auto-scored
 * server-side and is a staff-only field — hidden from the student until grade
 * publish (issue #21 owns the reveal). Composite-unique leads with `item_id`,
 * so it also serves single-column item lookups (no separate index).
 */
@Entity('mcq_responses')
@Unique('uq_mcq_response', ['itemId', 'userId'])
export class McqResponse extends BaseEntity {
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

  @Column({ type: 'jsonb', name: 'selected_option_ids' })
  selectedOptionIds!: string[];

  @Column({ type: 'float', default: 0, name: 'awarded_points' })
  awardedPoints!: number;
}
