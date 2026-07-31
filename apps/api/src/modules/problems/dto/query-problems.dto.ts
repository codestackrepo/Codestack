import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Difficulty, ProblemScope } from '../enums/problem.enums';

export class QueryProblemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ description: 'Filter by a single tag (topic) name' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Filter by a single company name' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Search in title' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Narrows the catalog to one scope (#70).
   *
   * This is a FILTER, never a grant: it is applied AFTER `applyVisibility`, so
   * `scope=global` shows the platform catalog an actor could already see and
   * `scope=org` shows only their own org's. It cannot widen what anyone sees.
   */
  @ApiPropertyOptional({ enum: ProblemScope })
  @IsOptional()
  @IsEnum(ProblemScope)
  scope?: ProblemScope;
}
