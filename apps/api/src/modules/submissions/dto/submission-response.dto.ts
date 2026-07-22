import { ApiProperty } from '@nestjs/swagger';
import { Language } from '../../../common/enums/language.enum';
import { Submission } from '../entities/submission.entity';
import { TestCaseResult } from '../entities/test-case-result.entity';
import { SubmissionStatus } from '../enums/submission-status.enum';

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
  @ApiProperty({ enum: SubmissionStatus }) status!: SubmissionStatus;
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

  static from(s: Submission, results?: TestCaseResult[]): SubmissionResponseDto {
    return {
      submissionId: s.id,
      status: s.status,
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
