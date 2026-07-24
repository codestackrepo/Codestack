/**
 * Local-day helpers shared by the award path (#35) and the read APIs (#36) so
 * streak/heatmap semantics can't diverge. All math is on the calendar date
 * string ('YYYY-MM-DD'), never on raw timestamps, so DST/zone offsets can't
 * shift the day.
 */

const POINTS_BY_DIFFICULTY: Record<string, number> = { easy: 10, medium: 25, hard: 50 };

/** Points awarded for a first solve of a problem of the given difficulty. */
export function pointsForDifficulty(difficulty: string): number {
  return POINTS_BY_DIFFICULTY[difficulty] ?? 0;
}

/** Today's local calendar date in the given IANA timezone, as 'YYYY-MM-DD'. */
export function localToday(tz: string, now: Date = new Date()): string {
  try {
    // en-CA formats as ISO YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  }
}

/** The calendar day before `dateStr` ('YYYY-MM-DD'), computed at UTC midnight. */
export function subtractDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * The effective current streak at read time: 0 if the last activity is older
 * than yesterday (a lapsed streak), else the stored value. Never mutates.
 */
export function effectiveStreak(
  lastActivityDate: string | null,
  storedStreak: number,
  tz: string,
  now: Date = new Date(),
): number {
  if (!lastActivityDate) return 0;
  const today = localToday(tz, now);
  const yesterday = subtractDay(today);
  return lastActivityDate === today || lastActivityDate === yesterday ? storedStreak : 0;
}
