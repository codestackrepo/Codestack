import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import { gradingApi } from '../api/grading.api';
import { formatScore, type ProblemScore } from '../types';

interface EditScoreDialogProps {
  assignmentId: string;
  studentId: string;
  studentName: string;
  problem: ProblemScore;
  /** Called after the dialog fully dismisses (save or cancel). */
  onClose: () => void;
}

/**
 * Mounted on demand (keyed) by the gradebook — its lifetime is exactly one
 * edit, so local form state never goes stale across different target cells.
 */
export function EditScoreDialog({
  assignmentId,
  studentId,
  studentName,
  problem,
  onClose,
}: EditScoreDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [score, setScore] = useState(formatScore(problem.score));
  const [feedback, setFeedback] = useState(problem.feedback);

  const mutation = useMutation({
    mutationFn: () =>
      gradingApi.updateScore(problem.assignmentProblemId, studentId, {
        score: clampScore(Number(score), problem.maxScore),
        feedback,
      }),
    onSuccess: () => {
      toast.success('Score saved');
      queryClient.invalidateQueries({ queryKey: ['grading', 'students-scores', assignmentId] });
      // Notify the parent so it clears editTarget and unmounts this keyed
      // instance. Routing through handleOpenChange would be swallowed — its
      // guard sees mutation.isPending (still true inside this closure) — and
      // Radix's onOpenChange never fires for a programmatic close anyway, so
      // the parent would keep a stale editTarget and the same cell couldn't
      // be reopened.
      onClose();
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const numericScore = Number(score);
  const invalid =
    score.trim() === '' ||
    Number.isNaN(numericScore) ||
    numericScore < 0 ||
    numericScore > problem.maxScore;

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return;
    setOpen(next);
    if (!next) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit score</DialogTitle>
          <DialogDescription>
            {studentName} · {problem.title || 'Untitled problem'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid && !mutation.isPending) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="grade-score">
              Score
              <span className="ml-1 font-normal text-muted-foreground">
                (max {formatScore(problem.maxScore)})
              </span>
            </Label>
            <Input
              id="grade-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={problem.maxScore}
              step="any"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              aria-invalid={invalid}
              autoFocus
            />
            {invalid && (
              <p className="text-xs text-destructive">
                Enter a number between 0 and {formatScore(problem.maxScore)}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grade-feedback">Feedback (optional)</Label>
            <Textarea
              id="grade-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Leave a note for the student…"
              rows={4}
            />
          </div>

          <DialogFooter>
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
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={invalid || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save score
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function clampScore(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(max, value));
}
