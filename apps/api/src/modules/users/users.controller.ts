import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AllowsUnassigned } from '../../common/decorators/allows-unassigned.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly orgs: OrganizationsService,
  ) {}

  // @AllowsUnassigned: owner-scoped — returns exactly `actor`, reads no other row
  // and touches no tenant.
  @Get('me')
  @AllowsUnassigned()
  async me(@CurrentUser('id') id: string): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.getById(id));
  }

  /**
   * The unassigned pool. Declared ABOVE `@Get(':id')`, which carries a
   * ParseUUIDPipe — Nest matches routes in declaration order, so below it the
   * literal "unassigned" would be parsed as a uuid and 400.
   */
  @Get('unassigned')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async unassigned(@Query() query: ListUsersQueryDto) {
    const page = await this.users.findUnassigned(query);
    return { data: page.data.map(UserResponseDto.from), meta: page.meta };
  }

  @Get('search')
  async search(
    @Query() dto: SearchUsersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto[]> {
    const results = await this.users.search(dto, actor);
    return results.map(UserResponseDto.from);
  }

  @Get()
  async findAll(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.users.findAll(query, actor);
    return { data: page.data.map(UserResponseDto.from), meta: page.meta };
  }

  @Post()
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.create(dto, actor));
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.findOneVisible(id, actor));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.update(id, dto, actor));
  }

  /**
   * Places an unassigned student into the ACTOR's organization. There is no body
   * and no org parameter: the tenant is `actor.organizationId`, so this route
   * cannot be pointed at another one. The SuperAdmin twin lives on the platform
   * controller and names the org explicitly.
   */
  @Post(':id/assign-organization')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(200)
  async assignOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    if (!actor.organizationId) {
      throw new ForbiddenException({ reason: 'no_organization' });
    }
    const org = await this.orgs.getById(actor.organizationId);
    return UserResponseDto.from(
      await this.users.assignOrganization(id, org.id, actor, Role.STUDENT, org.name),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.remove(id, actor);
  }
}
