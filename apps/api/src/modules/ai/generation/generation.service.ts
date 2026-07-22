import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { AiConfig } from '../../../config/configuration';
import { Problem } from '../../problems/entities/problem.entity';
import { GeneratedProblemLinkStatus, GenerationStatus } from '../enums/ai.enums';
import { GeneratedProblemLink, PerLanguagePass } from '../entities/generated-problem-link.entity';
import { GenerationRequest, TokenUsage } from '../entities/generation-request.entity';
import { LLM_PROVIDER, LlmProvider, LlmUsage } from '../llm/llm-provider.interface';
import {
  GeneratedProblem,
  GeneratedProblemSchema,
  GeneratedProblemSet,
  GeneratedProblemSetSchema,
} from '../llm/schemas/generated-problem.schema';
import { MaterializerService } from './materializer.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SelfValidationService } from './self-validation.service';

const MAX_REPAIR_ATTEMPTS = 2;
const MAX_REGENERATE_ATTEMPTS = 2;

// Zod v4 natively generates the provider-facing JSON Schema — no external
// converter needed (and zod-to-json-schema, deprecated in favor of this,
// doesn't type-check cleanly against v4's schema types anyway).
const PROBLEM_SET_SCHEMA = z.toJSONSchema(GeneratedProblemSetSchema) as Record<string, unknown>;
const SINGLE_PROBLEM_SCHEMA = z.toJSONSchema(GeneratedProblemSchema) as Record<string, unknown>;

interface CandidateOutcome {
  problem: Problem | null;
  perLanguagePass: PerLanguagePass;
  finalDraft: GeneratedProblem;
  usage: LlmUsage[];
}

/**
 * Orchestrates one generation request end to end: LLM call (with a bounded
 * schema-repair loop) → per-problem self-validation through the real judge
 * → bounded per-problem regeneration on failure → materialization. Runs
 * inside the `ai-generate` BullMQ processor, never inline on the request path.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly ai: AiConfig;

  constructor(
    config: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly selfValidation: SelfValidationService,
    private readonly materializer: MaterializerService,
    @InjectRepository(GenerationRequest) private readonly requests: Repository<GenerationRequest>,
    @InjectRepository(GeneratedProblemLink)
    private readonly links: Repository<GeneratedProblemLink>,
  ) {
    this.ai = config.getOrThrow<AiConfig>('ai');
  }

  async run(generationRequestId: string, material: string): Promise<void> {
    const request = await this.requests.findOneByOrFail({ id: generationRequestId });
    await this.setStatus(request, GenerationStatus.GENERATING);

    const allUsage: LlmUsage[] = [];
    try {
      const { data: problemSet, usage: genUsage } = await this.generateWithRepair(
        request.topic,
        material,
        request.requestedCount,
      );
      allUsage.push(...genUsage);

      await this.setStatus(request, GenerationStatus.VALIDATING);

      let readyCount = 0;
      for (const candidate of problemSet.problems) {
        const outcome = await this.validateWithRegeneration(request, candidate, material);
        allUsage.push(...outcome.usage);
        await this.links.save(
          this.links.create({
            generationRequestId: request.id,
            problemId: outcome.problem?.id ?? null,
            status: outcome.problem
              ? GeneratedProblemLinkStatus.VALIDATED
              : GeneratedProblemLinkStatus.DISCARDED,
            perLanguagePass: outcome.perLanguagePass,
            draft: outcome.finalDraft,
          }),
        );
        if (outcome.problem) readyCount++;
      }

      const tokenUsage = this.aggregateUsage(allUsage);
      await this.finish(
        request,
        readyCount > 0 ? GenerationStatus.READY : GenerationStatus.FAILED,
        tokenUsage,
        readyCount > 0 ? null : 'Every generated problem failed self-validation',
      );
    } catch (err) {
      this.logger.warn(`Generation ${generationRequestId} failed: ${String(err)}`);
      const tokenUsage = allUsage.length ? this.aggregateUsage(allUsage) : null;
      await this.finish(
        request,
        GenerationStatus.FAILED,
        tokenUsage,
        (err as Error).message.slice(0, 255),
      );
      throw err;
    }
  }

  private async generateWithRepair(
    topic: string,
    material: string,
    count: number,
  ): Promise<{ data: GeneratedProblemSet; usage: LlmUsage[] }> {
    let messages = this.promptBuilder.buildMessages(topic, material, count);
    const usages: LlmUsage[] = [];

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1; attempt++) {
      const result = await this.llm.generateStructured<unknown>(
        messages,
        PROBLEM_SET_SCHEMA,
        'GeneratedProblemSet',
        { maxOutputTokens: this.ai.maxOutputTokens, timeoutMs: this.ai.timeoutMs },
      );
      usages.push(result.usage);

      const parsed = GeneratedProblemSetSchema.safeParse(result.data);
      if (parsed.success) {
        return { data: parsed.data, usage: usages };
      }
      if (attempt === MAX_REPAIR_ATTEMPTS + 1) {
        throw new Error(
          `LLM output failed schema validation after ${attempt} attempt(s): ${parsed.error.message}`,
        );
      }
      messages = this.promptBuilder.buildRepairMessages(messages, parsed.error.message);
    }
    /* istanbul ignore next -- loop above always returns or throws */
    throw new Error('unreachable');
  }

  private async validateWithRegeneration(
    request: GenerationRequest,
    candidate: GeneratedProblem,
    material: string,
  ): Promise<CandidateOutcome> {
    let draft = candidate;
    const usages: LlmUsage[] = [];

    for (let attempt = 0; attempt <= MAX_REGENERATE_ATTEMPTS; attempt++) {
      const result = await this.selfValidation.validate(draft);

      if (this.selfValidation.isReady(result.perLanguagePass)) {
        const problem = await this.materializer.materialize(
          draft,
          result.perLanguagePass,
          request.id,
          request.userId,
        );
        return {
          problem,
          perLanguagePass: result.perLanguagePass,
          finalDraft: draft,
          usage: usages,
        };
      }

      if (attempt === MAX_REGENERATE_ATTEMPTS) {
        return {
          problem: null,
          perLanguagePass: result.perLanguagePass,
          finalDraft: draft,
          usage: usages,
        };
      }

      const messages = this.promptBuilder.buildRepairMessages(
        this.promptBuilder.buildMessages(request.topic, material, 1),
        result.failureReason ?? 'self-validation failed against the real judge',
      );
      const regen = await this.llm.generateStructured<unknown>(
        messages,
        SINGLE_PROBLEM_SCHEMA,
        'GeneratedProblem',
        { maxOutputTokens: this.ai.maxOutputTokens, timeoutMs: this.ai.timeoutMs },
      );
      usages.push(regen.usage);

      const parsed = GeneratedProblemSchema.safeParse(regen.data);
      if (!parsed.success) {
        return {
          problem: null,
          perLanguagePass: result.perLanguagePass,
          finalDraft: draft,
          usage: usages,
        };
      }
      draft = parsed.data;
    }
    /* istanbul ignore next -- loop above always returns */
    throw new Error('unreachable');
  }

  private aggregateUsage(usages: LlmUsage[]): TokenUsage {
    return usages.reduce<TokenUsage>(
      (acc, u) => ({
        inputTokens: acc.inputTokens + u.inputTokens,
        outputTokens: acc.outputTokens + u.outputTokens,
        costUsd: acc.costUsd + u.costUsd,
        model: u.model,
      }),
      { inputTokens: 0, outputTokens: 0, costUsd: 0, model: this.ai.model },
    );
  }

  private async setStatus(request: GenerationRequest, status: GenerationStatus): Promise<void> {
    request.status = status;
    await this.requests.save(request);
  }

  private async finish(
    request: GenerationRequest,
    status: GenerationStatus,
    tokenUsage: TokenUsage | null,
    errorReason: string | null,
  ): Promise<void> {
    request.status = status;
    request.tokenUsage = tokenUsage;
    request.model = tokenUsage?.model ?? request.model;
    request.errorReason = errorReason;
    request.completedAt = new Date();
    await this.requests.save(request);
  }
}
