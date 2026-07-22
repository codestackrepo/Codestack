import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Difficulty } from '@/types/problem';

const STYLES: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  [Difficulty.MEDIUM]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [Difficulty.HARD]: 'bg-red-500/15 text-red-600 dark:text-red-400',
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
