import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usersApi, type AdminUser, type UpdateUserInput } from '../api/users.api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
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
import { Role } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.ADMIN, label: 'Admin' },
  { value: Role.PROFESSOR, label: 'Professor' },
  { value: Role.STUDENT, label: 'Student' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Admin user management (`/home/admin/users`, #40). Paginated table over
 * `GET /users` with inline role change, active toggle, and delete. Actions on
 * the acting admin's own row are disabled to prevent accidental self-lockout —
 * a client-side UX guard (the API does not currently block self-changes).
 */
export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'users', page],
    queryFn: () => usersApi.list(page),
    placeholderData: keepPreviousData,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User updated');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User deleted');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const busy = updateMutation.isPending || removeMutation.isPending;
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User management"
        description="Change roles, activate or deactivate accounts, and remove users."
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
                        disabled={isSelf || busy}
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
                      <button
                        type="button"
                        disabled={isSelf || busy}
                        onClick={() =>
                          updateMutation.mutate({ id: u.id, input: { isActive: !u.isActive } })
                        }
                        className="disabled:cursor-not-allowed disabled:opacity-60"
                        title={isSelf ? 'You cannot change your own status' : 'Toggle active'}
                      >
                        <Badge variant={u.isActive ? 'secondary' : 'outline'}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
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
                            disabled={isSelf || busy}
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

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} users
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasPrev || busy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasNext || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
