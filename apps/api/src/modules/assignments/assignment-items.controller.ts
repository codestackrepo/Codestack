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
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppModuleKey } from '../module-access/enums/app-module-key.enum';
import { FeatureKey } from '../module-access/enums/feature-key.enum';
import { RequiresFeature } from '../module-access/decorators/requires-feature.decorator';
import { RequiresModule } from '../module-access/decorators/requires-module.decorator';
import { AssignmentItemsService } from './assignment-items.service';
import { AssignmentTakingService, TakePayload } from './assignment-taking.service';
import { AssignmentItemStaffDto } from './dto/assignment-item-response.dto';
import {
  CreateAssignmentItemDto,
  ReorderItemsDto,
  SaveMcqResponseDto,
  SaveQuizResponseDto,
  UpdateAssignmentItemDto,
} from './dto/assignment-item.dto';

/**
 * Mixed-item authoring (staff) + taking (student). Registered BEFORE
 * AssignmentsController in the module so the static `assignments/items/:itemId`
 * routes are matched ahead of AssignmentsController's `:id` routes.
 */
@ApiTags('assignment-items')
@ApiCookieAuth('access_token')
@Controller('assignments')
@RequiresModule(AppModuleKey.ASSIGNMENTS)
export class AssignmentItemsController {
  constructor(
    private readonly items: AssignmentItemsService,
    private readonly taking: AssignmentTakingService,
  ) {}

  // ---- static item routes (must precede :id) ----

  @Patch('items/:itemId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @RequiresFeature(FeatureKey.ASSIGNMENTS_AUTHOR)
  async updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateAssignmentItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AssignmentItemStaffDto> {
    return AssignmentItemStaffDto.from(await this.items.updateItem(itemId, dto, actor));
  }

  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @RequiresFeature(FeatureKey.ASSIGNMENTS_AUTHOR)
  @HttpCode(204)
  async deleteItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.items.deleteItem(itemId, actor);
  }

  @Put('items/:itemId/mcq')
  async saveMcq(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveMcqResponseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ saved: true }> {
    return this.taking.saveMcqResponse(itemId, dto, actor);
  }

  @Put('items/:itemId/quiz')
  async saveQuiz(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveQuizResponseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ saved: true }> {
    return this.taking.saveQuizResponse(itemId, dto, actor);
  }

  // ---- :id item + taking routes ----

  @Get(':id/items')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @RequiresFeature(FeatureKey.ASSIGNMENTS_AUTHOR)
  async listItems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AssignmentItemStaffDto[]> {
    const items = await this.items.listItems(id, actor);
    return items.map(AssignmentItemStaffDto.from);
  }

  @Post(':id/items')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @RequiresFeature(FeatureKey.ASSIGNMENTS_AUTHOR)
  async createItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssignmentItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AssignmentItemStaffDto> {
    return AssignmentItemStaffDto.from(await this.items.createItem(id, dto, actor));
  }

  @Post(':id/items/reorder')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @RequiresFeature(FeatureKey.ASSIGNMENTS_AUTHOR)
  @HttpCode(200)
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderItemsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AssignmentItemStaffDto[]> {
    const items = await this.items.reorder(id, dto.orderedItemIds, actor);
    return items.map(AssignmentItemStaffDto.from);
  }

  @Get(':id/take')
  async getTake(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TakePayload> {
    return this.taking.getTake(id, actor);
  }

  @Post(':id/attempt/start')
  @HttpCode(200)
  async startAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ deadlineAt: Date; status: string }> {
    const attempt = await this.taking.startAttempt(id, actor);
    return { deadlineAt: attempt.deadlineAt, status: attempt.status };
  }

  @Post(':id/attempt/submit')
  @HttpCode(200)
  async submitAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ status: string; submittedAt: Date | null }> {
    const attempt = await this.taking.submitAttempt(id, actor);
    return { status: attempt.status, submittedAt: attempt.submittedAt };
  }
}
