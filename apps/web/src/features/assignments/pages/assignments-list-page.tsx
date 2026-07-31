import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  Hammer,
  Lock,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { assignmentsApi } from '../api/assignments.api';
import { useAuth } from '@/features/auth/context/auth-context';
import { StudentGradesCard } from '@/features/grading/components/student-grades-card';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Role, STAFF_ROLES } from '@/types/common';
import { AssignmentStatus } from '@/types/assignment';
import { Difficulty } from '@/types/problem';

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  [AssignmentStatus.DRAFT]: 'bg-muted text-muted-foreground',
  [AssignmentStatus.SCHEDULED]: 'bg-info/12 text-info',
  [AssignmentStatus.ACTIVE]: 'bg-success/12 text-success',
  [AssignmentStatus.COMPLETED]: 'bg-warning/12 text-warning',
  [AssignmentStatus.GRADE_PUBLISHED]: 'bg-primary/15 text-primary',
};

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  [AssignmentStatus.DRAFT]: 'Draft',
  [AssignmentStatus.SCHEDULED]: 'Scheduled',
  [AssignmentStatus.ACTIVE]: 'Active',
  [AssignmentStatus.COMPLETED]: 'Completed',
  [AssignmentStatus.GRADE_PUBLISHED]: 'Grades published',
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <Badge className={cn('border-transparent', STATUS_STYLES[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function AssignmentsListPage() {
  const { user } = useAuth();
  const isStaff = !!user && STAFF_ROLES.includes(user.role);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['assignments', 'list', page],
    queryFn: () => assignmentsApi.list({ page }),
    placeholderData: keepPreviousData,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Coursework across your classrooms — expand one to open its problems."
        actions={
          isStaff ? (
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/home/assignments/new">
                <Plus className="size-4" /> New assignment
              </Link>
            </Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!isLoading && data?.data.length === 0 && (
        <EmptyState
          title="No assignments yet"
          description="Assignments across your classrooms will show up here."
        />
      )}

      {!isLoading && data && data.data.length > 0 && (
        <div className="space-y-2.5">
          {data.data.map((assignment) => {
            const expanded = expandedId === assignment.id;
            return (
              <div
                key={assignment.id}
                className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : assignment.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{assignment.title}</p>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarRange className="size-3.5" />
                        {new Date(assignment.startDate).toLocaleDateString()} –{' '}
                        {new Date(assignment.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <AssignmentStatusBadge status={assignment.status} />
                </button>
                {expanded && (
                  <AssignmentProblemsPanel
                    assignmentId={assignment.id}
                    status={assignment.status}
                    title={assignment.title}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && <Pagination meta={data?.meta} onPageChange={setPage} noun="assignments" />}
    </div>
  );
}

function AssignmentProblemsPanel({
  assignmentId,
  status,
  title,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  /** Named in the delete confirmation — a destructive dialog must say WHAT it deletes. */
  title: string;
}) {
  const { user } = useAuth();
  const isStaff = !!user && STAFF_ROLES.includes(user.role);
  const isActive = status === AssignmentStatus.ACTIVE;
  const notYetOpen = status === AssignmentStatus.DRAFT || status === AssignmentStatus.SCHEDULED;
  // The card is reveal-gated internally (§9.2): pre-publish it shows per-item
  // "Submitted / Awaiting review" states, post-publish the full breakdown. So
  // mount it for any open/closed assignment; the backend hides scores until
  // GRADE_PUBLISHED.
  const showGrades = user?.role === Role.STUDENT && !notYetOpen;

  const { data, isLoading } = useQuery({
    queryKey: ['assignments', assignmentId, 'problems'],
    queryFn: () => assignmentsApi.problems(assignmentId),
  });

  return (
    <div className="space-y-4 border-t border-border bg-muted/20 p-4">
      {/* Primary entry points (#22): staff build the item list; students take the
          assignment (mixed items) — the per-problem Solve links below remain the
          direct route into the coding editor. */}
      <div className="flex flex-wrap gap-2">
        {isStaff && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/home/assignments/${assignmentId}/build`}>
              <Hammer className="size-4" /> Build items
            </Link>
          </Button>
        )}
        {/*
          #46 — the edit route and form already existed; nothing in the UI reached
          them, so staff had no way to change Opens/Closes. Staff-only, matching the
          server's @Roles(ADMIN, PROFESSOR) on PATCH and DELETE.
        */}
        {isStaff && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/home/assignments/${assignmentId}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
        )}
        {isStaff && <DeleteAssignmentButton assignmentId={assignmentId} title={title} />}
        {!isStaff && isActive && (
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to={`/home/assignments/${assignmentId}/take`}>
              <PlayCircle className="size-4" /> Start / Continue
            </Link>
          </Button>
        )}
      </div>

      {showGrades && <StudentGradesCard assignmentId={assignmentId} />}

      {!isActive && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {notYetOpen
            ? 'Not open for submissions yet.'
            : 'Closed for submissions — you can still open problems and run your code.'}
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No problems assigned yet.</p>
      )}
      {!isLoading && data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((ap) => (
            <div
              key={ap.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ap.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <DifficultyBadge difficulty={ap.difficulty as Difficulty} />
                  <span className="text-xs text-muted-foreground">{ap.score} pts</span>
                </div>
              </div>
              {isActive ? (
                <Button
                  asChild
                  size="sm"
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Link to={`/solve/${ap.id}`}>
                    <Code2 className="size-4" />
                    Solve
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/solve/${ap.id}?mode=review`}>
                    <Eye className="size-4" />
                    Review
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Delete an assignment (#46), behind a confirmation.
 *
 * `assignment_problems` and `assignment_attempts` cascade, so this destroys every
 * student attempt and submission for the assignment. The dialog says so explicitly
 * rather than asking a generic "are you sure" — the cascade is the part a professor
 * would not otherwise expect, and it is not recoverable.
 */
function DeleteAssignmentButton({ assignmentId, title }: { assignmentId: string; title: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: () => assignmentsApi.delete(assignmentId),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['assignments', 'list'] });
      // The dashboard deadline strip reads its own key.
      void queryClient.invalidateQueries({ queryKey: ['assignments', 'deadlines'] });
      toast.success('Assignment deleted');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This also deletes every student attempt and submission for this assignment. It cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(e) => {
              // Keep the dialog open while the request is in flight so the error
              // toast is not the only trace of a failure.
              e.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
