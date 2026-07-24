import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Language } from '../../../common/enums/language.enum';
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
  @ApiProperty({ type: [String] }) companies!: string[];
  @ApiProperty({ description: 'True when drivers/tests can be judged (has io_spec)' })
  isJudgeReady!: boolean;
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
      companies: (problem.companies ?? []).map((c) => c.name),
      isJudgeReady: !!problem.ioSpec && !!problem.functionName,
      createdById: problem.createdById,
      createdAt: problem.createdAt,
      ...(testCases ? { testCases: testCases.map(TestCaseResponseDto.from) } : {}),
    };
  }
}

export class EditorSampleTestCaseDto {
  @ApiProperty() inputData!: string;
  @ApiProperty() expectedOutput!: string;
  @ApiProperty() explanation!: string;
}

export class EditorLanguageTemplateDto {
  @ApiProperty({ enum: Language }) language!: Language;
  @ApiProperty() starterCode!: string;
}

/**
 * Bootstrap payload for the practice code-editor screen (§9.11). Mirrors the
 * assignment editor DTO but for a catalog problem. NEVER includes driverCode or
 * hidden test cases — only SAMPLE cases and per-language starterCode. `isJudgeReady`
 * lets the practice UI (#29) gate the Submit button.
 */
export class ProblemEditorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: Difficulty }) difficulty!: Difficulty;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() isJudgeReady!: boolean;
  @ApiProperty({ type: [EditorSampleTestCaseDto] }) sampleTestCases!: EditorSampleTestCaseDto[];
  @ApiProperty({ type: [EditorLanguageTemplateDto] }) templates!: EditorLanguageTemplateDto[];

  static from(
    problem: Problem,
    sampleCases: TestCase[],
    templates: { language: Language; starterCode: string }[],
  ): ProblemEditorResponseDto {
    return {
      id: problem.id,
      title: problem.title,
      body: problem.body,
      difficulty: problem.difficulty,
      tags: (problem.tags ?? []).map((t) => t.name),
      isJudgeReady: problem.isJudgeReady,
      sampleTestCases: sampleCases
        .filter((tc) => tc.type === TestCaseType.SAMPLE && tc.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((tc) => ({
          inputData: tc.inputData,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
        })),
      templates: templates.map((t) => ({
        language: t.language,
        starterCode: t.starterCode,
      })),
    };
  }
}
