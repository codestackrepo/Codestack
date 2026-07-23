import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppModuleKey } from '../module-access/enums/app-module-key.enum';
import { RequiresModule } from '../module-access/decorators/requires-module.decorator';
import { UpdateScoreDto } from './dto/grading.dto';
import { GradingService } from './grading.service';

@ApiTags('grading')
@ApiCookieAuth('access_token')
@Controller('grading')
@RequiresModule(AppModuleKey.GRADING)
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

  /** Legacy coding-only manual grade — kept working; delegates to updateScore. */
  @Patch('problems/:assignmentProblemId/students/:studentId')
  updateScore(
    @Param('assignmentProblemId', ParseUUIDPipe) apId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.updateScore(apId, studentId, dto, actor);
  }

  /** Item-keyed manual grade (coding/quiz/mcq-override), dispatched by item kind. */
  @Patch('items/:itemId/students/:studentId')
  gradeItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.gradeItem(itemId, studentId, dto, actor);
  }

  /** Staff item-review detail for the grading drawer (code+verdict / selection
   * vs. correct / quiz text). Staff/grader only. */
  @Get('items/:itemId/students/:studentId')
  itemReview(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.getItemReview(itemId, studentId, actor);
  }
}
