import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AllowsUnassigned } from '../../common/decorators/allows-unassigned.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthConfig } from '../../config/configuration';
import { AuthService } from '../auth/auth.service';
import { setAuthCookies } from '../auth/cookie.util';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  AcceptInviteDto,
  ClaimInviteDto,
  CreateInviteDto,
  InvitePreviewDto,
  InviteResponseDto,
  ListInvitesQueryDto,
} from './dto/invite.dto';
import { InvitesService } from './invites.service';

/**
 * Org-scoped invite surface.
 *
 * There is deliberately NO class-level `@Roles`. Two reasons, both load-bearing:
 *
 *  - `RolesGuard` has no `IS_PUBLIC_KEY` bail, so a class-level `@Roles` plus a
 *    method `@Public()` would 403 the public accept/preview routes.
 *  - It is minimum-rank, so a class-level `@Roles(PROFESSOR)` would reject the
 *    STUDENT that `claim` exists for.
 *
 * No handler here accepts an organization identifier anywhere — the tenant is
 * always `actor.organizationId`. That is why there is no `assertSameOrg` to
 * forget on the create path.
 */
@ApiTags('invites')
@ApiCookieAuth('access_token')
@Controller('invites')
export class InvitesController {
  private readonly authCfg: AuthConfig;

  constructor(
    private readonly invites: InvitesService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.authCfg = config.getOrThrow<AuthConfig>('auth');
  }

  // ------------------------------------------------------------------ staff

  @Post()
  @Roles(Role.PROFESSOR)
  @Throttle({ minute: { limit: 20, ttl: 60_000 } })
  async create(
    @Body() dto: CreateInviteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.create(dto, actor, this.requireOrg(actor)));
  }

  @Get()
  @Roles(Role.PROFESSOR)
  async list(@Query() query: ListInvitesQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.invites.list(query, actor);
    return { data: page.data.map(InviteResponseDto.from), meta: page.meta };
  }

  @Post(':id/resend')
  @Roles(Role.PROFESSOR)
  @HttpCode(200)
  async resend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.resend(id, actor));
  }

  @Post(':id/revoke')
  @Roles(Role.PROFESSOR)
  @HttpCode(200)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.invites.revoke(id, actor));
  }

  // --------------------------------------------------- org-less holding state

  /** Owner-scoped: keyed on the actor's own address, no tenant involved. */
  @Get('mine')
  @AllowsUnassigned()
  async mine(@CurrentUser() actor: AuthenticatedUser): Promise<InviteResponseDto[]> {
    return (await this.invites.listMine(actor)).map(InviteResponseDto.from);
  }

  /** Token-scoped, and additionally asserts the invite is addressed to the actor. */
  @Post('claim')
  @AllowsUnassigned()
  @HttpCode(200)
  @Throttle({ minute: { limit: 5, ttl: 60_000 } })
  async claim(
    @Body() dto: ClaimInviteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ user: UserResponseDto; message: string }> {
    const user = await this.invites.claim(actor, dto.token);
    // No new cookies: the JwtAuthGuard re-stamps request.user from the fresh row
    // on the very next request, so the new org and role bind immediately.
    return { user: UserResponseDto.from(user), message: 'Joined organization' };
  }

  // ----------------------------------------------------------------- public

  /**
   * Never 4xxs, by design — including for a bogus token. A 4xx would put the raw
   * token into `AllExceptionsFilter`'s `path` field and thence the log.
   */
  @Get(':token/preview')
  @Public()
  @Throttle({ minute: { limit: 20, ttl: 60_000 } })
  async preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    const found = await this.invites.preview(token);
    return found
      ? InvitePreviewDto.valid(found.invite, found.organizationName)
      : InvitePreviewDto.invalid();
  }

  @Post('accept')
  @Public()
  @HttpCode(200)
  @Throttle({ minute: { limit: 5, ttl: 60_000 } })
  async accept(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserResponseDto; message: string; alreadyMember?: boolean }> {
    const result = await this.invites.accept(dto);

    if (result.outcome === 'already_member') {
      // The invite is consumed, but nothing authenticated here — issuing cookies
      // would let anyone holding the link sign in as the existing member.
      return {
        user: UserResponseDto.from(result.user),
        message: 'You are already a member of this organization',
        alreadyMember: true,
      };
    }

    const tokens = await this.auth.login(result.user);
    setAuthCookies(res, tokens, this.authCfg);
    return { user: UserResponseDto.from(result.user), message: 'Invitation accepted' };
  }

  /**
   * `RolesGuard` passes a SUPERADMIN through `@Roles(PROFESSOR)` and
   * `TenantContextGuard` early-returns for them, so without this a SuperAdmin
   * reaching the org path would write `organization_id = NULL` and skip the quota
   * check entirely. They have their own `@Platform()` controller.
   */
  private requireOrg(actor: AuthenticatedUser): string {
    if (!actor.organizationId) {
      throw new ForbiddenException({
        reason: 'no_organization',
        message: 'Use the platform invite endpoint to invite into a specific organization',
      });
    }
    return actor.organizationId;
  }
}
