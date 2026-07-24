import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Clock } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { Assignment } from '@/types/assignment';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { accentAt, accentChip } from '@/lib/accents';

/** Whole days from now until `dateStr` (negative = overdue). */
export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export function daysUntilLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}

// Urgency buckets — concrete hex (recharts fills can't be CSS classes; these read
// on both light and dark cards). Each carries a vertical gradient for depth and a
// solid `dot` for the legend. Nearest = red (urgent) → amber → indigo → green.
// Soft, pleasant pastels (light 300→400 range — no heavy darks). Nearest = warm
// coral → amber → periwinkle → mint. `dot` (a touch stronger) feeds the legend.
const URGENCY = [
  { id: 'due', max: 14, from: '#fecdd3', to: '#fda4af', dot: '#fb7185', label: 'Urgent' },
  { id: 'soon', max: 25, from: '#fde68a', to: '#fcd34d', dot: '#fbbf24', label: 'Soon' },
  { id: 'week', max: 45, from: '#c7d2fe', to: '#a5b4fc', dot: '#818cf8', label: 'Upcoming' },
  { id: 'later', max: Infinity, from: '#bbf7d0', to: '#86efac', dot: '#34d399', label: 'Later' },
] as const;

function urgencyOf(days: number) {
  return URGENCY.find((u) => days <= u.max) ?? URGENCY[URGENCY.length - 1];
}

/** Color-by-urgency countdown bar chart of the nearest deadlines, with legend. */
function DeadlinesChart({ deadlines }: { deadlines: Assignment[] }) {
  const data = deadlines.slice(0, 7).map((a, i) => {
    const days = daysUntil(a.endDate);
    const u = urgencyOf(days);
    return {
      key: a.id ?? String(i),
      // Short axis label; the tooltip carries the full title.
      name: a.title.length > 10 ? `${a.title.slice(0, 9)}…` : a.title,
      title: a.title,
      // Clamp overdue to 0 for the bar height; colour still flags it urgent.
      days: Math.max(days, 0),
      label: daysUntilLabel(a.endDate),
      fill: `url(#deadline-${u.id})`,
    };
  });

  return (
    <div className="mb-5">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 22, right: 10, left: 6, bottom: 0 }}
            barCategoryGap="24%"
          >
            <defs>
              {URGENCY.map((u) => (
                <linearGradient key={u.id} id={`deadline-${u.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={u.from} />
                  <stop offset="100%" stopColor={u.to} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              interval={0}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-muted)', opacity: 0.35 }}
              contentStyle={{
                background: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                color: 'var(--color-popover-foreground)',
                fontSize: 12,
                boxShadow: 'var(--shadow-soft-lg)',
              }}
              labelStyle={{ color: 'var(--color-foreground)', fontWeight: 600 }}
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.title ?? ''}
              formatter={(_value, _name, item) => [item?.payload?.label ?? '', 'Deadline']}
            />
            <Bar dataKey="days" radius={[6, 6, 0, 0]} maxBarSize={56} animationDuration={700}>
              <LabelList
                dataKey="days"
                position="top"
                className="fill-foreground"
                style={{ fontSize: 11, fontWeight: 600 }}
                formatter={(v) => (Number(v) > 0 ? `${v}d` : 'now')}
              />
              {data.map((d) => (
                <Cell key={d.key} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {URGENCY.map((u) => (
          <span key={u.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: u.dot }} />
            {u.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Sort assignments by soonest deadline first. */
export function byDeadline(deadlines: Assignment[] | undefined): Assignment[] {
  return [...(deadlines ?? [])].sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
  );
}

export function DeadlinesCard({
  deadlines,
  isLoading,
  className,
}: {
  deadlines: Assignment[];
  isLoading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Upcoming deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isLoading && deadlines.length === 0 && (
          <EmptyState
            title="Nothing due soon"
            description="Assignments with deadlines will appear here."
          />
        )}
        {!isLoading && deadlines.length > 0 && (
          <>
            <DeadlinesChart deadlines={deadlines} />
            <ul className="divide-y divide-border">
              {deadlines.map((a) => {
                const u = urgencyOf(daysUntil(a.endDate));
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={accentChip(u.dot)}
                      >
                        <CalendarClock className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.endDate).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1"
                      style={{
                        color: u.dot,
                        borderColor: `color-mix(in oklab, ${u.dot} 45%, transparent)`,
                        backgroundColor: `color-mix(in oklab, ${u.dot} 10%, transparent)`,
                      }}
                    >
                      <Clock className="size-3" />
                      {daysUntilLabel(a.endDate)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface QuickAction {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export function QuickActionsCard({
  actions,
  title = 'Quick actions',
}: {
  actions: QuickAction[];
  title?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((a, i) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium transition-all duration-200 hover:border-transparent hover:bg-muted hover:shadow-soft"
          >
            <span
              className="flex size-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
              style={accentChip(accentAt(i))}
            >
              <a.icon className="size-4" />
            </span>
            <span className="flex-1">{a.label}</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
