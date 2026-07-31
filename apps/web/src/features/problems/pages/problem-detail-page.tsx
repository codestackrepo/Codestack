import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, Code2, Tag as TagIcon } from 'lucide-react';
import { problemsApi } from '../api/problems.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { ScopeBadge } from '@/components/shared/scope-badge';
import { ProblemFeedbackThread } from '@/features/engagement/components/problem-feedback-thread';
import { MarkdownView } from '@/components/shared/markdown-view';

export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: problem, isLoading } = useQuery({
    queryKey: ['problems', id],
    queryFn: () => problemsApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!problem) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/home/problems">
          <ArrowLeft className="size-4" /> Back to problems
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{problem.title}</h1>
          <DifficultyBadge difficulty={problem.difficulty} />
          {/* #74 — a reader needs to know whether a problem is platform-wide before
              they judge its wording or report an issue with it. */}
          <ScopeBadge scope={problem.scope} />
          {problem.isJudgeReady && (
            <Badge className="gap-1 bg-success hover:bg-success">
              <CheckCircle2 className="size-3" /> Judge-ready
            </Badge>
          )}
        </div>
        {problem.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <TagIcon className="mr-0.5 size-3.5 text-muted-foreground" />
            {problem.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {problem.companies.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Building2 className="mr-0.5 size-3.5 text-muted-foreground" />
            {problem.companies.map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Practice entry point (§9.11): only judge-ready problems are solvable.
          Non-judge-ready problems show a subtle badge instead of a Solve CTA. */}
      <div>
        {problem.isJudgeReady ? (
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to={`/practice/${problem.id}`}>
              <Code2 className="size-4" /> Solve
            </Link>
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not yet solvable
          </Badge>
        )}
      </div>

      <Card>
        <CardContent>
          <MarkdownView>{problem.body}</MarkdownView>
        </CardContent>
      </Card>

      {problem.testCases && problem.testCases.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="text-sm font-semibold">Examples</h2>
            {problem.testCases.map((tc, i) => (
              <div key={tc.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Example {i + 1}</p>
                <pre className="overflow-x-auto text-xs">
                  <span className="text-muted-foreground">Input: </span>
                  {tc.inputData}
                  {'\n'}
                  <span className="text-muted-foreground">Output: </span>
                  {tc.expectedOutput}
                </pre>
                {tc.explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">{tc.explanation}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* #77 — the feedback thread over #75's backend. A student sees only their own
          items here; staff see everything their org raised on this problem. */}
      <ProblemFeedbackThread problemId={problem.id} />
    </div>
  );
}
