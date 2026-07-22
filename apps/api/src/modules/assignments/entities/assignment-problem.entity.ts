import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Problem } from '../../problems/entities/problem.entity';
import { Assignment } from './assignment.entity';
import { ProblemTemplate } from './problem-template.entity';

@Entity('assignment_problems')
@Unique('uq_assignment_problem', ['assignmentId', 'problemId'])
export class AssignmentProblem extends BaseEntity {
  // No dedicated index here — the composite unique below (uq_assignment_problem)
  // leads with assignment_id, so it already serves single-column lookups.
  @ManyToOne(() => Assignment, (a) => a.assignmentProblems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment!: Assignment;

  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId!: string;

  @ManyToOne(() => Problem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem;

  @Column({ type: 'uuid', name: 'problem_id' })
  problemId!: string;

  // Max points for this problem within the assignment.
  @Column({ type: 'float', default: 0 })
  score!: number;

  // true = referenced library problem; false = cloned/owned copy.
  @Column({ type: 'boolean', default: false, name: 'is_imported' })
  isImported!: boolean;

  @OneToMany(() => ProblemTemplate, (t) => t.assignmentProblem)
  languageTemplates!: ProblemTemplate[];
}
