import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import { toastMessageFor } from '@/lib/toast-reasons';
import { OrgApplicationStatus } from '@/features/onboarding/api/organization-applications.api';
import {
  professorApplicationKeys,
  professorApplicationsApi,
  type ProfessorApplication,
} from '@/features/onboarding/api/professor-applications.api';

const STATUS_VARIANT: Record<OrgApplicationStatus, 'default' | 'secondary' | 'destructive'> = {
  [OrgApplicationStatus.PENDING]: 'default',
  [OrgApplicationStatus.APPROVED]: 'secondary',
  [OrgApplicationStatus.REJECTED]: 'destructive',
  [OrgApplicationStatus.WITHDRAWN]: 'secondary',
};

/**
 * SuperAdmin review of open-professor applications (#118).
 *
 * Approving takes no parameters — unlike an organisation approval, there is nothing for
 * a human to decide beyond yes or no. The invite goes to the address on the application,
 * into the community tenant, at the professor role.
 */
export function PlatformProfessorApplicationsPage() {
  // Defaults to ALL (undefined), not Pending: landing on a filtered view makes an
  // empty queue ambiguous — nothing to review, or nothing matching this filter? All
  // answers that on arrival, and the reviewer narrows from there.
  const [status, setStatus] = useState<OrgApplicationStatus | undefined>(undefined);
  const [rejecting, setRejecting] = useState<ProfessorApplication | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: professorApplicationKeys.list(status),
    queryFn: () => professorApplicationsApi.list(status),
  });

  const approve = useMutation({
    mutationFn: (id: string) => professorApplicationsApi.approve(id),
    onSuccess: (app) => {
      toast.success(`Approved — a setup link is on its way to ${app.email}.`);
      void queryClient.invalidateQueries({ queryKey: professorApplicationKeys.list(status) });
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      // The application is already approved and is NOT rolled back — rolling it back
      // would let two reviewers race again. So the remedy is "invite by hand", and the
      // list is refreshed to show the approved state.
      if (parsed.reason === 'application_approved_invite_failed') {
        toast.error(parsed.message, { duration: 12_000 });
        void queryClient.invalidateQueries({ queryKey: professorApplicationKeys.list(status) });
        return;
      }
      toast.error(toastMessageFor(parsed.reason as string | undefined, parsed.message));
    },
  });

  const applications = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Professor requests</h1>
          <p className="text-sm text-muted-foreground">
            People asking to teach on the open platform. Approving emails them a link to set a
            password.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {[
            { value: OrgApplicationStatus.PENDING, label: 'Pending' },
            { value: OrgApplicationStatus.APPROVED, label: 'Approved' },
            { value: OrgApplicationStatus.REJECTED, label: 'Declined' },
            { value: undefined, label: 'All' },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setStatus(tab.value)}
              aria-pressed={status === tab.value}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                status === tab.value
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="h-32 animate-pulse rounded-lg bg-muted" />}

      {!isLoading && applications.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {status === OrgApplicationStatus.PENDING
                ? 'No requests waiting for review.'
                : 'Nothing here.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {applications.map((app) => (
          <Card key={app.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                    {app.firstName} {app.lastName}
                  </CardTitle>
                  <CardDescription>
                    {app.email}
                    {app.institution ? ` · ${app.institution}` : ''}
                  </CardDescription>
                </div>
                <Badge variant={STATUS_VARIANT[app.status]}>{app.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {app.message && (
                <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                  {app.message}
                </p>
              )}
              {app.decisionReason && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Reason given:</span>{' '}
                  {app.decisionReason}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Applied {new Date(app.createdAt).toLocaleDateString()}
              </p>

              {app.status === OrgApplicationStatus.PENDING && (
                <div className="flex gap-2">
                  <Button onClick={() => approve.mutate(app.id)} disabled={approve.isPending}>
                    {approve.isPending ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(app)}>
                    Decline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {rejecting && (
        <RejectDialog application={rejecting} status={status} onClose={() => setRejecting(null)} />
      )}
    </div>
  );
}

function RejectDialog({
  application,
  status,
  onClose,
}: {
  application: ProfessorApplication;
  status?: OrgApplicationStatus;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => professorApplicationsApi.reject(application.id, reason || undefined),
    onSuccess: () => {
      toast.success('Request declined — the applicant has been emailed.');
      void queryClient.invalidateQueries({ queryKey: professorApplicationKeys.list(status) });
      onClose();
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      toast.error(toastMessageFor(parsed.reason as string | undefined, parsed.message));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Decline {application.firstName} {application.lastName}
          </DialogTitle>
          <DialogDescription>
            The reason is optional and is sent word for word. They can apply again, and can use
            CodeStack as a learner meanwhile.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="We couldn't verify your teaching role from the details given…"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Declining…' : 'Decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
