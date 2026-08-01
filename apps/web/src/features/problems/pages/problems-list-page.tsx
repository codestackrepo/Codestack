import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { Button } from '@/components/ui/button';
import { FeatureKey } from '@/types/entitlement';
import { ProblemScope } from '@/types/problem';
import { problemsApi } from '../api/problems.api';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { ScopeBadge } from '@/components/shared/scope-badge';
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
  const { user } = useAuth();
  const { canAccessFeature } = useModuleAccess();
  const organizationId = user?.organizationId ?? null;
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [tag, setTag] = useState<string>(ANY);
  const [company, setCompany] = useState<string>(ANY);
  /**
   * #74. `all` sends no `scope` param at all, so the server's visibility predicate
   * decides — which is the point: this is a FILTER over what the actor can already
   * see, never a request for more.
   */
  const [scope, setScope] = useState<ProblemScope | 'all'>('all');
  const [page, setPage] = useState(1);

  // Any filter change resets to page 1 so results start from the top.
  const resetPage = () => setPage(1);

  const { data: facets } = useQuery({
    queryKey: ['problems', 'facets'],
    queryFn: problemsApi.facets,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    // `scope` and the actor's org are part of the key: without them a SuperAdmin
    // switching scopes, or two orgs on one browser profile, would read each other's
    // cached page.
    queryKey: [
      'problems',
      'list',
      organizationId,
      { difficulty, tag, company, search, scope, page },
    ],
    queryFn: () =>
      problemsApi.list({
        difficulty: difficulty === 'all' ? undefined : difficulty,
        tag: tag === ANY ? undefined : tag,
        company: company === ANY ? undefined : company,
        scope: scope === 'all' ? undefined : scope,
        search: search.trim() || undefined,
        page,
        limit: 20,
      }),
    placeholderData: keepPreviousData,
  });

  const problems = data?.data ?? [];
  const meta = data?.meta;
  const offset = ((meta?.page ?? 1) - 1) * (meta?.limit ?? 20);
  const hasFilters =
    difficulty !== 'all' ||
    tag !== ANY ||
    company !== ANY ||
    scope !== 'all' ||
    search.trim() !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Problems"
        description="Browse the problem library and sharpen your skills."
        actions={
          /*
           * Gated on the FEATURE, not the role. `canAccessFeature` deliberately does
           * not short-circuit staff the way `canAccess` does, because the resolver
           * applies a non-overridable role ceiling to features — so this hides for a
           * student and for any role an admin has switched authoring off for, and
           * matches exactly what `@RequiresFeature(PROBLEMS_AUTHOR)` will allow.
           */
          canAccessFeature(FeatureKey.PROBLEMS_AUTHOR) ? (
            <Button asChild className="gap-2">
              <Link to="/home/problems/new">
                <Plus className="size-4" /> New problem
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search problems…"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Segmented rather than another <Select>: there are exactly three mutually
            exclusive states and they are worth seeing at a glance, because "why can
            I not find that problem" is usually this control.
          */}
          <div
            role="group"
            aria-label="Problem scope"
            className="inline-flex overflow-hidden rounded-md border border-border"
          >
            {(
              [
                ['all', 'All'],
                [ProblemScope.GLOBAL, 'Global'],
                [ProblemScope.ORG, 'My org'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => {
                  setScope(value);
                  resetPage();
                }}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors',
                  scope === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Select
            value={tag}
            onValueChange={(v) => {
              setTag(v);
              resetPage();
            }}
          >
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

          <Select
            value={company}
            onValueChange={(v) => {
              setCompany(v);
              resetPage();
            }}
          >
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
                onClick={() => {
                  setDifficulty(f.value);
                  resetPage();
                }}
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
                  <TableCell className="tabular-nums text-muted-foreground">
                    {offset + i + 1}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/home/problems/${problem.id}`}
                        className="font-medium transition-colors group-hover:text-primary hover:underline"
                      >
                        {problem.title}
                      </Link>
                      {/* Only global is badged — inside an org catalog almost
                          everything is org-owned, so marking that would be noise. */}
                      <ScopeBadge scope={problem.scope} />
                    </span>
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

      {!isLoading && <Pagination meta={meta} onPageChange={setPage} noun="problems" />}
    </div>
  );
}
