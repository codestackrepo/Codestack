import { AlertTriangle, Infinity as InfinityIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/auth-context';
import type { QuotaSnapshot } from '@/features/auth/api/auth.api';

const LABELS: Record<string, string> = {
  max_users: 'Members',
  max_problems: 'Problems',
  max_assignments: 'Assignments',
};

/**
 * Quota headroom for the actor's own organization (#71).
 *
 * Sourced from the `quotas` block already on `GET /auth/verify` — no extra request,
 * and the same numbers the server enforces with.
 *
 * `remaining` and `exceeded` are rendered EXACTLY as the server sends them. The one
 * thing this component must never do is compute headroom itself: `limit === null`
 * means UNLIMITED, and the natural-looking `limit ?? 0` turns every uncapped
 * organization into one that appears fully blocked.
 *
 * Renders nothing for a SuperAdmin, who has no organization and is charged no quota.
 */
export function QuotaHeadroomTiles() {
  const { quotas } = useAuth();
  if (!quotas) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold">Capacity</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(quotas).map(([resource, q]) => (
          <HeadroomTile key={resource} label={LABELS[resource] ?? resource} quota={q} />
        ))}
      </div>
    </section>
  );
}

/**
 * Amber near the cap, red at or over it. The thresholds are a fraction of the limit
 * rather than an absolute count, so they mean the same thing for a 10-seat org and a
 * 10,000-seat one.
 */
function HeadroomTile({ label, quota }: { label: string; quota: QuotaSnapshot }) {
  const limit = quota.limit; // narrowed once; `unlimited` alone does not narrow it
  const unlimited = limit === null;
  // Only computed for the colour band, never for the numbers shown.
  const ratio = limit === null || limit === 0 ? 0 : quota.used / limit;
  const atCap = !unlimited && (quota.exceeded || quota.remaining === 0);
  const near = !unlimited && !atCap && ratio >= 0.8;

  return (
    <Card
      className={cn(
        'p-4',
        atCap && 'border-destructive/40 bg-destructive/5',
        near && 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {atCap && <AlertTriangle className="size-4 text-destructive" />}
      </div>
      <p className="mt-1 font-heading text-2xl font-bold">
        {quota.used}
        <span className="text-sm font-normal text-muted-foreground">
          {' / '}
          {unlimited ? (
            <span className="inline-flex items-center gap-1">
              <InfinityIcon className="size-3.5" /> Unlimited
            </span>
          ) : (
            quota.limit
          )}
        </span>
      </p>
      {/* Straight from the server. `remaining` is null exactly when unlimited. */}
      {!unlimited && (
        <p
          className={cn(
            'mt-0.5 text-xs',
            atCap ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {quota.exceeded
            ? 'Over the limit — ask your platform administrator to raise it.'
            : `${quota.remaining} remaining`}
        </p>
      )}
    </Card>
  );
}
