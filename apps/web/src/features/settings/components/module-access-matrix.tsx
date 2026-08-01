import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { CellToggle } from '@/components/shared/cell-toggle';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuth } from '@/features/auth/context/auth-context';
import { parseApiError } from '@/lib/api-client';
import { AppModuleKey, Role } from '@/types/common';
import { moduleAccessApi, type MatrixCell, type PendingCell } from '../api/module-access.api';

const MODULE_LABEL: Record<AppModuleKey, string> = {
  [AppModuleKey.CLASSROOMS]: 'Classrooms',
  [AppModuleKey.PROBLEMS]: 'Problems',
  [AppModuleKey.ASSIGNMENTS]: 'Assignments',
  [AppModuleKey.PLAYGROUND]: 'Playground',
  [AppModuleKey.GRADING]: 'Gradebook',
  [AppModuleKey.TOPICS]: 'Topics',
  [AppModuleKey.DASHBOARD]: 'Dashboard',
  [AppModuleKey.PROFILE]: 'Profile',
  [AppModuleKey.SETTINGS]: 'Settings',
};

const ROLE_COLUMNS: { role: Role; label: string }[] = [
  { role: Role.ADMIN, label: 'Admin' },
  { role: Role.PROFESSOR, label: 'Professor' },
  { role: Role.STUDENT, label: 'Student' },
];

const stagingKey = (moduleKey: AppModuleKey, role: Role): string => `${moduleKey}:${role}`;

/**
 * Admin-only Module × Role matrix (§9.7). Rows are toggleable modules, columns
 * are roles. Admin cells are locked (checked + disabled) — the client never
 * sends a PATCH for them (the backend also rejects role='admin').
 *
 * EDITS ARE STAGED, NOT LIVE. Toggling only moves local state; nothing is written
 * until Save. Two reasons:
 *
 *  1. Re-planning a role's access is inherently a multi-cell edit. Written one flip
 *     at a time, the org passes through combinations the admin never chose — and
 *     each write was its own transaction and its own cross-instance invalidation.
 *     One atomic bulk write ends that.
 *  2. It makes the toggle honest. The switch now reflects local intent immediately
 *     and always, instead of waiting on a round trip whose result used to be written
 *     to a cache key nobody was reading.
 */
export function ModuleAccessMatrix() {
  const { organization } = useAuth();
  const organizationId = organization?.id ?? null;
  const queryClient = useQueryClient();

  /** Staged edits, `module:role` -> enabled. Empty means nothing to save. */
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map());

  const matrixKey = ['module-access', 'matrix', organizationId];

  const { data, isLoading, isError, error } = useQuery({
    // Org in the key (#72): this matrix is per-organization admin data.
    queryKey: matrixKey,
    queryFn: () => moduleAccessApi.getMatrix(),
  });

  const mutation = useMutation({
    mutationFn: (cells: PendingCell[]) => moduleAccessApi.updateCells(cells),
    onSuccess: (matrix) => {
      // The SAME key the query reads. Writing a shorter key here was the reason a
      // saved change left the switch showing its old value until a manual refetch.
      queryClient.setQueryData(matrixKey, matrix);
      setStaged(new Map());
      // The acting admin's own effective map may have changed — refetch it so
      // the sidebar/routes stay consistent.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('Module access saved');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const cellFor = useMemo(() => {
    const index = new Map<string, MatrixCell>();
    for (const c of data?.matrix ?? []) index.set(`${c.moduleKey}:${c.role}`, c);
    return (moduleKey: AppModuleKey, role: Role): MatrixCell | undefined =>
      index.get(stagingKey(moduleKey, role));
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !data) {
    return (
      <EmptyState title="Couldn't load module access" description={parseApiError(error).message} />
    );
  }

  const save = () => {
    const cells: PendingCell[] = [];
    for (const [key, enabled] of staged) {
      const [moduleKey, role] = key.split(':') as [AppModuleKey, Role];
      cells.push({ moduleKey, role, enabled });
    }
    if (cells.length) mutation.mutate(cells);
  };

  return (
    <div className="space-y-4">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Module</TableHead>
            {ROLE_COLUMNS.map((col) => (
              <TableHead key={col.role} className="text-center">
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.toggleable.map((moduleKey) => {
            /*
             * #71 — a module the platform has capped off (`granted: false`) is a hard
             * false for this whole organization, its admin included, and no override
             * here can lift it. Render the row locked with the reason rather than as
             * a toggle that writes a value the resolver ignores.
             */
            const isCapped = (data.capped ?? []).includes(moduleKey);
            return (
              <TableRow key={moduleKey} className={isCapped ? 'opacity-60' : undefined}>
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {MODULE_LABEL[moduleKey] ?? moduleKey}
                    {isCapped && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
                        title="Switched off for your organization by the platform administrator. This cannot be enabled here."
                      >
                        <Lock className="size-3" /> Not included in your plan
                      </span>
                    )}
                  </span>
                </TableCell>
                {ROLE_COLUMNS.map((col) => {
                  const cell = cellFor(moduleKey, col.role);
                  if (!cell) return <TableCell key={col.role} />;
                  const key = stagingKey(moduleKey, col.role);
                  const isDirty = staged.has(key);
                  const checked = isCapped ? false : (staged.get(key) ?? cell.enabled);
                  return (
                    <TableCell key={col.role} className="text-center">
                      <span
                        className={
                          // A saved cell and an unsaved one must not look identical,
                          // or an admin navigates away believing a staged edit landed.
                          isDirty
                            ? 'inline-block rounded-full ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
                            : undefined
                        }
                        title={isDirty ? 'Unsaved change' : undefined}
                      >
                        <CellToggle
                          checked={checked}
                          // Admin cells are locked-on and a capped module is locked for
                          // every role. Staging itself is never blocked by an in-flight
                          // save — only the Save button is.
                          disabled={isCapped || cell.locked || mutation.isPending}
                          label={`${MODULE_LABEL[moduleKey] ?? moduleKey} for ${col.label}`}
                          onChange={(next) =>
                            setStaged((prev) => {
                              const draft = new Map(prev);
                              // Toggling back to the server's value is not an edit —
                              // dropping it keeps Save disabled when nothing differs.
                              if (next === cell.enabled) draft.delete(key);
                              else draft.set(key, next);
                              return draft;
                            })
                          }
                        />
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-3">
        <p className="mr-auto text-sm text-muted-foreground">
          {staged.size === 0
            ? 'No unsaved changes.'
            : `${staged.size} unsaved change${staged.size === 1 ? '' : 's'}.`}
        </p>
        <Button
          variant="outline"
          onClick={() => setStaged(new Map())}
          disabled={staged.size === 0 || mutation.isPending}
        >
          Discard
        </Button>
        <Button onClick={save} disabled={staged.size === 0 || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
