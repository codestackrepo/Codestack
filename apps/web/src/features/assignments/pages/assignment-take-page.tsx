import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, Code2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { assignmentsApi } from '../api/assignments.api';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Difficulty } from '@/types/problem';
import {
  AssignmentItemKind,
  AssignmentKind,
  AssignmentStatus,
  AttemptStatus,
  type AssignmentTakeItem,
} from '@/types/assignment';

type SaveState = 'saving' | 'saved';

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Student take page (`/home/assignments/:id/take`, #22). Renders mixed items;
 * coding links to /solve, MCQ/quiz autosave (debounced). For kind=test a
 * countdown anchored to the SERVER `deadlineAt` disables inputs and best-effort
 * auto-submits at expiry (the server is authoritative — #39). Never renders any
 * correctness or score (§9.2): the payload carries none.
 */
export function AssignmentTakePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  // key={id} remounts on assignment change, resetting all per-attempt state/refs
  // (guards against take→take navigation reusing another attempt's timers).
  return <TakePageInner key={id} id={id} />;
}

function TakePageInner({ id }: { id: string }) {
  const navigate = useNavigate();

  const { data: take, isLoading } = useQuery({
    queryKey: ['assignments', id, 'take'],
    queryFn: () => assignmentsApi.take(id),
  });

  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus | null>(null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string[]>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [submitting, setSubmitting] = useState(false);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latest pending save thunk per item, so we can FLUSH before submit/expiry
  // rather than dropping the last debounced edit.
  const pendingSaves = useRef<Record<string, () => Promise<unknown>>>({});
  const seededRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  // 1s tick for the countdown (only meaningful in a timed test).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cancel any pending debounced saves on unmount (avoid stale writes).
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  // Seed local answers + attempt from the fetched payload — ONCE per assignment.
  // Guarding on assignmentId stops a background refetch (reconnect/invalidate)
  // from clobbering in-progress edits with the server copy.
  useEffect(() => {
    if (!take || seededRef.current === take.assignmentId) return;
    seededRef.current = take.assignmentId;
    const mcq: Record<string, string[]> = {};
    const quiz: Record<string, string> = {};
    for (const it of take.items) {
      if (it.kind === AssignmentItemKind.MCQ)
        mcq[it.itemId] = it.myResponse?.selectedOptionIds ?? [];
      if (it.kind === AssignmentItemKind.QUIZ) quiz[it.itemId] = it.myResponse?.answerText ?? '';
    }
    /* eslint-disable react-hooks/set-state-in-effect -- seed editable local state from async fetched data */
    setMcqAnswers(mcq);
    setQuizAnswers(quiz);
    if (take.attempt) {
      setDeadlineAt(take.attempt.deadlineAt);
      setAttemptStatus(take.attempt.status);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [take]);

  // On mount for an ACTIVE assignment, ensure an attempt exists (idempotent) and
  // capture the server deadline.
  useEffect(() => {
    if (!take || !id || startedRef.current) return;
    if (take.status !== AssignmentStatus.ACTIVE) return;
    startedRef.current = true;
    assignmentsApi
      .startAttempt(id)
      .then((a) => {
        setDeadlineAt(a.deadlineAt);
        setAttemptStatus(a.status);
      })
      .catch(() => {
        /* non-fatal: saving/submitting still surface server errors */
      });
  }, [take, id]);

  const isTest = take?.kind === AssignmentKind.TEST;
  const remainingMs = deadlineAt ? new Date(deadlineAt).getTime() - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const submitted =
    attemptStatus === AttemptStatus.SUBMITTED || attemptStatus === AttemptStatus.AUTO_SUBMITTED;
  const canAnswer = take?.status === AssignmentStatus.ACTIVE && !submitted && !(isTest && expired);

  // Run (or flush) a single item's pending save immediately.
  async function runSave(itemId: string) {
    const run = pendingSaves.current[itemId];
    if (!run) return;
    delete pendingSaves.current[itemId];
    clearTimeout(timers.current[itemId]);
    delete timers.current[itemId];
    setSaveState((s) => ({ ...s, [itemId]: 'saving' }));
    try {
      await run();
      setSaveState((s) => ({ ...s, [itemId]: 'saved' }));
    } catch (e) {
      setSaveState((s) => {
        const next = { ...s };
        delete next[itemId];
        return next;
      });
      toast.error(parseApiError(e).message);
    }
  }

  // Flush every pending debounced save and wait for them — call BEFORE submit so
  // the last edit (still inside the 600ms window) isn't dropped on unmount.
  async function flushSaves() {
    await Promise.all(Object.keys(pendingSaves.current).map((itemId) => runSave(itemId)));
  }

  // Best-effort client auto-submit at expiry (server independently enforces #39).
  useEffect(() => {
    if (!id || !isTest || !deadlineAt || !expired || submitted || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void flushSaves()
      .then(() => assignmentsApi.submitAttempt(id))
      .then((a) => {
        setAttemptStatus(a.status);
        toast.warning('Time is up — your attempt was submitted.');
      })
      .catch(() => setAttemptStatus(AttemptStatus.AUTO_SUBMITTED));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isTest, deadlineAt, expired, submitted]);

  function scheduleSave(itemId: string, run: () => Promise<unknown>) {
    clearTimeout(timers.current[itemId]);
    pendingSaves.current[itemId] = run;
    timers.current[itemId] = setTimeout(() => void runSave(itemId), 600);
  }

  function onMcqChange(itemId: string, selected: string[]) {
    setMcqAnswers((prev) => ({ ...prev, [itemId]: selected }));
    scheduleSave(itemId, () => assignmentsApi.saveMcq(itemId, selected));
  }

  function onQuizChange(itemId: string, text: string) {
    setQuizAnswers((prev) => ({ ...prev, [itemId]: text }));
    scheduleSave(itemId, () => assignmentsApi.saveQuiz(itemId, text));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await flushSaves();
      const a = await assignmentsApi.submitAttempt(id);
      setAttemptStatus(a.status);
      toast.success('Assignment submitted.');
      navigate('/home/assignments');
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setSubmitting(false);
    }
  }

  const urgent = isTest && remainingMs !== null && remainingMs > 0 && remainingMs < 5 * 60 * 1000;

  if (isLoading || !take) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isTest && deadlineAt && (
        <div
          className={cn(
            'sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm font-medium backdrop-blur sm:-mx-6 sm:px-6',
            expired
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : urgent
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-border bg-background/80 text-foreground',
          )}
        >
          <span className="flex items-center gap-2">
            <Clock className="size-4" />
            {expired ? 'Time is up' : 'Time remaining'}
          </span>
          <span className="font-mono tabular-nums">
            {expired ? '00:00' : formatRemaining(remainingMs ?? 0)}
          </span>
        </div>
      )}

      <PageHeader
        title="Assignment"
        description={
          submitted
            ? 'Submitted — your answers are locked.'
            : take.status === AssignmentStatus.ACTIVE
              ? 'Answer each item below. Your MCQ and quiz answers save automatically.'
              : 'This assignment is not open for submissions.'
        }
      />

      {take.items.length === 0 ? (
        <EmptyState title="No items" description="This assignment has no items yet." />
      ) : (
        <ol className="space-y-4">
          {take.items.map((item, index) => (
            <li key={item.itemId}>
              <TakeItemCard
                item={item}
                index={index}
                disabled={!canAnswer}
                mcqSelected={mcqAnswers[item.itemId] ?? []}
                quizText={quizAnswers[item.itemId] ?? ''}
                save={saveState[item.itemId]}
                onMcqChange={(sel) => onMcqChange(item.itemId, sel)}
                onQuizChange={(text) => onQuizChange(item.itemId, text)}
              />
            </li>
          ))}
        </ol>
      )}

      {take.status === AssignmentStatus.ACTIVE && (
        <div className="flex items-center justify-end gap-3">
          {submitted ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" /> Submitted
            </Badge>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={submitting || (isTest && expired)}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Submit assignment
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this assignment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You won't be able to change your answers after submitting.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep working</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>Submit</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state?: SaveState }) {
  if (!state) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {state === 'saving' ? (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </>
      ) : (
        <>
          <Check className="size-3" /> Saved
        </>
      )}
    </span>
  );
}

function TakeItemCard({
  item,
  index,
  disabled,
  mcqSelected,
  quizText,
  save,
  onMcqChange,
  onQuizChange,
}: {
  item: AssignmentTakeItem;
  index: number;
  disabled: boolean;
  mcqSelected: string[];
  quizText: string;
  save?: SaveState;
  onMcqChange: (selected: string[]) => void;
  onQuizChange: (text: string) => void;
}) {
  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium text-muted-foreground">Question {index + 1}</span>
      <div className="flex items-center gap-3">
        {item.kind !== AssignmentItemKind.CODING && <SaveIndicator state={save} />}
        <span className="text-xs text-muted-foreground">{item.maxPoints} pts</span>
      </div>
    </div>
  );

  return (
    <Card className="space-y-3 p-4">
      {header}

      {item.kind === AssignmentItemKind.CODING && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {item.difficulty && <DifficultyBadge difficulty={item.difficulty as Difficulty} />}
                {/* #46 — which languages are allowed is part of "what do I build". */}
                {(item.languages ?? []).map((lang) => (
                  <Badge key={lang} variant="outline" className="text-xs">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
            {item.assignmentProblemId && (
              <Button
                asChild
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Link to={`/solve/${item.assignmentProblemId}`}>
                  <Code2 className="size-4" /> Open editor
                </Link>
              </Button>
            )}
          </div>

          {/*
            #46 — the requirements, inline and collapsed by default.
            Collapsed because a take page with five expanded statements is unreadable;
            available because "open the editor to find out what the task is" is the
            complaint this closes. Only SAMPLE cases are ever present — the server
            filters hidden ones out, so there is nothing to hide here.
          */}
          {(item.statement || (item.sampleTestCases?.length ?? 0) > 0) && (
            <details className="rounded-lg border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium select-none">
                What you need to do
              </summary>
              <div className="mt-3 space-y-3">
                {item.statement && <p className="text-sm whitespace-pre-wrap">{item.statement}</p>}
                {(item.sampleTestCases?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Sample cases</p>
                    {item.sampleTestCases?.map((tc, i) => (
                      <div key={i} className="rounded-md border border-border bg-background p-2">
                        <pre className="overflow-x-auto text-xs">
                          <span className="text-muted-foreground">Input: </span>
                          {tc.inputData}
                        </pre>
                        <pre className="overflow-x-auto text-xs">
                          <span className="text-muted-foreground">Expected: </span>
                          {tc.expectedOutput}
                        </pre>
                        {tc.explanation && (
                          <p className="mt-1 text-xs text-muted-foreground">{tc.explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {item.kind === AssignmentItemKind.MCQ && (
        <>
          {item.prompt && <p className="text-sm">{item.prompt}</p>}
          {item.allowMultiple ? (
            <div className="space-y-2">
              {item.options?.map((opt) => {
                const checked = mcqSelected.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-border p-3 text-sm',
                      disabled ? 'opacity-70' : 'cursor-pointer hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) =>
                        onMcqChange(
                          v === true
                            ? [...mcqSelected, opt.id]
                            : mcqSelected.filter((x) => x !== opt.id),
                        )
                      }
                    />
                    {opt.text}
                  </label>
                );
              })}
            </div>
          ) : (
            <RadioGroup
              value={mcqSelected[0] ?? ''}
              disabled={disabled}
              onValueChange={(v) => onMcqChange([v])}
            >
              {item.options?.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border border-border p-3 text-sm',
                    disabled ? 'opacity-70' : 'cursor-pointer hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem value={opt.id} />
                  {opt.text}
                </label>
              ))}
            </RadioGroup>
          )}
        </>
      )}

      {item.kind === AssignmentItemKind.QUIZ && (
        <>
          {item.prompt && <p className="text-sm">{item.prompt}</p>}
          <div className="grid gap-1.5">
            <Label htmlFor={`quiz-${item.itemId}`} className="sr-only">
              Your answer
            </Label>
            <Textarea
              id={`quiz-${item.itemId}`}
              value={quizText}
              disabled={disabled}
              rows={5}
              placeholder="Type your answer…"
              onChange={(e) => onQuizChange(e.target.value)}
            />
          </div>
        </>
      )}
    </Card>
  );
}
