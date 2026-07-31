import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Role } from '@/types/common';
import type { User } from '@/types/user';
import { platformApi, platformKeys } from '../api/platform.api';

/**
 * The platform-wide unassigned pool, with the SuperAdmin's extra power: placing
 * someone into ANY organization, and optionally above student rank.
 */
export function PlatformUnassignedPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>({});

  const params = { page, q: q || undefined };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: platformKeys.unassigned(params),
    queryFn: () => platformApi.listUnassigned(params),
    placeholderData: keepPreviousData,
  });

  const { data: organizations = [] } = useQuery({
    queryKey: platformKeys.organizations(),
    queryFn: platformApi.listOrganizations,
  });

  const assign = useMutation({
    mutationFn: ({ userId, organizationId }: { userId: string; organizationId: string }) =>
      platformApi.assignUser(userId, { organizationId, role: Role.STUDENT }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.unassigned() });
      void queryClient.invalidateQueries({
        queryKey: platformKeys.organization(vars.organizationId),
      });
      toast.success('Student assigned');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unassigned students"
        description="People who registered without an organization, across the whole platform."
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search name or email"
          className="pl-9"
          aria-label="Search unassigned students"
        />
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : isError ? (
        <EmptyState title="Couldn't load the pool" description={parseApiError(error).message} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="Nobody is waiting" description="The unassigned pool is empty." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead className="w-80 text-right">Assign to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((u: User) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.firstName} {u.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={targets[u.id] ?? ''}
                        onValueChange={(v) => setTargets((t) => ({ ...t, [u.id]: v }))}
                      >
                        <SelectTrigger className="h-8 w-48" aria-label={`Organization for ${u.email}`}>
                          <SelectValue placeholder="Choose an organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!targets[u.id] || assign.isPending}
                        onClick={() =>
                          assign.mutate({ userId: u.id, organizationId: targets[u.id] })
                        }
                      >
                        Assign
                      </Button>
                    </div>
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
