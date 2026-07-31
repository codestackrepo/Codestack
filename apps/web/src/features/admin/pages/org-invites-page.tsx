import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { InviteStatus, type Invite } from '@/types/invite';
import { invitesApi, inviteKeys } from '@/features/invites/api/invites.api';
import { adminUserKeys } from '../api/users.api';
import { InviteStudentDialog } from '../components/invite-student-dialog';

const STATUS_VARIANT: Record<InviteStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  [InviteStatus.PENDING]: 'secondary',
  [InviteStatus.ACCEPTED]: 'default',
  [InviteStatus.REVOKED]: 'destructive',
  [InviteStatus.EXPIRED]: 'outline',
};

/**
 * Outstanding invitations for the actor's organization.
 *
 * There is no "Copy link" here and there cannot be: the token is stored hashed
 * and the plaintext exists only in the mail that was sent. Resend re-mints it,
 * which also kills every earlier link for that invite.
 */
export function OrgInvitesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const params = { page };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: inviteKeys.list(params),
    queryFn: () => invitesApi.list(params),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
    void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
  };

  const resend = useMutation({
    mutationFn: (id: string) => invitesApi.resend(id),
    onSuccess: () => {
      invalidate();
      toast.success('Invitation resent — the previous link no longer works');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => invitesApi.revoke(id),
    onSuccess: () => {
      invalidate();
      toast.success('Invitation revoked');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const busy = resend.isPending || revoke.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Invitations"
          description="Pending invitations reserve a seat until they are accepted or expire."
        />
        <InviteStudentDialog />
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : isError ? (
        <EmptyState title="Couldn't load invitations" description={parseApiError(error).message} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No invitations yet"
          description="Invite a student, or import a roster from the Bulk import page."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((invite: Invite) => {
                const isPending = invite.status === InviteStatus.PENDING;
                return (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[invite.firstName, invite.lastName].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[invite.status]}>{invite.status}</Badge>
                      {/* A claim asks an EXISTING account to join — worth naming,
                          because nothing happens to them until they click. */}
                      {invite.kind === 'claim' && (
                        <span className="ml-2 text-xs text-muted-foreground">asked to join</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invite.expiresAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invite.sendCount}× · {formatDate(invite.lastSentAt)}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={!isPending || busy}
                        onClick={() => resend.mutate(invite.id)}
                        title={isPending ? 'Resend and re-mint the link' : 'Only pending invites'}
                      >
                        <RotateCcw className="size-3.5" /> Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={!isPending || busy}
                        onClick={() => revoke.mutate(invite.id)}
                      >
                        <XCircle className="size-3.5" /> Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
