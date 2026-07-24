import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Role } from '@/types/common';

/**
 * Admin user-management row — mirrors the backend `UserResponseDto` (#40).
 * `lastLoginAt`/`createdAt` arrive as ISO strings on the wire (JSON), not Date.
 */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Admin-editable fields. `UsersService.update` honors `role`/`isActive` only
 * when the actor is an admin — everyone else's changes to them are ignored.
 */
export interface UpdateUserInput {
  role?: Role;
  isActive?: boolean;
}

export const usersApi = {
  async list(page = 1, limit = 20): Promise<PaginatedResult<AdminUser>> {
    const { data } = await apiClient.get<PaginatedResult<AdminUser>>('/users', {
      params: { page, limit },
    });
    return data;
  },

  async update(id: string, input: UpdateUserInput): Promise<AdminUser> {
    const { data } = await apiClient.patch<AdminUser>(`/users/${id}`, input);
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/users/${id}`);
  },
};
