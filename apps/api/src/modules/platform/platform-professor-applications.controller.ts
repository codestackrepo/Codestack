import {
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrgInviteSource } from '../invites/enums/org-invite.enums';
import { InvitesService } from '../invites/invites.service';
import { MailTemplate } from '../mail/mail.types';
import {
  ProfessorApplicationDto,
  RejectProfessorApplicationDto,
} from '../onboarding/dto/professor-application.dto';
import { ProfessorApplicationsService } from '../onboarding/professor-applications.service';
import { CommunityOrgService } from '../organizations/community-org.service';
import { Platform } from './decorators/platform.decorator';

/**
 * SuperAdmin review of open-professor applications (#118).
 *
 * Lives here rather than beside the public submit endpoint because approval needs the
 * invite machinery, and only the platform module can import both without the cycle that
 * `OnboardingModule` → `InvitesModule` would create.
 */
@ApiTags('platform')
@Platform()
@Controller('platform/professor-applications')
export class PlatformProfessorApplicationsController {
  private readonly logger = new Logger(PlatformProfessorApplicationsController.name);

  constructor(
    private readonly applications: ProfessorApplicationsService,
    private readonly invites: InvitesService,
    private readonly community: CommunityOrgService,
  ) {}

  // `status` is read off the SAME validated DTO, never a second @Query('status'):
  // forbidNonWhitelisted rejects any query key the DTO does not declare, so the
  // undeclared form 400s before the filter is ever applied.
  @Get()
  async list(@Query() query: ListApplicationsQueryDto) {
    const page = await this.applications.list(query, query.status);
    return { data: page.data.map(ProfessorApplicationDto.from), meta: page.meta };
  }

  /**
   * Approve: mint a PROFESSOR invite into the community tenant.
   *
   * The whole design is that this creates NO bespoke account path. It is an ordinary
   * invite — same token mint, same 14-day TTL, same accept page, same seat handling,
   * same redaction — differing only in three deliberate ways:
   *
   *  - the target org is the community tenant, because an open professor belongs to no
   *    institution;
   *  - `source = 'application'`, because provenance matters: nobody in that tenant chose
   *    to invite this person, a superadmin approved them, and recording it as `manual`
   *    would make the audit trail claim a member acted;
   *  - a template override, because the default professor-invite copy opens with
   *    "You've been invited to join {orgName}" and rendering that as "CodeStack
   *    Community" would name an institution that does not exist.
   *
   * The status flip is claimed FIRST and conditionally, so two simultaneous approvals
   * cannot both reach the mint. If the mint then fails, the application is already
   * approved — deliberately, because the alternative (roll the status back) would let
   * two reviewers race again. The caller is told to invite by hand instead.
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessorApplicationDto> {
    const application = await this.applications.claimForApproval(id, actor);

    try {
      const invite = await this.invites.create(
        {
          email: application.email,
          role: Role.PROFESSOR,
          firstName: application.firstName,
          lastName: application.lastName,
        } as never,
        actor,
        this.community.id,
        OrgInviteSource.APPLICATION,
        MailTemplate.PROFESSOR_APPLICATION_APPROVED,
      );
      const updated = await this.applications.recordInvite(id, invite.id);
      return ProfessorApplicationDto.from(updated);
    } catch (err) {
      this.logger.error(
        `Approved professor application ${id} but the invite to ${application.email} FAILED: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException({
        reason: 'application_approved_invite_failed',
        message:
          `The application was approved, but the invitation to ${application.email} could not be ` +
          `sent. Invite them as a professor from the platform invites page — do not approve again.`,
      });
    }
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProfessorApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessorApplicationDto> {
    const application = await this.applications.reject(id, actor, dto.reason);
    return ProfessorApplicationDto.from(application);
  }
}
