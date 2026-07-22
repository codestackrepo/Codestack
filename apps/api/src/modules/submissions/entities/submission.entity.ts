import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Language } from '../../../common/enums/language.enum';
import { AssignmentProblem } from '../../assignments/entities/assignment-problem.entity';
import { User } from '../../users/entities/user.entity';
import { SubmissionStatus } from '../enums/submission-status.enum';
import { TestCaseResult } from './test-case-result.entity';

export interface FailedTestcaseDetail {
  input: string;
  expected: string;
  output: string;
  error: string;
  stdout: string;
}

@Entity('submissions')
@Index('idx_submission_user_ap_created', ['userId', 'assignmentProblemId', 'createdAt'])
@Index('idx_submission_status', ['status'])
export class Submission extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => AssignmentProblem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_problem_id' })
  assignmentProblem!: AssignmentProblem;

  @Column({ type: 'uuid', name: 'assignment_problem_id' })
  assignmentProblemId!: string;

  @Column({ type: 'enum', enum: Language })
  language!: Language;

  @Column({ type: 'text', name: 'user_code' })
  userCode!: string;

  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.PENDING })
  status!: SubmissionStatus;

  @Column({ type: 'int', default: 0, name: 'passed_testcase_count' })
  passedTestcaseCount!: number;

  @Column({ type: 'int', default: 0, name: 'total_testcase_count' })
  totalTestcaseCount!: number;

  @Column({ type: 'jsonb', nullable: true, name: 'failed_testcase_detail' })
  failedTestcaseDetail!: FailedTestcaseDetail | null;

  @Column({ type: 'int', nullable: true, name: 'runtime_ms' })
  runtimeMs!: number | null;

  @Column({ type: 'bigint', nullable: true, name: 'memory_bytes' })
  memoryBytes!: string | null;

  @OneToMany(() => TestCaseResult, (r) => r.submission)
  results!: TestCaseResult[];
}
