import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { problemsApi } from '../api/problems.api';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Difficulty } from '@/types/problem';
import { cn } from '@/lib/utils';

const FILTERS: { label: string; value: Difficulty | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Easy', value: Difficulty.EASY },
  { label: 'Medium', value: Difficulty.MEDIUM },
  { label: 'Hard', value: Difficulty.HARD },
];

export function ProblemsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['problems', 'list'],
    queryFn: () => problemsApi.list(),
  });
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');

  const filtered = useMemo(() => {
    const items = data?.data ?? [];
    const q = search.trim().toLowerCase();
    return items.filter(
      (p) =>
        (difficulty === 'all' || p.difficulty === difficulty) &&
        (q === '' ||
          p.title.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))),
    );
  }, [data, search, difficulty]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Problems"
        description="Browse the problem library and sharpen your skills."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search problems or tags…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setDifficulty(f.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                difficulty === f.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          title="No problems found"
          description={
            search || difficulty !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Problems you can access will show up here.'
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Difficulty</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-24">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((problem, i) => (
                <TableRow key={problem.id} className="group">
                  <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <Link
                      to={`/home/problems/${problem.id}`}
                      className="font-medium transition-colors group-hover:text-primary hover:underline"
                    >
                      {problem.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <DifficultyBadge difficulty={problem.difficulty} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {problem.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {problem.source}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
