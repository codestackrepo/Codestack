import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { editorApi } from '../api/editor.api';
import { CodeEditorScreen } from '../components/code-editor-screen';

/**
 * Assignment solve editor (`/solve/:apId`). Thin wrapper: bootstraps the
 * assignment-problem payload and injects the assignment run/submit transport
 * into the shared `CodeEditorScreen`. Submit is blind (no verdict toast) — the
 * screen's `variant="assignment"` enforces that (#27).
 */
export function CodeEditorPage() {
  const { apId } = useParams<{ apId: string }>();
  const [searchParams] = useSearchParams();
  // The assignments panel appends ?mode=review when the assignment isn't ACTIVE:
  // the backend still allows Run (not status-gated) but rejects Submit, so we
  // mirror that contract by disabling Submit and surfacing a banner.
  const reviewMode = searchParams.get('mode') === 'review';

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['editor', apId],
    queryFn: () => editorApi.bootstrap(apId!),
    enabled: !!apId,
  });

  if (isLoading || !bootstrap) {
    return (
      <div className="flex h-svh items-center justify-center bg-background p-6">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <CodeEditorScreen
      bootstrap={bootstrap}
      variant="assignment"
      reviewMode={reviewMode}
      onRun={(language, code, samples) => editorApi.run(apId!, language, code, samples)}
      onSubmit={(language, code) => editorApi.submit(apId!, language, code)}
    />
  );
}
