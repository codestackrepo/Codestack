import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Difficulty, ProblemScope, ProblemVisibility } from '../enums/problem.enums';
import { TestCaseInputDto } from './test-case.dto';

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
}
