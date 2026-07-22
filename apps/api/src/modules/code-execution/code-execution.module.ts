import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssignmentsModule } from '../assignments/assignments.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { QUEUE_JUDGE } from '../../queue/queue.constants';
import { CodeExecutionController } from './code-execution.controller';
import { ExecutorService } from './executors/executor.service';
import { PistonClient } from './piston/piston.client';
import { JudgeProcessor } from './queue/judge.processor';
import { SubmissionEventsService } from './realtime/submission-events.service';
import { SubmissionsGateway } from './realtime/submissions.gateway';
import { CodeExecutionService } from './services/code-execution.service';
import { DriverMergeService } from './services/driver-merge.service';
import { JudgeService } from './services/judge.service';
import { NormalizerService } from './services/normalizer.service';
import { RunService } from './services/run.service';
import { VerdictService } from './services/verdict.service';

@Module({
  imports: [
    SubmissionsModule,
    AssignmentsModule,
    JwtModule.register({}),
    BullModule.registerQueue({
      name: QUEUE_JUDGE,
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    }),
  ],
  controllers: [CodeExecutionController],
  providers: [
    PistonClient,
    ExecutorService,
    NormalizerService,
    VerdictService,
    DriverMergeService,
    JudgeService,
    CodeExecutionService,
    RunService,
    SubmissionEventsService,
    SubmissionsGateway,
    JudgeProcessor,
  ],
  exports: [JudgeService, ExecutorService, VerdictService, DriverMergeService],
})
export class CodeExecutionModule {}
