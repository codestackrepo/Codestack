import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
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
import { useSubmissionSocket } from '../hooks/use-submission-socket';
import { usePersistedCode } from '../hooks/use-persisted-code';
import { CasePills, IoField } from './solve-io';
import { parseApiError } from '@/lib/api-client';
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
   * LeetCode). Omitted for the blind assignment path — there the backend
   * coarsens the payload anyway, so no detail could leak.
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
  onRun,
  onSubmit,
  onAccepted,
  onFetchSubmission,
}: CodeEditorScreenProps) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';
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
    if (reviewMode) return;
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
  const submitMemory = formatMemory(submissionDetail?.memoryBytes ?? liveStatus?.memoryBytes ?? null);
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
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={handleSubmit}
            disabled={submitMutation.isPending || !!isJudging || reviewMode}
            title={reviewMode ? 'Closed for submissions' : 'Submit (⌘/Ctrl + Enter)'}
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

      {reviewMode && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <Lock className="size-3.5" />
          This assignment is closed for submissions — you can still run your code against the sample
          cases.
        </div>
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

                  <TabsContent
                    value="result"
                    className="custom-scrollbar h-full space-y-4 overflow-y-auto p-4"
                  >
                    {/* ---- Run result: full per-case Input / Your Output / Expected ---- */}
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
                            <div className="flex items-center gap-2">
                              <VerdictBadge status={runCases[runIdx].status} />
                            </div>
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

                    {/* ---- Submission: live progress, then verdict + failing case ---- */}
                    {submissionId && !runResult && (
                      <div className="space-y-4">
                        {!liveStatus && (
                          <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Judging…
                          </p>
                        )}

                        {liveStatus && (
                          <>
                            <div className="flex flex-wrap items-center gap-3">
                              {submitAccepted ? (
                                <span className="flex items-center gap-1.5 text-base font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="size-5" /> Accepted
                                </span>
                              ) : isJudging ? (
                                <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                  <Loader2 className="size-4 animate-spin" /> Judging…
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-base font-semibold text-red-600 dark:text-red-400">
                                  <XCircle className="size-5" /> {liveStatus.status}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {liveStatus.passedTestcaseCount} / {liveStatus.totalTestcaseCount}{' '}
                                testcases passed
                              </span>
                            </div>

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

                            {/* Per-testcase verdict dots as they stream in. */}
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

                            {/* First failing case detail (practice; blind assignment omits it). */}
                            {failedDetail && !submitAccepted && (
                              <div className="space-y-3 border-t border-border pt-3">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  First failing case
                                </p>
                                <IoField label="Input" value={failedDetail.input} />
                                <IoField label="Your Output" value={failedDetail.output} tone="bad" />
                                <IoField label="Expected" value={failedDetail.expected} tone="good" />
                                {failedDetail.error && (
                                  <IoField label="Stderr" value={failedDetail.error} tone="bad" />
                                )}
                              </div>
                            )}

                            {submitAccepted && (
                              <p className="text-sm text-muted-foreground">
                                All test cases passed. Nice work!
                              </p>
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
