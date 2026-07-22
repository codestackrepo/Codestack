import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { parseApiError } from '@/lib/api-client';
import { aiApi } from '../api/ai.api';
import { GenerationStatus, TERMINAL_GENERATION_STATUSES } from '../types';
import { GenerationStatusBadge } from './status-badge';
import { GenerationStepper } from './generation-stepper';
import { GeneratedProblemCard } from './generated-problem-card';

function isTerminal(status: GenerationStatus | undefined): boolean {
  return !!status && TERMINAL_GENERATION_STATUSES.includes(status);
}

export function GenerationDetail({ generationId }: { generationId: string }) {
  const generationQuery = useQuery({
    queryKey: ['ai', 'generation', generationId],
    queryFn: () => aiApi.getById(generationId),
    // Poll every 2s until the generation reaches a terminal status — but never
    // keep polling a query that has errored (that would spin forever).
    refetchInterval: (query) =>
      query.state.status === 'error' || isTerminal(query.state.data?.status) ? false : 2000,
  });

  const generation = generationQuery.data;
  const isReady = generation?.status === GenerationStatus.READY;

  const problemsQuery = useQuery({
    queryKey: ['ai', 'generations', generationId, 'problems'],
    queryFn: () => aiApi.getProblems(generationId),
    enabled: isReady,
  });

  if (generationQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Couldn&apos;t load this generation</p>
              <p className="text-destructive/90">{parseApiError(generationQuery.error).message}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => generationQuery.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (generationQuery.isLoading || !generation) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isFailed = generation.status === GenerationStatus.FAILED;
  const usage = generation.tokenUsage;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{generation.topic}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Badge variant="outline" className="uppercase">
                  {generation.sourceType}
                </Badge>
                <span>
                  {generation.requestedCount} problem{generation.requestedCount > 1 ? 's' : ''}{' '}
                  requested
                </span>
              </CardDescription>
            </div>
            <GenerationStatusBadge status={generation.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <GenerationStepper status={generation.status} />

          {!isTerminal(generation.status) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Working on it — this usually takes under a minute.
            </p>
          )}

          {isFailed && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Generation failed</p>
                <p className="text-destructive/90">
                  {generation.errorReason ?? 'Something went wrong. Please try again.'}
                </p>
              </div>
            </div>
          )}

          {usage && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Model: {usage.model}</span>
              <span>
                Tokens: {usage.inputTokens.toLocaleString()} in /{' '}
                {usage.outputTokens.toLocaleString()} out
              </span>
              <span>Cost: ${usage.costUsd.toFixed(4)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isReady && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Generated problems</h2>

          {problemsQuery.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {problemsQuery.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-2">
                <p>{parseApiError(problemsQuery.error).message}</p>
                <Button variant="outline" size="sm" onClick={() => problemsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!problemsQuery.isLoading && problemsQuery.data && problemsQuery.data.length === 0 && (
            <EmptyState
              title="No problems were produced"
              description="This generation completed but didn't yield any usable problems."
            />
          )}

          {!problemsQuery.isLoading &&
            problemsQuery.data &&
            problemsQuery.data.map((link) => (
              <GeneratedProblemCard key={link.id} generationId={generationId} link={link} />
            ))}
        </div>
      )}
    </div>
  );
}
