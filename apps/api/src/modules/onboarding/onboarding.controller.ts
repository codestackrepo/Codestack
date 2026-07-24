import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateInviteDto,
  CreateProfessorRequestDto,
  InvitePreviewDto,
  InviteResponseDto,
  ListRequestsQueryDto,
  ProfessorRequestResponseDto,
  RejectRequestDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiCookieAuth('access_token')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // ------------------------------------------------------------- invites

  @Post('invites')
  @Roles(Role.ADMIN)
  async mintInvite(
    @Body() dto: CreateInviteDto,
    @CurrentUser('id') adminId: string,
  ): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.onboarding.mintInvite(dto, adminId));
  }

  @Get('invites')
  @Roles(Role.ADMIN)
  async listInvites(@Query() query: PaginationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.onboarding.listInvites(query, actor);
    return { data: page.data.map(InviteResponseDto.from), meta: page.meta };
  }

  /** Public: lets the register page show "you're invited as a professor". */
  @Get('invites/:token/preview')
  @Public()
  async previewInvite(@Param('token') token: string): Promise<InvitePreviewDto> {
    const invite = await this.onboarding.previewInvite(token);
    return invite ? InvitePreviewDto.valid(invite) : InvitePreviewDto.invalid();
  }

  @Post('invites/:id/revoke')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async revokeInvite(@Param('id', ParseUUIDPipe) id: string): Promise<InviteResponseDto> {
    return InviteResponseDto.from(await this.onboarding.revokeInvite(id));
  }

  // ------------------------------------------------------------ requests

  @Post('requests')
  async createRequest(
    @Body() dto: CreateProfessorRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessorRequestResponseDto> {
    return ProfessorRequestResponseDto.from(await this.onboarding.createRequest(actor, dto));
  }

  @Get('requests/me')
  async myRequest(@CurrentUser('id') userId: string): Promise<ProfessorRequestResponseDto | null> {
    const req = await this.onboarding.myLatestRequest(userId);
    return req ? ProfessorRequestResponseDto.from(req) : null;
  }

  @Get('requests')
  @Roles(Role.ADMIN)
  async listRequests(
    @Query() query: ListRequestsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const page = await this.onboarding.listRequests(query, actor, query.status);
    return { data: page.data.map(ProfessorRequestResponseDto.from), meta: page.meta };
  }

  @Post('requests/:id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessorRequestResponseDto> {
    return ProfessorRequestResponseDto.from(await this.onboarding.approveRequest(id, actor));
  }

  @Post('requests/:id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessorRequestResponseDto> {
    return ProfessorRequestResponseDto.from(
      await this.onboarding.rejectRequest(id, actor, dto.reason ?? ''),
    );
  }
}
