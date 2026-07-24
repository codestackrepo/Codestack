import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Language } from '../../../common/enums/language.enum';
import { SubmissionContext } from '../../submissions/enums/submission-context.enum';

const CODE_MAX = 65536;
const STDIN_MAX = 65536;
// Real problems have a handful of sample cases; this bounds one /run request
// to a small, fixed amount of sandbox work (each entry drives a real Piston
// execution) rather than letting a client-controlled array size drive it.
const SAMPLE_TESTCASES_MAX = 20;

export class SubmitCodeDto {
  @ApiPropertyOptional({ enum: SubmissionContext, default: SubmissionContext.ASSIGNMENT })
  @IsOptional()
  @IsEnum(SubmissionContext)
  context: SubmissionContext = SubmissionContext.ASSIGNMENT;

  // Exactly-one-target, matching the DB CHECK: assignment → assignmentProblemId,
  // practice → problemId.
  @ApiProperty()
  @ValidateIf((o: SubmitCodeDto) => o.context !== SubmissionContext.PRACTICE)
  @IsUUID()
  assignmentProblemId!: string;

  @ApiPropertyOptional()
  @ValidateIf((o: SubmitCodeDto) => o.context === SubmissionContext.PRACTICE)
  @IsUUID()
  problemId!: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language!: Language;

  @ApiProperty()
  @IsString()
  @MaxLength(CODE_MAX)
  userCode!: string;
}

export class SampleTestcaseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(STDIN_MAX)
  input!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(STDIN_MAX)
  expected!: string;
}

export class RunCodeDto {
  @ApiPropertyOptional({ enum: SubmissionContext, default: SubmissionContext.ASSIGNMENT })
  @IsOptional()
  @IsEnum(SubmissionContext)
  context: SubmissionContext = SubmissionContext.ASSIGNMENT;

  @ApiProperty()
  @ValidateIf((o: RunCodeDto) => o.context !== SubmissionContext.PRACTICE)
  @IsUUID()
  assignmentProblemId!: string;

  @ApiPropertyOptional()
  @ValidateIf((o: RunCodeDto) => o.context === SubmissionContext.PRACTICE)
  @IsUUID()
  problemId!: string;

  @ApiProperty({ enum: Language })
  @IsEnum(Language)
  language!: Language;

  @ApiProperty()
  @IsString()
  @MaxLength(CODE_MAX)
  userCode!: string;

  @ApiProperty({ type: [SampleTestcaseDto], maxItems: SAMPLE_TESTCASES_MAX })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(SAMPLE_TESTCASES_MAX)
  @ValidateNested({ each: true })
  @Type(() => SampleTestcaseDto)
  sampleTestcases!: SampleTestcaseDto[];
}
