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
import { CreateProblemDto } from './dto/create-problem.dto';
import { ProblemResponseDto, TestCaseResponseDto } from './dto/problem-response.dto';
import { QueryProblemsDto } from './dto/query-problems.dto';
import { TestCaseInputDto } from './dto/test-case.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemsService } from './problems.service';

@ApiTags('problems')
@ApiCookieAuth('access_token')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async create(
    @Body() dto: CreateProblemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemResponseDto> {
    return ProblemResponseDto.from(await this.problems.create(dto, actor));
  }

  @Get()
  async findAll(@Query() query: QueryProblemsDto, @CurrentUser() actor: AuthenticatedUser) {
    const page = await this.problems.findAll(query, actor);
    return { data: page.data.map((p) => ProblemResponseDto.from(p)), meta: page.meta };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemResponseDto> {
    const problem = await this.problems.findOne(id, actor);
    return ProblemResponseDto.from(problem, problem.testCases);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProblemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemResponseDto> {
    return ProblemResponseDto.from(await this.problems.update(id, dto, actor));
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.problems.remove(id, actor);
  }

  @Get(':id/test-cases')
  async testCases(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TestCaseResponseDto[]> {
    const cases = await this.problems.getTestCases(id, actor);
    return cases.map(TestCaseResponseDto.from);
  }

  @Post(':id/test-cases')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async addTestCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestCaseInputDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TestCaseResponseDto> {
    return TestCaseResponseDto.from(await this.problems.addTestCase(id, dto, actor));
  }

  @Post(':id/clone')
  @Roles(Role.ADMIN, Role.PROFESSOR)
  async clone(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProblemResponseDto> {
    return ProblemResponseDto.from(await this.problems.clone(id, actor));
  }
}
