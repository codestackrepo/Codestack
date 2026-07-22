import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { SubmissionStatus } from '../enums/submission-status.enum';
import { Submission } from './submission.entity';

/**
 * Per-testcase verdict for a submission (an improvement over the original,
 * which stored only an aggregate). Unique (submission, testcase) enables
 * idempotent upserts on worker retries.
 */
@Entity('test_case_results')
@Unique('uq_tcr_submission_testcase', ['submissionId', 'testCaseId'])
@Index('idx_tcr_submission_ordinal', ['submissionId', 'ordinal'])
export class TestCaseResult extends BaseEntity {
  @ManyToOne(() => Submission, (s) => s.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission!: Submission;

  @Column({ type: 'uuid', name: 'submission_id' })
  submissionId!: string;

  @Column({ type: 'uuid', name: 'test_case_id', nullable: true })
  testCaseId!: string | null;

  @Column({ type: 'int' })
  ordinal!: number;

  @Column({ type: 'enum', enum: SubmissionStatus })
  verdict!: SubmissionStatus;

  @Column({ type: 'int', default: 0, name: 'runtime_ms' })
  runtimeMs!: number;

  @Column({ type: 'bigint', default: 0, name: 'memory_bytes' })
  memoryBytes!: string;

  @Column({ type: 'int', nullable: true, name: 'exit_code' })
  exitCode!: number | null;

  @Column({ type: 'text', default: '' })
  stdout!: string;

  @Column({ type: 'text', default: '' })
  stderr!: string;

  @Column({ type: 'text', default: '', name: 'output_extracted' })
  outputExtracted!: string;

  @Column({ type: 'boolean', default: false })
  truncated!: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_sample' })
  isSample!: boolean;
}
