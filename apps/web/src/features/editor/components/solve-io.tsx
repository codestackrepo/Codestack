import { cn } from '@/lib/utils';
import { SubmissionStatus } from '@/types/submission';

type Tone = 'neutral' | 'good' | 'bad';

/**
 * One labelled I/O block (Input / Your Output / Expected / Stderr) rendered as a
 * monospace, scrollable box — the building block of the LeetCode-style result
 * detail. `tone` tints the box so pass/fail reads at a glance.
 */
export function IoField({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const empty = value == null || value.length === 0;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <pre
        className={cn(
          'max-h-40 overflow-auto rounded-md border px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap',
          tone === 'good' && 'border-emerald-500/30 bg-emerald-500/5',
          tone === 'bad' && 'border-red-500/40 bg-red-500/5',
          tone === 'neutral' && 'border-border bg-muted/40',
        )}
      >
        {empty ? <span className="text-muted-foreground">(empty)</span> : value}
      </pre>
    </div>
  );
}

/**
 * `Case 1 / Case 2 …` selector. When `verdicts` is supplied each pill carries a
 * green/red dot for its result, so the whole run is scannable before drilling in.
 */
export function CasePills({
  count,
  active,
  onSelect,
  verdicts,
}: {
  count: number;
  active: number;
  onSelect: (i: number) => void;
  verdicts?: (SubmissionStatus | undefined)[];
}) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => {
        const v = verdicts?.[i];
        const ok = v === SubmissionStatus.ACCEPTED;
        const bad = v != null && v !== SubmissionStatus.ACCEPTED;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
              active === i
                ? 'border-brand bg-brand/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {v != null && (
              <span
                className={cn('size-1.5 rounded-full', ok && 'bg-emerald-500', bad && 'bg-red-500')}
              />
            )}
            Case {i + 1}
          </button>
        );
      })}
    </div>
  );
}
