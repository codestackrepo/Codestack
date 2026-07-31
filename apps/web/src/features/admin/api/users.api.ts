import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Role } from '@/types/common';
import type { User } from '@/types/user';

/**
 * `types/user.ts`'s `User` IS the admin row — both mirror `UserResponseDto`, and
 * the duplicate declared here drifted from it the moment the DTO gained
 * `organizationId`. Aliased rather than re-declared so existing imports keep
 * working while there is only one shape.
 */
export type AdminUser = User;

/** Filters accepted by `GET /users` (api: users/dto/list-users-query.dto.ts). */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  role?: Role;
  isActive?: boolean;
  q?: string;
}

/**
 * Admin-editable fields. `UsersService.update` honors `role`/`isActive` only
 * when the actor is an admin — everyone else's changes to them are ignored.
 */
export interface UpdateUserInput {
  role?: Role;
  isActive?: boolean;
}

/** Keys with the filter object LAST, so `['admin','users']` clears every permutation. */
export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...adminUserKeys.all, 'list'] as const,
  list: (params: ListUsersParams) => [...adminUserKeys.lists(), params] as const,
  unassigned: (params: { page?: number; q?: string }) =>
    [...adminUserKeys.all, 'unassigned', params] as const,
};

export const usersApi = {
  async list(params: ListUsersParams = {}): Promise<PaginatedResult<AdminUser>> {
    const { page = 1, limit = 20, ...filters } = params;
    const { data } = await apiClient.get<PaginatedResult<AdminUser>>('/users', {
      // Undefined filters are dropped by axios, which matters: the global pipe
      // runs forbidNonWhitelisted, and an explicit `undefined` would serialise.
      params: { page, limit, ...filters },
    });
    return data;
  },

  /** Org-less students awaiting assignment. `@Roles(ADMIN, PROFESSOR)`. */
  async listUnassigned(params: { page?: number; limit?: number; q?: string } = {}) {
    const { data } = await apiClient.get<PaginatedResult<AdminUser>>('/users/unassigned', {
      params: { page: 1, limit: 20, ...params },
    });
    return data;
  },

  /** Places an unassigned student into the ACTOR's org — no org parameter exists. */
  async assignToMyOrg(id: string): Promise<AdminUser> {
    const { data } = await apiClient.post<AdminUser>(`/users/${id}/assign-organization`);
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
