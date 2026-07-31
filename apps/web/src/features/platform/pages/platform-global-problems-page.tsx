import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
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
import { parseApiError } from '@/lib/api-client';
import { problemsApi } from '@/features/problems/api/problems.api';
import type { Problem } from '@/types/problem';

/**
 * The platform-global problem catalog (#70).
 *
 * Reuses the ordinary `/problems` endpoint with `scope=global` rather than adding a
 * platform-specific read. That filter is applied AFTER the server's visibility
 * predicate, so it narrows and never widens — this page shows a SuperAdmin the global
 * catalog because they can already see it, not because the route is privileged.
 *
 * Authoring lives on the existing problem form: `problems.global` has a deliberately
 * EMPTY role ceiling, which means SuperAdmin-only, so the create control appears
 * nowhere else in the app and does not need re-gating here.
 */
export function PlatformGlobalProblemsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const params = { page, scope: 'global' as const, ...(search ? { search } : {}) };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platform', 'global-problems', params],
    queryFn: () => problemsApi.list(params),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global problems"
        description="The platform catalog. Every organization can see these; only you can author them."
      />

      <Input
        placeholder="Search by title…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1); // a new filter invalidates the current page number
        }}
        className="max-w-sm"
      />

      {isLoading && <Skeleton className="h-64 w-full rounded-lg" />}
      {isError && (
        <EmptyState title="Couldn't load problems" description={parseApiError(error).message} />
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          title="No global problems yet"
          description="Create one from the problems section with scope set to global."
        />
      )}

      {data && data.data.length > 0 && (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((p: Problem) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link to={`/home/problems/${p.id}`} className="hover:text-primary">
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.difficulty}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.visibility}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="size-3" /> Global
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.meta && (
            <div className="border-t border-border p-3">
              <Pagination meta={data.meta} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
