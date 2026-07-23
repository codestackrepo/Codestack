import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentItemsService } from './assignment-items.service';
import { AssignmentItem } from './entities/assignment-item.entity';
import { AssignmentItemKind } from './enums/assignment-item-kind.enum';

describe('AssignmentItemsService', () => {
  let items: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let mcqOptions: { delete: jest.Mock; save: jest.Mock; create: jest.Mock };
  let assignmentProblems: { update: jest.Mock };
  let assignmentsService: { assertCanManageById: jest.Mock };
  let dataSource: { manager: { query: jest.Mock } };
  let service: AssignmentItemsService;

  const actor: AuthenticatedUser = { id: 'prof-1', role: Role.PROFESSOR, email: 'p@x.io' };

  beforeEach(() => {
    items = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn((e) => Promise.resolve({ id: 'i-1', ...e })),
    };
    mcqOptions = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn((e) => Promise.resolve(e)),
      create: jest.fn((d) => ({ ...d })),
    };
    assignmentProblems = { update: jest.fn() };
    assignmentsService = { assertCanManageById: jest.fn().mockResolvedValue({ id: 'a-1' }) };
    dataSource = { manager: { query: jest.fn().mockResolvedValue(undefined) } };
    service = new AssignmentItemsService(
      items as never,
      mcqOptions as never,
      assignmentProblems as never,
      assignmentsService as never,
      dataSource as never,
    );
  });

  it('syncs AssignmentProblem.score when a coding item maxPoints is updated', async () => {
    const codingItem = {
      id: 'i-1',
      assignmentId: 'a-1',
      kind: AssignmentItemKind.CODING,
      assignmentProblemId: 'ap-1',
      maxPoints: 10,
    } as AssignmentItem;
    items.findOne.mockResolvedValue(codingItem);
    await service.updateItem('i-1', { maxPoints: 20 }, actor);
    expect(dataSource.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE assignment_problems SET score'),
      [20, 'ap-1'],
    );
    expect(dataSource.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE assignment_items SET max_points'),
      [20, 'ap-1'],
    );
  });

  it('rejects an MCQ create with fewer than 2 options', async () => {
    await expect(
      service.createItem(
        'a-1',
        {
          kind: AssignmentItemKind.MCQ,
          orderIndex: 0,
          options: [{ text: 'only', isCorrect: true }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a single-answer MCQ with more than one correct option', async () => {
    await expect(
      service.createItem(
        'a-1',
        {
          kind: AssignmentItemKind.MCQ,
          orderIndex: 0,
          allowMultiple: false,
          options: [
            { text: 'A', isCorrect: true },
            { text: 'B', isCorrect: true },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an MCQ with no correct option', async () => {
    await expect(
      service.createItem(
        'a-1',
        {
          kind: AssignmentItemKind.MCQ,
          orderIndex: 0,
          allowMultiple: true,
          options: [
            { text: 'A', isCorrect: false },
            { text: 'B', isCorrect: false },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
