import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserRoundPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/features/auth/context/auth-context';
import { inviteKeys } from '@/features/invites/api/invites.api';
import { adminUserKeys, usersApi, type AdminUser } from '../api/users.api';

/**
 * The unassigned pool: self-registered students with no organization.
 *
 * The pool is PLATFORM-WIDE and browsable by any admin or professor — that is a
 * stated, accepted risk of the design (staff can see that an address
 * self-registered), and it is what makes "someone signed up but never got added"
 * fixable at all. Assigning places them in the ACTOR's org; there is no org
 * parameter to get wrong.
 */
export function OrgUnassignedPage() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  const params = { page, q: q || undefined };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: adminUserKeys.unassigned(params),
    queryFn: () => usersApi.listUnassigned(params),
    placeholderData: keepPreviousData,
  });

  const assign = useMutation({
    mutationFn: (id: string) => usersApi.assignToMyOrg(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      // Assignment takes a seat.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('Student added to your organization');
    },
    // A uniform 404 here means "not in the pool" — someone else may have taken
    // them between the page load and the click.
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unassigned students"
        description={
          organization
            ? `People who signed up but are not yet in any organization. Adding them puts them in ${organization.name}.`
            : 'People who signed up but are not yet in any organization.'
        }
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
        <EmptyState
          title="Nobody is waiting"
          description="Students who register without an organization will appear here."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((u: AdminUser) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.firstName} {u.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={assign.isPending}
                      onClick={() => assign.mutate(u.id)}
                    >
                      <UserRoundPlus className="size-3.5" /> Add to organization
                    </Button>
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
