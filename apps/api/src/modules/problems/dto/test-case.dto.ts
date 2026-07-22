import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TestCaseType } from '../enums/problem.enums';

export class TestCaseInputDto {
  @ApiProperty()
  @IsString()
  inputData!: string;

  @ApiProperty()
  @IsString()
  expectedOutput!: string;

  @ApiPropertyOptional({ enum: TestCaseType, default: TestCaseType.HIDDEN })
  @IsOptional()
  @IsEnum(TestCaseType)
  type: TestCaseType = TestCaseType.HIDDEN;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
