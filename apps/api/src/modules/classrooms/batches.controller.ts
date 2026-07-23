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
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BatchesService } from './batches.service';
import {
  BatchResponseDto,
  BatchStudentsDto,
  CreateBatchDto,
  UpdateBatchDto,
} from './dto/batch.dto';

/**
 * Batch management for a classroom. All routes are staff-only
 * (@Roles(ADMIN, PROFESSOR)); the service's assertCanManage is the real gate
 * (ownership/assignment), and graders are excluded by design.
 */
@ApiTags('batches')
@ApiCookieAuth('access_token')
@Roles(Role.ADMIN, Role.PROFESSOR)
@Controller('classrooms/:classroomId/batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  async list(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto[]> {
    const batches = await this.batches.list(classroomId, actor);
    return batches.map(BatchResponseDto.from);
  }

  @Post()
  async create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Body() dto: CreateBatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto> {
    return BatchResponseDto.from(await this.batches.create(classroomId, dto, actor));
  }

  @Get(':batchId')
  async getOne(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto> {
    return BatchResponseDto.from(await this.batches.getOne(classroomId, batchId, actor));
  }

  @Patch(':batchId')
  async update(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto> {
    return BatchResponseDto.from(await this.batches.update(classroomId, batchId, dto, actor));
  }

  @Delete(':batchId')
  @HttpCode(204)
  async remove(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.batches.remove(classroomId, batchId, actor);
  }

  @Post(':batchId/students')
  async addStudents(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: BatchStudentsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto> {
    return BatchResponseDto.from(await this.batches.addStudents(classroomId, batchId, dto, actor));
  }

  @Delete(':batchId/students/:studentId')
  async removeStudent(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BatchResponseDto> {
    return BatchResponseDto.from(
      await this.batches.removeStudent(classroomId, batchId, studentId, actor),
    );
  }
}
