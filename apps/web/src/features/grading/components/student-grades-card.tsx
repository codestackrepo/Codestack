import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Circle, Lock, MessageSquareText } from 'lucide-react';
import { gradingApi } from '../api/grading.api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { formatScore, scorePercent } from '../types';

/**
 * A student's own grade for an assignment. The backend only serves this once
 * grades are published (else 403); callers should gate rendering on the
 * assignment status, but a 403 is handled gracefully as a "locked" state.
 */
export function StudentGradesCard({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['grading', 'my-score', assignmentId],
    queryFn: () => gradingApi.myScore(assignmentId),
    retry: false,
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          {parseApiError(error).message}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { assignmentScore, problems } = data;
  const pct = Math.round(scorePercent(assignmentScore.finalScore, assignmentScore.maxScore));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="size-4 text-brand" />
          Your grade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-heading text-3xl font-bold tabular-nums">
              {formatScore(assignmentScore.finalScore)}
              <span className="text-lg text-muted-foreground">
                {' '}
                / {formatScore(assignmentScore.maxScore)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Points earned</p>
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {pct}%
          </Badge>
        </div>

        {assignmentScore.feedback && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquareText className="size-3.5" /> Instructor feedback
            </p>
            <p className="text-sm whitespace-pre-wrap">{assignmentScore.feedback}</p>
          </div>
        )}

        <ul className="divide-y divide-border">
          {problems.map((p) => (
            <li key={p.assignmentProblemId} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {p.solved ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">{p.title}</span>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatScore(p.score)} / {formatScore(p.maxScore)}
                </span>
              </div>
              {p.feedback && (
                <p className="ml-6 rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                  {p.feedback}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
