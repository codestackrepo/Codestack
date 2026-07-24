import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { LEGACY_ORG_ID } from '../organizations/organizations.constants';
import { Problem } from '../problems/entities/problem.entity';
import { Difficulty } from '../problems/enums/problem.enums';
import { Submission } from '../submissions/entities/submission.entity';
import { SubmissionContext } from '../submissions/enums/submission-context.enum';
import { SubmissionStatus } from '../submissions/enums/submission-status.enum';
import { User } from '../users/entities/user.entity';
import {
  ContributionsResponseDto,
  GamificationSummaryDto,
  SolvedHistoryItemDto,
} from './dto/gamification.dto';
import { DailyActivity } from './entities/daily-activity.entity';
import { PointsLedger } from './entities/points-ledger.entity';
import { UserGamification } from './entities/user-gamification.entity';
import { UserSolvedProblem } from './entities/user-solved-problem.entity';
import { effectiveStreak, localToday, pointsForDifficulty, subtractDay } from './gamification.util';

@Injectable()
export class GamificationService {
  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserGamification)
    private readonly gamification: Repository<UserGamification>,
    @InjectRepository(DailyActivity) private readonly dailyActivity: Repository<DailyActivity>,
    @InjectRepository(UserSolvedProblem)
    private readonly solved: Repository<UserSolvedProblem>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- award path (#35) ----

  /**
   * Award practice gamification for one finalized submission. Practice-only,
   * student-only. Every finalized practice submission advances daily activity +
   * streak; only the FIRST Accept of a problem awards points. Concurrency-safe
   * (row lock + unique-constraint-guarded upserts) and idempotent on re-fire.
   */
  async handleFinalizedSubmission(submissionId: string): Promise<void> {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) return;
    if (submission.context !== SubmissionContext.PRACTICE) return; // assignment never gamifies
    if (!submission.problemId) return; // defensive: practice must carry a problemId

    const user = await this.users.findOne({ where: { id: submission.userId } });
    if (!user || user.role !== Role.STUDENT) return; // staff excluded

    const existing = await this.gamification.findOne({ where: { userId: user.id } });
    const tz = existing?.timezone ?? user.timezone ?? 'UTC';
    const today = localToday(tz);
    const yesterday = subtractDay(today);

    const problem = await this.problems.findOne({
      where: { id: submission.problemId },
      select: { id: true, difficulty: true },
    });
    const accepted = submission.status === SubmissionStatus.ACCEPTED;

    await this.dataSource.transaction(async (m) => {
      // Ensure the aggregate row exists, then lock it for the counter/streak math.
      // Org derived from the persisted user (no request actor in this
      // SUBMISSION_FINALIZED worker path). Non-null in practice (row exists only
      // for STUDENTs, who always have an org); legacy fallback is defensive (#58).
      await m.query(
        `INSERT INTO user_gamification (id, user_id, organization_id, timezone, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, now(), now())
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, user.organizationId ?? LEGACY_ORG_ID, tz],
      );
      const agg = await m.findOne(UserGamification, {
        where: { userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!agg) return; // unreachable after the upsert, but keeps types honest

      // Streak: unchanged if already counted today; +1 if yesterday; else reset.
      if (agg.lastActivityDate !== today) {
        agg.currentStreak = agg.lastActivityDate === yesterday ? agg.currentStreak + 1 : 1;
        agg.longestStreak = Math.max(agg.longestStreak, agg.currentStreak);
        agg.lastActivityDate = today;
      }

      // Daily activity: +1 submission for today (heatmap intensity).
      await m.query(
        `INSERT INTO daily_activity (id, user_id, activity_date, submission_count, solved_count, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, 1, 0, now(), now())
         ON CONFLICT (user_id, activity_date)
         DO UPDATE SET submission_count = daily_activity.submission_count + 1, updated_at = now()`,
        [user.id, today],
      );

      // First-solve + points (only on an Accept, and only once per problem).
      if (accepted && problem) {
        const insertedSolve = await m.query(
          `INSERT INTO user_solved_problems (id, user_id, problem_id, difficulty, first_solved_at, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, now(), now(), now())
           ON CONFLICT (user_id, problem_id) DO NOTHING RETURNING id`,
          [user.id, problem.id, problem.difficulty],
        );
        if (insertedSolve.length > 0) {
          const points = pointsForDifficulty(problem.difficulty);
          const insertedLedger = await m.query(
            `INSERT INTO points_ledger (id, user_id, points, reason, ref_key, created_at, updated_at)
             VALUES (uuid_generate_v4(), $1, $2, 'first_solve', $3, now(), now())
             ON CONFLICT (user_id, reason, ref_key) DO NOTHING RETURNING id`,
            [user.id, points, problem.id],
          );
          if (insertedLedger.length > 0) {
            agg.totalPoints += points;
            if (problem.difficulty === Difficulty.EASY) agg.easySolved += 1;
            else if (problem.difficulty === Difficulty.MEDIUM) agg.mediumSolved += 1;
            else if (problem.difficulty === Difficulty.HARD) agg.hardSolved += 1;
            await m.query(
              `UPDATE daily_activity SET solved_count = solved_count + 1, updated_at = now()
               WHERE user_id = $1 AND activity_date = $2`,
              [user.id, today],
            );
          }
        }
      }

      await m.save(agg);
    });
  }

  // ---- read APIs (#36) — owner-only, side-effect free ----

  /** Caller's summary with the EFFECTIVE current streak. Never inserts a row. */
  async getSummary(userId: string): Promise<GamificationSummaryDto> {
    const row = await this.gamification.findOne({ where: { userId } });
    if (!row) return GamificationSummaryDto.zero();
    const tz = row.timezone ?? 'UTC';
    const streak = effectiveStreak(row.lastActivityDate, row.currentStreak, tz);
    return GamificationSummaryDto.from(row, streak);
  }

  /** Per-day activity for a calendar year (heatmap source). */
  async getContributions(userId: string, year?: number): Promise<ContributionsResponseDto> {
    const row = await this.gamification.findOne({ where: { userId } });
    const tz = row?.timezone ?? 'UTC';
    const resolvedYear = year ?? Number(localToday(tz).slice(0, 4));
    const start = `${resolvedYear}-01-01`;
    const end = `${resolvedYear}-12-31`;

    const rows = await this.dailyActivity.find({
      where: { userId, activityDate: Between(start, end) },
      order: { activityDate: 'ASC' },
    });

    const days = rows.map((r) => ({
      date: r.activityDate,
      count: r.submissionCount,
      solvedCount: r.solvedCount,
    }));
    const totalContributions = days.reduce((sum, d) => sum + d.count, 0);
    return { year: resolvedYear, totalContributions, days };
  }

  /** Paginated recent first-solves, points from the ledger (fallback to difficulty). */
  async getHistory(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<SolvedHistoryItemDto>> {
    const rows = await this.solved
      .createQueryBuilder('s')
      .leftJoin(Problem, 'p', 'p.id = s.problem_id')
      .leftJoin(
        PointsLedger,
        'pl',
        `pl.user_id = s.user_id AND pl.reason = 'first_solve' AND pl.ref_key = s.problem_id`,
      )
      .where('s.user_id = :userId', { userId })
      .select([
        's.problem_id AS "problemId"',
        'p.title AS "title"',
        's.difficulty AS "difficulty"',
        's.first_solved_at AS "solvedAt"',
        'pl.points AS "points"',
      ])
      .orderBy('s.first_solved_at', 'DESC')
      .offset(query.skip)
      .limit(query.limit)
      .getRawMany<{
        problemId: string;
        title: string | null;
        difficulty: string;
        solvedAt: Date;
        points: number | null;
      }>();

    const total = await this.solved.count({ where: { userId } });

    const data: SolvedHistoryItemDto[] = rows.map((r) => ({
      problemId: r.problemId,
      title: r.title ?? '',
      difficulty: r.difficulty,
      points: r.points ?? pointsForDifficulty(r.difficulty),
      solvedAt: r.solvedAt instanceof Date ? r.solvedAt.toISOString() : String(r.solvedAt),
    }));
    return PaginatedResult.of(data, total, query);
  }
}
