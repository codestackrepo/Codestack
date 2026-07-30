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
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Platform } from './decorators/platform.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { PlatformOrganizationDetailDto } from './dto/platform-organization-detail.dto';
import { PlatformOrganizationDto } from './dto/platform-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ListUsersQueryDto } from '../users/dto/list-users-query.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { PlatformService } from './platform.service';

/**
 * SuperAdmin platform console — cross-org organization management (#62). Every
 * route is @Platform-gated (fresh-DB SUPERADMIN + no-org check). This is the only
 * place org rows are created/suspended, so it deliberately bypasses the per-org
 * tenant scoping that governs the rest of the app.
 */
@ApiTags('platform')
@Platform()
@Controller('platform/organizations')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(): Promise<PlatformOrganizationDto[]> {
    const orgs = await this.platform.list();
    return orgs.map(PlatformOrganizationDto.from);
  }

  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlatformOrganizationDto> {
    return PlatformOrganizationDto.from(await this.platform.create(dto, actor));
  }

  /**
   * One org's members. `overrideOrgId`'s first consumer, and it is safe by
   * construction: scopeToOrg reads that option ONLY inside its isSuperAdmin
   * branch, so an org admin cannot craft `?organizationId=` into another tenant
   * through the ordinary /users route.
   *
   * `getById` first, so an unknown org 404s instead of returning an empty page —
   * matching `detail()`.
   */
  @Get(':id/users')
  async orgUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.platform.getOrganization(id);
    const page = await this.users.findAll(query, actor, { organizationId: id });
    return { data: page.data.map(UserResponseDto.from), meta: page.meta };
  }

  /** Superset of a list row: the org plus its live census read against quotas (#63). */
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformOrganizationDetailDto> {
    return this.platform.detail(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<PlatformOrganizationDto> {
    return PlatformOrganizationDto.from(await this.platform.update(id, dto));
  }

  @Post(':id/suspend')
  @HttpCode(200)
  async suspend(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformOrganizationDto> {
    return PlatformOrganizationDto.from(await this.platform.suspend(id));
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformOrganizationDto> {
    return PlatformOrganizationDto.from(await this.platform.activate(id));
  }
}
