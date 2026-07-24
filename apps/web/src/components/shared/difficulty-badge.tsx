import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Difficulty } from '@/types/problem';

const STYLES: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'bg-success/12 text-success',
  [Difficulty.MEDIUM]: 'bg-warning/12 text-warning',
  [Difficulty.HARD]: 'bg-destructive/12 text-destructive',
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: Difficulty;
  className?: string;
}) {
  return (
    <Badge className={cn('border-transparent capitalize', STYLES[difficulty], className)}>
      {difficulty}
    </Badge>
  );
}
