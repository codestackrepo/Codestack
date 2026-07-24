import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SubmissionStatus } from '@/types/submission';

// Aligned to the semantic status tokens (§13.6) rather than hardcoded Tailwind
// palette colors, so verdicts follow the theme + pass the contrast gate's hues.
const VERDICT_STYLES: Record<SubmissionStatus, string> = {
  [SubmissionStatus.PENDING]: 'bg-muted text-muted-foreground',
  [SubmissionStatus.RUNNING]: 'bg-info/12 text-info',
  [SubmissionStatus.ACCEPTED]: 'bg-success/12 text-success',
  [SubmissionStatus.WRONG_ANSWER]: 'bg-destructive/12 text-destructive',
  [SubmissionStatus.TIME_LIMIT_EXCEEDED]: 'bg-warning/12 text-warning',
  [SubmissionStatus.MEMORY_LIMIT_EXCEEDED]: 'bg-warning/12 text-warning',
  [SubmissionStatus.RUNTIME_ERROR]: 'bg-destructive/12 text-destructive',
  [SubmissionStatus.SYNTAX_ERROR]: 'bg-destructive/12 text-destructive',
  [SubmissionStatus.COMPILE_ERROR]: 'bg-destructive/12 text-destructive',
  [SubmissionStatus.INTERNAL_ERROR]: 'bg-destructive/12 text-destructive',
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
