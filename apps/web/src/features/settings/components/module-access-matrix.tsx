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
import { CellToggle } from '@/components/shared/cell-toggle';
import { EmptyState } from '@/components/shared/empty-state';
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
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['module-access', 'matrix'],
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
        {data.toggleable.map((moduleKey) => (
          <TableRow key={moduleKey}>
            <TableCell className="font-medium">{MODULE_LABEL[moduleKey] ?? moduleKey}</TableCell>
            {ROLE_COLUMNS.map((col) => {
              const cell = cellFor(moduleKey, col.role);
              if (!cell) return <TableCell key={col.role} />;
              return (
                <TableCell key={col.role} className="text-center">
                  <CellToggle
                    checked={cell.enabled}
                    // Admin cells are locked-on; disable while any mutation is in flight.
                    disabled={cell.locked || mutation.isPending}
                    label={`${MODULE_LABEL[moduleKey] ?? moduleKey} for ${col.label}`}
                    onChange={(next) =>
                      mutation.mutate({ moduleKey, role: col.role, enabled: next })
                    }
                  />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
