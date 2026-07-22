import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Submission } from './submission.entity';

export enum ExecutionJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Durable audit of a judge job (replaces the original's dead CodeExecutionJob).
 * queueJobId ties the row to its BullMQ job and is the idempotency key.
 */
@Entity('execution_jobs')
export class ExecutionJob extends BaseEntity {
  @Index('idx_execution_job_submission')
  @ManyToOne(() => Submission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission!: Submission;

  @Column({ type: 'uuid', name: 'submission_id' })
  submissionId!: string;

  // `unique: true` on the column already creates one unique index — an
  // additional named @Index({unique:true}) here would just duplicate it.
  @Column({ type: 'varchar', length: 255, name: 'queue_job_id', unique: true })
  queueJobId!: string;

  @Index('idx_execution_job_status')
  @Column({ type: 'enum', enum: ExecutionJobStatus, default: ExecutionJobStatus.QUEUED })
  status!: ExecutionJobStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'started_at' })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'finished_at' })
  finishedAt!: Date | null;
}
