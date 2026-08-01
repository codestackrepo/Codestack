import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { CellToggle } from '@/components/shared/cell-toggle';
import { Button } from '@/components/ui/button';
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

/** Feature keys contain dots, so the role is recovered by splitting on the LAST colon. */
const stagingKey = (key: AccessKey, role: Role): string => `${key}:${role}`;

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

  /**
   * Staged edits, `key:role` -> enabled. Nothing is written until Save.
   *
   * Same reasoning as the org-admin matrix: re-planning access is a multi-cell edit,
   * and writing each flip immediately walks the org through combinations nobody
   * chose, each its own transaction and its own cross-instance invalidation.
   */
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map());

  const save = useMutation({
    mutationFn: (cells: { key: AccessKey; role: Role; enabled: boolean }[]) =>
      platformApi.setOrgMatrixCells(orgId, cells),
    // The PATCH returns the refreshed matrix, so seed the cache with the server's
    // answer instead of refetching or optimistically guessing — the resolver may
    // legitimately disagree with the requested value.
    onSuccess: (fresh) => {
      queryClient.setQueryData(platformKeys.orgMatrix(orgId), fresh);
      setStaged(new Map());
      // A module/feature change alters what this org's users may reach, so any
      // session-derived module map is now stale.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('Access saved');
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
                        <span
                          // An unsaved cell must not look identical to a saved one.
                          className={
                            staged.has(stagingKey(key, role))
                              ? 'inline-block rounded-full ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
                              : undefined
                          }
                          title={staged.has(stagingKey(key, role)) ? 'Unsaved change' : undefined}
                        >
                          <CellToggle
                            checked={staged.get(stagingKey(key, role)) ?? cell.enabled}
                            // Staging is never blocked by an in-flight save; only the
                            // Save button is.
                            disabled={save.isPending}
                            label={`${key} for ${role}`}
                            onChange={(enabled) =>
                              setStaged((prev) => {
                                const draft = new Map(prev);
                                // Back to the server's value is not an edit.
                                if (enabled === cell.enabled) draft.delete(stagingKey(key, role));
                                else draft.set(stagingKey(key, role), enabled);
                                return draft;
                              })
                            }
                          />
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-3">
        <p className="mr-auto text-sm text-muted-foreground">
          {staged.size === 0
            ? 'No unsaved changes.'
            : `${staged.size} unsaved change${staged.size === 1 ? '' : 's'}.`}
        </p>
        <Button
          variant="outline"
          onClick={() => setStaged(new Map())}
          disabled={staged.size === 0 || save.isPending}
        >
          Discard
        </Button>
        <Button
          disabled={staged.size === 0 || save.isPending}
          onClick={() => {
            const cells = [...staged].map(([k, enabled]) => {
              // `key` may itself contain a dot (a feature key), so split on the LAST
              // colon — the role is always the final segment.
              const idx = k.lastIndexOf(':');
              return {
                key: k.slice(0, idx) as AccessKey,
                role: k.slice(idx + 1) as Role,
                enabled,
              };
            });
            if (cells.length) save.mutate(cells);
          }}
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
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
