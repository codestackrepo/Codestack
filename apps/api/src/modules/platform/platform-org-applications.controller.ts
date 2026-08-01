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
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InvitesService } from '../invites/invites.service';
import { OrgInviteSource } from '../invites/enums/org-invite.enums';
import { Role } from '../../common/enums/role.enum';
import {
  ApproveOrganizationApplicationDto,
  OrganizationApplicationDto,
  RejectOrganizationApplicationDto,
} from '../organizations/dto/organization-application.dto';
import { OrganizationApplicationsService } from '../organizations/organization-applications.service';
import { Platform } from './decorators/platform.decorator';

/**
 * SuperAdmin review of organization applications (#118).
 *
 * Lives in the platform module rather than alongside the public submit endpoint for the
 * same structural reason the invite controllers are split: `PlatformGuard` requires
 * `organizationId === null`, so a superadmin can never satisfy a route that derives the
 * tenant from the actor. It is also where the orchestration belongs — approval needs
 * both the applications service and the invite machinery, and the platform module can
 * import both without the circular dependency that would come from `OrganizationsModule`
 * importing `InvitesModule` (which already imports it).
 */
@ApiTags('platform')
@Platform()
@Controller('platform/organization-applications')
export class PlatformOrgApplicationsController {
  private readonly logger = new Logger(PlatformOrgApplicationsController.name);

  constructor(
    private readonly applications: OrganizationApplicationsService,
    private readonly invites: InvitesService,
  ) {}

  /** The review queue. `?status=pending` is what the console lands on. */
  // See ListApplicationsQueryDto: an undeclared `?status=` fails validation outright
  // rather than being ignored, which is why this reads it off the validated DTO.
  @Get()
  async list(@Query() query: ListApplicationsQueryDto) {
    const page = await this.applications.list(query, query.status);
    return { data: page.data.map(OrganizationApplicationDto.from), meta: page.meta };
  }

  /**
   * Approve: create the tenant with its seat caps, then invite its administrator.
   *
   * TWO STEPS, NOT ONE TRANSACTION, and the split is deliberate — see
   * `OrganizationApplicationsService.approve` for why. The consequence is handled here
   * rather than hidden: if the invite fails after the tenant is created, the caller is
   * told precisely that, because the recovery is "send the invite from the platform
   * invites surface", not "try approving again" (which would 409, the application
   * already being approved).
   *
   * The invite goes through the ORDINARY machinery with a SUPERADMIN actor, which is
   * what makes every downstream behaviour identical to any other org-admin invite:
   * `INVITABLE_ROLES[SUPERADMIN]` permits ADMIN, the token is minted and hashed the same
   * way, the 14-day TTL applies, the seat is reserved, the accept page is the same page,
   * and the mail is the same `org-admin-invite` template. Inventing a parallel
   * credential for this one case is how two accept paths with two sets of rules happen.
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveOrganizationApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OrganizationApplicationDto> {
    const outcome = await this.applications.approve(id, actor, dto);

    try {
      await this.invites.create(
        { email: dto.adminEmail, role: Role.ADMIN },
        actor,
        outcome.organization.id,
        OrgInviteSource.MANUAL,
      );
    } catch (err) {
      // The tenant is committed and linked to its application; only the invite is
      // missing, and that is recoverable by hand. Say so, loudly and specifically.
      this.logger.error(
        `Approved application ${id} and created organization ${outcome.organization.id}, but the ` +
          `admin invite to ${dto.adminEmail} FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException({
        reason: 'org_created_invite_failed',
        message:
          `${outcome.organization.name} was created, but the invitation to ${dto.adminEmail} ` +
          `could not be sent. Invite them from the organization's invites page — do not approve again.`,
        organizationId: outcome.organization.id,
      });
    }

    // Only after the invite is safely away: the contact is told their application
    // succeeded, and it would be misleading to say so while the admin has no way in.
    // Skipped automatically when the contact IS the admin — they have the invite itself.
    await this.applications.notifyApproved(outcome);

    return OrganizationApplicationDto.from(outcome.application);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOrganizationApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OrganizationApplicationDto> {
    const application = await this.applications.reject(id, actor, dto.reason);
    return OrganizationApplicationDto.from(application);
  }
}
