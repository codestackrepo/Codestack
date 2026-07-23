import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Clock } from 'lucide-react';
import type { Assignment } from '@/types/assignment';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

export function daysUntilLabel(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
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
          <ul className="divide-y divide-border">
            {deadlines.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Clock className="size-3" />
                  {daysUntilLabel(a.endDate)}
                </Badge>
              </li>
            ))}
          </ul>
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
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
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
