import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentsService, type EditorBootstrapView } from './assignments.service';
import { AssignmentProblemEditorResponseDto } from './dto/assignment-response.dto';
import { CreateAssignmentDto } from './dto/assignment.dto';
import { Assignment } from './entities/assignment.entity';
import { AssignmentKind } from './enums/assignment-kind.enum';
import { AssignmentStatus } from './enums/assignment-status.enum';
import { AssignmentTargetType } from './enums/assignment-target-type.enum';
import { AttemptStatus } from './enums/attempt-status.enum';

/**
 * #66 — create() had to be WRAPPED in a transaction: a quota check outside one
 * releases its row lock immediately, so the limit would be advisory.
 */
describe('AssignmentsService.create — quota enforcement (#66)', () => {
  const actor: AuthenticatedUser = {
    id: 'prof-1',
    role: Role.PROFESSOR,
    email: 'p@x.io',
    organizationId: 'actor-org',
  };

  function setup() {
    const order: string[] = [];
    const repo = {
      create: jest.fn((o: Record<string, unknown>) => o),
      save: jest.fn(async (o: Record<string, unknown>) => {
        order.push('save');
        return { id: 'a-1', ...o };
      }),
    };
    const assignments = {
      manager: {
        transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
          order.push('tx');
          return cb({ getRepository: () => repo });
        }),
      },
    };
    const quotas = {
      assertWithinQuota: jest.fn(async () => void order.push('quota')),
    };
    // The classroom lives in a DIFFERENT org than the actor, so the test can tell
    // which one is charged.
    const classroomsService = {
      getDetail: jest.fn().mockResolvedValue({ id: 'c-1', organizationId: 'classroom-org' }),
      assertStaffOrGrader: jest.fn(),
    };
    const service = new AssignmentsService(
      assignments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never, // batches
      {} as never,
      classroomsService as never,
      {} as never,
      {} as never,
      {} as never,
      quotas as never,
    );
    return { service, assignments, quotas, repo, order };
  }

  const dto = (): CreateAssignmentDto =>
    ({
      title: 'A',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-02-01T00:00:00.000Z',
      classroomId: 'c-1',
    }) as CreateAssignmentDto;

  it('runs the check inside a transaction, before the insert', async () => {
    const { service, assignments, order } = setup();
    await service.create(dto(), actor);
    expect(assignments.manager.transaction).toHaveBeenCalled();
    expect(order).toEqual(['tx', 'quota', 'save']);
  });

  it("charges the CLASSROOM's org, not the actor's", async () => {
    const { service, quotas } = setup();
    await service.create(dto(), actor);
    // Charging the actor would let a SuperAdmin acting on a tenant dodge its cap.
    expect(quotas.assertWithinQuota).toHaveBeenCalledWith(
      'classroom-org',
      'max_assignments',
      1,
      expect.anything(),
    );
  });

  it('does not insert when the quota check throws', async () => {
    const { service, quotas, repo } = setup();
    quotas.assertWithinQuota.mockRejectedValue(new Error('quota_exceeded'));
    await expect(service.create(dto(), actor)).rejects.toThrow('quota_exceeded');
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('AssignmentsService — kind/targeting validation', () => {
  let batches: { find: jest.Mock };
  let classroomsService: { getDetail: jest.Mock; assertStaffOrGrader: jest.Mock };
  let service: AssignmentsService;

  const actor: AuthenticatedUser = {
    id: 'prof-1',
    role: Role.PROFESSOR,
    email: 'p@x.io',
    organizationId: 'org-test',
  };
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
      {} as never, // testCases
      {} as never, // libraryTemplates
      batches as never,
      {} as never, // attempts
      classroomsService as never,
      {} as never, // dataSource
      {} as never, // emitter
      { getVisible: jest.fn() } as never, // problemsService (#57)
      { assertWithinQuota: jest.fn() } as never, // quotas (#66)
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

const MINUTE = 60_000;
const past = () => new Date(Date.now() - 5 * MINUTE);
const future = () => new Date(Date.now() + 5 * MINUTE);

function makeSweepService(overrides: {
  candidates?: Assignment[];
  attemptFindOne?: unknown;
  affected?: number;
}) {
  const sweepQb = {
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(overrides.candidates ?? []),
  };
  const updateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: overrides.affected ?? 0 }),
  };
  const assignmentsRepo = {
    createQueryBuilder: jest.fn(() => sweepQb),
    save: jest.fn(async (x) => x),
  };
  const attemptsRepo = {
    findOne: jest.fn(async () => overrides.attemptFindOne ?? null),
    findOneOrFail: jest.fn(async () => overrides.attemptFindOne),
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => ({ id: 'att-1', ...d })),
    createQueryBuilder: jest.fn(() => updateQb),
  };
  const noop = {} as never;
  const service = new AssignmentsService(
    assignmentsRepo as never, // assignments
    noop, // assignmentProblems
    noop, // templates
    noop, // testCases
    noop, // libraryTemplates
    noop, // batches
    attemptsRepo as never, // attempts
    noop, // classroomsService
    noop, // dataSource
    noop, // emitter
    noop, // problemsService (#57)
    noop, // quotas (#66)
  );
  return { service, assignmentsRepo, attemptsRepo };
}

const assignmentRow = (over: Partial<Assignment>): Assignment =>
  Object.assign(new Assignment(), {
    id: 'a1',
    status: AssignmentStatus.SCHEDULED,
    kind: AssignmentKind.ASSIGNMENT,
    startDate: past(),
    endDate: future(),
    durationMinutes: 60,
    ...over,
  });

describe('AssignmentsService.sweepStatuses (#38)', () => {
  it('flips SCHEDULED→ACTIVE and ACTIVE→COMPLETED, saving only changed rows', async () => {
    const toActivate = assignmentRow({
      id: 'a1',
      status: AssignmentStatus.SCHEDULED,
      startDate: past(),
      endDate: future(),
    });
    const toComplete = assignmentRow({
      id: 'a2',
      status: AssignmentStatus.ACTIVE,
      startDate: past(),
      endDate: past(),
    });
    const { service, assignmentsRepo } = makeSweepService({ candidates: [toActivate, toComplete] });

    const n = await service.sweepStatuses();

    expect(n).toBe(2);
    expect(toActivate.status).toBe(AssignmentStatus.ACTIVE);
    expect(toComplete.status).toBe(AssignmentStatus.COMPLETED);
    expect(assignmentsRepo.save).toHaveBeenCalledWith([toActivate, toComplete]);
  });

  it('never touches DRAFT and returns 0 (no save) when nothing changed', async () => {
    const draft = assignmentRow({ status: AssignmentStatus.DRAFT, endDate: past() });
    const { service, assignmentsRepo } = makeSweepService({ candidates: [draft] });

    const n = await service.sweepStatuses();

    expect(n).toBe(0);
    expect(draft.status).toBe(AssignmentStatus.DRAFT);
    expect(assignmentsRepo.save).not.toHaveBeenCalled();
  });
});

describe('AssignmentsService.assertTestAttemptOpen (#39)', () => {
  it('returns immediately for a plain assignment (no attempt lookup)', async () => {
    const { service, attemptsRepo } = makeSweepService({});
    await service.assertTestAttemptOpen(assignmentRow({ kind: AssignmentKind.ASSIGNMENT }), 'u1');
    expect(attemptsRepo.findOne).not.toHaveBeenCalled();
  });

  it('lazily anchors an attempt for a test, capping the deadline at endDate', async () => {
    const endDate = new Date(Date.now() + 2 * MINUTE); // sooner than started+duration
    const { service, attemptsRepo } = makeSweepService({});
    await service.assertTestAttemptOpen(
      assignmentRow({ kind: AssignmentKind.TEST, durationMinutes: 60, endDate }),
      'u1',
    );
    const saved = attemptsRepo.save.mock.calls[0][0];
    expect(saved.status).toBe(AttemptStatus.IN_PROGRESS);
    expect(saved.deadlineAt.getTime()).toBe(endDate.getTime()); // capped at endDate
  });

  it('auto-submits and rejects when the deadline has passed', async () => {
    const { service, attemptsRepo } = makeSweepService({
      attemptFindOne: { status: AttemptStatus.IN_PROGRESS, deadlineAt: past() },
    });
    await expect(
      service.assertTestAttemptOpen(assignmentRow({ kind: AssignmentKind.TEST }), 'u1'),
    ).rejects.toThrow(/Time is up/);
    const saved = attemptsRepo.save.mock.calls[0][0];
    expect(saved.status).toBe(AttemptStatus.AUTO_SUBMITTED);
  });

  it('rejects an already-submitted attempt', async () => {
    const { service } = makeSweepService({
      attemptFindOne: { status: AttemptStatus.SUBMITTED, deadlineAt: future() },
    });
    await expect(
      service.assertTestAttemptOpen(assignmentRow({ kind: AssignmentKind.TEST }), 'u1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('resolves for an open attempt before the deadline', async () => {
    const { service, attemptsRepo } = makeSweepService({
      attemptFindOne: { status: AttemptStatus.IN_PROGRESS, deadlineAt: future() },
    });
    await service.assertTestAttemptOpen(assignmentRow({ kind: AssignmentKind.TEST }), 'u1');
    expect(attemptsRepo.save).not.toHaveBeenCalled();
  });
});

describe('AssignmentsService.finalizeExpiredAttempts (#39)', () => {
  it('returns the affected count', async () => {
    const { service } = makeSweepService({ affected: 4 });
    expect(await service.finalizeExpiredAttempts()).toBe(4);
  });
});

/**
 * #145. The solve editor is a separate screen from the take page, so it has to
 * bootstrap the timed-test clock itself or the student codes with no countdown
 * and meets the deadline as a 403 on submit.
 */
describe('AssignmentsService.getEditorBootstrap — timed-test clock (#145)', () => {
  const actor = { id: 'u1', role: Role.STUDENT, organizationId: 'org-1' } as AuthenticatedUser;
  const AP = { id: 'ap-1', assignmentId: 'a1', problem: {}, languageTemplates: [] };

  function setup(over: { ap?: unknown; assignment?: Assignment; attempt?: unknown } = {}) {
    const assignmentProblems = { findOne: jest.fn(async () => ('ap' in over ? over.ap : AP)) };
    const attempts = { findOne: jest.fn(async () => over.attempt ?? null), save: jest.fn() };
    const noop = {} as never;
    const service = new AssignmentsService(
      noop, // assignments
      assignmentProblems as never,
      noop, // templates
      noop, // testCases
      noop, // libraryTemplates
      noop, // batches
      attempts as never,
      noop, // classroomsService
      noop, // dataSource
      noop, // emitter
      noop, // problemsService
      noop, // quotas
    );
    const assignment = over.assignment ?? assignmentRow({ kind: AssignmentKind.ASSIGNMENT });
    const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(assignment);
    return { service, assignmentProblems, attempts, findOne };
  }

  it('returns the caller’s own attempt for a timed test', async () => {
    const deadlineAt = future();
    const { service, attempts } = setup({
      assignment: assignmentRow({ kind: AssignmentKind.TEST }),
      attempt: { deadlineAt, status: AttemptStatus.IN_PROGRESS },
    });

    const res = await service.getEditorBootstrap('ap-1', actor);

    expect(res.attempt).toMatchObject({ deadlineAt, status: AttemptStatus.IN_PROGRESS });
    expect(res.assignment.kind).toBe(AssignmentKind.TEST);
    // Scoped to the actor — an editor bootstrap must never surface another
    // student's clock.
    expect(attempts.findOne).toHaveBeenCalledWith({
      where: { assignmentId: 'a1', userId: 'u1' },
    });
  });

  it('does not look for an attempt on a regular assignment', async () => {
    const { service, attempts } = setup({
      assignment: assignmentRow({ kind: AssignmentKind.ASSIGNMENT }),
    });

    const res = await service.getEditorBootstrap('ap-1', actor);

    expect(res.attempt).toBeNull();
    expect(attempts.findOne).not.toHaveBeenCalled();
  });

  /**
   * The load-bearing one. Opening a problem must not start somebody's clock —
   * `assertTestAttemptOpen` creates lazily on submit and the take page starts it
   * deliberately, but a READ path that creates would cost a student time merely
   * for looking.
   */
  it('never creates an attempt — a test not yet started reports null', async () => {
    const { service, attempts } = setup({
      assignment: assignmentRow({ kind: AssignmentKind.TEST }),
      attempt: null,
    });

    const res = await service.getEditorBootstrap('ap-1', actor);

    expect(res.attempt).toBeNull();
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('404s an unknown assignment problem before any permission work', async () => {
    const { service, findOne } = setup({ ap: null });
    await expect(service.getEditorBootstrap('nope', actor)).rejects.toThrow(/not found/i);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('still delegates view permission to findOne, and lets it reject', async () => {
    const { service, findOne, attempts } = setup();
    findOne.mockRejectedValue(new ForbiddenException('You do not have access to this assignment'));

    await expect(service.getEditorBootstrap('ap-1', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(attempts.findOne).not.toHaveBeenCalled();
  });
});

describe('AssignmentProblemEditorResponseDto — clock serialization (#145)', () => {
  const base = {
    ap: {
      id: 'ap-1',
      assignmentId: 'a1',
      problemId: 'p1',
      score: 10,
      problem: { title: 'T', body: 'B', difficulty: 'medium', tags: [], testCases: [] },
      languageTemplates: [],
    },
  } as never as EditorBootstrapView;

  it('emits the deadline as ISO-8601 alongside the kind', () => {
    const deadlineAt = new Date('2026-08-06T10:30:00.000Z');
    const dto = AssignmentProblemEditorResponseDto.from({
      ...base,
      assignment: assignmentRow({ kind: AssignmentKind.TEST }),
      attempt: { deadlineAt, status: AttemptStatus.IN_PROGRESS } as never,
    });

    expect(dto.kind).toBe(AssignmentKind.TEST);
    expect(dto.attempt).toEqual({
      deadlineAt: '2026-08-06T10:30:00.000Z',
      status: AttemptStatus.IN_PROGRESS,
    });
  });

  it('emits a null attempt rather than omitting the key, so the client can branch on it', () => {
    const dto = AssignmentProblemEditorResponseDto.from({
      ...base,
      assignment: assignmentRow({ kind: AssignmentKind.ASSIGNMENT }),
      attempt: null,
    });

    expect(dto.kind).toBe(AssignmentKind.ASSIGNMENT);
    expect(dto.attempt).toBeNull();
  });
});
