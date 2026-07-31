import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Language } from '../../../common/enums/language.enum';
import { AssignmentProblem } from '../../assignments/entities/assignment-problem.entity';
import { Problem } from '../../problems/entities/problem.entity';
import { User } from '../../users/entities/user.entity';
import { SubmissionContext } from '../enums/submission-context.enum';
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
@Index('idx_submission_user_problem_created', ['userId', 'problemId', 'createdAt'])
@Index('idx_submission_status', ['status'])
export class Submission extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Denormalized tenant FK (stamped at submit time from the actor's org) so the
  // actor-less judge worker + @OnEvent listeners never re-derive org (#58).
  @Index('idx_submission_organization')
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  // Discriminates the submission target (practice vs assignment). Default
  // 'assignment' preserves legacy behavior (migration 5, issue #25).
  // varchar + CHECK since #69 (migration 1785580000000), not a native enum — the
  // house rule, so a future context value is an ordinary reversible migration.
  @Column({ type: 'varchar', length: 20, default: SubmissionContext.ASSIGNMENT })
  context!: SubmissionContext;

  @ManyToOne(() => AssignmentProblem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assignment_problem_id' })
  assignmentProblem!: AssignmentProblem;

  // nullable in DB (migration 5); typed non-null until #26 introduces the
  // practice writer that branches on context.
  @Column({ type: 'uuid', name: 'assignment_problem_id', nullable: true })
  assignmentProblemId!: string;

  // Practice target — a standalone library problem. Null for assignment
  // submissions (exactly-one-target enforced by chk_submission_single_target).
  @ManyToOne(() => Problem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem | null;

  @Column({ type: 'uuid', name: 'problem_id', nullable: true })
  problemId!: string | null;

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
