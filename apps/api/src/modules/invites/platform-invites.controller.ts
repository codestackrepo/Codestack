import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Platform } from '../platform/decorators/platform.decorator';
import { CreateInviteDto, InviteResponseDto, ListInvitesQueryDto } from './dto/invite.dto';
import { InvitesService } from './invites.service';

/**
 * SuperAdmin invite surface — the same service, a different way of naming the
 * tenant.
 *
 * The split from `InvitesController` is STRUCTURAL, not stylistic. `PlatformGuard`
 * requires `organizationId === null`, so a SuperAdmin can never satisfy an
 * endpoint that derives the tenant from the actor; it has to arrive as a route
 * param. Keeping the two on one controller would mean a single handler that
 * sometimes reads the actor and sometimes reads a param, which is precisely how
 * an org-scoping check gets skipped on one of the branches.
 *
 * `:id` routes assert `invite.organizationId === orgId` and 404 otherwise, so
 * this console cannot be used to probe which org an arbitrary invite id belongs
 * to.
 */
@ApiTags('platform')
@Platform()
@Controller('platform/organizations/:orgId/invites')
export class PlatformInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  async create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.create(dto, actor, orgId));
  }

  @Get()
  async list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: ListInvitesQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const page = await this.invites.list(query, actor, orgId);
    return { data: page.data.map(InviteResponseDto.from), meta: page.meta };
  }

  @Post(':id/resend')
  @HttpCode(200)
  async resend(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.resend(id, actor, orgId));
  }

  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.revoke(id, actor, orgId));
  }
}
