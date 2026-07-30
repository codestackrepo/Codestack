import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
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
// live-configurable via judgeConfig.workerConcurrency (see onApplicationBootstrap).
@Processor(QUEUE_JUDGE, { concurrency: 8, limiter: { max: 100, duration: 1000 } })
export class JudgeProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(JudgeProcessor.name);

  constructor(
    private readonly judge: JudgeService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /**
   * `onApplicationBootstrap`, not `onModuleInit` — @nestjs/bullmq attaches the
   * Worker from its own `onModuleInit`, so reading `this.worker` there is a race
   * decided by module registration order. This module happens to be registered
   * late enough to have got away with it; MailProcessor (#103) was not, and threw
   * "Worker has not yet been initialized" at boot. Same fix, applied to both.
   */
  onApplicationBootstrap(): void {
    const judgeConfig = this.config.getOrThrow<JudgeConfig>('judge');
    this.worker.concurrency = judgeConfig.workerConcurrency;
  }

  async process(job: Job<JudgeJobData>): Promise<void> {
    this.logger.log(`Judging submission ${job.data.submissionId} (job ${job.id})`);
    await this.judge.judge(job.data.submissionId);
  }
}
