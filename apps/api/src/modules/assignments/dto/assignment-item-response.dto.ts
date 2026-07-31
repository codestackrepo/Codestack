import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestCaseType } from '../../problems/enums/problem.enums';
import { EditorSampleTestCaseDto } from '../../problems/dto/problem-response.dto';
import { Language } from '../../../common/enums/language.enum';
import { AssignmentItem } from '../entities/assignment-item.entity';
import { McqResponse } from '../entities/mcq-response.entity';
import { QuizResponse } from '../entities/quiz-response.entity';
import { AssignmentItemGradingMode } from '../enums/assignment-item-grading-mode.enum';
import { AssignmentItemKind } from '../enums/assignment-item-kind.enum';

/** Option shape for STAFF — includes `isCorrect`. */
export class McqOptionStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() isCorrect!: boolean;
  @ApiProperty() orderIndex!: number;
}

/** Option shape for STUDENTS — deliberately has NO `isCorrect` property. */
export class McqOptionStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() orderIndex!: number;
}

/**
 * Full staff view of an item, including MCQ `isCorrect` and (for coding) the
 * linked AssignmentProblem summary. Never sent to students.
 */
export class AssignmentItemStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AssignmentItemKind }) kind!: AssignmentItemKind;
  @ApiProperty() orderIndex!: number;
  @ApiProperty() maxPoints!: number;
  @ApiProperty() prompt!: string;
  @ApiProperty({ enum: AssignmentItemGradingMode }) gradingMode!: AssignmentItemGradingMode;
  @ApiProperty() allowMultiple!: boolean;
  @ApiPropertyOptional({ nullable: true }) assignmentProblemId!: string | null;
  @ApiPropertyOptional({ type: [McqOptionStaffDto] }) options?: McqOptionStaffDto[];
  // Coding summary (present for kind=coding).
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() difficulty?: string;
  @ApiPropertyOptional({ enum: Language, isArray: true }) languages?: Language[];

  static from(item: AssignmentItem): AssignmentItemStaffDto {
    const dto: AssignmentItemStaffDto = {
      id: item.id,
      kind: item.kind,
      orderIndex: item.orderIndex,
      maxPoints: item.maxPoints,
      prompt: item.prompt,
      gradingMode: item.gradingMode,
      allowMultiple: item.allowMultiple,
      assignmentProblemId: item.assignmentProblemId,
    };
    if (item.kind === AssignmentItemKind.MCQ) {
      dto.options = (item.options ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, orderIndex: o.orderIndex }));
    }
    if (item.kind === AssignmentItemKind.CODING && item.assignmentProblem) {
      const ap = item.assignmentProblem;
      dto.title = ap.problem?.title ?? '';
      dto.difficulty = ap.problem?.difficulty ?? '';
      dto.languages = (ap.languageTemplates ?? []).map((t) => t.language);
    }
    return dto;
  }
}

/** A student's own saved answer for rehydration — NEVER any score/correctness. */
export class MyItemResponseDto {
  @ApiPropertyOptional({ type: [String] }) selectedOptionIds?: string[];
  @ApiPropertyOptional() answerText?: string;
}

/**
 * Student-facing item view. Deliberately has NO `isCorrect` and NO
 * `awardedPoints`/score property anywhere (§9.2 MCQ score-leak guardrail): the
 * class simply doesn't declare them, so they can't be serialized by accident.
 */
export class AssignmentItemStudentDto {
  @ApiProperty() itemId!: string;
  @ApiProperty({ enum: AssignmentItemKind }) kind!: AssignmentItemKind;
  @ApiProperty() orderIndex!: number;
  @ApiProperty() maxPoints!: number;
  @ApiPropertyOptional() prompt?: string;
  @ApiPropertyOptional() allowMultiple?: boolean;
  @ApiPropertyOptional({ type: [McqOptionStudentDto] }) options?: McqOptionStudentDto[];
  // Coding link target for /solve/:apId.
  @ApiPropertyOptional({ nullable: true }) assignmentProblemId?: string | null;
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() difficulty?: string;
  @ApiPropertyOptional({ enum: Language, isArray: true }) languages?: Language[];
  /**
   * The problem statement, so a student can see what a coding item asks WITHOUT
   * opening the editor (#46).
   */
  @ApiPropertyOptional() statement?: string;
  /**
   * SAMPLE cases only, and only active ones.
   *
   * Hidden cases are the judge's; exposing them would let a student hardcode the
   * expected output instead of solving the problem. Same filter and same DTO the
   * editor bootstrap uses, deliberately — one rule about what a student may see, in
   * one shape.
   */
  @ApiPropertyOptional({ type: [EditorSampleTestCaseDto] })
  sampleTestCases?: EditorSampleTestCaseDto[];
  @ApiPropertyOptional({ type: MyItemResponseDto }) myResponse?: MyItemResponseDto;

  static from(
    item: AssignmentItem,
    myResponse?: McqResponse | QuizResponse | null,
  ): AssignmentItemStudentDto {
    const dto: AssignmentItemStudentDto = {
      itemId: item.id,
      kind: item.kind,
      orderIndex: item.orderIndex,
      maxPoints: item.maxPoints,
    };
    if (item.kind === AssignmentItemKind.CODING && item.assignmentProblem) {
      const ap = item.assignmentProblem;
      dto.assignmentProblemId = item.assignmentProblemId;
      dto.title = ap.problem?.title ?? '';
      dto.difficulty = ap.problem?.difficulty ?? '';
      dto.languages = (ap.languageTemplates ?? []).map((t) => t.language);
      dto.statement = ap.problem?.body ?? '';
      dto.sampleTestCases = (ap.problem?.testCases ?? [])
        .filter((tc) => tc.type === TestCaseType.SAMPLE && tc.isActive)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((tc) => ({
          inputData: tc.inputData,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
        }));
    } else {
      dto.prompt = item.prompt;
    }
    if (item.kind === AssignmentItemKind.MCQ) {
      dto.allowMultiple = item.allowMultiple;
      dto.options = (item.options ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => ({ id: o.id, text: o.text, orderIndex: o.orderIndex }));
      if (myResponse && 'selectedOptionIds' in myResponse) {
        dto.myResponse = { selectedOptionIds: myResponse.selectedOptionIds };
      }
    }
    if (item.kind === AssignmentItemKind.QUIZ && myResponse && 'answerText' in myResponse) {
      dto.myResponse = { answerText: myResponse.answerText };
    }
    return dto;
  }
}
