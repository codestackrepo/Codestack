import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { gamificationApi } from '@/features/gamification/api/gamification.api';
import { editorApi } from '../api/editor.api';
import { CodeEditorScreen } from '../components/code-editor-screen';

/**
 * Practice solve editor (`/practice/:problemId`). Bootstraps a catalog problem
 * and injects the practice run/submit transport (`context='practice'`) into the
 * shared `CodeEditorScreen`. Practice is NOT blind — the full verdict panel +
 * an accept toast show (§5.5). Hard-gates on `isJudgeReady` (§9.11): a
 * non-judge-ready problem never presents a solvable surface (the backend also
 * rejects — both layers required).
 */
export function PracticeEditorPage() {
  const { problemId } = useParams<{ problemId: string }>();
  const queryClient = useQueryClient();

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['practice-editor', problemId],
    queryFn: () => editorApi.bootstrapProblem(problemId!),
    enabled: !!problemId,
  });

  // §5.6/§5.8: on an accepted practice solve, refresh the gamification panels
  // and show a "+N points • K-day streak" toast (#37). The award is written by
  // a backend listener on submission-finalized, so it's normally committed by
  // the time these reads resolve; if not, the panels still refresh on next view.
  function handleAccepted() {
    void queryClient.invalidateQueries({ queryKey: ['gamification'] });
    void Promise.all([gamificationApi.summary(), gamificationApi.history({ limit: 1 })])
      .then(([summary, history]) => {
        const earned = history.data[0]?.points;
        const streak = summary.currentStreak;
        toast.success(earned ? `Accepted! +${earned} points` : 'Accepted!', {
          description: streak > 0 ? `${streak}-day streak 🔥` : undefined,
        });
      })
      .catch(() => toast.success('Accepted!'));
  }

  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-svh items-center justify-center bg-background p-6">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const solvable = bootstrap.isJudgeReady && bootstrap.templates.length > 0;
  if (!solvable) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">This problem isn’t solvable yet</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            It hasn’t been prepared for judging. Check back later or pick another problem.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/home/problems">
            <ArrowLeft className="size-4" /> Back to problems
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <CodeEditorScreen
      bootstrap={bootstrap}
      variant="practice"
      onRun={(language, code, samples) =>
        editorApi.runPractice(problemId!, language, code, samples)
      }
      onSubmit={(language, code) => editorApi.submitPractice(problemId!, language, code)}
      onAccepted={handleAccepted}
    />
  );
}
