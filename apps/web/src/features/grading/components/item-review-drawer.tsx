import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/api-client';
import { gradingApi } from '../api/grading.api';
import { formatScore, ITEM_KIND_LABEL, type ItemReview, type ItemScore } from '../types';

interface ItemReviewDrawerProps {
  assignmentId: string;
  studentId: string;
  studentName: string;
  item: ItemScore;
  /** Called after the drawer fully dismisses (save or cancel). */
  onClose: () => void;
}

/**
 * Keyed one-shot review + grade surface for a single (student, item) cell.
 * Fetches the staff review detail, renders kind-appropriate content, and grades
 * via the item-keyed endpoint. Mirrors the old edit-score-dialog's close
 * semantics (Radix onOpenChange never fires for a programmatic close, so the
 * parent unmounts us on save via onClose).
 */
export function ItemReviewDrawer({
  assignmentId,
  studentId,
  studentName,
  item,
  onClose,
}: ItemReviewDrawerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [score, setScore] = useState(item.score === null ? '' : formatScore(item.score));
  const [feedback, setFeedback] = useState(item.feedback ?? '');

  const { data: review, isLoading } = useQuery({
    queryKey: ['grading', 'item-review', item.itemId, studentId],
    queryFn: () => gradingApi.itemReview(item.itemId, studentId),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      gradingApi.updateItemScore(item.itemId, studentId, {
        score: clampScore(Number(score), item.maxScore),
        feedback,
      }),
    onSuccess: () => {
      toast.success('Score saved');
      queryClient.invalidateQueries({ queryKey: ['grading', 'students-scores', assignmentId] });
      onClose();
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const numericScore = Number(score);
  const invalid =
    score.trim() === '' ||
    Number.isNaN(numericScore) ||
    numericScore < 0 ||
    numericScore > item.maxScore;

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return;
    setOpen(next);
    if (!next) onClose();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {item.title || 'Item'}
            <Badge variant="outline" className="text-[10px] uppercase">
              {ITEM_KIND_LABEL[item.kind]}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {studentName} · max {formatScore(item.maxScore)}
          </SheetDescription>
        </SheetHeader>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : review ? (
            <ReviewBody review={review} />
          ) : (
            <p className="text-sm text-muted-foreground">No submission for this item yet.</p>
          )}

          <form
            id="grade-item-form"
            className="space-y-4 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid && !mutation.isPending) mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="item-score">
                Score
                <span className="ml-1 font-normal text-muted-foreground">
                  (max {formatScore(item.maxScore)})
                </span>
              </Label>
              <Input
                id="item-score"
                type="number"
                inputMode="decimal"
                min={0}
                max={item.maxScore}
                step="any"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                aria-invalid={invalid}
              />
              {invalid && (
                <p className="text-xs text-destructive">
                  Enter a number between 0 and {formatScore(item.maxScore)}.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-feedback">Feedback (optional)</Label>
              <Textarea
                id="item-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Leave a note for the student…"
                rows={3}
              />
            </div>
          </form>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="grade-item-form"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={invalid || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save score
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ReviewBody({ review }: { review: ItemReview }) {
  if (review.kind === 'coding') {
    const s = review.submission;
    if (!s) return <p className="text-sm text-muted-foreground">No submission yet.</p>;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{s.status}</Badge>
          <span className="text-muted-foreground">
            {s.passedTestcaseCount}/{s.totalTestcaseCount} tests
          </span>
          <span className="text-muted-foreground">· {s.language}</span>
        </div>
        <pre className="custom-scrollbar max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
          <code>{s.userCode}</code>
        </pre>
      </div>
    );
  }

  if (review.kind === 'mcq') {
    const selected = new Set(review.selectedOptionIds ?? []);
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Auto-scored: {formatScore(review.awardedPoints ?? 0)} / {formatScore(review.maxPoints)}
        </p>
        <ul className="space-y-1.5">
          {(review.options ?? []).map((o) => {
            const picked = selected.has(o.id);
            return (
              <li
                key={o.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  o.isCorrect
                    ? 'border-success/40 bg-success/12'
                    : picked
                      ? 'border-destructive/40 bg-destructive/12'
                      : 'border-border',
                )}
              >
                {o.isCorrect ? (
                  <Check className="size-4 shrink-0 text-success" />
                ) : picked ? (
                  <X className="size-4 shrink-0 text-destructive" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="flex-1">{o.text}</span>
                {picked && (
                  <Badge variant="outline" className="text-[10px]">
                    Selected
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // quiz
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Student answer</Label>
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
        {review.answerText || <span className="text-muted-foreground">No answer submitted.</span>}
      </div>
    </div>
  );
}

function clampScore(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, value));
}
