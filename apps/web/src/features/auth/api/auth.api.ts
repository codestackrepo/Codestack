import { apiClient } from '@/lib/api-client';
import type { ModuleMap } from '@/types/common';
import type { User } from '@/types/user';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Professor invite token (from an invite link) — elevates the new account. */
}

export const authApi = {
  async login(input: LoginInput): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>('/auth/login', input);
    return data.user;
  },

  async register(input: RegisterInput): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>('/auth/register', input);
    return data.user;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async verify(): Promise<{ user: User; modules: ModuleMap }> {
    const { data } = await apiClient.get<{ user: User; isValid: boolean; modules: ModuleMap }>(
      '/auth/verify',
    );
    return { user: data.user, modules: data.modules };
  },
};
