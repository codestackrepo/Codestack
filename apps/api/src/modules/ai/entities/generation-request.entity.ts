import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { GenerationSourceType, GenerationStatus } from '../enums/ai.enums';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

@Entity('generation_requests')
@Index('idx_generation_request_user_created', ['userId', 'createdAt'])
export class GenerationRequest extends BaseEntity {
  @Index('idx_generation_request_user')
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: GenerationSourceType, name: 'source_type' })
  sourceType!: GenerationSourceType;

  // A hash/reference to the uploaded file, never the raw content itself.
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'source_ref' })
  sourceRef!: string | null;

  @Column({ type: 'varchar', length: 255 })
  topic!: string;

  @Index('idx_generation_request_status')
  @Column({ type: 'enum', enum: GenerationStatus, default: GenerationStatus.QUEUED })
  status!: GenerationStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'token_usage' })
  tokenUsage!: TokenUsage | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'error_reason' })
  errorReason!: string | null;

  @Column({ type: 'smallint', default: 2, name: 'requested_count' })
  requestedCount!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'completed_at' })
  completedAt!: Date | null;
}
