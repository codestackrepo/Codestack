import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { BulkInviteResult, QuotaExceededBody, RosterPreview } from '@/types/bulk';
import { adminUserKeys } from '@/features/admin/api/users.api';
import { inviteKeys } from '@/features/invites/api/invites.api';
import { bulkInviteApi } from '../api/bulk-invite.api';
import { BulkDropzone } from '../components/bulk-dropzone';
import { BulkPreviewTable } from '../components/bulk-preview-table';

const STEPS = ['Upload', 'Review', 'Done'] as const;

/**
 * Bulk roster import.
 *
 * Three steps in local state, two mutations. The preview echoes an opaque
 * `stagingKey` that the commit sends back, so the rows committed are provably the
 * rows reviewed — re-uploading at commit time would let the two differ.
 *
 * There is NO partial-import affordance anywhere: the server charges the whole
 * batch in one transaction, and a UI that offered "import what fits" would be
 * describing behaviour that does not exist.
 */
export function BulkInvitePage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [quotaError, setQuotaError] = useState<QuotaExceededBody | null>(null);

  const previewMutation = useMutation({
    mutationFn: (file: File) => bulkInviteApi.preview(file),
    onSuccess: (data) => {
      setPreview(data);
      setQuotaError(null);
      setStep(1);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const commitMutation = useMutation({
    mutationFn: (stagingKey: string) => bulkInviteApi.commit({ stagingKey }),
    onSuccess: (data) => {
      setResult(data);
      setStep(2);
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
    onError: (e) => {
      // The preview's headroom check is ADVISORY and lock-free; the transaction is
      // authoritative, so a 409 here is expected even after a green preview.
      const body = parseApiError(e) as unknown as QuotaExceededBody;
      if (body?.reason === 'quota_exceeded') setQuotaError(body);
      else toast.error(parseApiError(e).message);
    },
  });

  const reset = () => {
    setStep(0);
    setPreview(null);
    setResult(null);
    setQuotaError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk import"
        description="Upload a roster to invite many students at once."
      />

      <Stepper current={step} />

      {step === 0 && (
        <Card>
          <CardContent className="pt-6">
            {previewMutation.isPending ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <BulkDropzone onFile={(file) => previewMutation.mutate(file)} />
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && preview && (
        <div className="space-y-4">
          <SummaryCards preview={preview} />
          {quotaError && <QuotaBlock body={quotaError} />}
          {!quotaError && !preview.canCommit && <HeadroomBlock preview={preview} />}
          {preview.warnings.truncated && (
            <Callout tone="warn">
              This file was longer than the 2000-row limit. Only the first 2000 rows were read.
            </Callout>
          )}
          {preview.warnings.extraWorksheetsIgnored.length > 0 && (
            <Callout tone="warn">
              Only the first worksheet was read. Ignored:{' '}
              {preview.warnings.extraWorksheetsIgnored.join(', ')}.
            </Callout>
          )}

          <BulkPreviewTable preview={preview} />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Start over
            </Button>
            <Button
              disabled={
                !preview.canCommit ||
                !!quotaError ||
                preview.summary.seatsRequired === 0 ||
                commitMutation.isPending
              }
              onClick={() => commitMutation.mutate(preview.stagingKey)}
            >
              {commitMutation.isPending
                ? 'Sending…'
                : `Send ${preview.summary.seatsRequired} invitation${preview.summary.seatsRequired === 1 ? '' : 's'}`}
            </Button>
          </div>
          {preview.summary.seatsRequired === 0 && (
            <p className="text-right text-sm text-muted-foreground">
              Everyone in this file is already a member or already invited — there is nothing to
              send.
            </p>
          )}
        </div>
      )}

      {step === 2 && result && (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="size-5 text-primary" />
            </div>
            <CardTitle>Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              <li>
                <span className="font-medium">{result.invited}</span> invitation
                {result.invited === 1 ? '' : 's'} sent
              </li>
              <li>
                <span className="font-medium">{result.claimed}</span> existing account
                {result.claimed === 1 ? '' : 's'} asked to join
              </li>
              <li>
                <span className="font-medium">{result.skipped}</span> skipped
              </li>
            </ul>
            {result.warnings.length > 0 && (
              <Callout tone="warn">
                <ul className="list-inside list-disc space-y-1">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Callout>
            )}
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
              i < current && 'border-primary bg-primary text-primary-foreground',
              i === current && 'border-primary text-primary',
              i > current && 'border-border text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === current ? 'font-medium' : 'text-muted-foreground')}>
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function SummaryCards({ preview }: { preview: RosterPreview }) {
  const { summary, seatsAvailable } = preview;
  const tiles: { label: string; value: string | number }[] = [
    { label: 'Rows read', value: summary.total },
    { label: 'Will invite', value: summary.willInvite },
    { label: 'Asked to join', value: summary.willClaim },
    { label: 'Seats needed', value: summary.seatsRequired },
    // `null` is UNLIMITED. Rendering it as 0 would read as "fully blocked",
    // which is the opposite state.
    { label: 'Seats available', value: seatsAvailable === null ? 'Unlimited' : seatsAvailable },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className="mt-1 font-heading text-xl font-bold">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

/** The server's 409. Every number rendered verbatim — no client arithmetic. */
function QuotaBlock({ body }: { body: QuotaExceededBody }) {
  return (
    <Callout tone="error">
      <p className="font-medium">Not enough seats — nothing was imported.</p>
      <p className="mt-1">
        Your organization allows <span className="font-medium">{body.limit}</span> members and
        currently uses <span className="font-medium">{body.current}</span>. This file needs{' '}
        <span className="font-medium">{body.attempted}</span> more, which would be{' '}
        <span className="font-medium">{body.wouldBe}</span>. Ask your platform administrator to
        raise the limit, then try again — your review is still here.
      </p>
    </Callout>
  );
}

/** The advisory pre-flight, shown before the admin can press anything. */
function HeadroomBlock({ preview }: { preview: RosterPreview }) {
  return (
    <Callout tone="error">
      <p className="font-medium">Not enough seats to import this file.</p>
      <p className="mt-1">
        It needs {preview.summary.seatsRequired} seat
        {preview.summary.seatsRequired === 1 ? '' : 's'} but only {preview.seatsAvailable} remain.
        Nothing will be imported until there is room for all of them.
      </p>
    </Callout>
  );
}

function Callout({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-sm',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/40',
      )}
    >
      {tone === 'error' ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className={tone === 'error' ? '' : 'text-muted-foreground'}>{children}</div>
    </div>
  );
}
