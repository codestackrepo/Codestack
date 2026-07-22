import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GeneratedProblemLink, PerLanguagePass } from '../entities/generated-problem-link.entity';
import { GenerationRequest, TokenUsage } from '../entities/generation-request.entity';
import {
  GeneratedProblemLinkStatus,
  GenerationSourceType,
  GenerationStatus,
} from '../enums/ai.enums';
import { GeneratedProblem } from '../llm/schemas/generated-problem.schema';

export class GenerationRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() topic!: string;
  @ApiProperty({ enum: GenerationSourceType }) sourceType!: GenerationSourceType;
  @ApiProperty({ enum: GenerationStatus }) status!: GenerationStatus;
  @ApiPropertyOptional({ nullable: true }) errorReason!: string | null;
  @ApiProperty() requestedCount!: number;
  @ApiPropertyOptional({ nullable: true }) tokenUsage!: TokenUsage | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) completedAt!: Date | null;

  static from(request: GenerationRequest): GenerationRequestResponseDto {
    return {
      id: request.id,
      topic: request.topic,
      sourceType: request.sourceType,
      status: request.status,
      errorReason: request.errorReason,
      requestedCount: request.requestedCount,
      tokenUsage: request.tokenUsage,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
    };
  }
}

export class GeneratedProblemLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: GeneratedProblemLinkStatus }) status!: GeneratedProblemLinkStatus;
  @ApiPropertyOptional({ nullable: true }) problemId!: string | null;
  @ApiProperty() perLanguagePass!: PerLanguagePass;
  @ApiProperty() draft!: GeneratedProblem;

  static from(link: GeneratedProblemLink): GeneratedProblemLinkResponseDto {
    return {
      id: link.id,
      status: link.status,
      problemId: link.problemId,
      perLanguagePass: link.perLanguagePass,
      draft: link.draft,
    };
  }
}
