import { Sparkles, Check, Infinity as InfinityIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/features/auth/context/auth-context';
import type { QuotaSnapshot } from '@/features/auth/api/auth.api';
import { QUOTA_LABELS, QuotaResource } from '@/types/entitlement';

/**
 * Plan and usage.
 *
 * There is no plan/tier column in the database yet and the Stripe module is
 * deliberately not registered, so "plan" here is DERIVED FROM THE QUOTAS THAT ALREADY
 * EXIST rather than invented as a parallel concept. That keeps this page honest: every
 * number shown is a real limit the server enforces today, not a marketing tier that
 * nothing checks.
 *
 * The two ecosystems get different remedies, the same split `QuotaBlockNotice` makes:
 * an institution's caps are raised by a platform superadmin, so an upgrade button
 * there would be a dead end; the community tenant is individuals, so upgrading is
 * theirs to do.
 */
export function SubscriptionPage() {
  const { organization, quotas } = useAuth();
  const isOpenEcosystem = organization?.type === 'community';

  // A tenant with no limit on anything is on the unrestricted footing; any cap at all
  // means someone has deliberately bounded it. This is a LABEL, not a gate — the
  // quotas below are what actually bind.
  const capped = quotas
    ? Object.values(QuotaResource).filter((r) => quotas[r]?.limit !== null)
    : [];
  const planName = capped.length === 0 ? 'Unlimited' : isOpenEcosystem ? 'Free' : 'Institution';

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Subscription</h1>
        <p className="text-sm text-muted-foreground">
          What your {isOpenEcosystem ? 'account' : 'organization'} is allowed today, and what
          upgrading would change.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold">{planName} plan</h2>
              <Badge variant={capped.length === 0 ? 'secondary' : 'default'}>Current</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {isOpenEcosystem
                ? 'Individual account on the open platform.'
                : `Managed for ${organization?.name ?? 'your organization'} by the CodeStack platform team.`}
            </p>
          </div>
          {isOpenEcosystem ? (
            // Disabled, not hidden: the path should be visible before it is wired, so
            // the page does not silently change shape the day billing is registered.
            <Button className="gap-2" disabled>
              <Sparkles className="size-4" /> Upgrade — coming soon
            </Button>
          ) : (
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              Need more capacity? Your platform administrator raises these limits — they are set per
              organization, not bought here.
            </p>
          )}
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Included in your plan</h2>
        {!quotas ? (
          <p className="text-sm text-muted-foreground">
            Platform administrators are charged to no organization, so there is nothing to meter
            here.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(QuotaResource).map((resource) => (
              <UsageCard key={resource} label={QUOTA_LABELS[resource]} usage={quotas[resource]} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Features</h2>
        <Card className="p-5">
          <p className="mb-3 text-sm text-muted-foreground">
            Every feature is switched on for your plan today. Individual areas can still be turned
            off per role by an administrator.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              'Problem library and authoring',
              'Assignments, quizzes and timed tests',
              'Automated judging in four languages',
              'Gradebook and manual review',
              'Discussion topics and doubts',
              'Bulk roster import',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="size-4 shrink-0 text-brand" />
                {f}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

/**
 * `remaining` comes straight from the server — never recomputed. `limit === null` is
 * UNLIMITED and `0` is BLOCKED, and the bar must not treat them alike: a percentage
 * of null is what turns an uncapped resource into a full one.
 */
function UsageCard({ label, usage }: { label: string; usage: QuotaSnapshot | undefined }) {
  if (!usage) return null;
  const unlimited = usage.limit === null;
  const pct = unlimited || usage.limit === 0 ? 0 : Math.min(100, (usage.used / usage.limit!) * 100);

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {usage.exceeded && <Badge variant="destructive">Over</Badge>}
      </div>
      <p className="font-heading text-xl font-bold">
        {usage.used}
        <span className="text-sm font-normal text-muted-foreground">
          {' / '}
          {unlimited ? (
            <span className="inline-flex items-center gap-1">
              <InfinityIcon className="size-3.5" /> Unlimited
            </span>
          ) : (
            usage.limit
          )}
        </span>
      </p>
      {!unlimited && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={pct >= 100 ? 'h-full bg-destructive' : 'h-full bg-brand'}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{usage.remaining} remaining</p>
        </>
      )}
    </Card>
  );
}
