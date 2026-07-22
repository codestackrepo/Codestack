import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Problem } from '../../problems/entities/problem.entity';
import { GeneratedProblemLinkStatus } from '../enums/ai.enums';
import { GenerationRequest } from './generation-request.entity';
import { GeneratedProblem } from '../llm/schemas/generated-problem.schema';

export interface PerLanguagePass {
  python?: boolean;
  javascript?: boolean;
  java?: boolean;
  cpp?: boolean;
}

/**
 * Joins a GenerationRequest to the Problems it produced. `problem` stays
 * null until validation passes and the row is materialized; `draft` retains
 * the full structured LLM output so a discarded/unsaved attempt is still
 * inspectable.
 */
@Entity('generated_problem_links')
@Index('idx_gpl_request_status', ['generationRequestId', 'status'])
export class GeneratedProblemLink extends BaseEntity {
  @ManyToOne(() => GenerationRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_request_id' })
  generationRequest!: GenerationRequest;

  @Column({ type: 'uuid', name: 'generation_request_id' })
  generationRequestId!: string;

  @ManyToOne(() => Problem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'problem_id' })
  problem!: Problem | null;

  @Column({ type: 'uuid', nullable: true, name: 'problem_id' })
  problemId!: string | null;

  @Column({ type: 'enum', enum: GeneratedProblemLinkStatus })
  status!: GeneratedProblemLinkStatus;

  @Column({ type: 'jsonb', name: 'per_language_pass' })
  perLanguagePass!: PerLanguagePass;

  @Column({ type: 'jsonb' })
  draft!: GeneratedProblem;
}
