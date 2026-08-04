import { PATH_METADATA } from '@nestjs/common/constants';
import { AppModuleKey } from '../module-access/enums/app-module-key.enum';
import { MODULE_KEY } from '../module-access/decorators/requires-module.decorator';
import { GradingController } from './grading.controller';
import { StudentGradesController } from './student-grades.controller';

/**
 * #139 was a decorator-inheritance bug, not a logic bug: `my-score` sat on a
 * controller carrying a class-level `@RequiresModule(GRADING)`, and GRADING is
 * `student: false` by default, so the one grading route written for students was
 * the one students could not reach.
 *
 * These assertions are about metadata rather than behaviour on purpose. The
 * regression would not be a failing handler — it would be someone adding the
 * decorator back, or moving the route onto the gated controller, and every
 * behavioural test still passing because they run as staff.
 */
describe('grading controller module gating (#139)', () => {
  /** What `ModuleAccessGuard` resolves for a route: handler metadata, else class. */
  const requiredModule = (
    controller: object,
    handler?: (...args: never[]) => unknown,
  ): AppModuleKey | undefined =>
    (handler && Reflect.getMetadata(MODULE_KEY, handler)) ??
    Reflect.getMetadata(MODULE_KEY, controller);

  const handlersOf = (controller: { prototype: object }): string[] =>
    Object.getOwnPropertyNames(controller.prototype).filter((n) => n !== 'constructor');

  it('leaves my-score un-gated: no @RequiresModule on the class or the handler', () => {
    expect(Reflect.getMetadata(MODULE_KEY, StudentGradesController)).toBeUndefined();
    expect(
      Reflect.getMetadata(MODULE_KEY, StudentGradesController.prototype.myScore),
    ).toBeUndefined();
    expect(requiredModule(StudentGradesController, StudentGradesController.prototype.myScore))
      // A student would be rejected before the handler ran if this were GRADING.
      .toBeUndefined();
  });

  it('keeps my-score on the same public path the frontend already calls', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StudentGradesController)).toBe('grading');
    expect(Reflect.getMetadata(PATH_METADATA, StudentGradesController.prototype.myScore)).toBe(
      'assignments/:assignmentId/my-score',
    );
  });

  it('hosts NOTHING but my-score — the un-gated surface stays one route wide', () => {
    expect(handlersOf(StudentGradesController)).toEqual(['myScore']);
  });

  it('still gates every staff grading route on the GRADING module', () => {
    expect(Reflect.getMetadata(MODULE_KEY, GradingController)).toBe(AppModuleKey.GRADING);
    const handlers = handlersOf(GradingController);
    // Guards against the opposite regression: the fix must not have taken the
    // gate off the gradebook, and a route added later inherits it by default.
    expect(handlers).toContain('studentsScores');
    for (const name of handlers) {
      const handler = GradingController.prototype[name as keyof GradingController] as (
        ...args: never[]
      ) => unknown;
      expect(requiredModule(GradingController, handler)).toBe(AppModuleKey.GRADING);
    }
  });

  it('does not host my-score on the gated controller any more', () => {
    expect(handlersOf(GradingController)).not.toContain('myScore');
  });
});
