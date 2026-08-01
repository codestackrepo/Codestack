import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { batchesApi } from '../api/batches.api';
import { BatchFormDialog } from './batch-form-dialog';
import { parseApiError } from '@/lib/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Batch } from '@/types/classroom';
import type { User } from '@/types/user';

/**
 * Staff-only batch management for a classroom: list, create/edit (name +
 * student subset), and delete. Delete is blocked server-side with a 409 when a
 * batch is still targeted by an assignment — surfaced as a specific message.
 */
export function BatchManagementCard({
  classroomId,
  students,
}: {
  classroomId: string;
  students: User[];
}) {
  const queryClient = useQueryClient();
  // `editing`: null when closed, 'new' for create, or the Batch being edited.
  const [editing, setEditing] = useState<Batch | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Batch | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches', classroomId],
    queryFn: () => batchesApi.list(classroomId),
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: string) => batchesApi.remove(classroomId, batchId),
    onSuccess: () => {
      toast.success('Batch deleted.');
      void queryClient.invalidateQueries({ queryKey: ['batches', classroomId] });
      void queryClient.invalidateQueries({ queryKey: ['classrooms', classroomId] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      const parsed = parseApiError(err);
      toast.error(
        parsed.statusCode === 409
          ? "This batch is targeted by an assignment and can't be deleted"
          : parsed.message,
      );
      setDeleteTarget(null);
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          Batches
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" /> New batch
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!isLoading && (batches?.length ?? 0) === 0 && (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No batches yet. Create one to target a subset of students.
          </p>
        )}

        {!isLoading && batches && batches.length > 0 && (
          <ul className="divide-y divide-border">
            {batches.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{batch.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {batch.studentCount} student{batch.studentCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(batch)}
                    aria-label={`Edit ${batch.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(batch)}
                    aria-label={`Delete ${batch.name}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <BatchFormDialog
        classroomId={classroomId}
        students={students}
        batch={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete batch?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `"${deleteTarget.name}" will be removed. This can't be undone.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
