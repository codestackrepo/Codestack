import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Infinity as InfinityIcon } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api-client';
import { QUOTA_LABELS, QuotaResource } from '@/types/entitlement';
import type { QuotaUsage } from '@/types/organization';
import { platformApi, platformKeys } from '../api/platform.api';

/**
 * Every resource the server knows about, derived rather than listed.
 *
 * A hardcoded list here is silently wrong the moment a resource is added: the
 * server returns usage for all of `ALL_QUOTA_RESOURCES`, so an omitted key is a cap
 * a superadmin simply cannot set, with nothing in the UI to say so. That is exactly
 * what happened to the two per-role seat caps (#118) — approval wrote them, and this
 * form could not edit them afterwards.
 *
 * MAX_USERS leads because it bounds everything else.
 */
const RESOURCES: QuotaResource[] = [
  QuotaResource.MAX_USERS,
  ...Object.values(QuotaResource).filter((r) => r !== QuotaResource.MAX_USERS),
];

/**
 * Per-org quota limits (#70).
 *
 * THE RULE THIS FORM EXISTS TO RESPECT: `null` is UNLIMITED and `0` is BLOCKED.
 *
 * They are not interchangeable anywhere in the stack, so "unlimited" is its own
 * explicit control — a checkbox — and never an empty text field. A blank input that
 * submitted `0` would silently convert an uncapped organization into one that can
 * add nothing at all, and the administrator would have no way to tell from the UI
 * that they had done it. When the box is ticked the number input is disabled and
 * `null` is sent; when it is clear a number is required.
 *
 * `remaining` and `exceeded` are rendered STRAIGHT FROM THE SERVER. Re-deriving them
 * here would put the null-vs-0 arithmetic in a second place, and the client copy is
 * the one that gets it wrong.
 */
export function OrgQuotaForm({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: platformKeys.orgQuotas(orgId),
    queryFn: () => platformApi.getOrgQuotas(orgId),
    enabled: !!orgId,
  });

  const save = useMutation({
    mutationFn: (v: { resource: QuotaResource; limitValue: number | null }) =>
      platformApi.setOrgQuota(orgId, v.resource, v.limitValue),
    onSuccess: (fresh) => {
      queryClient.setQueryData(platformKeys.orgQuotas(orgId), fresh);
      // The org detail header renders its own usage tiles from a different endpoint.
      void queryClient.invalidateQueries({ queryKey: platformKeys.organization(orgId) });
      toast.success('Limit updated');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !data) {
    return <EmptyState title="Couldn't load quotas" description={parseApiError(error).message} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A limit counts what the organization already has. Leave a resource unlimited, or set a
        number — <span className="font-medium text-foreground">0 blocks it entirely</span>, which is
        not the same as unlimited.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((resource) => (
          <QuotaRow
            /*
             * Keyed on the SERVER's limit, not just the resource. When the saved
             * value changes this remounts the row with fresh initial state, which
             * is React's own answer to "reset state when a prop changes" — the
             * useEffect-sync alternative sets state during an effect and triggers
             * a cascading render (and is a lint error here).
             */
            key={`${resource}:${String(data.usage[resource].limit)}`}
            resource={resource}
            usage={data.usage[resource]}
            saving={save.isPending}
            onSave={(limitValue) => save.mutate({ resource, limitValue })}
          />
        ))}
      </div>
    </div>
  );
}

function QuotaRow({
  resource,
  usage,
  saving,
  onSave,
}: {
  resource: QuotaResource;
  usage: QuotaUsage;
  saving: boolean;
  onSave: (limitValue: number | null) => void;
}) {
  const serverUnlimited = usage.limit === null;
  const [unlimited, setUnlimited] = useState(serverUnlimited);
  const [value, setValue] = useState(serverUnlimited ? '' : String(usage.limit));

  const parsed = Number(value);
  const numberInvalid =
    !unlimited && (value.trim() === '' || !Number.isInteger(parsed) || parsed < 0);
  const dirty = unlimited !== serverUnlimited || (!unlimited && parsed !== usage.limit);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <Label className="text-sm font-medium">{QUOTA_LABELS[resource]}</Label>
        {usage.exceeded && <Badge variant="destructive">Over limit</Badge>}
      </div>

      <p className="font-heading text-xl font-bold">
        {usage.used}
        <span className="text-sm font-normal text-muted-foreground">
          {' / '}
          {serverUnlimited ? 'Unlimited' : usage.limit}
        </span>
      </p>
      {/* Straight from the server — never recomputed here. */}
      {!serverUnlimited && (
        <p className="text-xs text-muted-foreground">{usage.remaining} remaining</p>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 rounded border-border accent-brand"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
        />
        <span className="inline-flex items-center gap-1">
          <InfinityIcon className="size-3.5" /> Unlimited
        </span>
      </label>

      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        // Disabled rather than hidden while unlimited: the previous number stays
        // visible as context, and there is no blank field that could be submitted.
        disabled={unlimited || saving}
        value={unlimited ? '' : value}
        placeholder={unlimited ? 'No limit' : '0 blocks entirely'}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`${QUOTA_LABELS[resource]} limit`}
      />
      {numberInvalid && !unlimited && (
        <p className="text-xs text-destructive">Enter a whole number of 0 or more.</p>
      )}

      <Button
        size="sm"
        className="w-full"
        disabled={saving || !dirty || (!unlimited && numberInvalid)}
        onClick={() => onSave(unlimited ? null : parsed)}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
