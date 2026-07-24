import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  ContributionsQueryDto,
  ContributionsResponseDto,
  GamificationSummaryDto,
  SolvedHistoryItemDto,
} from './dto/gamification.dto';
import { GamificationService } from './gamification.service';

// Owner-only reads (§5.6 / §2 decision 7: no leaderboard, no cross-user access).
// Gamification is NOT a toggleable AppModuleKey → no @RequiresModule; JWT auth
// (global guard) is sufficient.
@ApiTags('gamification')
@ApiCookieAuth('access_token')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('me/summary')
  getSummary(@CurrentUser('id') userId: string): Promise<GamificationSummaryDto> {
    return this.gamification.getSummary(userId);
  }

  @Get('me/contributions')
  getContributions(
    @CurrentUser('id') userId: string,
    @Query() q: ContributionsQueryDto,
  ): Promise<ContributionsResponseDto> {
    return this.gamification.getContributions(userId, q.year);
  }

  @Get('me/history')
  getHistory(
    @CurrentUser('id') userId: string,
    @Query() q: PaginationQueryDto,
  ): Promise<PaginatedResult<SolvedHistoryItemDto>> {
    return this.gamification.getHistory(userId, q);
  }
}
