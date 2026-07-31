import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MAX_ROSTER_ROWS } from '../roster-parser';
import {
  ClassifiedRosterRow,
  RosterRowError,
  RosterSummary,
  RosterWarnings,
} from '../roster.types';

export class CommitBulkInviteDto {
  @ApiProperty({ description: 'The key returned by /invites/bulk/preview.' })
  @IsString()
  stagingKey!: string;

  /**
   * Rows the admin unticked in the preview table. Validated against the STAGED
   * row numbers, and `seatsRequired` is recomputed after exclusion — otherwise an
   * admin who trims a roster to fit their remaining seats would still be blocked
   * by the original count.
   */
  @ApiPropertyOptional({ type: [Number], description: 'Staged row numbers to leave out.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROSTER_ROWS)
  @IsInt({ each: true })
  @Min(2, { each: true }) // row 1 is the header
  @Type(() => Number)
  excludeRowNumbers?: number[];

  /**
   * Re-mint and re-send invites that are already pending for this org, instead of
   * skipping them. Rotates the token on the EXISTING row — never inserts a second
   * one, which `uq_org_invites_org_pending_email` would reject anyway.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  resendPending?: boolean;
}

export class RosterPreviewDto {
  @ApiProperty() stagingKey!: string;
  @ApiProperty() summary!: RosterSummary;
  @ApiProperty({ description: 'Every classified row, in file order.' })
  rows!: ClassifiedRosterRow[];
  @ApiProperty({ description: 'Rows the parser could not use at all.' })
  errors!: RosterRowError[];
  @ApiProperty() warnings!: RosterWarnings;
  @ApiProperty({
    nullable: true,
    description: 'Remaining seats, or null for an UNLIMITED org. Never 0 for unlimited.',
  })
  seatsAvailable!: number | null;
  @ApiProperty({
    description: 'False when seatsRequired exceeds seatsAvailable — commit is blocked.',
  })
  canCommit!: boolean;
}

export class BulkInviteResultDto {
  @ApiProperty() invited!: number;
  @ApiProperty() claimed!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty({
    description:
      'Rows whose state changed benignly between preview and commit (e.g. someone ' +
      'joined in the meantime) — the batch intent was already achieved.',
  })
  warnings!: string[];
}
