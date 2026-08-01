import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { canReadStaffDirectory } from '../../common/tenancy/community-policy';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RequiresFeature } from '../module-access/decorators/requires-feature.decorator';
import { RequiresModule } from '../module-access/decorators/requires-module.decorator';
import { AppModuleKey } from '../module-access/enums/app-module-key.enum';
import { FeatureKey } from '../module-access/enums/feature-key.enum';
import {
  CreateTopicCommentDto,
  CreateTopicDto,
  TopicCommentResponseDto,
  TopicResponseDto,
  UpdateTopicDto,
} from './dto/topic.dto';
import { TopicsService } from './topics.service';

/**
 * Discussion topics (#76), gated by the TOPICS module.
 *
 * Two feature keys, and the split matters:
 *
 *  - `topics.comment` — writing. No `FEATURE_ROLE_CEILING` entry, so no ceiling and
 *    open to STUDENT, who are the intended participants.
 *  - `topics.moderate` — locking, editing, resolving, deleting someone else's
 *    comment. Ceiling `[ADMIN, PROFESSOR]`.
 *
 * READS carry no feature annotation. `@RequiresModule(TOPICS)` already gates the
 * section as a whole, and gating the read behind `topics.comment` would mean an org
 * that turned off commenting also lost the ability to read existing threads — a
 * strictly worse outcome than a read-only topic list.
 */
@ApiTags('topics')
@ApiCookieAuth('access_token')
@Controller('topics')
@RequiresModule(AppModuleKey.TOPICS)
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<TopicResponseDto[]> {
    const rows = await this.topics.listTopics(actor);
    return rows.map(({ topic, commentCount }) => TopicResponseDto.from(topic, commentCount));
  }

  /** Unanswered questions in the actor's org. Declared ABOVE `:id` so it is not eaten by it. */
  @Get('questions')
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.TOPICS_MODERATE)
  async questions(@CurrentUser() actor: AuthenticatedUser): Promise<TopicCommentResponseDto[]> {
    const rows = await this.topics.listOpenQuestions(actor);
    return rows.map((c) => TopicCommentResponseDto.from(c, canReadStaffDirectory(actor)));
  }

  @Post()
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.TOPICS_MODERATE)
  async create(
    @Body() dto: CreateTopicDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicResponseDto> {
    return TopicResponseDto.from(await this.topics.createTopic(dto, actor));
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicResponseDto> {
    return TopicResponseDto.from(await this.topics.getTopic(id, actor));
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.TOPICS_MODERATE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTopicDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicResponseDto> {
    return TopicResponseDto.from(await this.topics.updateTopic(id, dto, actor));
  }

  @Get(':id/comments')
  async comments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicCommentResponseDto[]> {
    const rows = await this.topics.listComments(id, actor);
    return rows.map((c) => TopicCommentResponseDto.from(c, canReadStaffDirectory(actor)));
  }

  @Post(':id/comments')
  @RequiresFeature(FeatureKey.TOPICS_COMMENT)
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTopicCommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicCommentResponseDto> {
    return TopicCommentResponseDto.from(await this.topics.addComment(id, dto, actor));
  }

  @Patch('comments/:commentId/resolve')
  @Roles(Role.PROFESSOR)
  @RequiresFeature(FeatureKey.TOPICS_MODERATE)
  @HttpCode(200)
  async resolve(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopicCommentResponseDto> {
    return TopicCommentResponseDto.from(await this.topics.resolveQuestion(commentId, actor));
  }

  /**
   * Author-or-staff. NOT annotated with `topics.moderate`: the author deleting their
   * own comment is not moderation, and gating it would make an org that disabled
   * moderation unable to let a student retract their own post. The ownership check
   * lives in the service, which is the only place that knows who wrote it.
   */
  @Delete('comments/:commentId')
  @HttpCode(204)
  async deleteComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.topics.deleteComment(commentId, actor);
  }
}
