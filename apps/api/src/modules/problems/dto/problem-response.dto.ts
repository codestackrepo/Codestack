import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Difficulty, ProblemSource, ProblemVisibility, TestCaseType } from '../enums/problem.enums';
import { Problem } from '../entities/problem.entity';
import { TestCase } from '../entities/test-case.entity';

export class TestCaseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() inputData!: string;
  @ApiProperty() expectedOutput!: string;
  @ApiProperty({ enum: TestCaseType }) type!: TestCaseType;
  @ApiProperty() explanation!: string;
  @ApiProperty() orderIndex!: number;

  static from(tc: TestCase): TestCaseResponseDto {
    return {
      id: tc.id,
      inputData: tc.inputData,
      expectedOutput: tc.expectedOutput,
      type: tc.type,
      explanation: tc.explanation,
      orderIndex: tc.orderIndex,
    };
  }
}

export class ProblemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: Difficulty }) difficulty!: Difficulty;
  @ApiProperty({ enum: ProblemSource }) source!: ProblemSource;
  @ApiProperty({ enum: ProblemVisibility }) visibility!: ProblemVisibility;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: [TestCaseResponseDto] }) testCases?: TestCaseResponseDto[];

  static from(problem: Problem, testCases?: TestCase[]): ProblemResponseDto {
    return {
      id: problem.id,
      title: problem.title,
      body: problem.body,
      difficulty: problem.difficulty,
      source: problem.source,
      visibility: problem.visibility,
      tags: (problem.tags ?? []).map((t) => t.name),
      createdById: problem.createdById,
      createdAt: problem.createdAt,
      ...(testCases ? { testCases: testCases.map(TestCaseResponseDto.from) } : {}),
    };
  }
}
