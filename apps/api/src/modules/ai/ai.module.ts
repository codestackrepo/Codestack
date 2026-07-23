import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_AI_GENERATE } from '../../queue/queue.constants';
import { BillingModule } from '../billing/billing.module';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { AiController } from './ai.controller';
import { GeneratedProblemLink } from './entities/generated-problem-link.entity';
import { GenerationRequest } from './entities/generation-request.entity';
import { GenerationRequestService } from './generation/generation-request.service';
import { GenerationService } from './generation/generation.service';
import { MaterializerService } from './generation/materializer.service';
import { PromptBuilderService } from './generation/prompt-builder.service';
import { SelfValidationService } from './generation/self-validation.service';
import { IngestionService } from './ingestion/ingestion.service';
import { LlmModule } from './llm/llm.module';
import { AiGenerateProcessor } from './queue/ai-generate.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([GenerationRequest, GeneratedProblemLink]),
    LlmModule,
    CodeExecutionModule,
    BillingModule,
    BullModule.registerQueue({
      name: QUEUE_AI_GENERATE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      },
    }),
  ],
  controllers: [AiController],
  providers: [
    IngestionService,
    // DriverSynthService is now provided/exported by CodeExecutionModule (imported
    // above) — it was lifted out of AiModule so the deterministic driver generator
    // survives AI being disabled.
    PromptBuilderService,
    SelfValidationService,
    MaterializerService,
    GenerationService,
    GenerationRequestService,
    AiGenerateProcessor,
  ],
})
export class AiModule {}
