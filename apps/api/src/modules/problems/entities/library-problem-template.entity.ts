import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Language } from '../../../common/enums/language.enum';
import { User } from '../../users/entities/user.entity';
import { Problem } from './problem.entity';

/**
 * Library-level per-language template (starter + driver code). NOTE: at judge
 * time the per-assignment-problem template (assignments module) is used; this
 * is the reusable library copy.
 */
@Entity('library_problem_templates')
@Index('idx_lib_template_problem_lang', ['problemId', 'language'])
export class LibraryProblemTemplate extends BaseEntity {
  @ManyToOne(() => Problem, (p) => p.libraryTemplates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem;

  @Column({ type: 'uuid', name: 'problem_id' })
  problemId!: string;

  @Column({ type: 'enum', enum: Language })
  language!: Language;

  @Column({ type: 'text', name: 'starter_code', default: '' })
  starterCode!: string;

  @Column({ type: 'text', name: 'driver_code', default: '' })
  driverCode!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by_id' })
  createdById!: string | null;
}
