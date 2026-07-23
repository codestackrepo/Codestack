import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ProblemsModule } from '../problems/problems.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { QUEUE_JUDGE } from '../../queue/queue.constants';
import { CodeExecutionController } from './code-execution.controller';
import { DriverSynthService } from './driver-synth/driver-synth.service';
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
    ProblemsModule,
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
    DriverSynthService,
    JudgeService,
    CodeExecutionService,
    RunService,
    SubmissionEventsService,
    SubmissionsGateway,
    JudgeProcessor,
  ],
  // DriverSynthService is a dependency-free, deterministic judge-driver generator.
  // It was lifted out of the (now-disabled) AI module so the capability survives;
  // exported here so any future consumer (e.g. seeding) can synthesize drivers
  // without pulling in AiModule. See driver-synth/io-spec.types.ts.
  exports: [JudgeService, ExecutorService, VerdictService, DriverMergeService, DriverSynthService],
})
export class CodeExecutionModule {}
