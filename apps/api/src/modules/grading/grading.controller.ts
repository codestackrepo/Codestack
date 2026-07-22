import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UpdateScoreDto } from './dto/grading.dto';
import { GradingService } from './grading.service';

@ApiTags('grading')
@ApiCookieAuth('access_token')
@Controller('grading')
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get('assignments/:assignmentId/my-score')
  myScore(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.getStudentScore(assignmentId, actor);
  }

  @Get('assignments/:assignmentId/students-scores')
  studentsScores(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.getStudentsScore(assignmentId, actor);
  }

  @Get('assignments/:assignmentId/score')
  assignmentScore(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.getAssignmentScore(assignmentId, actor);
  }

  @Patch('problems/:assignmentProblemId/students/:studentId')
  updateScore(
    @Param('assignmentProblemId', ParseUUIDPipe) apId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.updateScore(apId, studentId, dto, actor);
  }
}
