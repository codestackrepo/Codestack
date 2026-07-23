import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentTakingService } from './assignment-taking.service';
import { AssignmentItemStudentDto } from './dto/assignment-item-response.dto';
import { AssignmentItem } from './entities/assignment-item.entity';
import { McqOption } from './entities/mcq-option.entity';
import { AssignmentItemKind } from './enums/assignment-item-kind.enum';
import { AssignmentKind } from './enums/assignment-kind.enum';
import { AssignmentStatus } from './enums/assignment-status.enum';

describe('AssignmentTakingService', () => {
  let items: { findOne: jest.Mock };
  let mcqOptions: { find: jest.Mock };
  let mcqResponses: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let quizResponses: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let attempts: { findOne: jest.Mock };
  let assignmentsService: { findOne: jest.Mock };
  let service: AssignmentTakingService;

  const actor: AuthenticatedUser = { id: 'stu-1', role: Role.STUDENT, email: 's@x.io' };
  const ITEM_ID = 'i-1';

  const mcqItem = (): AssignmentItem =>
    ({
      id: ITEM_ID,
      assignmentId: 'a-1',
      kind: AssignmentItemKind.MCQ,
      maxPoints: 5,
    }) as AssignmentItem;

  const options = (): McqOption[] =>
    [
      { id: 'o1', isCorrect: true },
      { id: 'o2', isCorrect: false },
      { id: 'o3', isCorrect: true },
    ] as McqOption[];

  beforeEach(() => {
    items = { findOne: jest.fn().mockResolvedValue(mcqItem()) };
    mcqOptions = { find: jest.fn().mockResolvedValue(options()) };
    mcqResponses = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((e) => Promise.resolve(e)),
      create: jest.fn((d) => ({ ...d })),
    };
    quizResponses = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    attempts = { findOne: jest.fn() };
    assignmentsService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a-1',
        status: AssignmentStatus.ACTIVE,
        kind: AssignmentKind.ASSIGNMENT,
      }),
    };
    service = new AssignmentTakingService(
      items as never,
      mcqOptions as never,
      mcqResponses as never,
      quizResponses as never,
      attempts as never,
      assignmentsService as never,
    );
  });

  it('auto-scores an exact-set MCQ match to full maxPoints', async () => {
    await service.saveMcqResponse(ITEM_ID, { selectedOptionIds: ['o1', 'o3'] }, actor);
    const saved = mcqResponses.save.mock.calls[0][0];
    expect(saved.awardedPoints).toBe(5);
  });

  it('awards 0 when the selection has an extra option', async () => {
    await service.saveMcqResponse(ITEM_ID, { selectedOptionIds: ['o1', 'o2', 'o3'] }, actor);
    expect(mcqResponses.save.mock.calls[0][0].awardedPoints).toBe(0);
  });

  it('awards 0 when a correct option is missing', async () => {
    await service.saveMcqResponse(ITEM_ID, { selectedOptionIds: ['o1'] }, actor);
    expect(mcqResponses.save.mock.calls[0][0].awardedPoints).toBe(0);
  });

  it('never returns awardedPoints/correctness to the student', async () => {
    const result = await service.saveMcqResponse(
      ITEM_ID,
      { selectedOptionIds: ['o1', 'o3'] },
      actor,
    );
    expect(result).toEqual({ saved: true });
    expect('awardedPoints' in result).toBe(false);
  });

  it('upserts the MCQ response idempotently on (item, user)', async () => {
    mcqResponses.findOne.mockResolvedValue({ id: 'r-1', selectedOptionIds: [], awardedPoints: 0 });
    await service.saveMcqResponse(ITEM_ID, { selectedOptionIds: ['o1', 'o3'] }, actor);
    expect(mcqResponses.create).not.toHaveBeenCalled(); // updates the existing row
    expect(mcqResponses.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an MCQ write for a test past its deadline (§9.9)', async () => {
    assignmentsService.findOne.mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.ACTIVE,
      kind: AssignmentKind.TEST,
    });
    attempts.findOne.mockResolvedValue({ deadlineAt: new Date(Date.now() - 60_000) });
    await expect(
      service.saveMcqResponse(ITEM_ID, { selectedOptionIds: ['o1', 'o3'] }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AssignmentItemStudentDto.from omits isCorrect on every option', () => {
    const item = {
      id: ITEM_ID,
      kind: AssignmentItemKind.MCQ,
      orderIndex: 0,
      maxPoints: 5,
      prompt: 'Pick',
      allowMultiple: true,
      options: [
        { id: 'o1', text: 'A', isCorrect: true, orderIndex: 0 },
        { id: 'o2', text: 'B', isCorrect: false, orderIndex: 1 },
      ],
    } as unknown as AssignmentItem;
    const dto = AssignmentItemStudentDto.from(item);
    expect(dto.options).toHaveLength(2);
    for (const o of dto.options ?? []) {
      expect('isCorrect' in o).toBe(false);
    }
  });
});
