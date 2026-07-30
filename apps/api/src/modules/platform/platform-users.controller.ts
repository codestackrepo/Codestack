import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrganizationStatus } from '../organizations/enums/organization.enums';
import { AssignOrganizationDto } from '../users/dto/assign-organization.dto';
import { ListUsersQueryDto } from '../users/dto/list-users-query.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { Platform } from './decorators/platform.decorator';

/**
 * SuperAdmin user administration.
 *
 * Separate from `UsersController` for the same structural reason the invite
 * controllers are split: `PlatformGuard` requires `organizationId === null`, so a
 * SuperAdmin can never satisfy a route that derives the tenant from the actor —
 * it has to arrive as a body field or a route param.
 */
@ApiTags('platform')
@Platform()
@Controller('platform/users')
export class PlatformUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly orgs: OrganizationsService,
  ) {}

  /**
   * Declared above nothing dangerous here (this controller has no `:id` GET), but
   * kept first to mirror `UsersController`, where ordering IS load-bearing.
   */
  @Get('unassigned')
  async unassigned(@Query() query: ListUsersQueryDto) {
    const page = await this.users.findUnassigned(query);
    return { data: page.data.map(UserResponseDto.from), meta: page.meta };
  }

  /**
   * Places an unassigned student into ANY organization, optionally at a role
   * above student — the SuperAdmin is the only actor who may do either.
   */
  @Post(':id/assign-organization')
  @HttpCode(200)
  async assignOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrganizationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    // getById first: an unknown org must 404 before anything is written, and the
    // name is needed for the assignment mail.
    const org = await this.orgs.getById(dto.organizationId);
    if (org.status === OrganizationStatus.SUSPENDED) {
      throw new ConflictException({ reason: 'org_suspended' });
    }
    return UserResponseDto.from(
      await this.users.assignOrganization(id, org.id, actor, dto.role, org.name),
    );
  }
}
