import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { notificationsApi } from '../api/notifications.api';
import type { Notification } from '@/types/notification';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unread?: boolean) => ['notifications', 'list', { unread: !!unread }] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    staleTime: 30_000,
  });
}

export function useNotificationsList(unread?: boolean) {
  return useQuery({
    queryKey: notificationKeys.list(unread),
    queryFn: () => notificationsApi.list(1, 20, unread),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/**
 * Live pushes over /ws/notifications. WebSocket-primary; REST stays the source
 * of truth — on (re)connect we invalidate so a disconnect never desyncs the
 * badge. Mount once (in the navbar bell) so pushes arrive app-wide.
 */
export function useNotificationSocket() {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = io('/ws/notifications', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('notification.created', (n: Notification) => {
      toast.info(n.title, { description: n.message });
      qc.setQueryData<{ count: number }>(notificationKeys.unreadCount, (prev) => ({
        count: (prev?.count ?? 0) + 1,
      }));
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    });

    socket.on('connect', () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    });

    return () => {
      socket.disconnect();
    };
  }, [qc]);
}
