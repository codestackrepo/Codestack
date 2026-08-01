import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Lock, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownEditor } from '@/components/shared/markdown-editor';
import { parseApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Role, atLeast } from '@/types/common';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { engagementApi, engagementKeys } from '../api/engagement.api';

/**
 * Topic list (#77, over #76's backend), replacing the ComingSoon stub.
 *
 * A GLOBAL topic is shown to every organization, but its comment count is the
 * READER's own org's — the discussion under a shared topic is partitioned per tenant
 * server-side. That is why the badge says "Global" while the count can differ between
 * two organizations looking at the same row, and it is worth not being surprised by.
 */
export function TopicsPage() {
  const { user, organization } = useAuth();
  const { canAccessFeature } = useModuleAccess();
  const queryClient = useQueryClient();
  const orgId = organization?.id ?? null;

  const isStaff = !!user && atLeast(user.role, Role.PROFESSOR);
  const mayModerate = isStaff && canAccessFeature('topics.moderate');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: engagementKeys.topics(orgId),
    queryFn: engagementApi.listTopics,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      engagementApi.createTopic({ title: title.trim(), description: description.trim() }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: engagementKeys.topics(orgId) });
      toast.success('Topic created');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const topics = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Topics"
        description="Discussion threads for your organization, plus platform-wide topics."
        actions={
          mayModerate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" /> New topic
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New topic</DialogTitle>
                  <DialogDescription>
                    Visible to your organization. Platform-wide topics are created by a platform
                    administrator.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="topic-title">Title</Label>
                    <Input
                      id="topic-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="topic-desc">Description</Label>
                    <MarkdownEditor
                      id="topic-desc"
                      value={description}
                      onChange={setDescription}
                      rows={8}
                      maxLength={4000}
                      placeholder={'What this topic covers, and what to read first.'}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={title.trim().length === 0 || create.isPending}
                    onClick={() => create.mutate()}
                  >
                    {create.isPending ? 'Creating…' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
      {isError && (
        <EmptyState title="Couldn't load topics" description={parseApiError(error).message} />
      )}

      {!isLoading && topics.length === 0 && (
        <EmptyState
          title="No topics yet"
          description={
            mayModerate
              ? 'Create the first one to get a discussion started.'
              : 'Your instructors have not opened any discussions yet.'
          }
        />
      )}

      <div className="grid gap-3">
        {topics.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Link
                  to={`/home/topics/${t.id}`}
                  className="flex flex-wrap items-center gap-2 font-medium hover:text-primary"
                >
                  {t.title}
                  {t.isGlobal && (
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="size-3" /> Global
                    </Badge>
                  )}
                  {t.isLocked && (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="size-3" /> Locked
                    </Badge>
                  )}
                </Link>
                {t.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t.createdByName ?? 'Unknown'} · {formatDate(t.createdAt)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <MessageSquare className="size-4" />
                {t.commentCount ?? 0}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
