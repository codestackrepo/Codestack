import { ApiProperty } from '@nestjs/swagger';
import { Language } from '../../../common/enums/language.enum';
import { Submission } from '../entities/submission.entity';
import { TestCaseResult } from '../entities/test-case-result.entity';
import { SubmissionContext } from '../enums/submission-context.enum';
import { SubmissionStatus } from '../enums/submission-status.enum';

/** Socket/DTO-only coarse status for a blinded assignment submission. */
export const BLIND_STATUS = 'submitted';

export class TestCaseResultDto {
  @ApiProperty() ordinal!: number;
  @ApiProperty({ enum: SubmissionStatus }) verdict!: SubmissionStatus;
  @ApiProperty() runtimeMs!: number;
  @ApiProperty() memoryBytes!: string;
  @ApiProperty() isSample!: boolean;

  static from(r: TestCaseResult): TestCaseResultDto {
    return {
      ordinal: r.ordinal,
      verdict: r.verdict,
      runtimeMs: r.runtimeMs,
      memoryBytes: r.memoryBytes,
      isSample: r.isSample,
    };
  }
}

export class SubmissionResponseDto {
  @ApiProperty() submissionId!: string;
  @ApiProperty({ enum: SubmissionStatus }) status!: SubmissionStatus | typeof BLIND_STATUS;
  @ApiProperty({ enum: SubmissionContext }) context!: SubmissionContext;
  @ApiProperty({ enum: Language }) language!: Language;
  @ApiProperty() passedTestcaseCount!: number;
  @ApiProperty() totalTestcaseCount!: number;
  @ApiProperty({ nullable: true }) runtimeMs!: number | null;
  @ApiProperty({ nullable: true }) memoryBytes!: string | null;
  @ApiProperty({ nullable: true }) failedTestcaseDetail!: unknown;
  @ApiProperty() userCode!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [TestCaseResultDto], required: false })
  testCaseResults?: TestCaseResultDto[];

  /**
   * When `blind` (a student's own ASSIGNMENT submission, §9.1/decision #3),
   * every verdict-bearing field is coarsened/zeroed and per-test results are
   * dropped — the student only learns "submitted, under review". Staff/graders
   * and practice owners get full detail.
   */
  static from(
    s: Submission,
    results?: TestCaseResult[],
    opts?: { blind?: boolean },
  ): SubmissionResponseDto {
    if (opts?.blind) {
      return {
        submissionId: s.id,
        status: BLIND_STATUS,
        context: s.context,
        language: s.language,
        passedTestcaseCount: 0,
        totalTestcaseCount: 0,
        runtimeMs: null,
        memoryBytes: null,
        failedTestcaseDetail: null,
        userCode: s.userCode,
        createdAt: s.createdAt,
      };
    }
    return {
      submissionId: s.id,
      status: s.status,
      context: s.context,
      language: s.language,
      passedTestcaseCount: s.passedTestcaseCount,
      totalTestcaseCount: s.totalTestcaseCount,
      runtimeMs: s.runtimeMs,
      memoryBytes: s.memoryBytes,
      failedTestcaseDetail: s.failedTestcaseDetail,
      userCode: s.userCode,
      createdAt: s.createdAt,
      ...(results ? { testCaseResults: results.map(TestCaseResultDto.from) } : {}),
    };
  }
}
