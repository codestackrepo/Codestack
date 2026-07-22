import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/common';
import type { Notification } from '@/types/notification';

export const notificationsApi = {
  async list(page = 1, limit = 20, unread?: boolean): Promise<PaginatedResult<Notification>> {
    const { data } = await apiClient.get<PaginatedResult<Notification>>('/notifications', {
      params: { page, limit, ...(unread ? { unread: true } : {}) },
    });
    return data;
  },

  async unreadCount(): Promise<{ count: number }> {
    const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
    return data;
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<{ updated: number }> {
    const { data } = await apiClient.post<{ updated: number }>('/notifications/read-all');
    return data;
  },
};
