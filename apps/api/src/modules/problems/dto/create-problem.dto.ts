import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { Difficulty, ProblemScope, ProblemVisibility } from '../enums/problem.enums';
import { TestCaseInputDto } from './test-case.dto';
import { IDENTIFIER, IoSpecDto, IsNotReservedWordConstraint } from './io-spec.dto';

export class CreateProblemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: 'Markdown problem statement' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ enum: Difficulty, default: Difficulty.MEDIUM })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ type: [String], description: 'Tag names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Company names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  companies?: string[];

  @ApiPropertyOptional({ enum: ProblemVisibility, default: ProblemVisibility.PRIVATE })
  @IsOptional()
  @IsEnum(ProblemVisibility)
  visibility?: ProblemVisibility;

  @ApiPropertyOptional({
    enum: ProblemScope,
    description:
      'Superadmin only. Org staff problems are always org-scoped; a non-superadmin sending scope=global is rejected.',
  })
  @IsOptional()
  @IsEnum(ProblemScope)
  scope?: ProblemScope;

  @ApiPropertyOptional({ type: [TestCaseInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseInputDto)
  testCases?: TestCaseInputDto[];

  /*
   * ---- Structured judging (§9.11) ----
   *
   * `isJudgeReady` is `!!ioSpec && !!functionName`, and until now NEITHER field was
   * accepted by any endpoint — so no problem created through the API could ever be
   * judged, only browsed. These two close that.
   *
   * They travel together on purpose. One without the other is not a partial spec, it
   * is an unjudgeable problem that reports itself as authored, so the service rejects
   * the half-set combination rather than storing it.
   *
   * Both remain OPTIONAL: prose-only problems with hand-authored driver code predate
   * synthesis and stay valid (the entity columns are nullable for exactly that reason).
   */
  @ApiPropertyOptional({
    description: 'Entry-point name the synthesized driver calls. Required with ioSpec.',
    example: 'secondLargest',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(IDENTIFIER, {
    message:
      'functionName must start with a letter or underscore and contain only letters, digits and underscores',
  })
  @Validate(IsNotReservedWordConstraint)
  functionName?: string;

  @ApiPropertyOptional({ type: IoSpecDto, description: 'Signature. Required with functionName.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => IoSpecDto)
  ioSpec?: IoSpecDto;
}
