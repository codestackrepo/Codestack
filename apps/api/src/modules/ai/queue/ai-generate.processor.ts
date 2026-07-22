import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_AI_GENERATE } from '../../../queue/queue.constants';
import { GenerationService } from '../generation/generation.service';

export interface AiGenerateJobData {
  generationRequestId: string;
  /** Extracted study-material text — travels with the job, never persisted in Postgres. */
  material: string;
}

/**
 * Low concurrency by design: each job drives up to 4 languages × up to 13
 * testcases × up to (1 + regenerate attempts) LLM/judge round trips, so a
 * handful of concurrent generations already saturates Piston/LLM budgets far
 * before the judge queue's own concurrency would.
 */
@Processor(QUEUE_AI_GENERATE, { concurrency: 2 })
export class AiGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(AiGenerateProcessor.name);

  constructor(private readonly generation: GenerationService) {
    super();
  }

  async process(job: Job<AiGenerateJobData>): Promise<void> {
    this.logger.log(`Generating for request ${job.data.generationRequestId} (job ${job.id})`);
    await this.generation.run(job.data.generationRequestId, job.data.material);
  }
}
