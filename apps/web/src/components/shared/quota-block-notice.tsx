import { AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context/auth-context';

/**
 * What to tell someone a quota has just stopped.
 *
 * The remedy is NOT the same in the two ecosystems, which is the whole reason this
 * is one component rather than a hardcoded sentence at each call site:
 *
 *  - CLOSED tenant (a real institution): its caps are set by a platform superadmin
 *    and its own admin cannot raise them. The only true instruction is "ask your
 *    platform administrator" — offering an upgrade button would be a dead end.
 *  - OPEN tenant (the shared community org): there is no institution to ask. These
 *    members are individuals, so the honest remedy is an upgrade.
 *
 * The branch is on `organization.type === 'community'`, never on `user.origin` —
 * origin is immutable provenance, so an open-origin student who accepted a
 * university invite would otherwise be shown a personal upgrade offer for a cap
 * their university controls.
 *
 * The upgrade action is a PLACEHOLDER. Billing exists in the tree but is
 * deliberately not registered, so there is nothing to check out against; this
 * surfaces the path without pretending it is wired.
 */
export function QuotaBlockNotice({
  resourceLabel,
  limit,
  used,
  onUpgrade,
}: {
  /** What ran out, in the user's words — "professor seat", "problem". */
  resourceLabel: string;
  limit: number | null | undefined;
  used: number | null | undefined;
  /** Omit to render the default "coming soon" toast-free placeholder. */
  onUpgrade?: () => void;
}) {
  const { organization } = useAuth();
  const isOpenEcosystem = organization?.type === 'community';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-2">
        <p className="font-medium">No {resourceLabel} capacity left.</p>
        <p>
          {/* Rendered from the server's numbers, never re-derived: `limit ?? 0` is
              how an uncapped org gets reported as a blocked one. */}
          Your plan allows {limit} and you are using {used}.{' '}
          {isOpenEcosystem
            ? 'Upgrade to raise the limit and unlock the full catalog.'
            : 'Ask your platform administrator to raise the limit.'}
        </p>
        {isOpenEcosystem && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={onUpgrade}
            disabled={!onUpgrade}
          >
            <Sparkles className="size-3.5" />
            {onUpgrade ? 'Upgrade' : 'Upgrade — coming soon'}
          </Button>
        )}
      </div>
    </div>
  );
}
