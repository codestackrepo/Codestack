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
  let dataSource: {
    manager: { query: jest.Mock; transaction: jest.Mock };
    transaction: jest.Mock;
  };
  let access: { isEnabled: jest.Mock };
  let service: AssignmentItemsService;

  const actor: AuthenticatedUser = {
    id: 'prof-1',
    role: Role.PROFESSOR,
    email: 'p@x.io',
    organizationId: 'org-test',
  };

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
    const query = jest.fn().mockResolvedValue(undefined);
    // transaction() runs its callback with a manager that shares the same query
    // mock, so assertions on dataSource.manager.query still see the calls.
    const transaction = jest.fn(async (cb: (m: unknown) => unknown) => cb({ query }));
    // `transaction` also has to exist on dataSource itself, not only on .manager:
    // the MCQ create path calls `this.dataSource.transaction(...)`. Every existing
    // case threw in validation before reaching it, so the gap was invisible.
    const txRepos: Record<string, unknown> = {
      AssignmentItem: items,
      McqOption: mcqOptions,
    };
    const entityTx = jest.fn(async (cb: (m: unknown) => unknown) =>
      cb({ query, getRepository: (e: { name: string }) => txRepos[e.name] ?? items }),
    );
    dataSource = { manager: { query, transaction }, transaction: entityTx };
    // Entitled by default so the existing cases exercise authoring, not the gate.
    // Returns a real boolean, matching ModuleAccessService.isEnabled's contract —
    // a mock resolving `undefined` would make every kind look DENIED and turn the
    // gate's own tests green for the wrong reason.
    access = { isEnabled: jest.fn().mockResolvedValue(true) };
    service = new AssignmentItemsService(
      items as never,
      mcqOptions as never,
      assignmentProblems as never,
      assignmentsService as never,
      dataSource as never,
      access as never,
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

  /**
   * #65 — `assignments.mcq-crud` / `.quiz-crud` are enforced HERE and not by
   * `@RequiresFeature`, because item kind is a body field: one route authors
   * coding, mcq and quiz depending on `dto.kind`, so route metadata cannot tell
   * them apart. These pin that the right key is consulted per kind.
   */
  describe('per-kind entitlement (#65)', () => {
    beforeEach(() => {
      // createItem ends by re-reading the row it just wrote; without this the
      // trailing getItemOrThrow throws and masks what these tests assert.
      items.findOne.mockResolvedValue({
        id: 'i-1',
        assignmentId: 'a-1',
        kind: AssignmentItemKind.MCQ,
        maxPoints: 0,
        prompt: '',
        allowMultiple: false,
        options: [],
      });
    });

    const mcqDto = {
      kind: AssignmentItemKind.MCQ,
      orderIndex: 0,
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    };

    it('consults assignments.mcq-crud for an MCQ create', async () => {
      await service.createItem('a-1', mcqDto as never, actor);
      expect(access.isEnabled).toHaveBeenCalledWith(
        'assignments.mcq-crud',
        actor.role,
        actor.organizationId,
      );
    });

    it('consults assignments.quiz-crud for a QUIZ create', async () => {
      await service.createItem(
        'a-1',
        { kind: AssignmentItemKind.QUIZ, orderIndex: 0, prompt: 'why' } as never,
        actor,
      );
      expect(access.isEnabled).toHaveBeenCalledWith(
        'assignments.quiz-crud',
        actor.role,
        actor.organizationId,
      );
    });

    it('403s entitlement_required when the kind feature is off, before writing', async () => {
      access.isEnabled.mockResolvedValue(false);
      await expect(service.createItem('a-1', mcqDto as never, actor)).rejects.toMatchObject({
        response: { reason: 'entitlement_required', feature: 'assignments.mcq-crud' },
      });
      // The gate must precede the write, or a denied request still mutates.
      expect(items.save).not.toHaveBeenCalled();
      expect(mcqOptions.save).not.toHaveBeenCalled();
    });

    it('does NOT gate a CODING item on an mcq/quiz key', async () => {
      // CODING has no dedicated feature key; it is covered by assignments.author
      // on the route. Gating it on either crud key would disable coding authoring
      // for an org that only turned mcq off.
      access.isEnabled.mockResolvedValue(false);
      assignmentsService.assertCanManageById.mockResolvedValue({ id: 'a-1' });
      await service
        .createItem(
          'a-1',
          { kind: AssignmentItemKind.CODING, orderIndex: 0, sourceProblemId: 'p-1' } as never,
          actor,
        )
        .catch(() => undefined); // the coding path needs more fixture than this test provides
      expect(access.isEnabled).not.toHaveBeenCalled();
    });

    it('reads the STORED kind on update, since update carries no kind', async () => {
      items.findOne.mockResolvedValue({
        id: 'i-1',
        assignmentId: 'a-1',
        kind: AssignmentItemKind.QUIZ,
        maxPoints: 0,
        prompt: '',
        allowMultiple: false,
      });
      await service.updateItem('i-1', { prompt: 'edited' } as never, actor).catch(() => undefined);
      expect(access.isEnabled).toHaveBeenCalledWith(
        'assignments.quiz-crud',
        actor.role,
        actor.organizationId,
      );
    });
  });
});
