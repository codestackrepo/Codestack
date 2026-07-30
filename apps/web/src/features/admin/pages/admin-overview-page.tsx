import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  FileCode2,
  GraduationCap,
  Inbox,
  Mail,
  Send,
  Users,
} from 'lucide-react';
import { adminApi } from '../api/admin.api';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { AssignmentStatus } from '@/types/assignment';

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  [AssignmentStatus.DRAFT]: 'Draft',
  [AssignmentStatus.SCHEDULED]: 'Scheduled',
  [AssignmentStatus.ACTIVE]: 'Active',
  [AssignmentStatus.COMPLETED]: 'Completed',
  [AssignmentStatus.GRADE_PUBLISHED]: 'Grades published',
};

/**
 * Admin overview (`/home/admin`, #40) — platform-wide KPI tiles from
 * `GET /admin/overview`, plus quick entry into user management and the
 * professor-onboarding queues (which already exist from #11).
 */
export function AdminOverviewPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.overview,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin overview"
        description="Platform-wide totals across users, content, and activity."
        actions={
          <Button asChild variant="outline">
            <Link to="/home/admin/users">
              <Users className="size-4" /> Manage users
            </Link>
          </Button>
        }
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState title="Couldn't load the overview" description={parseApiError(error).message} />
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Users"
              value={data.users.total}
              icon={<Users className="size-5" />}
              hint={`${data.users.active} active · ${data.users.inactive} inactive`}
            />
            <StatCard
              label="Classrooms"
              value={data.classrooms.total}
              icon={<GraduationCap className="size-5" />}
            />
            <StatCard
              label="Problems"
              value={data.problems.total}
              icon={<FileCode2 className="size-5" />}
              hint="In the library"
            />
            <StatCard
              label="Submissions"
              value={data.submissions.total}
              icon={<Send className="size-5" />}
              hint="All-time"
            />
            <StatCard
              label="Assignments"
              value={data.assignments.total}
              icon={<ClipboardList className="size-5" />}
              hint={`${data.assignments.tests} timed test${data.assignments.tests === 1 ? '' : 's'}`}
            />
            <StatCard label="Admins" value={data.users.admins} icon={<Users className="size-5" />} />
            <StatCard
              label="Professors"
              value={data.users.professors}
              icon={<Users className="size-5" />}
            />
            <StatCard
              label="Students"
              value={data.users.students}
              icon={<Users className="size-5" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-heading text-sm font-semibold">Assignments by status</h2>
              <div className="mt-3 space-y-2">
                {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((status) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
                    <span className="font-medium tabular-nums">
                      {data.assignments.byStatus[status] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-heading text-sm font-semibold">Professor onboarding</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Link
                  to="/home/admin/requests"
                  className="rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Inbox className="size-4" /> Pending requests
                  </span>
                  <p className="mt-1 font-heading text-2xl font-bold">
                    {data.onboarding.pendingRequests}
                  </p>
                </Link>
                {/* Not a link: the professor-invite page is retired (#104) and the
                    org-console invites tab lands with the console rewrite (#108).
                    The COUNT is still live and correct — it now reads pending,
                    non-expired org_invites, the same rows that hold seats. */}
                <div className="rounded-lg border border-border p-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="size-4" /> Active invites
                  </span>
                  <p className="mt-1 font-heading text-2xl font-bold">
                    {data.onboarding.activeInvites}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
