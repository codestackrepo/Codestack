import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerationStatus } from '../types';

const STEPS = [
  { status: GenerationStatus.QUEUED, label: 'Queued' },
  { status: GenerationStatus.GENERATING, label: 'Generating' },
  { status: GenerationStatus.VALIDATING, label: 'Validating' },
  { status: GenerationStatus.READY, label: 'Ready' },
] as const;

const ORDER: Record<GenerationStatus, number> = {
  [GenerationStatus.QUEUED]: 0,
  [GenerationStatus.GENERATING]: 1,
  [GenerationStatus.VALIDATING]: 2,
  [GenerationStatus.READY]: 3,
  [GenerationStatus.FAILED]: 3,
};

export function GenerationStepper({ status }: { status: GenerationStatus }) {
  const current = ORDER[status];
  const failed = status === GenerationStatus.FAILED;

  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => {
        const stepIndex = i;
        const isLast = i === STEPS.length - 1;
        const isDone = stepIndex < current;
        const isActive = stepIndex === current && !failed;
        const isFailedHere = failed && isLast;

        return (
          <li key={step.status} className={cn('flex items-center', !isLast && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  isDone &&
                    'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                  isActive && 'border-primary/40 bg-primary/10 text-primary',
                  isFailedHere && 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400',
                  !isDone &&
                    !isActive &&
                    !isFailedHere &&
                    'border-border bg-muted text-muted-foreground',
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? (
                  <Check className="size-4" />
                ) : isActive ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isFailedHere ? (
                  <X className="size-4" />
                ) : (
                  stepIndex + 1
                )}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  isActive || isDone ? 'text-foreground' : 'text-muted-foreground',
                  isFailedHere && 'text-destructive',
                )}
              >
                {isFailedHere ? 'Failed' : step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'mx-1 mb-5 h-0.5 flex-1 rounded-full transition-colors',
                  stepIndex < current ? 'bg-emerald-500/40' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
