import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SubmissionStatus } from '@/types/submission';

const VERDICT_STYLES: Record<SubmissionStatus, string> = {
  [SubmissionStatus.PENDING]: 'bg-muted text-muted-foreground',
  [SubmissionStatus.RUNNING]: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  [SubmissionStatus.ACCEPTED]: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [SubmissionStatus.WRONG_ANSWER]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [SubmissionStatus.TIME_LIMIT_EXCEEDED]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [SubmissionStatus.MEMORY_LIMIT_EXCEEDED]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [SubmissionStatus.RUNTIME_ERROR]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [SubmissionStatus.SYNTAX_ERROR]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [SubmissionStatus.COMPILE_ERROR]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [SubmissionStatus.INTERNAL_ERROR]: 'bg-red-500/15 text-red-600 dark:text-red-400',
  [SubmissionStatus.FINISHED]: 'bg-muted text-muted-foreground',
};

export function VerdictBadge({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent font-medium', VERDICT_STYLES[status], className)}>
      {status}
    </Badge>
  );
}
