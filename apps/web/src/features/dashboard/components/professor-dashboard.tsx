import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  FileCode2,
} from 'lucide-react';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { classroomsApi } from '@/features/classrooms/api/classrooms.api';
import { problemsApi } from '@/features/problems/api/problems.api';
import type { User } from '@/types/user';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import {
  byDeadline,
  daysUntilLabel,
  DeadlinesCard,
  QuickActionsCard,
  type QuickAction,
} from './dashboard-parts';

const ACTIONS: QuickAction[] = [
  { to: '/home/classrooms', label: 'My classrooms', icon: GraduationCap },
  { to: '/home/assignments', label: 'Manage assignments', icon: ClipboardList },
  { to: '/home/grading', label: 'Open gradebook', icon: ClipboardCheck },
  { to: '/home/problems', label: 'Browse problems', icon: FileCode2 },
];

export function ProfessorDashboard({ user }: { user: User }) {
  const { data: deadlines, isLoading } = useQuery({
    queryKey: ['assignments', 'deadlines'],
    queryFn: assignmentsApi.deadlines,
  });
  const { data: classrooms } = useQuery({
    queryKey: ['classrooms', 'list'],
    queryFn: () => classroomsApi.list(),
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
        description="Here's what's happening across your classrooms."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active classrooms"
          value={classrooms?.meta.total ?? '—'}
          icon={<GraduationCap className="size-5" />}
          hint="You teach"
        />
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
          hint="In the library"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DeadlinesCard deadlines={sorted} isLoading={isLoading} className="lg:col-span-2" />
        <QuickActionsCard actions={ACTIONS} />
      </div>
    </div>
  );
}
