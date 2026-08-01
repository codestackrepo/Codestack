import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { assignmentsApi } from '@/features/assignments/api/assignments.api';
import { useAuth } from '@/features/auth/context/auth-context';
import { AssignmentStatus } from '@/types/assignment';
import { gradingApi } from '../api/grading.api';

/**
 * The student's own published grades, rolled up across assignments (#128).
 *
 * `StudentGradesCard` already shows one assignment's breakdown on the assignments
 * list. This is the dashboard answer to "how am I doing overall", which that card
 * cannot give because it is scoped to a single assignment.
 *
 * ONLY `grade_published` assignments are listed, and that is the server's rule, not a
 * cosmetic filter: `AssignmentScoreSummary.finalScore` is `null` for a student until
 * grades are published (§9.2 reveal gating). Listing a pre-publish assignment would
 * render a row whose score is permanently "—", which reads as a bug rather than as
 * "not marked yet".
 *
 * One request per published assignment. `my-score` is per-assignment and there is no
 * bulk endpoint; the count is small by construction (only marked work appears) and
 * `useQueries` runs them together rather than in series. If a cohort ever carries
 * enough published assignments for that to matter, the fix is a bulk endpoint, not a
 * loop with a limit — a silently truncated grade list is worse than a slow one.
 */
export function MyGradesCard() {
  const { user, organization } = useAuth();
  const orgId = organization?.id ?? null;

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', 'deadlines', orgId],
    queryFn: assignmentsApi.deadlines,
    enabled: !!user,
  });

  const published = (assignments ?? []).filter(
    (a) => a.status === AssignmentStatus.GRADE_PUBLISHED,
  );

  const scores = useQueries({
    queries: published.map((a) => ({
      queryKey: ['grading', 'my-score', orgId, a.id],
      queryFn: () => gradingApi.myScore(a.id),
    })),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  // Nothing published yet is the normal state early in a term — say so plainly
  // rather than rendering an empty table.
  if (published.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-4" /> My grades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No grades published yet. Marks appear here once your instructor releases them.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = published.map((a, i) => ({
    assignment: a,
    query: scores[i],
  }));

  /*
   * Totals come only from rows the SERVER has actually answered.
   *
   * The `data` check is load-bearing, not defensive: a row still loading has
   * `data === undefined`, and `undefined !== null` is TRUE — so testing `finalScore`
   * alone counts every in-flight row as settled and adds 0 to both sides. The header
   * then reads "0 / 0" and climbs as requests land, which looks like a student with
   * no marks rather than a card still loading.
   */
  const settled = rows
    .map((r) => r.query?.data?.assignmentScore)
    .filter((s): s is NonNullable<typeof s> => !!s && s.finalScore !== null);
  const earned = settled.reduce((sum, s) => sum + (s.finalScore ?? 0), 0);
  const possible = settled.reduce((sum, s) => sum + s.maxScore, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <GraduationCap className="size-4" /> My grades
          </span>
          {possible > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {earned} / {possible}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(({ assignment, query }) => (
          <div
            key={assignment.id}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
          >
            <Link
              to="/home/assignments"
              className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
            >
              {assignment.title}
            </Link>
            {query?.isLoading && <Skeleton className="h-4 w-16" />}
            {query?.isError && <span className="text-xs text-muted-foreground">Unavailable</span>}
            {query?.data && (
              <span className="shrink-0 text-sm">
                <span className="font-medium">{query.data.assignmentScore.finalScore ?? '—'}</span>
                <span className="text-muted-foreground">
                  {' / '}
                  {query.data.assignmentScore.maxScore}
                </span>
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
