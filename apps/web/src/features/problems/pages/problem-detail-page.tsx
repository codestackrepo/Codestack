import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { problemsApi } from '../api/problems.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
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
        </div>
        {problem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {problem.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent>
          <MarkdownView>{problem.body}</MarkdownView>
        </CardContent>
      </Card>
    </div>
  );
}
