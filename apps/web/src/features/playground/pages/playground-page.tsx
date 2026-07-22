import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Loader2, Play, Terminal, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VerdictBadge } from '@/components/shared/verdict-badge';
import { parseApiError } from '@/lib/api-client';
import { Language } from '@/types/common';
import { SubmissionStatus } from '@/types/submission';
import { playgroundApi } from '../api/playground.api';
import { LANGUAGE_LABELS, LANGUAGE_STARTERS, MONACO_LANGUAGE } from '../starters';
import { PLAYGROUND_MAX_LENGTH, type PlaygroundResult } from '../types';

const LANGUAGE_OPTIONS: Language[] = [
  Language.PYTHON,
  Language.JAVASCRIPT,
  Language.JAVA,
  Language.CPP,
];

/** Seed every language with its hello-world starter; edits persist per-language in memory. */
function initialCodeByLanguage(): Record<Language, string> {
  return { ...LANGUAGE_STARTERS };
}

export function PlaygroundPage() {
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';
  const [language, setLanguage] = useState<Language>(Language.PYTHON);
  const [codeByLanguage, setCodeByLanguage] =
    useState<Record<Language, string>>(initialCodeByLanguage);
  const [stdin, setStdin] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);

  const code = codeByLanguage[language];

  const runMutation = useMutation({
    mutationFn: () =>
      playgroundApi.run({
        language,
        userCode: code,
        stdin: stdin || undefined,
      }),
    onSuccess: (data) => setResult(data),
    onError: (error) => toast.error(parseApiError(error).message),
  });

  function setCode(next: string) {
    setCodeByLanguage((prev) => ({ ...prev, [language]: next }));
  }

  const overLimit = code.length > PLAYGROUND_MAX_LENGTH || stdin.length > PLAYGROUND_MAX_LENGTH;

  function handleRun() {
    if (runMutation.isPending || overLimit || code.trim().length === 0) return;
    runMutation.mutate();
  }

  // Keep a live ref to handleRun so the global Cmd/Ctrl+Enter listener stays
  // registered once (no re-subscribe per keystroke) yet always runs the
  // latest code/language/stdin.
  const runRef = useRef(handleRun);
  useEffect(() => {
    runRef.current = handleRun;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isClean = result?.status === SubmissionStatus.FINISHED;

  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-[540px] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Terminal className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-lg font-bold leading-none">Playground</h1>
            <p className="mt-1 text-xs text-muted-foreground">Run scratch code — nothing is saved.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger className="h-8 w-36" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={handleRun}
            disabled={runMutation.isPending || overLimit || code.trim().length === 0}
            title="Run (⌘/Ctrl + Enter)"
          >
            {runMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Run
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Group orientation="horizontal" className="h-full">
          <Panel defaultSize="55%" minSize="30%">
            <Group orientation="vertical" className="h-full">
              <Panel defaultSize="70%" minSize="30%">
                <Editor
                  height="100%"
                  language={MONACO_LANGUAGE[language]}
                  value={code}
                  onChange={(value) => setCode(value ?? '')}
                  theme={monacoTheme}
                  options={{ minimap: { enabled: false }, fontSize: 14, contextmenu: false }}
                />
              </Panel>

              <Separator className="h-1 bg-border transition-colors hover:bg-brand" />

              <Panel defaultSize="30%" minSize="15%">
                <div className="flex h-full flex-col gap-1.5 p-3">
                  <Label htmlFor="playground-stdin" className="text-xs text-muted-foreground">
                    Standard input (stdin)
                  </Label>
                  <Textarea
                    id="playground-stdin"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    placeholder="Optional input passed to your program…"
                    className="custom-scrollbar h-full flex-1 resize-none font-mono text-xs"
                  />
                </div>
              </Panel>
            </Group>
          </Panel>

          <Separator className="w-1 bg-border transition-colors hover:bg-brand" />

          <Panel defaultSize="45%" minSize="25%">
            <div className="custom-scrollbar flex h-full flex-col overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Output</span>
                  {result && <VerdictBadge status={result.status} />}
                </div>
                {result && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Timer className="size-3.5" />
                    {result.runtimeMs} ms
                  </span>
                )}
              </div>

              <div className="flex-1 p-4">
                {runMutation.isPending && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Running…
                  </p>
                )}

                {!runMutation.isPending && !result && (
                  <p className="text-sm text-muted-foreground">
                    Press <span className="font-medium text-foreground">Run</span> (or ⌘/Ctrl +
                    Enter) to execute your code. Output will appear here.
                  </p>
                )}

                {!runMutation.isPending && result && (
                  <div className="space-y-4">
                    <section className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">stdout</p>
                      <pre className="custom-scrollbar max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                        {result.stdout || (
                          <span className="text-muted-foreground">(no output)</span>
                        )}
                      </pre>
                    </section>

                    {!isClean && result.error && (
                      <section className="space-y-1.5">
                        <p className="text-xs font-medium text-destructive">stderr</p>
                        <pre className="custom-scrollbar max-h-64 overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                          {result.error}
                        </pre>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
