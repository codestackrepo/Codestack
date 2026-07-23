import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ASSIGNMENT_SWEEP_SCHEDULER_ID,
  JOB_ASSIGNMENT_SWEEP,
  QUEUE_ASSIGNMENT_SWEEP,
} from '../../../queue/queue.constants';
import { AssignmentsService } from '../assignments.service';

/**
 * Repeatable ~60s sweep that drives zero-traffic assignment status transitions
 * (#38) and timed-test attempt auto-submit (#39). Runs in the worker (and the
 * HTTP process — both boot AppModule); BullMQ single-delivers each tick and the
 * sweeps are idempotent, so double-processing is harmless.
 */
@Processor(QUEUE_ASSIGNMENT_SWEEP)
export class AssignmentSweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AssignmentSweepProcessor.name);

  constructor(
    private readonly assignments: AssignmentsService,
    @InjectQueue(QUEUE_ASSIGNMENT_SWEEP) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Idempotent: a stable scheduler id means restarts never stack duplicates.
    await this.queue.upsertJobScheduler(
      ASSIGNMENT_SWEEP_SCHEDULER_ID,
      { every: 60_000 },
      { name: JOB_ASSIGNMENT_SWEEP },
    );
  }

  async process(): Promise<void> {
    // A throwing tick must not poison the repeat schedule — the next tick retries.
    try {
      const swept = await this.assignments.sweepStatuses();
      const finalized = await this.assignments.finalizeExpiredAttempts();
      if (swept || finalized) {
        this.logger.log(
          `Swept ${swept} status transition(s), auto-submitted ${finalized} attempt(s)`,
        );
      }
    } catch (err) {
      this.logger.error(`Assignment sweep failed: ${String(err)}`);
    }
  }
}
