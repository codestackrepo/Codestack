import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Circle, Clock, Lock, MessageSquareText } from 'lucide-react';
import { gradingApi } from '../api/grading.api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { formatScore, GRADING_STATUS_LABEL, scorePercent } from '../types';

/**
 * A student's own grade for an assignment. Reveal-gated (§9.2): before
 * GRADE_PUBLISHED the backend returns null scores + null finalScore, so we show
 * per-item "Submitted / Awaiting review" states with NO numbers; after publish,
 * the full breakdown. A 403 is handled gracefully as a "locked" state.
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

  const { assignmentScore, items } = data;
  const published = assignmentScore.finalScore !== null;
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
        {published ? (
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
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            Grades aren’t published yet — your submissions are recorded and awaiting review.
          </div>
        )}

        {published && assignmentScore.feedback && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquareText className="size-3.5" /> Instructor feedback
            </p>
            <p className="text-sm whitespace-pre-wrap">{assignmentScore.feedback}</p>
          </div>
        )}

        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.itemId} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {item.solved ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">{item.title}</span>
                </div>
                {item.score === null ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {GRADING_STATUS_LABEL[item.gradingStatus]}
                  </Badge>
                ) : (
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatScore(item.score)} / {formatScore(item.maxScore)}
                  </span>
                )}
              </div>
              {published && item.feedback && (
                <p className="ml-6 rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                  {item.feedback}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
