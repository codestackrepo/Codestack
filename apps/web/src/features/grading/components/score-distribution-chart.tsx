import { useMemo } from 'react';
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
import { scorePercent, type StudentScore } from '../types';

/**
 * Percentage buckets students are distributed into. `color` runs a sequential
 * red→green performance scale so low/high mastery reads at a glance (the x-axis
 * ordering makes this an ordered scale, not arbitrary categories).
 */
const BUCKETS = [
  { label: '0–20%', min: 0, max: 20, color: 'hsl(0 72% 51%)' },
  { label: '20–40%', min: 20, max: 40, color: 'hsl(25 90% 55%)' },
  { label: '40–60%', min: 40, max: 60, color: 'hsl(45 92% 48%)' },
  { label: '60–80%', min: 60, max: 80, color: 'hsl(190 70% 45%)' },
  { label: '80–100%', min: 80, max: 100, color: 'hsl(145 60% 42%)' },
] as const;

interface ChartDatum {
  range: string;
  students: number;
}

export function ScoreDistributionChart({ students }: { students: StudentScore[] }) {
  const data = useMemo<ChartDatum[]>(() => {
    const counts = BUCKETS.map(() => 0);
    for (const s of students) {
      const pct = scorePercent(s.assignmentScore.finalScore, s.assignmentScore.maxScore);
      // Last bucket is inclusive of 100 so a perfect score lands in 80–100%.
      let idx = BUCKETS.findIndex((b) => pct >= b.min && pct < b.max);
      if (idx === -1) idx = BUCKETS.length - 1;
      counts[idx] += 1;
    }
    return BUCKETS.map((b, i) => ({ range: b.label, students: counts[i] }));
  }, [students]);

  if (students.length === 0) {
    return (
      <EmptyState
        title="No data to chart"
        description="Grades will be visualized here once students are enrolled and scored."
      />
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="range"
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
            formatter={(value) => [value, 'Students']}
          />
          <Bar dataKey="students" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {data.map((_, i) => (
              <Cell key={i} fill={BUCKETS[i].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
