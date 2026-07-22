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
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentsService } from './assignments.service';
import {
  AssignmentProblemEditorResponseDto,
  AssignmentProblemResponseDto,
  AssignmentResponseDto,
} from './dto/assignment-response.dto';
import {
  CloneProblemDto,
  CreateAssignmentDto,
  EditAssignmentProblemDto,
  ImportProblemDto,
  QueryAssignmentsDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

@ApiTags('assignments')
@ApiCookieAuth('access_token')
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async create(@Body() dto: CreateAssignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return AssignmentResponseDto.from(await this.assignments.create(dto, actor));
  }

  @Get()
  async findAll(@Query() query: QueryAssignmentsDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.assignments.findAll(query, actor);
    return { data: page.data.map(AssignmentResponseDto.from), meta: page.meta };
  }

  @Get('deadlines')
  async deadlines(@CurrentUser() actor: AuthenticatedUser) {
    const rows = await this.assignments.myActiveDeadlines(actor);
    return rows.map(AssignmentResponseDto.from);
  }

  // ---- assignment-problem edit/delete (static segment, before :id) ----

  @Get('problems/:apId/editor')
  async editorBootstrap(
    @Param('apId', ParseUUIDPipe) apId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentProblemEditorResponseDto.from(
      await this.assignments.getEditorBootstrap(apId, actor),
    );
  }

  @Patch('problems/:apId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async editProblem(
    @Param('apId', ParseUUIDPipe) apId: string,
    @Body() dto: EditAssignmentProblemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentProblemResponseDto.from(
      await this.assignments.editAssignmentProblem(apId, dto, actor),
    );
  }

  @Delete('problems/:apId')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(204)
  async deleteProblem(
    @Param('apId', ParseUUIDPipe) apId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.assignments.deleteAssignmentProblem(apId, actor);
  }

  // ---- single assignment ----

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return AssignmentResponseDto.from(await this.assignments.findOne(id, actor));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentResponseDto.from(await this.assignments.update(id, dto, actor));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.assignments.remove(id, actor);
  }

  @Post(':id/publish')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(200)
  async publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return AssignmentResponseDto.from(await this.assignments.publish(id, actor));
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(200)
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return AssignmentResponseDto.from(await this.assignments.complete(id, actor));
  }

  @Post(':id/publish-grades')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(200)
  async publishGrades(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentResponseDto.from(await this.assignments.publishGrades(id, actor));
  }

  @Get(':id/problems')
  async problems(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    const rows = await this.assignments.getAssignmentProblems(id, actor);
    return rows.map(AssignmentProblemResponseDto.from);
  }

  @Post(':id/problems/import')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async importProblem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportProblemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentProblemResponseDto.from(await this.assignments.importProblem(id, dto, actor));
  }

  @Post(':id/problems/clone')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async cloneProblem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneProblemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return AssignmentProblemResponseDto.from(await this.assignments.cloneProblem(id, dto, actor));
  }
}
