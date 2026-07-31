import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HelpCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/auth-context';
import { engagementApi, engagementKeys } from '../api/engagement.api';

/**
 * The staff "Doubts & Feedback" inbox (#77).
 *
 * Two independent backends, one screen, because to a professor they are the same job:
 * a student is stuck and waiting. Problem feedback (#75) is anchored to the author's
 * organization and topic questions (#76) to the commenter's, so BOTH lists are already
 * this org's — a doubt raised elsewhere on the same global problem or global topic is
 * not here, which is the intended behaviour and not a missing filter.
 *
 * Only unanswered items are shown by default: an inbox that also lists everything
 * already dealt with stops being a queue.
 */
export function DoubtsInboxPage() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const orgId = organization?.id ?? null;

  const feedbackParams = { status: 'open' };
  const feedbackKey = engagementKeys.feedbackInbox(orgId, feedbackParams);

  const feedback = useQuery({
    queryKey: feedbackKey,
    queryFn: () => engagementApi.listFeedbackInbox(feedbackParams),
  });

  const questions = useQuery({
    queryKey: engagementKeys.openQuestions(orgId),
    queryFn: engagementApi.listOpenQuestions,
  });

  const resolveFeedback = useMutation({
    mutationFn: (id: string) => engagementApi.resolveFeedback(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedbackKey });
      toast.success('Marked resolved');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const resolveQuestion = useMutation({
    mutationFn: (id: string) => engagementApi.resolveQuestion(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: engagementKeys.openQuestions(orgId) });
      toast.success('Marked answered');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const fbItems = feedback.data ?? [];
  const qItems = questions.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doubts & feedback"
        description="Open items from students in your organization, across problems and topics."
      />

      <Tabs defaultValue="problems">
        <TabsList>
          <TabsTrigger value="problems" className="gap-2">
            <MessageSquare className="size-4" /> Problems ({fbItems.length})
          </TabsTrigger>
          <TabsTrigger value="topics" className="gap-2">
            <HelpCircle className="size-4" /> Topics ({qItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="problems" className="space-y-3 pt-4">
          {feedback.isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
          {feedback.isError && (
            <EmptyState
              title="Couldn't load feedback"
              description={parseApiError(feedback.error).message}
            />
          )}
          {!feedback.isLoading && fbItems.length === 0 && (
            <EmptyState title="Nothing open" description="No unresolved problem feedback." />
          )}
          {fbItems.map((f) => (
            <Card key={f.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={f.kind === 'doubt' ? 'default' : 'outline'}>{f.kind}</Badge>
                  <Link
                    to={`/home/problems/${f.problemId}`}
                    className="font-medium hover:text-primary"
                  >
                    {f.problemTitle ?? 'A problem'}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {f.authorName ?? 'A student'} · {formatDate(f.createdAt)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveFeedback.isPending}
                  onClick={() => resolveFeedback.mutate(f.id)}
                >
                  <CheckCircle2 className="size-3.5" /> Resolve
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{f.body}</p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="topics" className="space-y-3 pt-4">
          {questions.isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
          {questions.isError && (
            <EmptyState
              title="Couldn't load questions"
              description={parseApiError(questions.error).message}
            />
          )}
          {!questions.isLoading && qItems.length === 0 && (
            <EmptyState title="Nothing open" description="No unanswered topic questions." />
          )}
          {qItems.map((q) => (
            <Card key={q.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/home/topics/${q.topicId}`} className="font-medium hover:text-primary">
                    Open thread
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {q.authorName ?? 'A student'} · {formatDate(q.createdAt)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveQuestion.isPending}
                  onClick={() => resolveQuestion.mutate(q.id)}
                >
                  <CheckCircle2 className="size-3.5" /> Mark answered
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{q.body}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
