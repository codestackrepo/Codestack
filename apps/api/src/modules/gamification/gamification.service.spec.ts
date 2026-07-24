import { Role } from '../../common/enums/role.enum';
import { Difficulty } from '../problems/enums/problem.enums';
import { SubmissionContext } from '../submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';
import { GamificationListener } from './gamification.listener';
import { GamificationService } from './gamification.service';
import { localToday, subtractDay } from './gamification.util';

const TODAY = localToday('UTC');
const YESTERDAY = subtractDay(TODAY);
const THREE_DAYS_AGO = subtractDay(subtractDay(YESTERDAY));

interface Harness {
  service: GamificationService;
  agg: Record<string, unknown>;
  queryCalls: string[];
  save: jest.Mock;
  transaction: jest.Mock;
  gamificationRepo: { findOne: jest.Mock };
}

function build(opts: {
  submission?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  problem?: Record<string, unknown> | null;
  agg?: Record<string, unknown>;
  firstSolveInserted?: boolean;
  ledgerInserted?: boolean;
}): Harness {
  const agg = opts.agg ?? {
    userId: 'u1',
    totalPoints: 0,
    easySolved: 0,
    mediumSolved: 0,
    hardSolved: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    timezone: 'UTC',
  };
  const queryCalls: string[] = [];
  const save = jest.fn(async (e) => e);
  const m = {
    query: jest.fn(async (sql: string) => {
      queryCalls.push(sql);
      if (sql.includes('user_solved_problems')) {
        return opts.firstSolveInserted === false ? [] : [{ id: 'solve-1' }];
      }
      if (sql.includes('points_ledger')) {
        return opts.ledgerInserted === false ? [] : [{ id: 'ledger-1' }];
      }
      return [];
    }),
    findOne: jest.fn(async () => agg),
    save,
  };
  const transaction = jest.fn(async (cb: (mgr: unknown) => Promise<unknown>) => cb(m));

  const submissions = { findOne: jest.fn(async () => opts.submission ?? null) };
  const problems = { findOne: jest.fn(async () => opts.problem ?? null) };
  const users = { findOne: jest.fn(async () => opts.user ?? null) };
  const gamificationRepo = { findOne: jest.fn(async () => null) };
  const dailyActivity = { find: jest.fn(async () => []) };
  const solved = { createQueryBuilder: jest.fn(), count: jest.fn(async () => 0) };

  const service = new GamificationService(
    submissions as never,
    problems as never,
    users as never,
    gamificationRepo as never,
    dailyActivity as never,
    solved as never,
    { transaction } as never,
  );
  return { service, agg, queryCalls, save, transaction, gamificationRepo };
}

const practiceSub = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  userId: 'u1',
  context: SubmissionContext.PRACTICE,
  problemId: 'p1',
  status: SubmissionStatus.ACCEPTED,
  ...over,
});
const student = { id: 'u1', role: Role.STUDENT, timezone: 'UTC' };

describe('GamificationService.handleFinalizedSubmission — gates', () => {
  it('does nothing for an assignment-context submission', async () => {
    const h = build({
      submission: practiceSub({ context: SubmissionContext.ASSIGNMENT }),
      user: student,
    });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('does nothing for a staff user', async () => {
    const h = build({
      submission: practiceSub(),
      user: { id: 'u1', role: Role.PROFESSOR, timezone: 'UTC' },
    });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('does nothing when the submission is missing', async () => {
    const h = build({ submission: null });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe('GamificationService.handleFinalizedSubmission — org stamping (#58)', () => {
  it('stamps organization_id on the user_gamification upsert (derived from the user, no actor)', async () => {
    const h = build({
      submission: practiceSub(),
      user: { ...student, organizationId: 'org-A' },
      problem: { id: 'p1', difficulty: Difficulty.EASY },
    });
    await h.service.handleFinalizedSubmission('s1');
    const upsert = h.queryCalls.find((s) => s.includes('INSERT INTO user_gamification'));
    expect(upsert).toBeDefined();
    expect(upsert).toContain('organization_id');
  });
});

describe('GamificationService.handleFinalizedSubmission — points', () => {
  it('awards difficulty points + bumps the counter on a first Accept', async () => {
    const h = build({
      submission: practiceSub(),
      user: student,
      problem: { id: 'p1', difficulty: Difficulty.MEDIUM },
    });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.agg.totalPoints).toBe(25);
    expect(h.agg.mediumSolved).toBe(1);
    expect(h.queryCalls.some((s) => s.includes('points_ledger'))).toBe(true);
    expect(h.save).toHaveBeenCalled();
  });

  it('awards 10 for easy and 50 for hard', async () => {
    const easy = build({
      submission: practiceSub(),
      user: student,
      problem: { id: 'p1', difficulty: Difficulty.EASY },
    });
    await easy.service.handleFinalizedSubmission('s1');
    expect(easy.agg.totalPoints).toBe(10);
    expect(easy.agg.easySolved).toBe(1);

    const hard = build({
      submission: practiceSub(),
      user: student,
      problem: { id: 'p1', difficulty: Difficulty.HARD },
    });
    await hard.service.handleFinalizedSubmission('s1');
    expect(hard.agg.totalPoints).toBe(50);
    expect(hard.agg.hardSolved).toBe(1);
  });

  it('does NOT re-award on a second Accept of the same problem', async () => {
    const h = build({
      submission: practiceSub(),
      user: student,
      problem: { id: 'p1', difficulty: Difficulty.MEDIUM },
      firstSolveInserted: false, // conflict → no RETURNING row
    });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.agg.totalPoints).toBe(0);
    expect(h.agg.mediumSolved).toBe(0);
    // daily activity still recorded
    expect(h.queryCalls.some((s) => s.includes('daily_activity'))).toBe(true);
  });

  it('records activity but no points on a non-accepted practice submission', async () => {
    const h = build({
      submission: practiceSub({ status: SubmissionStatus.WRONG_ANSWER }),
      user: student,
      problem: { id: 'p1', difficulty: Difficulty.MEDIUM },
    });
    await h.service.handleFinalizedSubmission('s1');
    expect(h.agg.totalPoints).toBe(0);
    expect(h.queryCalls.some((s) => s.includes('user_solved_problems'))).toBe(false);
    expect(h.queryCalls.some((s) => s.includes('daily_activity'))).toBe(true);
  });
});

describe('GamificationService.handleFinalizedSubmission — streak math', () => {
  const run = async (lastActivityDate: string | null, currentStreak: number) => {
    const h = build({
      submission: practiceSub({ status: SubmissionStatus.WRONG_ANSWER }),
      user: student,
      agg: {
        userId: 'u1',
        totalPoints: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        currentStreak,
        longestStreak: currentStreak,
        lastActivityDate,
        timezone: 'UTC',
      },
    });
    await h.service.handleFinalizedSubmission('s1');
    return h.agg;
  };

  it('unchanged when already active today', async () => {
    const agg = await run(TODAY, 5);
    expect(agg.currentStreak).toBe(5);
  });

  it('increments when last activity was yesterday', async () => {
    const agg = await run(YESTERDAY, 5);
    expect(agg.currentStreak).toBe(6);
    expect(agg.longestStreak).toBe(6);
    expect(agg.lastActivityDate).toBe(TODAY);
  });

  it('resets to 1 on a gap (or first ever)', async () => {
    expect((await run(THREE_DAYS_AGO, 5)).currentStreak).toBe(1);
    expect((await run(null, 0)).currentStreak).toBe(1);
  });
});

describe('GamificationListener', () => {
  it('swallows errors so a failure never crashes the event pipeline', async () => {
    const gamification = {
      handleFinalizedSubmission: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const listener = new GamificationListener(gamification as never);
    await expect(listener.onSubmissionFinalized({ submissionId: 's1' })).resolves.toBeUndefined();
  });
});

describe('GamificationService read APIs', () => {
  it('getSummary returns a zero-state and inserts nothing when there is no row', async () => {
    const h = build({});
    const summary = await h.service.getSummary('u1');
    expect(summary.totalPoints).toBe(0);
    expect(summary.currentStreak).toBe(0);
    expect(summary.lastActivityDate).toBeNull();
    expect(h.gamificationRepo.findOne).toHaveBeenCalled();
  });

  it('getSummary reports the effective streak (stored when recent, 0 when lapsed)', async () => {
    const h = build({});
    h.gamificationRepo.findOne
      .mockResolvedValueOnce({
        totalPoints: 100,
        easySolved: 1,
        mediumSolved: 1,
        hardSolved: 1,
        currentStreak: 5,
        longestStreak: 9,
        lastActivityDate: TODAY,
        timezone: 'UTC',
      })
      .mockResolvedValueOnce({
        totalPoints: 100,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        currentStreak: 5,
        longestStreak: 9,
        lastActivityDate: THREE_DAYS_AGO,
        timezone: 'UTC',
      });

    const recent = await h.service.getSummary('u1');
    expect(recent.currentStreak).toBe(5);
    expect(recent.totalSolved).toBe(3);

    const lapsed = await h.service.getSummary('u1');
    expect(lapsed.currentStreak).toBe(0);
    expect(lapsed.longestStreak).toBe(9); // longest is always the stored value
  });
});
