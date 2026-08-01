import { useId, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownView } from '@/components/shared/markdown-view';
import { cn } from '@/lib/utils';

/**
 * A markdown textarea with a preview tab.
 *
 * Deliberately NOT a WYSIWYG. The stored value is markdown — the same string the
 * renderer receives — so what is typed, what is stored and what is shown cannot
 * diverge. A rich-text editor would introduce a second representation and the
 * conversion bugs that come with it, for a field whose readers are developers.
 *
 * Preview shares the editor's height rather than sitting beside it, so the control
 * does not change size when tabs are switched — a jumping dialog is worse than a
 * narrow preview.
 */
export function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  maxLength,
  placeholder,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-foreground/60 hover:text-foreground',
    );

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
          <button
            type="button"
            className={tabClass(tab === 'write')}
            onClick={() => setTab('write')}
          >
            <Pencil className="size-3.5" /> Write
          </button>
          <button
            type="button"
            className={tabClass(tab === 'preview')}
            onClick={() => setTab('preview')}
          >
            <Eye className="size-3.5" /> Preview
          </button>
        </div>
        {maxLength !== undefined && (
          <span
            className={cn(
              'text-xs tabular-nums',
              // Only shout near the limit — a counter that is always red is ignored.
              value.length > maxLength * 0.9 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {value.length} / {maxLength}
          </span>
        )}
      </div>

      {tab === 'write' ? (
        <Textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className="font-mono text-sm"
        />
      ) : (
        <div
          className="overflow-y-auto rounded-lg border border-input-border bg-muted/20 px-3 py-2"
          // Match the textarea's height so switching tabs does not resize the form.
          // 1.25rem/row tracks the textarea's line-height; the padding is the same.
          style={{ minHeight: `calc(${rows} * 1.25rem + 1rem)` }}
        >
          {value.trim() ? (
            <MarkdownView>{value}</MarkdownView>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Markdown — <code>**bold**</code>, <code>`code`</code>, lists, headings and fenced code
        blocks all render.
      </p>
    </div>
  );
}
