import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GeneratedProblemLinkStatus, GenerationStatus, type Difficulty } from '../types';

const GENERATION_STYLES: Record<GenerationStatus, string> = {
  [GenerationStatus.QUEUED]: 'bg-muted text-muted-foreground',
  [GenerationStatus.GENERATING]: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  [GenerationStatus.VALIDATING]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [GenerationStatus.READY]: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [GenerationStatus.FAILED]: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const GENERATION_LABELS: Record<GenerationStatus, string> = {
  [GenerationStatus.QUEUED]: 'Queued',
  [GenerationStatus.GENERATING]: 'Generating',
  [GenerationStatus.VALIDATING]: 'Validating',
  [GenerationStatus.READY]: 'Ready',
  [GenerationStatus.FAILED]: 'Failed',
};

export function GenerationStatusBadge({
  status,
  className,
}: {
  status: GenerationStatus;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent font-medium', GENERATION_STYLES[status], className)}>
      {GENERATION_LABELS[status]}
    </Badge>
  );
}

const LINK_STYLES: Record<GeneratedProblemLinkStatus, string> = {
  [GeneratedProblemLinkStatus.VALIDATED]:
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [GeneratedProblemLinkStatus.SAVED]: 'bg-primary/15 text-primary',
  [GeneratedProblemLinkStatus.DISCARDED]: 'bg-muted text-muted-foreground',
};

const LINK_LABELS: Record<GeneratedProblemLinkStatus, string> = {
  [GeneratedProblemLinkStatus.VALIDATED]: 'Validated',
  [GeneratedProblemLinkStatus.SAVED]: 'Saved',
  [GeneratedProblemLinkStatus.DISCARDED]: 'Discarded',
};

export function LinkStatusBadge({
  status,
  className,
}: {
  status: GeneratedProblemLinkStatus;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent font-medium', LINK_STYLES[status], className)}>
      {LINK_LABELS[status]}
    </Badge>
  );
}

const DIFFICULTY_VARIANT: Record<Difficulty, 'secondary' | 'default' | 'destructive'> = {
  easy: 'secondary',
  medium: 'default',
  hard: 'destructive',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <Badge variant={DIFFICULTY_VARIANT[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  );
}
