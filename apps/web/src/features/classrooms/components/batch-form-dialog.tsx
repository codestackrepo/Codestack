import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { batchesApi } from '../api/batches.api';
import { parseApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckboxList } from '@/components/shared/checkbox-list';
import type { Batch } from '@/types/classroom';
import type { User } from '@/types/user';

/**
 * Create/edit dialog for a batch. `batch === null` is create mode. The student
 * multi-select is limited to the classroom's own students, so the subset
 * invariant (§9.10) holds client-side before the request is even sent.
 */
export function BatchFormDialog({
  classroomId,
  students,
  batch,
  open,
  onOpenChange,
}: {
  classroomId: string;
  students: User[];
  batch: Batch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = batch !== null;
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form each time the dialog is opened (for create or a given batch).
  useEffect(() => {
    if (!open) return;
    setName(batch?.name ?? '');
    setSelectedIds((batch?.students ?? []).map((s) => s.id));
    setError(null);
  }, [open, batch]);

  const mutation = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), studentIds: selectedIds };
      return isEdit
        ? batchesApi.update(classroomId, batch.id, input)
        : batchesApi.create(classroomId, input);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Batch updated.' : 'Batch created.');
      void queryClient.invalidateQueries({ queryKey: ['batches', classroomId] });
      void queryClient.invalidateQueries({ queryKey: ['classrooms', classroomId] });
      onOpenChange(false);
    },
    onError: (err) => setError(parseApiError(err).message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Batch name is required.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit batch' : 'New batch'}</DialogTitle>
          <DialogDescription>
            Group a subset of this classroom's students. Assignments can target a batch instead of
            the whole class.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="batch-name">Name</Label>
            <Input
              id="batch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Section A"
              maxLength={255}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>
              Students
              <span className="font-normal text-muted-foreground">
                {selectedIds.length} selected
              </span>
            </Label>
            {students.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                This classroom has no students yet.
              </p>
            ) : (
              <CheckboxList
                items={students.map((s) => ({
                  id: s.id,
                  label: `${s.firstName} ${s.lastName}`,
                  description: s.email,
                }))}
                selectedIds={selectedIds}
                onToggle={(id, checked) =>
                  setSelectedIds((prev) =>
                    checked ? [...prev, id] : prev.filter((x) => x !== id),
                  )
                }
              />
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
