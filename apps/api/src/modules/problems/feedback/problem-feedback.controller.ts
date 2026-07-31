import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RequiresFeature } from '../../module-access/decorators/requires-feature.decorator';
import { RequiresModule } from '../../module-access/decorators/requires-module.decorator';
import { AppModuleKey } from '../../module-access/enums/app-module-key.enum';
import { FeatureKey } from '../../module-access/enums/feature-key.enum';
import {
  CreateProblemFeedbackDto,
  ProblemFeedbackResponseDto,
  QueryProblemFeedbackDto,
  ResolveProblemFeedbackDto,
} from './dto/problem-feedback.dto';
import { ProblemFeedbackService } from './problem-feedback.service';

/**
 * Per-problem feedback (#75), mounted under `problems` so it inherits
 * `@RequiresModule(PROBLEMS)`.
 *
 * That nesting is required, not cosmetic: `problems.feedback` resolves its owning
 * module from its own key PREFIX, and `resolveFeature` returns false unless that
 * module is enabled. Mounting these routes anywhere else would leave the feature
 * gate depending on a module the routes are not under.
 *
 * `problems.feedback` deliberately has NO entry in `FEATURE_ROLE_CEILING`, which
 * means no ceiling and therefore open to every role including STUDENT — students
 * are the intended authors. Contrast `problems.author`, whose ceiling is
 * `[ADMIN, PROFESSOR]`.
 */
@ApiTags('problem-feedback')
@ApiCookieAuth('access_token')
@Controller('problems')
@RequiresModule(AppModuleKey.PROBLEMS)
export class ProblemFeedbackController {
  constructor(private readonly feedback: ProblemFeedbackService) {}

  @Post(':id/feedback')
  @RequiresFeature(FeatureKey.PROBLEMS_FEEDBACK)
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProblemFeedbackDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemFeedbackResponseDto> {
    return ProblemFeedbackResponseDto.from(await this.feedback.create(id, dto, actor));
  }

  /** The thread. Staff see the org's; a student sees only their own. */
  @Get(':id/feedback')
  @RequiresFeature(FeatureKey.PROBLEMS_FEEDBACK)
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemFeedbackResponseDto[]> {
    const rows = await this.feedback.listForProblem(id, actor);
    return rows.map(ProblemFeedbackResponseDto.from);
  }
}

/**
 * The staff doubts inbox (#75), on its own root path because it is cross-problem.
 *
 * Still `@RequiresModule(PROBLEMS)` + `problems.feedback` for the same reason as
 * above — the module owns the feature key regardless of the URL — and additionally
 * `@Roles(ADMIN, PROFESSOR)`. `RolesGuard` is minimum-rank, so that admits ADMIN
 * and SUPERADMIN and excludes STUDENT, which is the intent: a student reaches their
 * own feedback through the per-problem thread, never through the inbox.
 */
@ApiTags('problem-feedback')
@ApiCookieAuth('access_token')
@Controller('feedback')
@RequiresModule(AppModuleKey.PROBLEMS)
export class FeedbackInboxController {
  constructor(private readonly feedback: ProblemFeedbackService) {}

  @Get()
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.PROBLEMS_FEEDBACK)
  async inbox(
    @Query() query: QueryProblemFeedbackDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemFeedbackResponseDto[]> {
    const rows = await this.feedback.listInbox(query, actor);
    return rows.map(ProblemFeedbackResponseDto.from);
  }

  @Patch(':id/resolve')
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.PROBLEMS_FEEDBACK)
  @HttpCode(200)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveProblemFeedbackDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemFeedbackResponseDto> {
    return ProblemFeedbackResponseDto.from(await this.feedback.resolve(id, dto, actor));
  }
}
