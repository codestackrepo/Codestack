import { apiClient } from '@/lib/api-client';
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

  async verify(): Promise<User> {
    const { data } = await apiClient.get<{ user: User; isValid: boolean }>('/auth/verify');
    return data.user;
  },
};
