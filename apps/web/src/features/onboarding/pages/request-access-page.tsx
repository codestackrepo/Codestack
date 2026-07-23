import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, GraduationCap, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { onboardingApi } from '../api/onboarding.api';
import { parseApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';

const MY_REQUEST_KEY = ['onboarding', 'my-request'];

export function RequestAccessPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const { data: request, isLoading } = useQuery({
    queryKey: MY_REQUEST_KEY,
    queryFn: onboardingApi.myRequest,
  });

  const mutation = useMutation({
    mutationFn: () => onboardingApi.createRequest({ message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success('Request submitted — an admin will review it shortly.');
      queryClient.invalidateQueries({ queryKey: MY_REQUEST_KEY });
      setMessage('');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });

  const pending = request?.status === 'pending';
  const approved = request?.status === 'approved';
  const rejected = request?.status === 'rejected';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Request professor access"
        description="Ask an administrator to grant you teaching tools — classrooms, assignments, and the gradebook."
      />

      {isLoading && <Skeleton className="h-40 w-full" />}

      {!isLoading && approved && (
        <Card>
          <CardContent className="flex items-start gap-3 py-6">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">You have professor access</p>
              <p className="text-sm text-muted-foreground">
                Your request was approved. If teaching tools aren't visible yet, reload the app.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && pending && (
        <Card>
          <CardContent className="flex items-start gap-3 py-6">
            <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Your request is pending review</p>
              <p className="text-sm text-muted-foreground">
                An administrator will approve or decline it soon. You'll get a notification.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !pending && !approved && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-primary" />
              {rejected ? 'Submit a new request' : 'Tell us why'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rejected && request?.decisionReason && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>Previously declined: {request.decisionReason}</span>
              </div>
            )}
            <Textarea
              placeholder="Which courses will you teach? (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
            />
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {mutation.isPending ? 'Submitting…' : 'Request access'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
