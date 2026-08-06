import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Editor } from '@monaco-editor/react';
import { defineEditorThemes, useEditorTheme } from '../lib/editor-theme';
import { EditorThemeToggle } from './editor-theme-toggle';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Loader2,
  Lock,
  Play,
  Send,
  Timer,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { Logo } from '@/components/shared/logo';
import { MarkdownView } from '@/components/shared/markdown-view';
import { VerdictBadge } from '@/components/shared/verdict-badge';
import { AcceptedBurst } from './accepted-burst';
import { CasePills, IoField } from './solve-io';
import { useSubmissionSocket } from '../hooks/use-submission-socket';
import { usePersistedCode } from '../hooks/use-persisted-code';
import { parseApiError } from '@/lib/api-client';
import { formatRemaining, isUrgent } from '@/lib/countdown';
import type { Language } from '@/types/common';
import { Difficulty } from '@/types/problem';
import {
  SubmissionStatus,
  TERMINAL_STATUSES,
  type RunResult,
  type SampleTestcase,
  type Submission,
  type SubmitResult,
} from '@/types/submission';

const LANGUAGE_LABELS: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
};

const MONACO_LANGUAGE: Record<Language, string> = {
  python: 'python',
  javascript: 'javascript',
  java: 'java',
  cpp: 'cpp',
};

/** Human-readable memory from the raw byte count the judge reports (string). */
function formatMemory(bytes: string | null): string | null {
  if (bytes == null) return null;
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** The subset both the assignment (`EditorBootstrap`) and practice (`PracticeBootstrap`) payloads share. */
export interface EditorScreenBootstrap {
  id: string;
  title: string;
  body: string;
  difficulty: string;
  tags: string[];
  sampleTestCases: SampleTestcase[];
  templates: { language: Language; starterCode: string }[];
}

interface CodeEditorScreenProps {
  bootstrap: EditorScreenBootstrap;
  /** `assignment` = blind submit (no verdict toast); `practice` = full feedback. */
  variant: 'assignment' | 'practice';
  /** Assignment-only: closed for submissions — disables Submit, shows a banner. */
  reviewMode?: boolean;
  /**
   * Timed test only (#145): the SERVER's attempt deadline, ISO-8601. Drives the
   * countdown in the header and, at expiry, the same lockout `reviewMode` gives.
   *
   * Deliberately just a deadline and not an attempt object: this screen is shared
   * with practice, which has no attempt at all, and a countdown is the entire
   * amount of attempt the editor needs to know about.
   *
   * The screen does NOT auto-submit the attempt at expiry. The take page owns
   * that (it has the pending MCQ/quiz saves to flush), and the server sweep
   * closes every expired attempt within ~60s regardless. A second auto-submit
   * owner would just be a second toast racing the first.
   */
  deadlineAt?: string | null;
  onRun: (language: Language, code: string, samples: SampleTestcase[]) => Promise<RunResult>;
  onSubmit: (language: Language, code: string) => Promise<SubmitResult>;
  /**
   * Practice only: invoked once per terminal-Accepted submission. The blind
   * assignment path never passes this, so no verdict signal leaks (#27). #37
   * supplies a handler that shows the gamification "+N points • day-K streak"
   * toast; without one the default "Accepted!" toast fires.
   */
  onAccepted?: (submissionId: string) => void;
  /**
   * Practice only: fetches the finalized submission once judging is terminal, so
   * the result panel can show the failing case's input/expected/output (like
   * LeetCode). Omitted for the blind assignment path — the backend coarsens the
   * payload there anyway, so no detail could leak.
   */
  onFetchSubmission?: (submissionId: string) => Promise<Submission>;
}

/**
 * The shared Monaco solve surface behind both `/solve/:apId` (assignment) and
 * `/practice/:problemId` (practice). Owns editor/run/submit/socket state; the
 * source of the bootstrap + run/submit transport is injected by the page so the
 * two contexts stay a single, non-forked implementation (#29).
 */
export function CodeEditorScreen({
  bootstrap,
  variant,
  reviewMode = false,
  deadlineAt = null,
  onRun,
  onSubmit,
  onAccepted,
  onFetchSubmission,
}: CodeEditorScreenProps) {
  const navigate = useNavigate();
  const { pref: editorThemePref, setPref: setEditorThemePref, monacoTheme } = useEditorTheme();
  const [language, setLanguage] = useState<Language | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [resultTab, setResultTab] = useState<'testcases' | 'result'>('testcases');
  // Which sample case is open in the "Test Cases" tab, and which case is open
  // in a Run result — LeetCode-style Case 1 / Case 2 drill-in.
  const [activeSample, setActiveSample] = useState(0);
  const [activeRunCase, setActiveRunCase] = useState(0);

  // Derived, not stored: `language` only holds an explicit user override;
  // absent one, fall back to the bootstrap's first template.
  const effectiveLanguage = language ?? bootstrap.templates[0]?.language ?? null;

  const starterCode = useMemo(
    () => bootstrap.templates.find((t) => t.language === effectiveLanguage)?.starterCode ?? '',
    [bootstrap, effectiveLanguage],
  );
  const [code, setCode] = usePersistedCode(
    bootstrap.id,
    effectiveLanguage ?? 'python',
    starterCode,
  );

  // Timed-test countdown (#145). The 1s tick only runs when there is a deadline,
  // so practice and untimed assignments keep re-rendering exactly as before.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadlineAt]);

  const remainingMs = deadlineAt ? new Date(deadlineAt).getTime() - now : null;
  const timeExpired = remainingMs !== null && remainingMs <= 0;
  const urgent = isUrgent(remainingMs);
  // Both close the door on Submit; they differ only in what the banner says.
  const submitClosed = reviewMode || timeExpired;

  const { status: liveStatus, testcaseVerdicts } = useSubmissionSocket(submissionId);

  // Judging has reached a terminal verdict — used to gate the detail fetch below.
  const judgingTerminal =
    !!submissionId && !!liveStatus && TERMINAL_STATUSES.includes(liveStatus.status);

  // Practice only: once judging is terminal, pull the finalized submission so the
  // result panel can show the first failing case's input/expected/output + timing
  // (the live socket streams verdicts only). Assignment omits `onFetchSubmission`.
  const { data: submissionDetail } = useQuery({
    queryKey: ['submission-detail', submissionId, liveStatus?.status],
    queryFn: () => onFetchSubmission!(submissionId!),
    enabled: !!onFetchSubmission && judgingTerminal,
  });

  const runMutation = useMutation({
    mutationFn: () => onRun(effectiveLanguage!, code, bootstrap.sampleTestCases),
    onSuccess: (result) => {
      setRunResult(result);
      setActiveRunCase(0);
      setResultTab('result');
    },
    onError: (error) => toast.error(parseApiError(error).message),
  });

  const submitMutation = useMutation({
    mutationFn: () => onSubmit(effectiveLanguage!, code),
    onSuccess: (result) => {
      setSubmissionId(result.submissionId);
      setRunResult(null);
      setResultTab('result');
      toast.success('Submitted — judging…');
    },
    onError: (error) => toast.error(parseApiError(error).message),
  });

  function handleRun() {
    if (!runMutation.isPending) runMutation.mutate();
  }

  function handleSubmit() {
    // Also guards the ⌘/Ctrl+Enter shortcut, which does not go through the
    // disabled button — without this, expiry would still let a keyboard submit
    // through to a certain 403.
    if (submitClosed) return;
    if (!submitMutation.isPending) submitMutation.mutate();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "'") {
        e.preventDefault();
        handleRun();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.id, effectiveLanguage, code]);

  // Practice-only verdict feedback (§5.5). Fires once per submission on a
  // terminal Accepted — the ref guards against re-firing across the multiple
  // socket frames a single submission emits. Assignment is blind → no handler.
  const acceptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (variant !== 'practice' || !submissionId || !liveStatus) return;
    if (liveStatus.status !== SubmissionStatus.ACCEPTED) return;
    if (acceptedRef.current === submissionId) return;
    acceptedRef.current = submissionId;
    if (onAccepted) onAccepted(submissionId);
    else toast.success('Accepted!');
  }, [variant, submissionId, liveStatus, onAccepted]);

  const isJudging =
    !!submissionId && (!liveStatus || !TERMINAL_STATUSES.includes(liveStatus.status));

  // ---- Derived view state for the result panels (LeetCode-style detail) ----
  const samples = bootstrap.sampleTestCases;
  const sampleIdx = samples.length ? Math.min(activeSample, samples.length - 1) : 0;

  const runCases = runResult?.results ?? [];
  const runIdx = runCases.length ? Math.min(activeRunCase, runCases.length - 1) : 0;
  const runPassed = runCases.filter((r) => r.status === SubmissionStatus.ACCEPTED).length;

  const failedDetail = submissionDetail?.failedTestcaseDetail ?? null;
  const submitAccepted = liveStatus?.status === SubmissionStatus.ACCEPTED;
  const submitMemory = formatMemory(
    submissionDetail?.memoryBytes ?? liveStatus?.memoryBytes ?? null,
  );
  const submitRuntime = submissionDetail?.runtimeMs ?? liveStatus?.runtimeMs ?? null;

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <Logo variant="mark" className="size-7" />
          <h1 className="truncate text-sm font-semibold">{bootstrap.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <EditorThemeToggle pref={editorThemePref} onChange={setEditorThemePref} />
          {effectiveLanguage && (
            <Select value={effectiveLanguage} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bootstrap.templates.map((t) => (
                  <SelectItem key={t.language} value={t.language}>
                    {LANGUAGE_LABELS[t.language]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {deadlineAt && (
            <div
              // aria-live so a screen-reader user is told time is short without
              // having to poll the value; 'off' the rest of the time, because a
              // per-second announcement would be unusable.
              aria-live={urgent || timeExpired ? 'polite' : 'off'}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 tabular-nums ${
                timeExpired || urgent
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-border text-muted-foreground'
              }`}
            >
              <Timer className="size-3.5 shrink-0" />
              <span className="text-xs font-medium">
                {timeExpired ? 'Time is up' : formatRemaining(remainingMs ?? 0)}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            onClick={handleRun}
            disabled={runMutation.isPending}
            title="Run (⌘/Ctrl + ')"
          >
            {runMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Run
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || !!isJudging || submitClosed}
            title={
              timeExpired
                ? 'Your time for this test has run out'
                : reviewMode
                  ? 'Closed for submissions'
                  : 'Submit (⌘/Ctrl + Enter)'
            }
          >
            {submitMutation.isPending || isJudging ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Submit
          </Button>
        </div>
      </div>

      {/* Expiry wins the banner slot: when a test has run out, "closed for
          submissions" is true but tells the student nothing about why. */}
      {timeExpired ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
          <Timer className="size-3.5 shrink-0" />
          Your time for this test has run out. Anything you already submitted is saved and will be
          graded — this problem is no longer accepting submissions.
        </div>
      ) : (
        reviewMode && (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
            <Lock className="size-3.5" />
            This assignment is closed for submissions — you can still run your code against the
            sample cases.
          </div>
        )
      )}

      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize="40%" minSize="25%">
          <div className="custom-scrollbar h-full overflow-y-auto p-5">
            <h2 className="font-heading text-xl font-bold tracking-tight">{bootstrap.title}</h2>
            <div className="mt-2 mb-4 flex flex-wrap items-center gap-1.5">
              <DifficultyBadge difficulty={bootstrap.difficulty as Difficulty} />
              {bootstrap.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
            <MarkdownView>{bootstrap.body}</MarkdownView>
          </div>
        </Panel>

        <Separator className="w-1 bg-border transition-colors hover:bg-brand" />

        <Panel defaultSize="60%" minSize="35%">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize="65%" minSize="30%">
              <Editor
                height="100%"
                language={effectiveLanguage ? MONACO_LANGUAGE[effectiveLanguage] : 'plaintext'}
                value={code}
                onChange={(value) => setCode(value ?? '')}
                beforeMount={defineEditorThemes}
                theme={monacoTheme}
                options={{ minimap: { enabled: false }, fontSize: 14, contextmenu: false }}
              />
            </Panel>

            <Separator className="h-1 bg-border transition-colors hover:bg-brand" />

            <Panel defaultSize="35%" minSize="20%">
              <div className="h-full overflow-hidden">
                <Tabs
                  value={resultTab}
                  onValueChange={(v) => setResultTab(v as 'testcases' | 'result')}
                  className="h-full"
                >
                  <TabsList className="mx-4 mt-2">
                    <TabsTrigger value="testcases">Test Cases</TabsTrigger>
                    <TabsTrigger value="result">Test Result</TabsTrigger>
                  </TabsList>

                  {/* ---- Test Cases: sample inputs, LeetCode-style case drill-in ---- */}
                  <TabsContent
                    value="testcases"
                    className="custom-scrollbar h-full space-y-3 overflow-y-auto p-4"
                  >
                    {samples.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No sample cases for this problem.
                      </p>
                    ) : (
                      <>
                        <CasePills
                          count={samples.length}
                          active={sampleIdx}
                          onSelect={setActiveSample}
                        />
                        <IoField label="Input" value={samples[sampleIdx].inputData} />
                        <IoField
                          label="Expected"
                          value={samples[sampleIdx].expectedOutput}
                          tone="good"
                        />
                        {samples[sampleIdx].explanation && (
                          <p className="text-xs text-muted-foreground">
                            {samples[sampleIdx].explanation}
                          </p>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ---- Test Result: Run detail, then submit verdict + failing case ---- */}
                  <TabsContent
                    value="result"
                    className="custom-scrollbar h-full space-y-4 overflow-y-auto p-4"
                  >
                    {/* Run: full per-case Input / Your Output / Expected */}
                    {runResult && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <VerdictBadge status={runResult.status} />
                          <span className="text-xs text-muted-foreground">
                            {runPassed} / {runCases.length} sample cases passed
                          </span>
                        </div>
                        <CasePills
                          count={runCases.length}
                          active={runIdx}
                          onSelect={setActiveRunCase}
                          verdicts={runCases.map((r) => r.status)}
                        />
                        {runCases[runIdx] && (
                          <div className="space-y-3">
                            <VerdictBadge status={runCases[runIdx].status} />
                            <IoField label="Input" value={runCases[runIdx].input} />
                            <IoField
                              label="Your Output"
                              value={runCases[runIdx].output}
                              tone={
                                runCases[runIdx].status === SubmissionStatus.ACCEPTED
                                  ? 'good'
                                  : 'bad'
                              }
                            />
                            <IoField
                              label="Expected"
                              value={runCases[runIdx].expected}
                              tone="good"
                            />
                            {runCases[runIdx].error && (
                              <IoField label="Stderr" value={runCases[runIdx].error} tone="bad" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Submission: live progress, then verdict + failing-case detail */}
                    {submissionId && !runResult && (
                      <div className="space-y-4">
                        {!liveStatus && (
                          <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Judging…
                          </p>
                        )}

                        {liveStatus && (
                          <>
                            {submitAccepted ? (
                              <div className="animate-scale-in relative flex items-center gap-2.5 overflow-visible rounded-xl bg-success/10 p-3">
                                <AcceptedBurst key={submissionId} />
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                                  <CheckCircle2 className="size-5" />
                                </span>
                                <div className="leading-tight">
                                  <p className="font-semibold text-success">Accepted!</p>
                                  <p className="text-xs text-muted-foreground">
                                    {liveStatus.passedTestcaseCount}/{liveStatus.totalTestcaseCount}{' '}
                                    tests passed
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-3">
                                {isJudging ? (
                                  <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" /> Judging…
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-2">
                                    <XCircle className="size-5 text-red-600 dark:text-red-400" />
                                    <VerdictBadge status={liveStatus.status} />
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {liveStatus.passedTestcaseCount} / {liveStatus.totalTestcaseCount}{' '}
                                  testcases passed
                                </span>
                              </div>
                            )}

                            {(submitRuntime != null || submitMemory) && (
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                {submitRuntime != null && (
                                  <span className="flex items-center gap-1">
                                    <Timer className="size-3.5" /> {submitRuntime} ms
                                  </span>
                                )}
                                {submitMemory && (
                                  <span className="flex items-center gap-1">
                                    <Cpu className="size-3.5" /> {submitMemory}
                                  </span>
                                )}
                              </div>
                            )}

                            {Object.keys(testcaseVerdicts).length > 0 && (
                              <CasePills
                                count={
                                  liveStatus.totalTestcaseCount ||
                                  Object.keys(testcaseVerdicts).length
                                }
                                active={-1}
                                onSelect={() => {}}
                                verdicts={Object.values(testcaseVerdicts)
                                  .sort((a, b) => a.ordinal - b.ordinal)
                                  .map((tc) => tc.verdict)}
                              />
                            )}

                            {failedDetail && !submitAccepted && (
                              <div className="space-y-3 border-t border-border pt-3">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  First failing case
                                </p>
                                <IoField label="Input" value={failedDetail.input} />
                                <IoField
                                  label="Your Output"
                                  value={failedDetail.output}
                                  tone="bad"
                                />
                                <IoField
                                  label="Expected"
                                  value={failedDetail.expected}
                                  tone="good"
                                />
                                {failedDetail.error && (
                                  <IoField label="Stderr" value={failedDetail.error} tone="bad" />
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {!runResult && !submissionId && (
                      <p className="text-sm text-muted-foreground">
                        Run your code against the sample cases, or submit for full judging.
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
}
