import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AiConfig } from '../../../config/configuration';
import { JOB_AI_GENERATE, QUEUE_AI_GENERATE } from '../../../queue/queue.constants';
import { Entitlement } from '../../billing/enums/billing.enums';
import { EntitlementService } from '../../billing/services/entitlement.service';
import { CreateGenerationDto } from '../dto/create-generation.dto';
import { GeneratedProblemLink } from '../entities/generated-problem-link.entity';
import { GenerationRequest } from '../entities/generation-request.entity';
import { GeneratedProblemLinkStatus, GenerationStatus } from '../enums/ai.enums';
import { IngestionService, UploadedFileLike } from '../ingestion/ingestion.service';
import { AiGenerateJobData } from '../queue/ai-generate.processor';

const DEFAULT_REQUESTED_COUNT = 2;

/**
 * The synchronous, request-path half of the AI module: entitlement check,
 * ingest/hash the upload, create the durable `GenerationRequest` row, and
 * enqueue the async job. The actual LLM/self-validation work
 * (`GenerationService`) only ever runs inside the `ai-generate` worker,
 * never inline here.
 *
 * Entitlement gating lives here rather than in the Billing module: a paid
 * subscription (`EntitlementService`, owned by Billing) OR this module's own
 * free-tier monthly quota (counted from `GenerationRequest`, which Billing
 * has no knowledge of) unlocks generation. This keeps the dependency
 * one-way — AiModule depends on BillingModule, never the reverse.
 */
@Injectable()
export class GenerationRequestService {
  private readonly ai: AiConfig;

  constructor(
    config: ConfigService,
    private readonly ingestion: IngestionService,
    private readonly entitlements: EntitlementService,
    @InjectQueue(QUEUE_AI_GENERATE) private readonly queue: Queue<AiGenerateJobData>,
    @InjectRepository(GenerationRequest) private readonly requests: Repository<GenerationRequest>,
    @InjectRepository(GeneratedProblemLink)
    private readonly links: Repository<GeneratedProblemLink>,
  ) {
    this.ai = config.getOrThrow<AiConfig>('ai');
  }

  async create(
    dto: CreateGenerationDto,
    file: UploadedFileLike | undefined,
    userId: string,
  ): Promise<GenerationRequest> {
    if (!file && !dto.prompt) {
      throw new BadRequestException('Provide either a file upload or a "prompt" field');
    }
    await this.assertEntitled(userId);

    const material = file
      ? await this.ingestion.ingestFile(file)
      : await this.ingestion.ingestPrompt(dto.prompt as string);

    const request = await this.requests.save(
      this.requests.create({
        userId,
        sourceType: material.sourceType,
        sourceRef: material.sourceRef,
        topic: dto.topic,
        status: GenerationStatus.QUEUED,
        requestedCount: dto.count ?? DEFAULT_REQUESTED_COUNT,
      }),
    );

    await this.queue.add(
      JOB_AI_GENERATE,
      { generationRequestId: request.id, material: material.text },
      { jobId: request.id },
    );

    return request;
  }

  list(userId: string): Promise<GenerationRequest[]> {
    return this.requests.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOwned(id: string, userId: string): Promise<GenerationRequest> {
    const row = await this.requests.findOneBy({ id });
    if (!row) throw new NotFoundException('Generation request not found');
    if (row.userId !== userId) {
      throw new ForbiddenException('You cannot access this generation request');
    }
    return row;
  }

  async listProblems(id: string, userId: string): Promise<GeneratedProblemLink[]> {
    await this.findOwned(id, userId);
    return this.links.find({ where: { generationRequestId: id }, order: { createdAt: 'ASC' } });
  }

  async saveProblem(id: string, linkId: string, userId: string): Promise<GeneratedProblemLink> {
    await this.findOwned(id, userId);
    const link = await this.links.findOneBy({ id: linkId, generationRequestId: id });
    if (!link) throw new NotFoundException('Generated problem not found');
    if (link.status !== GeneratedProblemLinkStatus.VALIDATED) {
      throw new BadRequestException('Only a validated problem can be saved');
    }
    link.status = GeneratedProblemLinkStatus.SAVED;
    return this.links.save(link);
  }

  private async assertEntitled(userId: string): Promise<void> {
    const hasSubscription = await this.entitlements.hasActiveEntitlement(userId, Entitlement.AI);
    if (hasSubscription) return;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const usedThisMonth = await this.requests.count({
      where: { userId, createdAt: MoreThanOrEqual(monthStart) },
    });
    if (usedThisMonth >= this.ai.freeGenerationsPerMonth) {
      throw new ForbiddenException({
        reason: 'entitlement_required',
        entitlement: Entitlement.AI,
        message: `Free tier limit reached (${this.ai.freeGenerationsPerMonth}/month) — subscribe for unlimited AI generations.`,
      });
    }
  }
}
