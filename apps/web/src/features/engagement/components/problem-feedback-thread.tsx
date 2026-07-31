import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Role, atLeast } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import {
  FEEDBACK_KIND_LABEL,
  FeedbackKind,
  FeedbackStatus,
  type ProblemFeedback,
} from '@/types/engagement';
import { engagementApi, engagementKeys } from '../api/engagement.api';

/**
 * Feedback on one problem (#77, over #75's backend).
 *
 * A STUDENT sees only their own items — that is the server's rule, not this
 * component's, and it is why there is no "all feedback" affordance here. Staff see
 * everything their org raised on this problem and can resolve it.
 *
 * Only DOUBT notifies staff. The kind labels say what each one does rather than
 * naming the enum, because "issue" and "suggestion" look interchangeable otherwise
 * and the difference (one pages people, two do not) is the whole point.
 */
export function ProblemFeedbackThread({ problemId }: { problemId: string }) {
  const { user, organization } = useAuth();
  const { canAccessFeature } = useModuleAccess();
  const queryClient = useQueryClient();
  const orgId = organization?.id ?? null;

  const [kind, setKind] = useState<FeedbackKind>(FeedbackKind.DOUBT);
  const [body, setBody] = useState('');

  const isStaff = !!user && atLeast(user.role, Role.PROFESSOR);
  // Cosmetic — FeatureGuard is the real enforcement. A student in an org without
  // `problems.feedback` should not see a composer that 403s on submit.
  const mayWrite = canAccessFeature('problems.feedback');

  const key = engagementKeys.feedback(problemId, orgId);
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => engagementApi.listFeedback(problemId),
    enabled: !!problemId,
  });

  const raise = useMutation({
    mutationFn: () => engagementApi.raiseFeedback(problemId, { kind, body: body.trim() }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: key });
      toast.success(
        kind === FeedbackKind.DOUBT
          ? 'Sent — your instructors have been notified.'
          : 'Thanks, this has been recorded for staff.',
      );
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => engagementApi.resolveFeedback(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: engagementKeys.feedbackInbox(orgId) });
      toast.success('Marked resolved');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const items = data ?? [];
  const tooShort = body.trim().length < 3;

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <MessageSquare className="size-4" />
        {isStaff ? 'Feedback from students' : 'Questions & feedback'}
      </h2>

      {mayWrite && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-2">
            <Label htmlFor="fb-kind">What kind of feedback is this?</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as FeedbackKind)}>
              <SelectTrigger id="fb-kind" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FeedbackKind).map((k) => (
                  <SelectItem key={k} value={k}>
                    {FEEDBACK_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Says which one actually pages a human. */}
            <p className="text-xs text-muted-foreground">
              {kind === FeedbackKind.DOUBT
                ? 'Your instructors are notified straight away.'
                : 'Recorded for staff to review — nobody is paged.'}
            </p>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what you're stuck on, or what looks wrong…"
            rows={3}
            maxLength={4000}
          />
          <div className="flex justify-end">
            <Button disabled={tooShort || raise.isPending} onClick={() => raise.mutate()}>
              {raise.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </Card>
      )}

      {isLoading && <Skeleton className="h-24 w-full rounded-lg" />}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isStaff
            ? 'No feedback on this problem yet.'
            : 'You have not raised anything on this problem.'}
        </p>
      )}

      <div className="space-y-3">
        {items.map((f) => (
          <FeedbackItem
            key={f.id}
            feedback={f}
            canResolve={isStaff && f.status === FeedbackStatus.OPEN}
            resolving={resolve.isPending}
            onResolve={() => resolve.mutate(f.id)}
          />
        ))}
      </div>
    </section>
  );
}

function FeedbackItem({
  feedback,
  canResolve,
  resolving,
  onResolve,
}: {
  feedback: ProblemFeedback;
  canResolve: boolean;
  resolving: boolean;
  onResolve: () => void;
}) {
  const resolved = feedback.status === FeedbackStatus.RESOLVED;
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={feedback.kind === FeedbackKind.DOUBT ? 'default' : 'outline'}>
            {feedback.kind}
          </Badge>
          {resolved && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="size-3" /> Resolved
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {feedback.authorName ?? 'A student'} · {formatDate(feedback.createdAt)}
          </span>
        </div>
        {canResolve && (
          <Button size="sm" variant="outline" disabled={resolving} onClick={onResolve}>
            Mark resolved
          </Button>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">{feedback.body}</p>
      {resolved && feedback.resolutionNote && (
        <p className="rounded-md bg-muted/50 p-2 text-sm">
          <span className="font-medium">
            {feedback.resolvedByName ? `${feedback.resolvedByName}: ` : 'Staff: '}
          </span>
          {feedback.resolutionNote}
        </p>
      )}
    </Card>
  );
}
