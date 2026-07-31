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
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { CellToggle } from '@/components/shared/cell-toggle';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuth } from '@/features/auth/context/auth-context';
import { parseApiError } from '@/lib/api-client';
import { AppModuleKey, Role } from '@/types/common';
import { moduleAccessApi, type MatrixCell } from '../api/module-access.api';

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

/**
 * Admin-only Module × Role matrix (§9.7). Rows are toggleable modules, columns
 * are roles. Admin cells are locked (checked + disabled) — the client never
 * sends a PATCH for them (the backend also rejects role='admin'). Each toggle
 * flips one cell; on success the matrix and the acting admin's own session are
 * refreshed so their nav stays consistent.
 */
export function ModuleAccessMatrix() {
  const { organization } = useAuth();
  const organizationId = organization?.id ?? null;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    // Org in the key (#72): this matrix is per-organization admin data.
    queryKey: ['module-access', 'matrix', organizationId],
    queryFn: () => moduleAccessApi.getMatrix(),
  });

  const mutation = useMutation({
    mutationFn: ({
      moduleKey,
      role,
      enabled,
    }: {
      moduleKey: AppModuleKey;
      role: Role;
      enabled: boolean;
    }) => moduleAccessApi.updateCell(moduleKey, role, enabled),
    onSuccess: (matrix) => {
      queryClient.setQueryData(['module-access', 'matrix'], matrix);
      // The acting admin's own effective map may have changed — refetch it so
      // the sidebar/routes stay consistent.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      toast.success('Module access updated');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !data) {
    return (
      <EmptyState title="Couldn't load module access" description={parseApiError(error).message} />
    );
  }

  const cellFor = (moduleKey: AppModuleKey, role: Role): MatrixCell | undefined =>
    data.matrix.find((c) => c.moduleKey === moduleKey && c.role === role);

  return (
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
                return (
                  <TableCell key={col.role} className="text-center">
                    <CellToggle
                      checked={isCapped ? false : cell.enabled}
                      // Admin cells are locked-on; a capped module is locked for every
                      // role; and everything is disabled while a mutation is in flight.
                      disabled={isCapped || cell.locked || mutation.isPending}
                      label={`${MODULE_LABEL[moduleKey] ?? moduleKey} for ${col.label}`}
                      onChange={(next) =>
                        mutation.mutate({ moduleKey, role: col.role, enabled: next })
                      }
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
