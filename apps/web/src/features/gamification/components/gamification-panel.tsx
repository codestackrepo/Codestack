import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContributions, useGamificationSummary } from '../hooks/use-gamification';
import { ContributionHeatmap } from './contribution-heatmap';
import { DifficultyBreakdownChart } from './difficulty-breakdown-chart';
import { GamificationStats } from './gamification-stats';

/**
 * The single gamification unit (stats + contribution heatmap + difficulty
 * breakdown) dropped into both the Profile page and the Student dashboard.
 * Student-only — the caller gates on role.
 */
export function GamificationPanel() {
  const year = new Date().getFullYear();
  const { data: summary } = useGamificationSummary();
  const { data: contributions } = useContributions(year);

  return (
    <div className="space-y-6">
      <GamificationStats />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {contributions?.totalContributions ?? 0} contributions in {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contributions ? (
              <ContributionHeatmap year={contributions.year} days={contributions.days} />
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By difficulty</CardTitle>
          </CardHeader>
          <CardContent>
            {summary ? (
              <DifficultyBreakdownChart summary={summary} />
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
