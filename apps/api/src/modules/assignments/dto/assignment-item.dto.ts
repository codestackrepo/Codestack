import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Language } from '../../../common/enums/language.enum';
import { AssignmentItemKind } from '../enums/assignment-item-kind.enum';

export class McqOptionInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty()
  @IsBoolean()
  isCorrect!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

/**
 * Discriminated by `kind` (validated in the service, not via a class-validator
 * union): mcq carries `options` + `allowMultiple`; coding carries
 * `sourceProblemId`/`languages`/`score` (reusing import semantics); quiz just
 * carries a `prompt`.
 */
export class CreateAssignmentItemDto {
  @ApiProperty({ enum: AssignmentItemKind })
  @IsEnum(AssignmentItemKind)
  kind!: AssignmentItemKind;

  @ApiPropertyOptional({ description: 'Append to the end when omitted.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Prompt / statement (mcq + quiz).' })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional({ description: 'Points for mcq/quiz items (coding uses score).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPoints?: number;

  // ---- mcq ----
  @ApiPropertyOptional({ type: [McqOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McqOptionInputDto)
  options?: McqOptionInputDto[];

  @ApiPropertyOptional({ description: 'MCQ: allow selecting more than one option.' })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  // ---- coding ----
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceProblemId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @ApiPropertyOptional({ enum: Language, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Language, { each: true })
  languages?: Language[];
}

export class UpdateAssignmentItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Coding: also mirrors to AssignmentProblem.score.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPoints?: number;

  @ApiPropertyOptional({ description: 'MCQ: allow selecting more than one option.' })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({ type: [McqOptionInputDto], description: 'MCQ: replaces all options.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McqOptionInputDto)
  options?: McqOptionInputDto[];
}

export class SaveMcqResponseDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  @Type(() => String)
  selectedOptionIds!: string[];
}

export class SaveQuizResponseDto {
  @ApiProperty()
  @IsString()
  answerText!: string;
}

export class ReorderItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @Type(() => String)
  orderedItemIds!: string[];
}
