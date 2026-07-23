import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap,
  FileCode2,
  ClipboardCheck,
  CalendarClock,
  Inbox,
  Mail,
} from 'lucide-react';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { classroomsApi } from '@/features/classrooms/api/classrooms.api';
import { problemsApi } from '@/features/problems/api/problems.api';
import type { User } from '@/types/user';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import {
  byDeadline,
  DeadlinesCard,
  QuickActionsCard,
  type QuickAction,
} from './dashboard-parts';

const ACTIONS: QuickAction[] = [
  { to: '/home/admin/requests', label: 'Access requests', icon: Inbox },
  { to: '/home/admin/invites', label: 'Professor invites', icon: Mail },
  { to: '/home/classrooms', label: 'All classrooms', icon: GraduationCap },
  { to: '/home/problems', label: 'Problem library', icon: FileCode2 },
  { to: '/home/grading', label: 'Open gradebook', icon: ClipboardCheck },
];

export function AdminDashboard({ user }: { user: User }) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.firstName ?? ''}`}
        description="Platform overview across all classrooms."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Classrooms"
          value={classrooms?.meta.total ?? '—'}
          icon={<GraduationCap className="size-5" />}
          hint="Across the platform"
        />
        <StatCard
          label="Problems"
          value={problems?.meta.total ?? '—'}
          icon={<FileCode2 className="size-5" />}
          hint="In the library"
        />
        <StatCard
          label="Assignments due"
          value={deadlines?.length ?? '—'}
          icon={<CalendarClock className="size-5" />}
          hint="With an open deadline"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DeadlinesCard deadlines={sorted} isLoading={isLoading} className="lg:col-span-2" />
        <QuickActionsCard actions={ACTIONS} />
      </div>
    </div>
  );
}
