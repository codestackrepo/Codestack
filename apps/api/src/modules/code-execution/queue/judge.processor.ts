import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { JudgeConfig } from '../../../config/configuration';
import { QUEUE_JUDGE } from '../../../queue/queue.constants';
import { JudgeService } from '../services/judge.service';

interface JudgeJobData {
  submissionId: string;
}

// The queue-side rate limiter is a static safety cap on Piston throughput and
// rarely needs runtime tuning, so it mirrors the .env.sample defaults here
// (BullMQ bakes `limiter` into Worker construction, which — unlike
// `concurrency` — cannot be adjusted after the fact). `concurrency` below IS
// live-configurable via judgeConfig.workerConcurrency (see onModuleInit).
@Processor(QUEUE_JUDGE, { concurrency: 8, limiter: { max: 100, duration: 1000 } })
export class JudgeProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private readonly judge: JudgeService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onModuleInit(): void {
    const judgeConfig = this.config.getOrThrow<JudgeConfig>('judge');
    this.worker.concurrency = judgeConfig.workerConcurrency;
  }

  async process(job: Job<JudgeJobData>): Promise<void> {
    this.logger.log(`Judging submission ${job.data.submissionId} (job ${job.id})`);
    await this.judge.judge(job.data.submissionId);
  }
}
