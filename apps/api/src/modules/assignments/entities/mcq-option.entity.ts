import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AssignmentItem } from './assignment-item.entity';

/**
 * One selectable option of an MCQ item. `isCorrect` is a staff-only field and
 * is NEVER serialized to students (enforced by the separate student/staff DTOs
 * in issue #20).
 */
@Entity('mcq_options')
export class McqOption extends BaseEntity {
  @ManyToOne(() => AssignmentItem, (item) => item.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item!: AssignmentItem;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'boolean', default: false, name: 'is_correct' })
  isCorrect!: boolean;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex!: number;
}
