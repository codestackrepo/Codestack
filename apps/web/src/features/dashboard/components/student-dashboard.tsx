import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FileCode2, Terminal, ClipboardList } from 'lucide-react';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { problemsApi } from '@/features/problems/api/problems.api';
import type { User } from '@/types/user';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { GamificationPanel } from '@/features/gamification/components/gamification-panel';
import {
  byDeadline,
  daysUntilLabel,
  DeadlinesCard,
  QuickActionsCard,
  type QuickAction,
} from './dashboard-parts';

const ACTIONS: QuickAction[] = [
  { to: '/home/problems', label: 'Browse problems', icon: FileCode2 },
  { to: '/home/playground', label: 'Open playground', icon: Terminal },
  { to: '/home/assignments', label: 'My assignments', icon: ClipboardList },
];

export function StudentDashboard({ user }: { user: User }) {
  const { data: deadlines, isLoading } = useQuery({
    queryKey: ['assignments', 'deadlines'],
    queryFn: assignmentsApi.deadlines,
  });
  const { data: problems } = useQuery({
    queryKey: ['problems', 'list'],
    queryFn: () => problemsApi.list(),
  });

  const sorted = byDeadline(deadlines);
  const next = sorted[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.firstName ?? ''}`}
        description="Keep your streak going — here's what's next."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          className="animate-fade-in-up"
          label="Upcoming deadlines"
          value={deadlines?.length ?? '—'}
          icon={<CalendarClock className="size-5" />}
          accent="#f59e0b"
          hint={next ? `Next ${daysUntilLabel(next.endDate)}` : 'Nothing due soon'}
        />
        <StatCard
          className="animate-fade-in-up [animation-delay:80ms]"
          label="Problems available"
          value={problems?.meta.total ?? '—'}
          icon={<FileCode2 className="size-5" />}
          accent="#0ea5e9"
          hint="Ready to solve"
        />
        <StatCard
          className="animate-fade-in-up [animation-delay:160ms]"
          label="Assignments"
          value={deadlines?.length ?? '—'}
          icon={<ClipboardList className="size-5" />}
          accent="#8b5cf6"
          hint="With an open deadline"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DeadlinesCard deadlines={sorted} isLoading={isLoading} className="lg:col-span-2" />
        <QuickActionsCard actions={ACTIONS} />
      </div>

      <GamificationPanel />
    </div>
  );
}
