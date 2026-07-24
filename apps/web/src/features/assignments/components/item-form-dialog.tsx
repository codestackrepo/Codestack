import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { assignmentsApi } from '../api/assignments.api';
import { problemsApi } from '@/features/problems/api/problems.api';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckboxList } from '@/components/shared/checkbox-list';
import { cn } from '@/lib/utils';
import { Language } from '@/types/common';
import {
  AssignmentItemKind,
  type AssignmentItemStaff,
  type CreateAssignmentItemInput,
  type McqOptionInput,
  type UpdateAssignmentItemInput,
} from '@/types/assignment';

const KIND_TITLE: Record<AssignmentItemKind, string> = {
  [AssignmentItemKind.CODING]: 'coding problem',
  [AssignmentItemKind.MCQ]: 'multiple-choice question',
  [AssignmentItemKind.QUIZ]: 'quiz question',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  [Language.PYTHON]: 'Python',
  [Language.JAVASCRIPT]: 'JavaScript',
  [Language.JAVA]: 'Java',
  [Language.CPP]: 'C++',
};
const ALL_LANGUAGES = Object.keys(LANGUAGE_LABELS) as Language[];

function emptyOptions(): McqOptionInput[] {
  return [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

/**
 * Add/edit dialog for a single assignment item. `item === null` is create mode
 * (with the given `kind`); otherwise edit. Coding items are created via a
 * problem picker (score only on edit — the linked problem can't change).
 */
export function ItemFormDialog({
  assignmentId,
  kind,
  item,
  open,
  onOpenChange,
}: {
  assignmentId: string;
  kind: AssignmentItemKind;
  item: AssignmentItemStaff | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = item !== null;
  const isCodingCreate = kind === AssignmentItemKind.CODING && !isEdit;

  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState('1');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState<McqOptionInput[]>(emptyOptions());
  const [sourceProblemId, setSourceProblemId] = useState<string | null>(null);
  const [languages, setLanguages] = useState<Language[]>(ALL_LANGUAGES);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed the form each time the dialog opens for a given item/kind — a reset
  // from props when opened, not derivable during render.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- intentional open-time form seed */
    setError(null);
    setPrompt(item?.prompt ?? '');
    setPoints(String(item?.maxPoints ?? (kind === AssignmentItemKind.CODING ? 10 : 1)));
    setAllowMultiple(item?.allowMultiple ?? false);
    setOptions(
      item?.options?.length
        ? item.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex,
          }))
        : emptyOptions(),
    );
    setSourceProblemId(null);
    setLanguages(ALL_LANGUAGES);
    setSearch('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, item, kind]);

  const { data: problems, isLoading: problemsLoading } = useQuery({
    queryKey: ['problems', 'picker', search],
    queryFn: () => problemsApi.list({ search: search || undefined, limit: 20 }),
    enabled: open && isCodingCreate,
  });

  function cleanedOptions(): McqOptionInput[] {
    return options
      .map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, orderIndex: i }))
      .filter((o) => o.text.length > 0);
  }

  // True when the edited option set differs from the item's saved options. The
  // backend rebuilds options (fresh ids) whenever `options` is sent, orphaning
  // students' saved selections — so on edit we only send options when changed.
  function optionsChanged(): boolean {
    const next = cleanedOptions();
    const prev = (item?.options ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ text: o.text, isCorrect: o.isCorrect }));
    if (next.length !== prev.length) return true;
    return next.some((o, i) => o.text !== prev[i].text || o.isCorrect !== prev[i].isCorrect);
  }

  function validate(): string | null {
    const pts = Number(points);
    if (Number.isNaN(pts) || pts < 0) return 'Points must be a non-negative number.';
    if (kind === AssignmentItemKind.CODING) {
      if (isCodingCreate && !sourceProblemId) return 'Pick a problem.';
      if (isCodingCreate && languages.length === 0) return 'Select at least one language.';
    } else if (!prompt.trim()) {
      return 'A prompt is required.';
    }
    if (kind === AssignmentItemKind.MCQ) {
      const opts = cleanedOptions();
      if (opts.length < 2) return 'Add at least two options.';
      const correct = opts.filter((o) => o.isCorrect).length;
      if (correct < 1) return 'Mark at least one correct option.';
      if (!allowMultiple && correct !== 1)
        return 'A single-answer question needs exactly one correct option.';
    }
    return null;
  }

  const mutation = useMutation({
    mutationFn: () => {
      const pts = Number(points);
      if (isEdit) {
        const body: UpdateAssignmentItemInput = { maxPoints: pts };
        if (kind !== AssignmentItemKind.CODING) body.prompt = prompt.trim();
        if (kind === AssignmentItemKind.MCQ) {
          body.allowMultiple = allowMultiple;
          // Only replace options when they actually changed — sending them
          // rebuilds ids server-side and orphans saved student responses.
          if (optionsChanged()) body.options = cleanedOptions();
        }
        return assignmentsApi.updateItem(item.id, body);
      }
      const body: CreateAssignmentItemInput = { kind };
      if (kind === AssignmentItemKind.CODING) {
        body.sourceProblemId = sourceProblemId ?? undefined;
        body.score = pts;
        body.languages = languages;
      } else {
        body.prompt = prompt.trim();
        body.maxPoints = pts;
      }
      if (kind === AssignmentItemKind.MCQ) {
        body.allowMultiple = allowMultiple;
        body.options = cleanedOptions();
      }
      return assignmentsApi.createItem(assignmentId, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Item updated.' : 'Item added.');
      void queryClient.invalidateQueries({ queryKey: ['assignments', assignmentId, 'items'] });
      onOpenChange(false);
    },
    onError: (err) => setError(parseApiError(err).message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    mutation.mutate();
  }

  function toggleCorrect(index: number) {
    setOptions((prev) =>
      prev.map((o, i) =>
        allowMultiple
          ? i === index
            ? { ...o, isCorrect: !o.isCorrect }
            : o
          : { ...o, isCorrect: i === index },
      ),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit' : 'Add'} {KIND_TITLE[kind]}
          </DialogTitle>
          <DialogDescription>
            {kind === AssignmentItemKind.CODING
              ? 'Coding items link to a library problem and open in the full editor.'
              : 'Autosaved answers are graded ' +
                (kind === AssignmentItemKind.MCQ
                  ? 'automatically on submit.'
                  : 'manually by staff.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Coding create — problem picker */}
          {isCodingCreate && (
            <div className="grid gap-2">
              <Label htmlFor="prob-search">Problem</Label>
              <Input
                id="prob-search"
                placeholder="Search problems…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {problemsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (problems?.data.length ?? 0) === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No problems found.</p>
                ) : (
                  problems?.data.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSourceProblemId(p.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                        sourceProblemId === p.id && 'bg-brand/10 ring-1 ring-brand',
                      )}
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground capitalize">
                        {p.difficulty}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <Label className="mt-2">Languages students may use</Label>
              <CheckboxList
                items={ALL_LANGUAGES.map((lang) => ({ id: lang, label: LANGUAGE_LABELS[lang] }))}
                selectedIds={languages}
                onToggle={(langId, checked) =>
                  setLanguages((prev) =>
                    checked ? [...prev, langId as Language] : prev.filter((l) => l !== langId),
                  )
                }
              />
            </div>
          )}

          {/* Coding edit — show linked problem read-only */}
          {kind === AssignmentItemKind.CODING && isEdit && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <span className="font-medium">{item.title}</span>
              <span className="ml-2 text-xs text-muted-foreground capitalize">
                {item.difficulty}
              </span>
            </p>
          )}

          {/* Prompt — mcq/quiz */}
          {kind !== AssignmentItemKind.CODING && (
            <div className="grid gap-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Question text…"
                rows={3}
                autoFocus
              />
            </div>
          )}

          {/* MCQ options */}
          {kind === AssignmentItemKind.MCQ && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allowMultiple}
                    onCheckedChange={(v) => setAllowMultiple(v === true)}
                  />
                  Allow multiple answers
                </label>
              </div>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCorrect(i)}
                      aria-pressed={opt.isCorrect}
                      title={opt.isCorrect ? 'Correct answer' : 'Mark correct'}
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center border border-input text-xs transition-colors',
                        allowMultiple ? 'rounded-[4px]' : 'rounded-full',
                        opt.isCorrect
                          ? 'border-success bg-success text-success-foreground'
                          : 'bg-transparent',
                      )}
                    >
                      {opt.isCorrect ? '✓' : ''}
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((o, idx) => (idx === i ? { ...o, text: e.target.value } : o)),
                        )
                      }
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={options.length <= 2}
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove option"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, { text: '', isCorrect: false }])}
              >
                <Plus className="size-4" /> Add option
              </Button>
            </div>
          )}

          {/* Points */}
          <div className="grid gap-2">
            <Label htmlFor="points">Points</Label>
            <Input
              id="points"
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-32"
            />
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
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
