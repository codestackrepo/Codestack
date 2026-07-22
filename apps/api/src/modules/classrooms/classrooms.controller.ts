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
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { ClassroomsService } from './classrooms.service';
import { ClassroomResponseDto } from './dto/classroom-response.dto';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';

@ApiTags('classrooms')
@ApiCookieAuth('access_token')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async create(
    @Body() dto: CreateClassroomDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(await this.classrooms.create(dto, actor), true);
  }

  @Get()
  async findAll(@Query() query: PaginationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.classrooms.findAll(query, actor);
    return { data: page.data.map((c) => ClassroomResponseDto.from(c)), meta: page.meta };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(await this.classrooms.findOne(id, actor), true);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassroomDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(await this.classrooms.update(id, dto, actor), true);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.classrooms.remove(id, actor);
  }

  @Get(':id/members')
  async members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    const { professor, students, graders } = await this.classrooms.getMembers(id, actor);
    return {
      professor: professor ? UserResponseDto.from(professor) : null,
      students: students.map(UserResponseDto.from),
      graders: graders.map(UserResponseDto.from),
    };
  }

  @Post(':id/remove-professor')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async removeProfessor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(await this.classrooms.removeProfessor(id, actor), true);
  }

  @Delete(':id/students/:studentId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(
      await this.classrooms.removeStudent(id, studentId, actor),
      true,
    );
  }

  @Delete(':id/graders/:graderId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async removeGrader(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('graderId', ParseUUIDPipe) graderId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassroomResponseDto> {
    return ClassroomResponseDto.from(await this.classrooms.removeGrader(id, graderId, actor), true);
  }
}
