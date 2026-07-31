import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { CellToggle } from '@/components/shared/cell-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { parseApiError } from '@/lib/api-client';
import { Role } from '@/types/common';
import type { AccessKey, MatrixCell } from '@/types/entitlement';
import { platformApi, platformKeys } from '../api/platform.api';

/** The three roles the matrix is editable across. SUPERADMIN bypasses every layer. */
const ROLES: Role[] = [Role.ADMIN, Role.PROFESSOR, Role.STUDENT];

/**
 * One org's Module × Role or Feature × Role matrix (#70).
 *
 * ONE component for both, chosen by `kind`, because the two tables differ only in
 * which key list they iterate — the cells, the toggle and the locked semantics are
 * identical. Two components would be two places to fix the same bug.
 *
 * A `locked` cell renders as a disabled switch with the reason, never as an editable
 * one. The 8-layer resolver owns those cells (a role ceiling, or org-admin immunity),
 * so a toggle would appear to work, POST successfully and change nothing — which is
 * strictly worse than showing no control.
 */
export function OrgAccessMatrix({ orgId, kind }: { orgId: string; kind: 'modules' | 'features' }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: platformKeys.orgMatrix(orgId),
    queryFn: () => platformApi.getOrgMatrix(orgId),
    enabled: !!orgId,
  });

  const toggle = useMutation({
    mutationFn: (v: { key: AccessKey; role: Role; enabled: boolean }) =>
      platformApi.setOrgMatrixCell(orgId, v.key, v.role, v.enabled),
    // The PATCH returns the refreshed matrix, so seed the cache with the server's
    // answer instead of refetching or optimistically guessing — the resolver may
    // legitimately disagree with the requested value.
    onSuccess: (fresh) => {
      queryClient.setQueryData(platformKeys.orgMatrix(orgId), fresh);
      // A module/feature change alters what this org's users may reach, so any
      // session-derived module map is now stale.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !data) {
    return (
      <EmptyState title="Couldn't load entitlements" description={parseApiError(error).message} />
    );
  }

  const keys: AccessKey[] = kind === 'modules' ? data.toggleable : data.features;
  if (keys.length === 0) {
    return <EmptyState title="Nothing to configure" description="No keys of this kind exist." />;
  }

  const cellFor = (key: AccessKey, role: Role): MatrixCell | undefined =>
    data.matrix.find((c) => c.moduleKey === key && c.role === role);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {kind === 'modules'
          ? 'Whole sections of the app, per role. System modules (dashboard, profile, settings) are always on and are not listed.'
          : 'Individual capabilities within a module. A feature is only reachable when its module is also on.'}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">
                {kind === 'modules' ? 'Module' : 'Feature'}
              </TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="capitalize">
                  {r}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-mono text-xs">{key}</TableCell>
                {ROLES.map((role) => {
                  const cell = cellFor(key, role);
                  if (!cell) return <TableCell key={role}>—</TableCell>;
                  return (
                    <TableCell key={role}>
                      {cell.locked ? (
                        <LockedCell enabled={cell.enabled} role={role} />
                      ) : (
                        <CellToggle
                          checked={cell.enabled}
                          disabled={toggle.isPending}
                          label={`${key} for ${role}`}
                          onChange={(enabled) => toggle.mutate({ key, role, enabled })}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Shows the resolved value AND why it cannot be changed. The two locked causes read
 * very differently to an administrator, so they are not collapsed into one message.
 */
function LockedCell({ enabled, role }: { enabled: boolean; role: Role }) {
  const reason =
    role === Role.ADMIN
      ? 'Organization administrators are immune to these overrides — this cannot be switched off for them.'
      : 'A platform role ceiling forbids this capability for this role. No override can grant it.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {enabled ? 'Always on' : 'Never'}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}
