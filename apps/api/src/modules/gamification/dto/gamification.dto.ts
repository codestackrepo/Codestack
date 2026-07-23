import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { UserGamification } from '../entities/user-gamification.entity';

export class GamificationSummaryDto {
  @ApiProperty() totalPoints!: number;
  @ApiProperty() totalSolved!: number;
  @ApiProperty() easySolved!: number;
  @ApiProperty() mediumSolved!: number;
  @ApiProperty() hardSolved!: number;
  @ApiProperty({ description: 'Effective streak: 0 if the last activity is older than yesterday' })
  currentStreak!: number;
  @ApiProperty() longestStreak!: number;
  @ApiProperty({ nullable: true }) lastActivityDate!: string | null;

  /** Zero-state for a user with no gamification row (no row is ever created on read). */
  static zero(): GamificationSummaryDto {
    return {
      totalPoints: 0,
      totalSolved: 0,
      easySolved: 0,
      mediumSolved: 0,
      hardSolved: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    };
  }

  static from(row: UserGamification, effectiveCurrentStreak: number): GamificationSummaryDto {
    return {
      totalPoints: row.totalPoints,
      totalSolved: row.easySolved + row.mediumSolved + row.hardSolved,
      easySolved: row.easySolved,
      mediumSolved: row.mediumSolved,
      hardSolved: row.hardSolved,
      currentStreak: effectiveCurrentStreak,
      longestStreak: row.longestStreak,
      lastActivityDate: row.lastActivityDate,
    };
  }
}

export class ContributionDayDto {
  @ApiProperty() date!: string;
  @ApiProperty() count!: number;
  @ApiProperty() solvedCount!: number;
}

export class ContributionsResponseDto {
  @ApiProperty() year!: number;
  @ApiProperty() totalContributions!: number;
  @ApiProperty({ type: [ContributionDayDto] }) days!: ContributionDayDto[];
}

export class SolvedHistoryItemDto {
  @ApiProperty() problemId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() difficulty!: string;
  @ApiProperty() points!: number;
  @ApiProperty() solvedAt!: string;
}

export class ContributionsQueryDto {
  @ApiPropertyOptional({ minimum: 2020, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
