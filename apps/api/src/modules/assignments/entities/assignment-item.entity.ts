import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AssignmentItemGradingMode } from '../enums/assignment-item-grading-mode.enum';
import { AssignmentItemKind } from '../enums/assignment-item-kind.enum';
import { AssignmentProblem } from './assignment-problem.entity';
import { Assignment } from './assignment.entity';
import { McqOption } from './mcq-option.entity';

/**
 * A single item within an assignment: coding | mcq | quiz. A coding item wraps
 * an AssignmentProblem 1:1 (`assignmentProblemId`), keeping the existing judge
 * path untouched; mcq/quiz items carry their own prompt + options/responses
 * (docs/REDESIGN.md §5.3).
 */
@Entity('assignment_items')
@Index('idx_item_assignment_order', ['assignmentId', 'orderIndex'])
export class AssignmentItem extends BaseEntity {
  @ManyToOne(() => Assignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment!: Assignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId!: string;

  @Column({ type: 'enum', enum: AssignmentItemKind })
  kind!: AssignmentItemKind;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex!: number;

  @Column({ type: 'float', default: 0, name: 'max_points' })
  maxPoints!: number;

  @Column({ type: 'text', default: '' })
  prompt!: string;

  @Column({ type: 'enum', enum: AssignmentItemGradingMode, name: 'grading_mode' })
  gradingMode!: AssignmentItemGradingMode;

  // MCQ only — author-set single vs. multi select. Never derived from the
  // correct-answer count (that would leak how many options are correct).
  @Column({ type: 'boolean', default: false, name: 'allow_multiple' })
  allowMultiple!: boolean;

  // Coding items wrap an AssignmentProblem 1:1. Nullable so mcq/quiz items and
  // the insert-time FK cycle (AP ↔ item) are both satisfied.
  @OneToOne(() => AssignmentProblem, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_problem_id' })
  assignmentProblem!: AssignmentProblem | null;

  @Column({ type: 'uuid', nullable: true, name: 'assignment_problem_id' })
  assignmentProblemId!: string | null;

  // MCQ options (inverse side; no schema impact — the FK lives on mcq_options).
  @OneToMany(() => McqOption, (o) => o.item)
  options!: McqOption[];
}
