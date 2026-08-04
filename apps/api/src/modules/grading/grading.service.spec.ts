import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AssignmentItemKind } from '../assignments/enums/assignment-item-kind.enum';
import { AssignmentStatus } from '../assignments/enums/assignment-status.enum';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Submission } from '../submissions/entities/submission.entity';
import { SubmissionContext } from '../submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';
import { AssignmentScore } from './entities/assignment-score.entity';
import { ProblemScore } from './entities/problem-score.entity';
import { GradingStatus } from './enums/grading-status.enum';
import { GradingService } from './grading.service';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder?: jest.Mock;
};

function fakeQueryBuilder(rawResult: { total: string }) {
  const qb: Record<string, jest.Mock> = {};
  ['innerJoin', 'where', 'andWhere', 'select'].forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.getRawOne = jest.fn().mockResolvedValue(rawResult);
  return qb;
}

describe('GradingService.onSubmissionFinalized — attempt tracking (no auto-award)', () => {
  let problemScores: MockRepo;
  let assignmentScores: MockRepo;
  let submissions: MockRepo;
  let assignmentProblems: MockRepo;
  let assignments: MockRepo;
  let items: MockRepo;
  let mcqResponses: MockRepo;
  let quizResponses: MockRepo;
  let classrooms: { getById: jest.Mock; getDetail: jest.Mock; assertStaffOrGrader: jest.Mock };
  let notifications: { createForRecipients: jest.Mock };
  let service: GradingService;

  const PROFESSOR_ID = 'prof-1';
  const STUDENT_ID = 'student-1';
  const AP_ID = 'ap-1';
  const ASSIGNMENT_ID = 'assignment-1';

  const submission = (overrides: Partial<Submission> = {}): Submission =>
    ({
      id: 'sub-1',
      userId: STUDENT_ID,
      assignmentProblemId: AP_ID,
      context: SubmissionContext.ASSIGNMENT,
      status: SubmissionStatus.ACCEPTED,
      ...overrides,
    }) as Submission;

  const assignmentProblem = (score = 10): AssignmentProblem =>
    ({
      id: AP_ID,
      assignmentId: ASSIGNMENT_ID,
      score,
      assignment: { id: ASSIGNMENT_ID, classroomId: 'classroom-1' } as Assignment,
    }) as AssignmentProblem;

  beforeEach(() => {
    problemScores = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ score: 0, submissionCount: 0, ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    assignmentScores = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ finalScore: 0, ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      createQueryBuilder: undefined,
    };
    submissions = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    assignmentProblems = {
      findOne: jest.fn().mockResolvedValue(assignmentProblem()),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(fakeQueryBuilder({ total: '10' })),
    };
    assignments = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    // MCQ/quiz repos: their createQueryBuilder feeds recomputeAssignmentScore's
    // per-kind sums; default to 0 so the coding-only tests' totals are stable.
    items = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    mcqResponses = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(fakeQueryBuilder({ total: '0' })),
    };
    quizResponses = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: 'quiz-1', ...entity })),
      createQueryBuilder: jest.fn().mockReturnValue(fakeQueryBuilder({ total: '0' })),
    };
    classrooms = {
      getById: jest.fn().mockResolvedValue({ id: 'classroom-1', professorId: PROFESSOR_ID }),
      getDetail: jest.fn().mockResolvedValue({
        id: 'classroom-1',
        professorId: PROFESSOR_ID,
        students: [],
        graders: [],
      }),
      assertStaffOrGrader: jest.fn(),
    };
    notifications = { createForRecipients: jest.fn().mockResolvedValue([]) };

    // GradingService.recomputeAssignmentScore calls
    // this.problemScores.createQueryBuilder(...).innerJoin(AssignmentProblem, ...)
    problemScores.createQueryBuilder = jest.fn().mockReturnValue(fakeQueryBuilder({ total: '10' }));

    service = new GradingService(
      problemScores as unknown as import('typeorm').Repository<ProblemScore>,
      assignmentScores as unknown as import('typeorm').Repository<AssignmentScore>,
      submissions as unknown as import('typeorm').Repository<Submission>,
      assignmentProblems as unknown as import('typeorm').Repository<AssignmentProblem>,
      assignments as unknown as import('typeorm').Repository<Assignment>,
      items as unknown as import('typeorm').Repository<
        import('../assignments/entities/assignment-item.entity').AssignmentItem
      >,
      mcqResponses as unknown as import('typeorm').Repository<
        import('../assignments/entities/mcq-response.entity').McqResponse
      >,
      quizResponses as unknown as import('typeorm').Repository<
        import('../assignments/entities/quiz-response.entity').QuizResponse
      >,
      classrooms as unknown as ClassroomsService,
      notifications as unknown as import('../notifications/notifications.service').NotificationsService,
      // Not exercised by the finalize path; getStudentScore is covered below.
      {
        findOne: jest.fn(),
      } as unknown as import('../assignments/assignments.service').AssignmentsService,
    );
  });

  it('does NOT auto-award on an Accepted submission — points stay 0 awaiting review', async () => {
    // §5.3 decision #3: award-on-accept was removed. An accepted submission is
    // pinned + counted + marked "submitted", but the score remains 0 until a
    // professor grades it.
    submissions.findOne.mockResolvedValue(submission({ status: SubmissionStatus.ACCEPTED }));

    await service.onSubmissionFinalized({ submissionId: 'sub-1' });

    expect(problemScores.save).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 0,
        submissionCount: 1,
        submissionId: 'sub-1',
        gradingStatus: GradingStatus.SUBMITTED,
      }),
    );
  });

  it('tracks a non-Accepted submission the same way — 0 points, awaiting review', async () => {
    submissions.findOne.mockResolvedValue(submission({ status: SubmissionStatus.WRONG_ANSWER }));

    await service.onSubmissionFinalized({ submissionId: 'sub-1' });

    expect(problemScores.save).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 0,
        submissionCount: 1,
        submissionId: 'sub-1',
        gradingStatus: GradingStatus.SUBMITTED,
      }),
    );
  });

  it('skips assignment scoring entirely for a PRACTICE submission', async () => {
    submissions.findOne.mockResolvedValue(submission({ context: SubmissionContext.PRACTICE }));

    await service.onSubmissionFinalized({ submissionId: 'sub-1' });

    expect(assignmentProblems.findOne).not.toHaveBeenCalled();
    expect(problemScores.save).not.toHaveBeenCalled();
  });

  it('does not overwrite an already-Accepted submission with a later non-Accepted one', async () => {
    problemScores.findOne.mockResolvedValue({
      assignmentProblemId: AP_ID,
      userId: STUDENT_ID,
      score: 10,
      submissionCount: 1,
      submission: { id: 'earlier-accepted', status: SubmissionStatus.ACCEPTED },
      submissionId: 'earlier-accepted',
    });
    submissions.findOne.mockResolvedValue(
      submission({ id: 'sub-2', status: SubmissionStatus.WRONG_ANSWER }),
    );

    await service.onSubmissionFinalized({ submissionId: 'sub-2' });

    const saved = problemScores.save.mock.calls[0][0];
    expect(saved.submissionId).toBe('earlier-accepted'); // pinned, not overwritten
    expect(saved.score).toBe(10); // still full points
    expect(saved.submissionCount).toBe(2); // attempt still counted
  });

  it('skips scoring entirely for the classroom professor testing their own assignment', async () => {
    submissions.findOne.mockResolvedValue(submission({ userId: PROFESSOR_ID }));

    await service.onSubmissionFinalized({ submissionId: 'sub-1' });

    expect(problemScores.save).not.toHaveBeenCalled();
  });

  it('does nothing if the submission no longer exists', async () => {
    submissions.findOne.mockResolvedValue(null);
    await expect(service.onSubmissionFinalized({ submissionId: 'gone' })).resolves.toBeUndefined();
    expect(problemScores.save).not.toHaveBeenCalled();
  });

  it('swallows errors so a scoring failure never crashes the judge event pipeline', async () => {
    submissions.findOne.mockRejectedValue(new Error('db exploded'));
    await expect(service.onSubmissionFinalized({ submissionId: 'sub-1' })).resolves.toBeUndefined();
  });
});

describe('GradingService — item-model rollup, grade dispatch, reveal gating (#21)', () => {
  const STUDENT_ID = 'student-1';
  const AP_ID = 'ap-1';
  const ASSIGNMENT_ID = 'assignment-1';
  const STAFF = { id: 'prof-1', role: Role.PROFESSOR } as AuthenticatedUser;
  const STUDENT = { id: STUDENT_ID, role: Role.STUDENT } as AuthenticatedUser;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRepo = Record<string, jest.Mock>;

  function build() {
    const savedAssignmentScores: Array<{ finalScore: number }> = [];
    const problemScores: AnyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ score: 0, submissionCount: 0, ...d })),
      save: jest.fn((e) => Promise.resolve({ id: 'ps-1', ...e })),
      createQueryBuilder: jest.fn(),
    };
    const assignmentScores: AnyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ finalScore: 0, ...d })),
      save: jest.fn((e) => {
        savedAssignmentScores.push(e);
        return Promise.resolve(e);
      }),
    };
    const submissions: AnyRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const assignmentProblems: AnyRepo = { findOne: jest.fn() };
    const assignments: AnyRepo = {
      findOne: jest.fn().mockResolvedValue({ id: ASSIGNMENT_ID, classroomId: 'c1' }),
      exist: jest.fn().mockResolvedValue(true),
      // assertAssignmentExists / getAssignmentScore are now org-scoped via a QB.
      createQueryBuilder: jest.fn(() => {
        const qb: Record<string, jest.Mock> = {};
        qb.where = jest.fn().mockReturnValue(qb);
        qb.andWhere = jest.fn().mockReturnValue(qb); // scopeToOrg appends this for non-superadmins
        qb.getOne = jest.fn().mockResolvedValue({ id: ASSIGNMENT_ID, classroomId: 'c1' });
        return qb;
      }),
    };
    const items: AnyRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const mcqResponses: AnyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((e) => Promise.resolve({ id: 'mcq-1', ...e })),
      createQueryBuilder: jest.fn(),
    };
    const quizResponses: AnyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn((e) => Promise.resolve({ id: 'quiz-1', ...e })),
      createQueryBuilder: jest.fn(),
    };
    const classrooms: AnyRepo = {
      getById: jest.fn().mockResolvedValue({ id: 'c1' }),
      getDetail: jest.fn().mockResolvedValue({ id: 'c1', students: [{ id: STUDENT_ID }] }),
      assertStaffOrGrader: jest.fn(),
    };
    const notifications: AnyRepo = { createForRecipients: jest.fn().mockResolvedValue([]) };
    // #139: getStudentScore authorizes through AssignmentsService.findOne and
    // builds the view from the assignment it returns, so the status a test wants
    // to exercise the reveal gate with is set HERE, not on the repo mock.
    const assignmentsService: AnyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: ASSIGNMENT_ID,
        classroomId: 'c1',
        status: AssignmentStatus.ACTIVE,
      }),
    };

    const service = new GradingService(
      problemScores as never,
      assignmentScores as never,
      submissions as never,
      assignmentProblems as never,
      assignments as never,
      items as never,
      mcqResponses as never,
      quizResponses as never,
      classrooms as never,
      notifications as never,
      assignmentsService as never,
    );
    return {
      service,
      assignmentsService,
      problemScores,
      assignmentScores,
      submissions,
      assignmentProblems,
      assignments,
      items,
      mcqResponses,
      quizResponses,
      classrooms,
      notifications,
      savedAssignmentScores,
    };
  }

  const qbTotal = (total: string) => {
    const qb: Record<string, jest.Mock> = {};
    ['innerJoin', 'where', 'andWhere', 'select'].forEach((m) => {
      qb[m] = jest.fn().mockReturnValue(qb);
    });
    qb.getRawOne = jest.fn().mockResolvedValue({ total });
    return qb;
  };

  it('recomputeAssignmentScore SUMs coding + mcq + quiz (via gradeItem)', async () => {
    const h = build();
    h.items.findOne.mockResolvedValue({
      id: 'item-c',
      kind: AssignmentItemKind.CODING,
      assignmentProblemId: AP_ID,
      assignmentId: ASSIGNMENT_ID,
      maxPoints: 10,
      assignment: { classroomId: 'c1' },
      assignmentProblem: { problem: { title: 'P' } },
    });
    h.problemScores.findOne.mockResolvedValue({
      id: 'ps-1',
      assignmentProblemId: AP_ID,
      userId: STUDENT_ID,
      score: 0,
      submissionCount: 1,
    });
    // Per-kind sums: coding 10 + mcq 5 + quiz 3 = 18.
    h.problemScores.createQueryBuilder.mockReturnValue(qbTotal('10'));
    h.mcqResponses.createQueryBuilder.mockReturnValue(qbTotal('5'));
    h.quizResponses.createQueryBuilder.mockReturnValue(qbTotal('3'));

    await h.service.gradeItem('item-c', STUDENT_ID, { score: 10 }, STAFF);

    expect(h.savedAssignmentScores.at(-1)?.finalScore).toBe(18);
    expect(h.problemScores.save).toHaveBeenCalledWith(
      expect.objectContaining({ score: 10, gradingStatus: GradingStatus.GRADED }),
    );
    expect(h.notifications.createForRecipients).toHaveBeenCalled();
  });

  it('gradeItem quiz path saves QuizResponse.awardedPoints + feedback', async () => {
    const h = build();
    h.items.findOne.mockResolvedValue({
      id: 'item-q',
      kind: AssignmentItemKind.QUIZ,
      assignmentId: ASSIGNMENT_ID,
      maxPoints: 8,
      prompt: 'Explain',
      assignment: { classroomId: 'c1' },
    });
    h.problemScores.createQueryBuilder.mockReturnValue(qbTotal('0'));
    h.mcqResponses.createQueryBuilder.mockReturnValue(qbTotal('0'));
    h.quizResponses.createQueryBuilder.mockReturnValue(qbTotal('7'));

    await h.service.gradeItem('item-q', STUDENT_ID, { score: 7, feedback: 'good' }, STAFF);

    expect(h.quizResponses.save).toHaveBeenCalledWith(
      expect.objectContaining({ awardedPoints: 7, feedback: 'good', gradedById: STAFF.id }),
    );
    expect(h.notifications.createForRecipients).toHaveBeenCalled();
  });

  it('gradeItem clamps to the item maxPoints', async () => {
    const h = build();
    h.items.findOne.mockResolvedValue({
      id: 'item-q',
      kind: AssignmentItemKind.QUIZ,
      assignmentId: ASSIGNMENT_ID,
      maxPoints: 5,
      assignment: { classroomId: 'c1' },
    });
    await expect(h.service.gradeItem('item-q', STUDENT_ID, { score: 6 }, STAFF)).rejects.toThrow(
      /exceed/,
    );
  });

  it('student my-score HIDES scores + finalScore until GRADE_PUBLISHED', async () => {
    const h = build();
    h.assignmentsService.findOne.mockResolvedValue({
      id: ASSIGNMENT_ID,
      classroomId: 'c1',
      status: AssignmentStatus.ACTIVE, // not published
    });
    h.items.find.mockResolvedValue([
      { id: 'i1', kind: AssignmentItemKind.CODING, assignmentProblemId: AP_ID, maxPoints: 10 },
      {
        id: 'i2',
        kind: AssignmentItemKind.MCQ,
        assignmentProblemId: null,
        maxPoints: 5,
        prompt: 'Q',
      },
    ]);
    h.problemScores.find.mockResolvedValue([
      {
        assignmentProblemId: AP_ID,
        score: 10,
        gradingStatus: GradingStatus.GRADED,
        submissionId: 's1',
        feedback: 'nice',
      },
    ]);
    h.mcqResponses.find.mockResolvedValue([{ itemId: 'i2', awardedPoints: 5 }]);
    h.assignmentScores.findOne.mockResolvedValue({ finalScore: 15, feedback: 'x' });

    const view = await h.service.getStudentScore(ASSIGNMENT_ID, STUDENT);

    expect(view.assignmentScore.finalScore).toBeNull();
    expect(view.assignmentScore.maxScore).toBe(15); // maxScore still shown
    expect(view.items[0].score).toBeNull();
    expect(view.items[1].score).toBeNull();
    // 'graded' is clamped to 'submitted' pre-publish (§9.2) — state surfaced
    // without revealing that grading has completed.
    expect(view.items[0].gradingStatus).toBe(GradingStatus.SUBMITTED);
    expect(view.items[0].feedback).toBe('');
  });

  it('student my-score REVEALS full scores at GRADE_PUBLISHED', async () => {
    const h = build();
    h.assignmentsService.findOne.mockResolvedValue({
      id: ASSIGNMENT_ID,
      classroomId: 'c1',
      status: AssignmentStatus.GRADE_PUBLISHED,
    });
    h.items.find.mockResolvedValue([
      { id: 'i1', kind: AssignmentItemKind.CODING, assignmentProblemId: AP_ID, maxPoints: 10 },
      {
        id: 'i2',
        kind: AssignmentItemKind.MCQ,
        assignmentProblemId: null,
        maxPoints: 5,
        prompt: 'Q',
      },
    ]);
    h.problemScores.find.mockResolvedValue([
      {
        assignmentProblemId: AP_ID,
        score: 10,
        gradingStatus: GradingStatus.GRADED,
        submissionId: 's1',
      },
    ]);
    h.mcqResponses.find.mockResolvedValue([{ itemId: 'i2', awardedPoints: 5 }]);
    h.assignmentScores.findOne.mockResolvedValue({ finalScore: 15, feedback: 'x' });

    const view = await h.service.getStudentScore(ASSIGNMENT_ID, STUDENT);

    expect(view.assignmentScore.finalScore).toBe(15);
    expect(view.items[0].score).toBe(10);
    expect(view.items[1].score).toBe(5);
  });

  it('staff students-scores ALWAYS shows full scores, even pre-publish', async () => {
    const h = build();
    // classroomForAssignment → assignments.findOne (classroomId) → getDetail
    h.classrooms.getDetail.mockResolvedValue({ id: 'c1', students: [{ id: STUDENT_ID }] });
    h.items.find.mockResolvedValue([
      { id: 'i1', kind: AssignmentItemKind.CODING, assignmentProblemId: AP_ID, maxPoints: 10 },
    ]);
    h.problemScores.find.mockResolvedValue([
      {
        assignmentProblemId: AP_ID,
        userId: STUDENT_ID,
        score: 9,
        gradingStatus: GradingStatus.GRADED,
        submissionId: 's1',
      },
    ]);
    h.assignmentScores.find.mockResolvedValue([
      { userId: STUDENT_ID, finalScore: 9, feedback: '' },
    ]);

    const rows = await h.service.getStudentsScore(ASSIGNMENT_ID, STAFF);

    expect(rows[0].items[0].score).toBe(9); // staff bypass the reveal gate
    expect(rows[0].assignmentScore.finalScore).toBe(9);
  });

  /**
   * #139 moved `my-score` off the staff GRADING module gate, so what is asserted
   * below is no longer defence in depth — it is the whole of the authorization
   * on that route. Hence the explicit coverage the issue asked for.
   */
  describe('getStudentScore is the sole gate on my-score (#139)', () => {
    it('reads ONLY the actor’s own rows — every repo query is filtered to actor.id', async () => {
      const h = build();
      h.items.find.mockResolvedValue([
        { id: 'i1', kind: AssignmentItemKind.CODING, assignmentProblemId: AP_ID, maxPoints: 10 },
        { id: 'i2', kind: AssignmentItemKind.MCQ, assignmentProblemId: null, maxPoints: 5 },
        { id: 'i3', kind: AssignmentItemKind.QUIZ, assignmentProblemId: null, maxPoints: 5 },
      ]);

      const view = await h.service.getStudentScore(ASSIGNMENT_ID, STUDENT);

      expect(view.userId).toBe(STUDENT_ID);
      // There is no parameter by which a caller could name another student, so
      // the guarantee is that actor.id is what reaches every query.
      for (const repo of [h.problemScores, h.mcqResponses, h.quizResponses]) {
        expect(repo.find).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ userId: STUDENT_ID }) }),
        );
      }
      expect(h.assignmentScores.findOne).toHaveBeenCalledWith({
        where: { assignmentId: ASSIGNMENT_ID, userId: STUDENT_ID },
      });
    });

    it('404s a cross-org assignment id before it 403s — no cross-tenant existence leak', async () => {
      const h = build();
      // scopeToOrg'd query builder finds nothing for an assignment in another org.
      h.assignments.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(h.service.getStudentScore('other-org-assignment', STUDENT)).rejects.toThrow(
        /not found/i,
      );
      // Order matters: the tenancy 404 must win, so the visibility check — which
      // answers 403, confirming existence — is never reached.
      expect(h.assignmentsService.findOne).not.toHaveBeenCalled();
    });

    it('defers to the shared assignment-visibility policy for a same-org outsider', async () => {
      const h = build();
      // A student of the same org who is in no batch / not in the classroom:
      // AssignmentsService.findOne is the single source of that rule.
      h.assignmentsService.findOne.mockRejectedValue(
        new ForbiddenException('You do not have access to this assignment'),
      );

      await expect(h.service.getStudentScore(ASSIGNMENT_ID, STUDENT)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Rejected before any score row is touched.
      expect(h.problemScores.find).not.toHaveBeenCalled();
      expect(h.assignmentScores.findOne).not.toHaveBeenCalled();
    });

    it('builds the view from the authorized assignment, not a second re-read', async () => {
      const h = build();
      h.assignmentsService.findOne.mockResolvedValue({
        id: ASSIGNMENT_ID,
        classroomId: 'c1',
        status: AssignmentStatus.GRADE_PUBLISHED,
      });
      // The repo mock disagrees on status. If the view were rebuilt off a fresh
      // repo read it could reveal (or withhold) against a staler status than the
      // one the gate authorized — pinned so that cannot regress.
      h.assignments.findOne.mockResolvedValue({
        id: ASSIGNMENT_ID,
        classroomId: 'c1',
        status: AssignmentStatus.ACTIVE,
      });
      h.items.find.mockResolvedValue([
        { id: 'i1', kind: AssignmentItemKind.CODING, assignmentProblemId: AP_ID, maxPoints: 10 },
      ]);
      h.problemScores.find.mockResolvedValue([
        { assignmentProblemId: AP_ID, score: 10, gradingStatus: GradingStatus.GRADED },
      ]);
      h.assignmentScores.findOne.mockResolvedValue({ finalScore: 10, feedback: 'done' });

      const view = await h.service.getStudentScore(ASSIGNMENT_ID, STUDENT);

      expect(view.assignmentScore.finalScore).toBe(10);
      expect(view.items[0].score).toBe(10);
    });
  });
});
