import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SearchUsersDto {
  @ApiProperty({ description: 'Search query (name or email)' })
  @IsString()
  @MinLength(1)
  q!: string;

  @ApiPropertyOptional({ enum: ['student', 'professor', 'both'], default: 'both' })
  @IsOptional()
  @IsIn(['student', 'professor', 'both'])
  type: 'student' | 'professor' | 'both' = 'both';

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}
