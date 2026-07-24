import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SUBMISSION_FINALIZED,
  SubmissionFinalizedEvent,
} from '../../common/events/submission-events';
import { GamificationService } from './gamification.service';

/**
 * Second SUBMISSION_FINALIZED subscriber (coexists with GradingService's). Fires
 * in the worker where the judge finalizes jobs. Errors are swallowed + logged so
 * a gamification failure never crashes the judge/grading pipeline (EventEmitter2
 * only logs async-listener rejections).
 */
@Injectable()
export class GamificationListener {
  private readonly logger = new Logger(GamificationListener.name);

  constructor(private readonly gamification: GamificationService) {}

  @OnEvent(SUBMISSION_FINALIZED)
  async onSubmissionFinalized(event: SubmissionFinalizedEvent): Promise<void> {
    try {
      await this.gamification.handleFinalizedSubmission(event.submissionId);
    } catch (err) {
      this.logger.error(`Gamification failed for submission ${event.submissionId}: ${String(err)}`);
    }
  }
}
