import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Globe, HelpCircle, Lock, Trash2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';
import { Role, atLeast } from '@/types/common';
import type { TopicComment } from '@/types/engagement';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { engagementApi, engagementKeys } from '../api/engagement.api';

/**
 * One topic's thread (#77, over #76's backend).
 *
 * The thread a reader sees is ORG-PARTITIONED even on a global topic — that happens
 * server-side, on the comment's own organization, so there is nothing to filter here.
 * Worth knowing while reading this file: two organizations open the same global topic
 * and see completely different discussions.
 *
 * Replies are ONE level deep (the server rejects a nested reply), so this renders a
 * flat list with indented children rather than a recursive tree.
 */
export function TopicDetailPage() {
  const { topicId = '' } = useParams<{ topicId: string }>();
  const { user, organization } = useAuth();
  const { canAccessFeature } = useModuleAccess();
  const queryClient = useQueryClient();
  const orgId = organization?.id ?? null;

  const isStaff = !!user && atLeast(user.role, Role.PROFESSOR);
  const mayComment = canAccessFeature('topics.comment');
  const mayModerate = isStaff && canAccessFeature('topics.moderate');

  const [body, setBody] = useState('');
  const [isQuestion, setIsQuestion] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const commentsKey = engagementKeys.comments(topicId, orgId);

  const {
    data: topic,
    isLoading: topicLoading,
    isError,
    error,
  } = useQuery({
    queryKey: engagementKeys.topic(topicId, orgId),
    queryFn: () => engagementApi.getTopic(topicId),
    enabled: !!topicId,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: commentsKey,
    queryFn: () => engagementApi.listComments(topicId),
    enabled: !!topicId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: commentsKey });
    void queryClient.invalidateQueries({ queryKey: engagementKeys.openQuestions(orgId) });
  };

  const post = useMutation({
    mutationFn: () =>
      engagementApi.addComment(topicId, {
        body: body.trim(),
        isQuestion,
        ...(replyTo ? { parentId: replyTo } : {}),
      }),
    onSuccess: () => {
      setBody('');
      setIsQuestion(false);
      setReplyTo(null);
      refresh();
      // The list page shows a per-org comment count.
      void queryClient.invalidateQueries({ queryKey: engagementKeys.topics(orgId) });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => engagementApi.resolveQuestion(id),
    onSuccess: () => {
      refresh();
      toast.success('Marked answered');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => engagementApi.deleteComment(id),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: engagementKeys.topics(orgId) });
      toast.success('Deleted');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const toggleLock = useMutation({
    mutationFn: (locked: boolean) => engagementApi.setTopicLocked(topicId, locked),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: engagementKeys.topic(topicId, orgId) });
      void queryClient.invalidateQueries({ queryKey: engagementKeys.topics(orgId) });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (topicLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (isError || !topic) {
    return (
      <EmptyState title="Couldn't load this topic" description={parseApiError(error).message} />
    );
  }

  const all = comments ?? [];
  const roots = all.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id);

  // A global topic is platform property — an org's staff read and comment on it but
  // must not lock or retitle it for everyone. The server enforces this; hiding the
  // control keeps it from looking available.
  const mayLock = mayModerate && !topic.isGlobal;

  return (
    <div className="space-y-6">
      <Link
        to="/home/topics"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> All topics
      </Link>

      <PageHeader
        title={topic.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {topic.isGlobal && (
              <Badge variant="secondary" className="gap-1">
                <Globe className="size-3" /> Global
              </Badge>
            )}
            {topic.isLocked && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" /> Locked
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">{topic.description}</span>
          </span>
        }
        actions={
          mayLock ? (
            <Button
              variant="outline"
              className="gap-2"
              disabled={toggleLock.isPending}
              onClick={() => toggleLock.mutate(!topic.isLocked)}
            >
              {topic.isLocked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
              {topic.isLocked ? 'Unlock' : 'Lock'}
            </Button>
          ) : undefined
        }
      />

      {topic.isLocked && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This topic is locked. Existing replies stay readable; no new ones can be added.
        </p>
      )}

      {commentsLoading && <Skeleton className="h-40 w-full rounded-lg" />}

      {!commentsLoading && roots.length === 0 && (
        <EmptyState title="No replies yet" description="Be the first to post." />
      )}

      <div className="space-y-3">
        {roots.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentCard
              comment={c}
              isMine={c.authorId === user?.id}
              mayModerate={mayModerate}
              onResolve={() => resolve.mutate(c.id)}
              onDelete={() => remove.mutate(c.id)}
              onReply={() => setReplyTo(c.id)}
              canReply={mayComment && !topic.isLocked}
            />
            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="ml-6 border-l border-border pl-3">
                <CommentCard
                  comment={r}
                  isMine={r.authorId === user?.id}
                  mayModerate={mayModerate}
                  onResolve={() => resolve.mutate(r.id)}
                  onDelete={() => remove.mutate(r.id)}
                  // Replies are one level deep — the server rejects a nested reply,
                  // so no reply control is offered on one.
                  canReply={false}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {mayComment && !topic.isLocked && (
        <Card className="space-y-3 p-4">
          {replyTo && (
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Replying to a comment
              <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                Cancel reply
              </Button>
            </p>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            maxLength={4000}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-brand"
                checked={isQuestion}
                onChange={(e) => setIsQuestion(e.target.checked)}
              />
              <span className="inline-flex items-center gap-1">
                <HelpCircle className="size-3.5" /> This is a question
              </span>
              <span className="text-xs text-muted-foreground">(notifies your instructors)</span>
            </label>
            <Button
              disabled={body.trim().length < 2 || post.isPending}
              onClick={() => post.mutate()}
            >
              {post.isPending ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  isMine,
  mayModerate,
  canReply,
  onResolve,
  onDelete,
  onReply,
}: {
  comment: TopicComment;
  isMine: boolean;
  mayModerate: boolean;
  canReply: boolean;
  onResolve: () => void;
  onDelete: () => void;
  onReply?: () => void;
}) {
  const answered = comment.resolvedAt !== null;
  return (
    <Card className={cn('space-y-2 p-4', comment.isQuestion && !answered && 'border-primary/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{comment.authorName ?? 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
          {comment.isQuestion && (
            <Badge variant={answered ? 'secondary' : 'default'} className="gap-1">
              {answered ? <CheckCircle2 className="size-3" /> : <HelpCircle className="size-3" />}
              {answered ? 'Answered' : 'Question'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canReply && onReply && (
            <Button size="sm" variant="ghost" onClick={onReply}>
              Reply
            </Button>
          )}
          {mayModerate && comment.isQuestion && !answered && (
            <Button size="sm" variant="outline" onClick={onResolve}>
              Mark answered
            </Button>
          )}
          {/* Author-or-staff, matching the server. Deleting a parent takes its
              replies with it via the FK cascade. */}
          {(isMine || mayModerate) && (
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete comment">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
    </Card>
  );
}
