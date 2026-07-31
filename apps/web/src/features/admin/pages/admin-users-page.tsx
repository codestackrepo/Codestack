import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminUserKeys, usersApi, type AdminUser, type UpdateUserInput } from '../api/users.api';
import { UserFiltersBar, type UserFilters } from '../components/user-filters-bar';
import { AccessToggleDialog } from '@/components/shared/access-toggle-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { Role, atLeast } from '@/types/common';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/auth-context';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.ADMIN, label: 'Admin' },
  { value: Role.PROFESSOR, label: 'Professor' },
  { value: Role.STUDENT, label: 'Student' },
];

/**
 * Admin user management (`/home/admin/users`, #40). Paginated table over
 * `GET /users` with inline role change, active toggle, and delete. Actions on
 * the acting admin's own row are disabled to prevent accidental self-lockout —
 * a client-side UX guard (the API does not currently block self-changes).
 */
export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: me, organization } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<UserFilters>({});

  const params = { page, ...filters };
  const { data, isLoading, isError, error } = useQuery({
    // Factory key with the filter object last, so the prefix ['admin','users']
    // used by every mutation below still clears each filtered permutation.
    queryKey: adminUserKeys.list(params),
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });

  // Only an ADMIN may change a role or delete. `remove()` is a HARD delete, and
  // assertCanModify permits PROFESSOR -> STUDENT — this change is what first puts
  // a route to it in a professor's sidebar, so the control has to be gated here
  // too rather than relying on nobody finding the page.
  const canAdminister = !!me && atLeast(me.role, Role.ADMIN);

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      // An access change alters what the TARGET can do, and if the actor changed
      // their own org's seat usage the session's quota block is now stale.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('User updated');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      toast.success('User deleted');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const busy = updateMutation.isPending || removeMutation.isPending;
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description={
          organization ? `Everyone in ${organization.name}` : 'Everyone in your organization'
        }
      />

      <UserFiltersBar
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1); // a filtered page 4 reads as "no results", not "no page 4"
        }}
      />

      {isLoading && !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : isError ? (
        <EmptyState title="Couldn't load users" description={parseApiError(error).message} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No users" description="There are no users to show." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-36">Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((u: AdminUser) => {
                const isSelf = u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        disabled={isSelf || busy || !canAdminister}
                        onValueChange={(role) =>
                          updateMutation.mutate({ id: u.id, input: { role: role as Role } })
                        }
                      >
                        <SelectTrigger className="h-8 w-32" aria-label={`Role for ${u.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <AccessToggleDialog
                        email={u.email}
                        isActive={u.isActive}
                        disabled={isSelf || busy}
                        onConfirm={() =>
                          updateMutation.mutate({ id: u.id, input: { isActive: !u.isActive } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon-sm"
                            disabled={isSelf || busy || !canAdminister}
                            aria-label={`Delete ${u.email}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {u.firstName} {u.lastName} ({u.email}) will be permanently removed.
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeMutation.mutate(u.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination meta={meta} onPageChange={setPage} busy={busy} noun="users" />
    </div>
  );
}
