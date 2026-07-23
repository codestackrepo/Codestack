import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SubmissionResponseDto } from './dto/submission-response.dto';
import { SubmissionsService } from './submissions.service';

@ApiTags('submissions')
@ApiCookieAuth('access_token')
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubmissionResponseDto> {
    const submission = await this.submissions.getById(id, actor);
    const full = await this.submissions.canViewFullDetail(actor, submission);
    const results = full ? await this.submissions.getResults(id) : undefined;
    return SubmissionResponseDto.from(submission, results, { blind: !full });
  }

  @Get()
  async list(
    @Query('assignmentProblemId', ParseUUIDPipe) assignmentProblemId: string,
    @Query('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubmissionResponseDto[]> {
    const rows = await this.submissions.listForProblem(assignmentProblemId, userId, actor);
    // Assignment-only list: a student's own rows are blind; a staff/grader
    // viewer (userId !== self, already authorized in the service) sees full.
    const blind = userId === actor.id && actor.role !== Role.ADMIN;
    return rows.map((s) => SubmissionResponseDto.from(s, undefined, { blind }));
  }
}
