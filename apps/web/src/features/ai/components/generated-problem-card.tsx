import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronUp, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/api-client';
import { aiApi } from '../api/ai.api';
import {
  GeneratedProblemLinkStatus,
  SupportedLanguageKey,
  type GeneratedProblemLink,
} from '../types';
import { MarkdownView } from './markdown-view';
import { DifficultyBadge, LinkStatusBadge } from './status-badge';

const LANGUAGE_LABELS: Record<SupportedLanguageKey, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
};

export function GeneratedProblemCard({
  generationId,
  link,
}: {
  generationId: string;
  link: GeneratedProblemLink;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { draft } = link;

  const saveMutation = useMutation({
    mutationFn: () => aiApi.saveProblem(generationId, link.id),
    onSuccess: (updated) => {
      queryClient.setQueryData<GeneratedProblemLink[]>(
        ['ai', 'generations', generationId, 'problems'],
        (prev) => prev?.map((l) => (l.id === updated.id ? updated : l)),
      );
      toast.success('Saved to your problem library.');
    },
    onError: (error) => toast.error(parseApiError(error).message),
  });

  const isSaved = link.status === GeneratedProblemLinkStatus.SAVED;
  const isDiscarded = link.status === GeneratedProblemLinkStatus.DISCARDED;
  const canSave = link.status === GeneratedProblemLinkStatus.VALIDATED;

  const passEntries = (Object.values(SupportedLanguageKey) as SupportedLanguageKey[])
    .map((lang) => ({ lang, pass: link.perLanguagePass[lang] }))
    .filter((e) => e.pass !== undefined);

  return (
    <Card className={cn(isDiscarded && 'opacity-70')}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{draft.title}</CardTitle>
          <LinkStatusBadge status={link.status} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DifficultyBadge difficulty={draft.difficulty} />
          {draft.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div
            className={cn(
              'custom-scrollbar overflow-y-auto rounded-md border border-border bg-muted/20 p-3',
              expanded ? 'max-h-none' : 'max-h-40',
            )}
          >
            <MarkdownView>{draft.statement_markdown}</MarkdownView>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1.5"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" /> Show full statement
              </>
            )}
          </Button>
        </div>

        {passEntries.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Reference solution checks</p>
            <div className="flex flex-wrap gap-1.5">
              {passEntries.map(({ lang, pass }) => (
                <span
                  key={lang}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                    pass
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  {pass ? <Check className="size-3" /> : null}
                  {LANGUAGE_LABELS[lang]}
                </span>
              ))}
            </div>
          </div>
        )}

        {draft.sample_testcases.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Sample cases ({draft.sample_testcases.length})
            </p>
            <div className="space-y-1.5">
              {draft.sample_testcases.map((tc, i) => (
                <div
                  key={i}
                  className="custom-scrollbar overflow-x-auto rounded-md border border-border p-2 font-mono text-xs text-muted-foreground"
                >
                  <span className="text-foreground">{draft.function_name}</span>(
                  {tc.inputs.map((v) => JSON.stringify(v)).join(', ')}) →{' '}
                  {JSON.stringify(tc.expected)}
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {isSaved
              ? 'Added to your problem library.'
              : isDiscarded
                ? 'Discarded during validation.'
                : 'Validated and ready to save.'}
          </p>
          {isSaved ? (
            <Button variant="outline" size="sm" disabled>
              <Check className="size-4" /> Saved
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save to library
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
