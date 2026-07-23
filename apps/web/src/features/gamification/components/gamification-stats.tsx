import { CheckCircle2, Flame, Sparkles, Trophy } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { useGamificationSummary } from '../hooks/use-gamification';

/** Four StatCards from the gamification summary. Shows `—` while loading. */
export function GamificationStats() {
  const { data } = useGamificationSummary();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total points"
        value={data?.totalPoints ?? '—'}
        icon={<Sparkles className="size-5" />}
      />
      <StatCard
        label="Current streak"
        value={data ? `${data.currentStreak}d` : '—'}
        icon={<Flame className="size-5" />}
        hint={data ? `Longest ${data.longestStreak}d` : undefined}
      />
      <StatCard
        label="Problems solved"
        value={data?.totalSolved ?? '—'}
        icon={<CheckCircle2 className="size-5" />}
      />
      <StatCard
        label="Longest streak"
        value={data ? `${data.longestStreak}d` : '—'}
        icon={<Trophy className="size-5" />}
      />
    </div>
  );
}
