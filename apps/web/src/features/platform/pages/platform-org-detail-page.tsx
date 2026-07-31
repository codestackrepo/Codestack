import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Play } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { OrganizationStatus, type QuotaUsage } from '@/types/organization';
import type { User } from '@/types/user';
import { platformApi, platformKeys } from '../api/platform.api';
import { InviteStaffDialog } from '../components/invite-staff-dialog';
import { OrgAccessMatrix } from '../components/org-access-matrix';
import { OrgQuotaForm } from '../components/org-quota-form';

/** One tenant: census, quota usage, members, and the suspend switch. */
export function PlatformOrgDetailPage() {
  const { orgId = '' } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const {
    data: org,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: platformKeys.organization(orgId),
    queryFn: () => platformApi.getOrganization(orgId),
    enabled: !!orgId,
  });

  const usersParams = { page };
  const { data: users } = useQuery({
    queryKey: platformKeys.orgUsers(orgId, usersParams),
    queryFn: () => platformApi.listOrgUsers(orgId, usersParams),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: (suspend: boolean) =>
      suspend ? platformApi.suspendOrganization(orgId) : platformApi.activateOrganization(orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.organizations() });
      toast.success('Organization updated');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (isError || !org) {
    return (
      <EmptyState
        title="Couldn't load this organization"
        description={parseApiError(error).message}
      />
    );
  }

  const suspended = org.status === OrganizationStatus.SUSPENDED;

  return (
    <div className="space-y-6">
      <Link
        to="/home/platform/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> All organizations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={org.name}
          description={
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{org.slug}</span>
              <Badge variant={suspended ? 'destructive' : 'secondary'}>{org.status}</Badge>
            </span>
          }
        />
        <div className="flex gap-2">
          <InviteStaffDialog orgId={org.id} orgName={org.name} />
          <Button
            variant={suspended ? 'default' : 'destructive'}
            className="gap-2"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate(!suspended)}
          >
            {suspended ? <Play className="size-4" /> : <Ban className="size-4" />}
            {suspended ? 'Reactivate' : 'Suspend'}
          </Button>
        </div>
      </div>

      {suspended && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Every member of this organization is blocked from signing in. Their work is untouched.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Members" value={org.counts.users} />
        <Tile label="Pending invites" value={org.counts.pendingInvites} />
        <Tile label="Classrooms" value={org.counts.classrooms} />
        <Tile label="Submissions" value={org.counts.submissions} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Usage against quota</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuotaRow label="Seats" usage={org.usage.users} />
          <QuotaRow label="Problems" usage={org.usage.problems} />
          <QuotaRow label="Assignments" usage={org.usage.assignments} />
        </div>
      </section>

      {/*
        #70 — entitlement and quota administration, as tabs on this page rather than a
        parallel console. #108 established this page, its route and `platformKeys`;
        adding tabs keeps one place where an organization is administered.
      */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Administration</h2>
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="quotas">Quotas</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="pt-4">
            <OrgAccessMatrix orgId={org.id} kind="modules" />
          </TabsContent>
          <TabsContent value="features" className="pt-4">
            <OrgAccessMatrix orgId={org.id} kind="features" />
          </TabsContent>
          <TabsContent value="quotas" className="pt-4">
            <OrgQuotaForm orgId={org.id} />
          </TabsContent>
        </Tabs>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Members</h2>
        {!users || users.data.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Invite an administrator to get started."
          />
        ) : (
          <div className="rounded-lg border border-border">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((u: User) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{u.role}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'secondary' : 'outline'}>
                        {u.isActive ? 'Active' : 'No access'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.lastLoginAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {users.meta && (
              <div className="border-t border-border p-3">
                <Pagination meta={users.meta} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
    </div>
  );
}

/**
 * `remaining` and `exceeded` come from the server and are rendered as given.
 *
 * Re-deriving them here would put the null-vs-0 rule in a second place: `limit`
 * null means UNLIMITED, `0` means fully blocked, and a client that coalesces them
 * turns every uncapped org into a blocked one.
 */
function QuotaRow({ label, usage }: { label: string; usage: QuotaUsage }) {
  const unlimited = usage.limit === null;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        {usage.exceeded && <Badge variant="destructive">Over limit</Badge>}
      </div>
      <p className="mt-1 font-heading text-xl font-bold">
        {usage.used}
        <span className="text-sm font-normal text-muted-foreground">
          {' '}
          / {unlimited ? 'Unlimited' : usage.limit}
        </span>
      </p>
      {!unlimited && (
        <p className="mt-0.5 text-xs text-muted-foreground">{usage.remaining} remaining</p>
      )}
    </div>
  );
}
