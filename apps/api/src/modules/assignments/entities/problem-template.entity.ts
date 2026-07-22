import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Language } from '../../../common/enums/language.enum';
import { AssignmentProblem } from './assignment-problem.entity';

/**
 * Per-assignment-problem, per-language template. THIS is what the judge reads:
 * `driverCode` is the harness containing the `{{user_code}}` placeholder;
 * `starterCode` is the boilerplate shown in the editor.
 */
@Entity('problem_templates')
@Index('idx_template_ap_lang', ['assignmentProblemId', 'language'], { unique: true })
export class ProblemTemplate extends BaseEntity {
  @ManyToOne(() => AssignmentProblem, (ap) => ap.languageTemplates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_problem_id' })
  assignmentProblem!: AssignmentProblem;

  @Column({ type: 'uuid', name: 'assignment_problem_id' })
  assignmentProblemId!: string;

  @Column({ type: 'enum', enum: Language })
  language!: Language;

  @Column({ type: 'text', name: 'driver_code', default: '' })
  driverCode!: string;

  @Column({ type: 'text', name: 'starter_code', default: '' })
  starterCode!: string;
}
