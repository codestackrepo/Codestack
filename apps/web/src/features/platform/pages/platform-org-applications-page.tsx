import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Inbox } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import {
  orgApplicationKeys,
  orgApplicationsApi,
  OrgApplicationStatus,
  type OrgApplication,
} from '@/features/onboarding/api/organization-applications.api';

const STATUS_VARIANT: Record<OrgApplicationStatus, 'default' | 'secondary' | 'destructive'> = {
  [OrgApplicationStatus.PENDING]: 'default',
  [OrgApplicationStatus.APPROVED]: 'secondary',
  [OrgApplicationStatus.REJECTED]: 'destructive',
  [OrgApplicationStatus.WITHDRAWN]: 'secondary',
};

/**
 * SuperAdmin review of organisation applications (#118).
 *
 * Approving is the moment the platform commits to a tenant, so this page asks for the
 * two things only a human can decide — how many professors and how many students it may
 * hold — and nothing else. The slug is derived from the institution's name and shown
 * back afterwards, so there is one fewer field to invent.
 */
export function PlatformOrgApplicationsPage() {
  // Defaults to ALL (undefined) for the same reason as the professor queue: an empty
  // filtered view cannot be told apart from an empty queue.
  const [status, setStatus] = useState<OrgApplicationStatus | undefined>(undefined);
  const [approving, setApproving] = useState<OrgApplication | null>(null);
  const [rejecting, setRejecting] = useState<OrgApplication | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: orgApplicationKeys.list(status),
    queryFn: () => orgApplicationsApi.list(status),
  });

  const applications = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Organisation applications
          </h1>
          <p className="text-sm text-muted-foreground">
            Approving one creates the workspace, sets its seat limits and invites its administrator.
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
                ? 'No applications waiting for review.'
                : 'Nothing here.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {applications.map((app) => (
          <ApplicationCard
            key={app.id}
            application={app}
            onApprove={() => setApproving(app)}
            onReject={() => setRejecting(app)}
          />
        ))}
      </div>

      {approving && (
        <ApproveDialog application={approving} status={status} onClose={() => setApproving(null)} />
      )}
      {rejecting && (
        <RejectDialog application={rejecting} status={status} onClose={() => setRejecting(null)} />
      )}
    </div>
  );
}

function ApplicationCard({
  application,
  onApprove,
  onReject,
}: {
  application: OrgApplication;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = application.status === OrgApplicationStatus.PENDING;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
              {application.organizationName}
            </CardTitle>
            <CardDescription>
              {application.contactName} · {application.contactEmail}
            </CardDescription>
          </div>
          <Badge variant={STATUS_VARIANT[application.status]}>{application.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Row label="Type" value={application.organizationType} />
          <Row label="Applied" value={new Date(application.createdAt).toLocaleDateString()} />
          {application.website && (
            <div className="sm:col-span-2">
              <dt className="inline text-muted-foreground">Website: </dt>
              <dd className="inline">
                {/* rel=noreferrer on an applicant-supplied URL: this is untrusted input,
                    and the referrer would leak the console URL to whoever they named. */}
                <a
                  href={application.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {application.website}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </dd>
            </div>
          )}
        </dl>

        {application.message && (
          <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
            {application.message}
          </p>
        )}

        {application.decisionReason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Reason given:</span>{' '}
            {application.decisionReason}
          </p>
        )}

        {pending && (
          <div className="flex gap-2">
            <Button onClick={onApprove}>Approve</Button>
            <Button variant="outline" onClick={onReject}>
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline capitalize">{value}</dd>
    </div>
  );
}

function ApproveDialog({
  application,
  status,
  onClose,
}: {
  application: OrgApplication;
  status?: OrgApplicationStatus;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Prefilled from the contact but EDITABLE: the person who filled in the form is not
  // always the intended administrator.
  const [adminEmail, setAdminEmail] = useState(application.contactEmail);
  const [maxProfessors, setMaxProfessors] = useState('10');
  const [maxStudents, setMaxStudents] = useState('500');
  const [maxProblems, setMaxProblems] = useState('200');
  const [maxAssignments, setMaxAssignments] = useState('100');

  const mutation = useMutation({
    mutationFn: () =>
      orgApplicationsApi.approve(application.id, {
        adminEmail,
        maxProfessors: Number(maxProfessors),
        maxStudents: Number(maxStudents),
        maxProblems: Number(maxProblems),
        maxAssignments: Number(maxAssignments),
      }),
    onSuccess: (app) => {
      toast.success(`${app.organizationName} created — invitation sent to ${adminEmail}.`);
      void queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(status) });
      onClose();
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      /*
       * `org_created_invite_failed` means the workspace EXISTS and only the invite is
       * missing. Approving again would 409, so the toast must say "invite by hand"
       * rather than "try again" — and the dialog stays open with the address in it.
       */
      if (parsed.reason === 'org_created_invite_failed') {
        toast.error(parsed.message, { duration: 12_000 });
        void queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(status) });
        return;
      }
      toast.error(parsed.message);
    },
  });

  // Every cap must be a whole number >= 0. Blank is not "unlimited" here — the server
  // requires all four, and an empty string would coerce to 0 and silently block the
  // resource outright.
  const capValid = (v: string) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;
  const valid =
    /.+@.+\..+/.test(adminEmail) &&
    [maxProfessors, maxStudents, maxProblems, maxAssignments].every(capValid);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {application.organizationName}</DialogTitle>
          <DialogDescription>
            This creates the workspace, sets its seat limits and emails the administrator a setup
            link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Administrator email</span>
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Prefilled from the applicant — change it if someone else should administer the
              workspace.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Professors</span>
              <Input
                type="number"
                min={0}
                value={maxProfessors}
                onChange={(e) => setMaxProfessors(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">Teaching seats only.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Students</span>
              <Input
                type="number"
                min={0}
                value={maxStudents}
                onChange={(e) => setMaxStudents(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">Raise it later at any time.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Problems</span>
              <Input
                type="number"
                min={0}
                value={maxProblems}
                onChange={(e) => setMaxProblems(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">Org-owned only.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Assignments</span>
              <Input
                type="number"
                min={0}
                value={maxAssignments}
                onChange={(e) => setMaxAssignments(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">0 blocks them entirely.</span>
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Administrators don&apos;t count against the professor limit. The workspace&apos;s short
            name is generated from its title. Every limit here can be changed later from the
            organization&apos;s Quotas tab — including to unlimited, which is deliberately not an
            option at approval.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Approve and invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  application,
  status,
  onClose,
}: {
  application: OrgApplication;
  status?: OrgApplicationStatus;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => orgApplicationsApi.reject(application.id, reason || undefined),
    onSuccess: () => {
      toast.success('Application declined — the applicant has been emailed.');
      void queryClient.invalidateQueries({ queryKey: orgApplicationKeys.list(status) });
      onClose();
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      toast.error(parsed.message);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {application.organizationName}</DialogTitle>
          <DialogDescription>
            The reason is optional and is sent to the applicant word for word. They can apply again.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="We couldn't verify the institution from the details given…"
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
