import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { onboardingApi, type Invite, type InviteStatus } from '../api/onboarding.api';
import { parseApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';

const STATUS_VARIANT: Record<InviteStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  consumed: 'secondary',
  revoked: 'destructive',
};

function inviteLink(token: string): string {
  return `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;
}

export function AdminInvitesPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', 'invites', page],
    queryFn: () => onboardingApi.listInvites(page),
    placeholderData: keepPreviousData,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['onboarding', 'invites'] });

  const mint = useMutation({
    mutationFn: () => onboardingApi.mintInvite({ email: email.trim() || undefined }),
    onSuccess: (invite) => {
      void navigator.clipboard?.writeText(inviteLink(invite.token));
      toast.success('Invite created — link copied to clipboard.');
      setEmail('');
      invalidate();
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => onboardingApi.revokeInvite(id),
    onSuccess: () => {
      toast.success('Invite revoked.');
      invalidate();
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  async function copyLink(token: string) {
    await navigator.clipboard?.writeText(inviteLink(token));
    toast.success('Invite link copied.');
  }

  const rows: Invite[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Professor invites"
        description="Mint an invite link; whoever registers with it becomes a professor."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create an invite</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="Email (optional — pre-fills the form)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="sm:max-w-xs"
            />
            <Button
              onClick={() => mint.mutate()}
              disabled={mint.isPending}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="mr-1 size-4" />
              {mint.isPending ? 'Creating…' : 'Create invite'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {isLoading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <EmptyState title="No invites yet" description="Create one above to invite a professor." />
        )}
        {!isLoading && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm">{inv.email || '— (open link)'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status]} className="capitalize">
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                          <Copy className="mr-1 size-3.5" /> Copy link
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke.mutate(inv.id)}
                          disabled={revoke.isPending}
                        >
                          <Ban className="mr-1 size-3.5" /> Revoke
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Pagination meta={meta} onPageChange={setPage} noun="invites" />
    </div>
  );
}
