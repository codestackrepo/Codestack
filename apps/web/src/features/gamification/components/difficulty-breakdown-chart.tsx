import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/shared/empty-state';
import type { GamificationSummary } from '../types';

// Difficulty hues mirror difficulty-badge.tsx: Easy emerald / Medium amber /
// Hard red (Tailwind 500). recharts needs concrete colors, not CSS classes.
const BARS = [
  { label: 'Easy', color: '#10b981' },
  { label: 'Medium', color: '#f59e0b' },
  { label: 'Hard', color: '#ef4444' },
] as const;

/** Bar chart of solved-by-difficulty. Mirrors ScoreDistributionChart exactly. */
export function DifficultyBreakdownChart({ summary }: { summary: GamificationSummary }) {
  const data = [
    { label: 'Easy', solved: summary.easySolved },
    { label: 'Medium', solved: summary.mediumSolved },
    { label: 'Hard', solved: summary.hardSolved },
  ];

  if (summary.totalSolved === 0) {
    return (
      <EmptyState
        title="No solves yet"
        description="Solve a practice problem to see your difficulty breakdown."
      />
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
            contentStyle={{
              background: 'var(--color-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-popover-foreground)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--color-foreground)' }}
            formatter={(value) => [value, 'Solved']}
          />
          <Bar dataKey="solved" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {data.map((_, i) => (
              <Cell key={i} fill={BARS[i].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
