import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/assignment.dto';
import { AssignmentKind } from './enums/assignment-kind.enum';
import { AssignmentTargetType } from './enums/assignment-target-type.enum';

describe('AssignmentsService — kind/targeting validation', () => {
  let batches: { find: jest.Mock };
  let classroomsService: { getDetail: jest.Mock; assertStaffOrGrader: jest.Mock };
  let service: AssignmentsService;

  const actor: AuthenticatedUser = { id: 'prof-1', role: Role.PROFESSOR, email: 'p@x.io' };
  const CLASSROOM_ID = 'c-1';

  const baseDto = (overrides: Partial<CreateAssignmentDto> = {}): CreateAssignmentDto => ({
    title: 'A',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-02-01T00:00:00.000Z',
    classroomId: CLASSROOM_ID,
    ...overrides,
  });

  beforeEach(() => {
    batches = { find: jest.fn().mockResolvedValue([]) };
    classroomsService = {
      getDetail: jest.fn().mockResolvedValue({ id: CLASSROOM_ID }),
      assertStaffOrGrader: jest.fn(),
    };
    // Only the batches repo + classroomsService are exercised by these paths;
    // the rest are never reached because validation throws first.
    service = new AssignmentsService(
      {} as never, // assignments
      {} as never, // assignmentProblems
      {} as never, // templates
      {} as never, // problems
      {} as never, // testCases
      {} as never, // libraryTemplates
      batches as never,
      classroomsService as never,
      {} as never, // dataSource
      {} as never, // emitter
    );
  });

  it('rejects kind=test without durationMinutes', async () => {
    await expect(
      service.create(baseDto({ kind: AssignmentKind.TEST }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects targetType=batch with no target batch ids', async () => {
    await expect(
      service.create(
        baseDto({ targetType: AssignmentTargetType.BATCH, targetBatchIds: [] }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects targetType=batch when a batch id does not belong to the classroom', async () => {
    batches.find.mockResolvedValue([]); // none of the requested ids resolve
    await expect(
      service.create(
        baseDto({ targetType: AssignmentTargetType.BATCH, targetBatchIds: ['b-x'] }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
