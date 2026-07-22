import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Clock,
  FileCode2,
  Terminal,
  ClipboardList,
  ClipboardCheck,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { problemsApi } from '@/features/problems/api/problems.api';
import { useAuth } from '@/features/auth/context/auth-context';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { STAFF_ROLES } from '@/types/common';

function daysUntilLabel(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}

const QUICK_ACTIONS = [
  { to: '/home/problems', label: 'Browse problems', icon: FileCode2, staffOnly: false },
  { to: '/home/playground', label: 'Open playground', icon: Terminal, staffOnly: false },
  { to: '/home/assignments', label: 'Manage assignments', icon: ClipboardList, staffOnly: true },
  { to: '/home/grading', label: 'Open gradebook', icon: ClipboardCheck, staffOnly: true },
];

export function DashboardPage() {
  const { user } = useAuth();
  const isStaff = user ? STAFF_ROLES.includes(user.role) : false;

  const { data: deadlines, isLoading } = useQuery({
    queryKey: ['assignments', 'deadlines'],
    queryFn: assignmentsApi.deadlines,
  });
  const { data: problems } = useQuery({
    queryKey: ['problems', 'list'],
    queryFn: () => problemsApi.list(),
  });

  const sorted = [...(deadlines ?? [])].sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
  );
  const next = sorted[0];
  const actions = QUICK_ACTIONS.filter((a) => !a.staffOnly || isStaff);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ''}`}
        description="Here's what's happening across your classrooms."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Upcoming deadlines"
          value={deadlines?.length ?? '—'}
          icon={<CalendarClock className="size-5" />}
          hint={next ? `Next ${daysUntilLabel(next.endDate)}` : 'Nothing due soon'}
        />
        <StatCard
          label="Problems available"
          value={problems?.meta.total ?? '—'}
          icon={<FileCode2 className="size-5" />}
          hint="In your library"
        />
        <StatCard
          label="Your role"
          value={<span className="capitalize">{user?.role}</span>}
          icon={<Sparkles className="size-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
            {!isLoading && sorted.length === 0 && (
              <EmptyState
                title="Nothing due soon"
                description="Assignments with deadlines will appear here."
              />
            )}
            {!isLoading && sorted.length > 0 && (
              <ul className="divide-y divide-border">
                {sorted.map((a) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
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
      </div>
    </div>
  );
}
