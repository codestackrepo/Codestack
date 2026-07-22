import { ApiProperty } from '@nestjs/swagger';
import { Language } from '../../../common/enums/language.enum';
import { Difficulty, TestCaseType } from '../../problems/enums/problem.enums';
import { AssignmentProblem } from '../entities/assignment-problem.entity';
import { Assignment } from '../entities/assignment.entity';
import { AssignmentStatus } from '../enums/assignment-status.enum';

export class AssignmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() startDate!: Date;
  @ApiProperty() endDate!: Date;
  @ApiProperty() classroomId!: string;
  @ApiProperty() createdById!: string;
  @ApiProperty({ enum: AssignmentStatus }) status!: AssignmentStatus;
  @ApiProperty({ nullable: true }) publishedAt!: Date | null;

  static from(a: Assignment): AssignmentResponseDto {
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      startDate: a.startDate,
      endDate: a.endDate,
      classroomId: a.classroomId,
      createdById: a.createdById,
      status: a.status,
      publishedAt: a.publishedAt,
    };
  }
}

export class AssignmentProblemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() assignmentId!: string;
  @ApiProperty() problemId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() difficulty!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() score!: number;
  @ApiProperty() isImported!: boolean;
  @ApiProperty({ enum: Language, isArray: true }) languages!: Language[];

  static from(ap: AssignmentProblem): AssignmentProblemResponseDto {
    return {
      id: ap.id,
      assignmentId: ap.assignmentId,
      problemId: ap.problemId,
      title: ap.problem?.title ?? '',
      difficulty: ap.problem?.difficulty ?? '',
      tags: (ap.problem?.tags ?? []).map((t) => t.name),
      score: ap.score,
      isImported: ap.isImported,
      languages: (ap.languageTemplates ?? []).map((t) => t.language),
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

/** Bootstrap payload for the code-editor screen — never includes driverCode. */
export class AssignmentProblemEditorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() assignmentId!: string;
  @ApiProperty() problemId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: Difficulty }) difficulty!: Difficulty;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() score!: number;
  @ApiProperty({ type: [EditorSampleTestCaseDto] }) sampleTestCases!: EditorSampleTestCaseDto[];
  @ApiProperty({ type: [EditorLanguageTemplateDto] }) templates!: EditorLanguageTemplateDto[];

  static from(ap: AssignmentProblem): AssignmentProblemEditorResponseDto {
    return {
      id: ap.id,
      assignmentId: ap.assignmentId,
      problemId: ap.problemId,
      title: ap.problem?.title ?? '',
      body: ap.problem?.body ?? '',
      difficulty: ap.problem?.difficulty ?? Difficulty.MEDIUM,
      tags: (ap.problem?.tags ?? []).map((t) => t.name),
      score: ap.score,
      sampleTestCases: (ap.problem?.testCases ?? [])
        .filter((tc) => tc.type === TestCaseType.SAMPLE && tc.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((tc) => ({
          inputData: tc.inputData,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
        })),
      templates: (ap.languageTemplates ?? []).map((t) => ({
        language: t.language,
        starterCode: t.starterCode,
      })),
    };
  }
}
