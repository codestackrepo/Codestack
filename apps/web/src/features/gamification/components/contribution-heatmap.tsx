import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ContributionDay } from '../types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
// Only odd weekday rows are labelled (Mon/Wed/Fri) — the GitHub convention.
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/** Emerald intensity ramp by activity count; theme-aware via Tailwind opacity. */
function levelClass(count: number): string {
  if (count <= 0) return 'bg-muted';
  if (count === 1) return 'bg-emerald-500/30';
  if (count <= 3) return 'bg-emerald-500/50';
  if (count <= 6) return 'bg-emerald-500/70';
  return 'bg-emerald-500';
}

interface Cell {
  iso: string;
  date: Date;
}

function tooltip(iso: string, count: number): string {
  const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return count > 0
    ? `${count} contribution${count === 1 ? '' : 's'} on ${label}`
    : `No contributions on ${label}`;
}

/**
 * Hand-rolled GitHub-style contribution grid (recharts has no calendar heatmap).
 * Columns are ISO-ish weeks (Sun→Sat rows); leading blanks align Jan 1 to its
 * weekday. All dates are computed in UTC to match the backend `YYYY-MM-DD` keys.
 */
export function ContributionHeatmap({ year, days }: { year: number; days: ContributionDay[] }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.count])), [days]);

  const weeks = useMemo(() => {
    const result: (Cell | null)[][] = [];
    const first = new Date(Date.UTC(year, 0, 1));
    const last = new Date(Date.UTC(year, 11, 31));
    let current: (Cell | null)[] = [];
    // Leading blanks so the first column starts on the correct weekday row.
    for (let i = 0; i < first.getUTCDay(); i++) current.push(null);
    for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      current.push({ iso: d.toISOString().slice(0, 10), date: new Date(d) });
      if (current.length === 7) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      while (current.length < 7) current.push(null);
      result.push(current);
    }
    return result;
  }, [year]);

  // Month label per week column: shown when the first real day's month changes.
  const monthLabels = useMemo(() => {
    let lastMonth = -1;
    return weeks.map((week) => {
      const firstDay = week.find((c): c is Cell => c !== null);
      if (!firstDay) return '';
      const month = firstDay.date.getUTCMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        return MONTHS[month];
      }
      return '';
    });
  }, [weeks]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        {/* Month labels, aligned to week columns (pl-8 matches the weekday gutter). */}
        <div className="flex gap-1 pl-8 text-[10px] text-muted-foreground">
          {monthLabels.map((label, i) => (
            <div key={i} className="w-3 shrink-0">
              {label}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {/* Weekday gutter */}
          <div className="flex w-8 shrink-0 flex-col gap-1 pr-1 text-right text-[10px] text-muted-foreground">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="h-3 leading-3">
                {label}
              </div>
            ))}
          </div>
          {/* Week columns */}
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell, ci) =>
                  cell ? (
                    <div
                      key={ci}
                      title={tooltip(cell.iso, byDate.get(cell.iso) ?? 0)}
                      className={cn('size-3 rounded-[3px]', levelClass(byDate.get(cell.iso) ?? 0))}
                    />
                  ) : (
                    <div key={ci} className="size-3" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
