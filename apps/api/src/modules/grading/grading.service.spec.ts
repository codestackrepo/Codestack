import { AssignmentProblem } from '../assignments/entities/assignment-problem.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
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
      classrooms as unknown as ClassroomsService,
      notifications as unknown as import('../notifications/notifications.service').NotificationsService,
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
