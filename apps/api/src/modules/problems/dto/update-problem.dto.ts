import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProblemDto } from './create-problem.dto';

/** Update problem metadata (nested testCases are managed via dedicated routes). */
export class UpdateProblemDto extends PartialType(
  OmitType(CreateProblemDto, ['testCases'] as const),
) {}
