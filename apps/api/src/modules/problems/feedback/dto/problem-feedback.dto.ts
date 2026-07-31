import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProblemFeedback } from '../entities/problem-feedback.entity';
import { ProblemFeedbackKind, ProblemFeedbackStatus } from '../enums/problem-feedback.enums';

/**
 * NOTE: there is deliberately no `problemId`, `organizationId`, `authorId` or
 * `status` here. The problem comes from the route, the org and author come from
 * the authenticated actor, and status starts `open` by definition. Accepting any
 * of them from the client would be the cross-tenant write hole #75 exists inside.
 */
export class CreateProblemFeedbackDto {
  @ApiProperty({ enum: ProblemFeedbackKind })
  @IsEnum(ProblemFeedbackKind)
  kind!: ProblemFeedbackKind;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(4000)
  body!: string;
}

export class ResolveProblemFeedbackDto {
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNote?: string;
}

export class QueryProblemFeedbackDto {
  @ApiPropertyOptional({ enum: ProblemFeedbackStatus })
  @IsOptional()
  @IsEnum(ProblemFeedbackStatus)
  status?: ProblemFeedbackStatus;

  @ApiPropertyOptional({ enum: ProblemFeedbackKind })
  @IsOptional()
  @IsEnum(ProblemFeedbackKind)
  kind?: ProblemFeedbackKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  problemId?: string;
}

export class ProblemFeedbackResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() problemId!: string;
  @ApiPropertyOptional() problemTitle?: string | null;
  @ApiProperty() authorId!: string;
  @ApiPropertyOptional() authorName?: string | null;
  @ApiProperty({ enum: ProblemFeedbackKind }) kind!: ProblemFeedbackKind;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: ProblemFeedbackStatus }) status!: ProblemFeedbackStatus;
  @ApiPropertyOptional() resolvedById!: string | null;
  @ApiPropertyOptional() resolvedByName?: string | null;
  @ApiPropertyOptional() resolvedAt!: Date | null;
  @ApiPropertyOptional() resolutionNote!: string | null;
  @ApiProperty() createdAt!: Date;

  /**
   * `organizationId` is intentionally NOT projected. It is the author's org and
   * every reader is already inside it (`scopeToOrg`), so returning it would add a
   * tenant identifier to a student-visible payload while telling them nothing.
   */
  static from(f: ProblemFeedback): ProblemFeedbackResponseDto {
    const name = (u?: { firstName: string; lastName: string } | null): string | null =>
      u ? `${u.firstName} ${u.lastName}` : null;
    return {
      id: f.id,
      problemId: f.problemId,
      problemTitle: f.problem?.title ?? null,
      authorId: f.authorId,
      authorName: name(f.author),
      kind: f.kind,
      body: f.body,
      status: f.status,
      resolvedById: f.resolvedById,
      resolvedByName: name(f.resolvedBy),
      resolvedAt: f.resolvedAt,
      resolutionNote: f.resolutionNote,
      createdAt: f.createdAt,
    };
  }
}
