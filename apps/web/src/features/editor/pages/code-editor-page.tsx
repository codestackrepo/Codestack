import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ArrowLeft, Loader2, Lock, Play, Send } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DifficultyBadge } from '@/components/shared/difficulty-badge';
import { Logo } from '@/components/shared/logo';
import { MarkdownView } from '@/components/shared/markdown-view';
import { VerdictBadge } from '@/components/shared/verdict-badge';
import { editorApi } from '../api/editor.api';
import { useSubmissionSocket } from '../hooks/use-submission-socket';
import { usePersistedCode } from '../hooks/use-persisted-code';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Language } from '@/types/common';
import { Difficulty } from '@/types/problem';
import { TERMINAL_STATUSES, type RunResult } from '@/types/submission';

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

export function CodeEditorPage() {
  const { apId } = useParams<{ apId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The assignments panel appends ?mode=review when the assignment isn't ACTIVE:
  // the backend still allows Run (not status-gated) but rejects Submit, so we
  // mirror that contract by disabling Submit and surfacing a banner.
  const reviewMode = searchParams.get('mode') === 'review';
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';
  const [language, setLanguage] = useState<Language | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [resultTab, setResultTab] = useState<'testcases' | 'result'>('testcases');

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['editor', apId],
    queryFn: () => editorApi.bootstrap(apId!),
    enabled: !!apId,
  });

  // Derived, not stored: `language` only holds an explicit user override;
  // absent one, fall back to the bootstrap's first template.
  const effectiveLanguage = language ?? bootstrap?.templates[0]?.language ?? null;

  const starterCode = useMemo(
    () => bootstrap?.templates.find((t) => t.language === effectiveLanguage)?.starterCode ?? '',
    [bootstrap, effectiveLanguage],
  );
  const [code, setCode] = usePersistedCode(apId ?? '', effectiveLanguage ?? 'python', starterCode);

  const { status: liveStatus, testcaseVerdicts } = useSubmissionSocket(submissionId);

  const runMutation = useMutation({
    mutationFn: () => editorApi.run(apId!, effectiveLanguage!, code, bootstrap!.sampleTestCases),
    onSuccess: (result) => {
      setRunResult(result);
      setResultTab('result');
    },
    onError: (error) => toast.error(parseApiError(error).message),
  });

  const submitMutation = useMutation({
    mutationFn: () => editorApi.submit(apId!, effectiveLanguage!, code),
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
  }, [apId, effectiveLanguage, code]);

  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-svh items-center justify-center bg-background p-6">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const isJudging =
    !!submissionId && (!liveStatus || !TERMINAL_STATUSES.includes(liveStatus.status));

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            onClick={() => navigate(-1)}
          >
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
          <Button variant="outline" onClick={handleRun} disabled={runMutation.isPending} title="Run (⌘/Ctrl + ')">
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
                    className="custom-scrollbar h-full overflow-y-auto p-4"
                  >
                    <div className="space-y-3">
                      {bootstrap.sampleTestCases.map((tc, i) => (
                        <div key={i} className="rounded-lg border border-border p-3 text-sm">
                          <p className="font-medium">Case {i + 1}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            Input: {tc.inputData}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            Expected: {tc.expectedOutput}
                          </p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="result"
                    className="custom-scrollbar h-full overflow-y-auto p-4"
                  >
                    {runResult && (
                      <div className="space-y-2">
                        <VerdictBadge status={runResult.status} />
                        {runResult.results.map((r, i) => (
                          <div key={i} className="rounded-lg border border-border p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">Case {i + 1}</p>
                              <VerdictBadge status={r.status} />
                            </div>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              Output: {r.output || '(empty)'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {submissionId && !runResult && (
                      <div className="space-y-2">
                        {liveStatus ? (
                          <>
                            <div className="flex items-center gap-2">
                              <VerdictBadge status={liveStatus.status} />
                              <span className="text-sm text-muted-foreground">
                                {liveStatus.passedTestcaseCount}/{liveStatus.totalTestcaseCount}{' '}
                                passed
                              </span>
                            </div>
                            {Object.values(testcaseVerdicts)
                              .sort((a, b) => a.ordinal - b.ordinal)
                              .map((tc) => (
                                <div
                                  key={tc.ordinal}
                                  className={cn(
                                    'flex items-center justify-between rounded-lg border border-border p-2 text-sm',
                                  )}
                                >
                                  <span>Test case {tc.ordinal + 1}</span>
                                  <VerdictBadge status={tc.verdict} />
                                </div>
                              ))}
                          </>
                        ) : (
                          <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Judging…
                          </p>
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
