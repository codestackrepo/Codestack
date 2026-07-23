/**
 * Frontend mirrors of the #36 gamification read DTOs (`gamification.dto.ts`).
 * Kept in lockstep with the backend — a drift compiles green but renders wrong.
 */

export interface GamificationSummary {
  totalPoints: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  /** Effective streak: 0 if the last activity is older than yesterday. */
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export interface ContributionDay {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  /** Activity count that day (accepted submissions) — drives heatmap intensity. */
  count: number;
  /** Distinct problems newly solved that day. */
  solvedCount: number;
}

export interface ContributionsResponse {
  year: number;
  totalContributions: number;
  days: ContributionDay[];
}

export interface SolvedHistoryItem {
  problemId: string;
  title: string;
  difficulty: string;
  points: number;
  solvedAt: string;
}
