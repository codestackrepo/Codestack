import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Language } from '../../../common/enums/language.enum';
import { Difficulty } from '../../problems/enums/problem.enums';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty()
  @IsUUID()
  classroomId!: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Create as a hidden draft instead of scheduled. A draft never auto-activates by date and ' +
      'must be explicitly opened via POST /:id/publish.',
  })
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class QueryAssignmentsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class ImportProblemDto {
  @ApiProperty()
  @IsUUID()
  sourceProblemId!: string;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  score!: number;

  @ApiProperty({ enum: Language, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Language, { each: true })
  languages!: Language[];
}

class ClonedProblemBody {
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() body!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;
}

export class CloneProblemDto {
  @ApiProperty()
  @IsUUID()
  sourceProblemId!: string;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  score!: number;

  @ApiProperty({ enum: Language, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Language, { each: true })
  languages!: Language[];

  @ApiProperty({ type: ClonedProblemBody })
  @ValidateNested()
  @Type(() => ClonedProblemBody)
  problem!: ClonedProblemBody;
}

export class EditAssignmentProblemDto {
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
