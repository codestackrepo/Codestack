import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['practice-editor', problemId],
    queryFn: () => editorApi.bootstrapProblem(problemId!),
    enabled: !!problemId,
  });

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
      // #37 will pass onAccepted to show "+N points • day-K streak"; until then
      // the screen falls back to a plain "Accepted!" toast.
    />
  );
}
