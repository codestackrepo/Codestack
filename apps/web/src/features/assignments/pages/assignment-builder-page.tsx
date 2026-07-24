import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Code2,
  ListChecks,
  PenLine,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { assignmentsApi } from '../api/assignments.api';
import { ItemFormDialog } from '../components/item-form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { parseApiError } from '@/lib/api-client';
import { AssignmentItemKind, type AssignmentItemStaff } from '@/types/assignment';

const KIND_META: Record<AssignmentItemKind, { label: string; icon: typeof Code2 }> = {
  [AssignmentItemKind.CODING]: { label: 'Coding', icon: Code2 },
  [AssignmentItemKind.MCQ]: { label: 'MCQ', icon: ListChecks },
  [AssignmentItemKind.QUIZ]: { label: 'Quiz', icon: PenLine },
};

function itemHeadline(item: AssignmentItemStaff): string {
  if (item.kind === AssignmentItemKind.CODING) return item.title || 'Coding problem';
  return item.prompt || '(no prompt)';
}

/**
 * Staff assignment builder (`/home/assignments/:id/build`, #22). Orders mixed
 * coding / MCQ / quiz items; add/edit via ItemFormDialog, reorder via up/down,
 * delete with confirm. All writes invalidate the items query.
 */
export function AssignmentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{
    kind: AssignmentItemKind;
    item: AssignmentItemStaff | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentItemStaff | null>(null);

  const { data: assignment } = useQuery({
    queryKey: ['assignments', id],
    queryFn: () => assignmentsApi.getById(id!),
    enabled: !!id,
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['assignments', id, 'items'],
    queryFn: () => assignmentsApi.items(id!),
    enabled: !!id,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedItemIds: string[]) => assignmentsApi.reorderItems(id!, orderedItemIds),
    onSuccess: (next) => queryClient.setQueryData(['assignments', id, 'items'], next),
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => assignmentsApi.deleteItem(itemId),
    onSuccess: () => {
      toast.success('Item removed.');
      void queryClient.invalidateQueries({ queryKey: ['assignments', id, 'items'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  function move(index: number, dir: -1 | 1) {
    if (!items) return;
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((it) => it.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMutation.mutate(ids);
  }

  const totalPoints = items?.reduce((sum, it) => sum + it.maxPoints, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={assignment ? `Build: ${assignment.title}` : 'Build assignment'}
        description={
          items
            ? `${items.length} item${items.length === 1 ? '' : 's'} · ${totalPoints} points total`
            : undefined
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/home/assignments">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_META) as AssignmentItemKind[]).map((kind) => {
          const { label, icon: Icon } = KIND_META[kind];
          return (
            <Button key={kind} variant="outline" onClick={() => setDialog({ kind, item: null })}>
              <Plus className="size-4" />
              <Icon className="size-4" /> {label}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !items || items.length === 0 ? (
        <EmptyState
          title="No items yet"
          description="Add coding problems, multiple-choice questions, or quiz prompts to build this assignment."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const { label, icon: Icon } = KIND_META[item.kind];
            return (
              <Card key={item.id} className="flex items-center gap-3 p-4">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === items.length - 1 || reorderMutation.isPending}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>

                <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Icon className="size-3" /> {label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{item.maxPoints} pts</span>
                    {item.kind === AssignmentItemKind.MCQ && (
                      <span className="text-xs text-muted-foreground">
                        {item.options?.length ?? 0} options ·{' '}
                        {item.allowMultiple ? 'multi' : 'single'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm">{itemHeadline(item)}</p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDialog({ kind: item.kind, item })}
                    aria-label="Edit item"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(item)}
                    aria-label="Delete item"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {dialog && id && (
        <ItemFormDialog
          assignmentId={id}
          kind={dialog.kind}
          item={dialog.item}
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item from the assignment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
