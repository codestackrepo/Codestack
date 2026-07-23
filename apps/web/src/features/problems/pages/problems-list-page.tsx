import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const ANY = '__any__';

export function ProblemsListPage() {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [tag, setTag] = useState<string>(ANY);
  const [company, setCompany] = useState<string>(ANY);

  const { data: facets } = useQuery({
    queryKey: ['problems', 'facets'],
    queryFn: problemsApi.facets,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['problems', 'list', { difficulty, tag, company, search }],
    queryFn: () =>
      problemsApi.list({
        difficulty: difficulty === 'all' ? undefined : difficulty,
        tag: tag === ANY ? undefined : tag,
        company: company === ANY ? undefined : company,
        search: search.trim() || undefined,
        limit: 100,
      }),
  });

  const problems = data?.data ?? [];
  const hasFilters = difficulty !== 'all' || tag !== ANY || company !== ANY || search.trim() !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Problems"
        description="Browse the problem library and sharpen your skills."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search problems…"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All topics</SelectItem>
              {(facets?.tags ?? []).map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name} ({t.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All companies</SelectItem>
              {(facets?.companies ?? []).map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && problems.length === 0 && (
        <EmptyState
          title="No problems found"
          description={
            hasFilters
              ? 'Try adjusting your search or filters.'
              : 'Problems you can access will show up here.'
          }
        />
      )}

      {!isLoading && problems.length > 0 && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Difficulty</TableHead>
                <TableHead>Topics</TableHead>
                <TableHead>Companies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((problem, i) => (
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
                      {problem.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {problem.companies.map((c) => (
                        <Badge key={c} variant="secondary">
                          {c}
                        </Badge>
                      ))}
                    </div>
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
