import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Platform } from './decorators/platform.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { PlatformOrganizationDto } from './dto/platform-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
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
  constructor(private readonly platform: PlatformService) {}

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

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformOrganizationDto> {
    return PlatformOrganizationDto.from(await this.platform.getById(id));
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
