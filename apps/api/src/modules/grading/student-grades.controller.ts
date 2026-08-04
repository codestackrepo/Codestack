import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GradingService } from './grading.service';

/**
 * The one grading read that belongs to the STUDENT, deliberately kept off the
 * staff gradebook's module gate (#139).
 *
 * It shares the `grading` path prefix with `GradingController` but NOT its
 * class-level `@RequiresModule(AppModuleKey.GRADING)`. That decorator is right
 * for the gradebook — `MODULE_ACCESS_DEFAULTS` has GRADING at `student: false`
 * because it is the staff grading workspace — but it silently re-gated the one
 * route written for students, so a student saw a locked card instead of their
 * own published mark. Un-gating this read is a locked decision on #80 and was
 * restated on #128: a student reaches their own score even where staff grading
 * is switched off.
 *
 * Why a separate controller rather than lifting the decorator onto each staff
 * method: this way the gate stays the DEFAULT. A route added to
 * `GradingController` tomorrow inherits the module requirement as before, and
 * opting out means moving it here — a visible, deliberate act — instead of
 * forgetting a decorator and failing open.
 *
 * Nothing else may live here. With the module gate gone, the only authorization
 * left is inside `GradingService.getStudentScore`, which scopes every read to
 * the calling actor.
 */
@ApiTags('grading')
@ApiCookieAuth('access_token')
@Controller('grading')
export class StudentGradesController {
  constructor(private readonly grading: GradingService) {}

  /** The caller's OWN score for an assignment. Reveal-gated (§9.2), never another user's. */
  @Get('assignments/:assignmentId/my-score')
  myScore(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.grading.getStudentScore(assignmentId, actor);
  }
}
