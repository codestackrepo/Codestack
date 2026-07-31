import { apiClient } from '@/lib/api-client';
import type { ModuleMap } from '@/types/common';
import type { OrganizationSummary } from '@/types/organization';
import type { User } from '@/types/user';

/**
 * Mirrors `SessionContextDto` (api: auth/dto/session-context.dto.ts) in full.
 *
 * `verify` used to discard everything but `{user, modules}`, so the client could
 * not tell an org-less student from a SuperAdmin, could not name the org in a
 * heading, and could not read a quota. The whole contract is returned now.
 */
export interface SessionContext {
  user: User;
  organization: OrganizationSummary | null;
  isSuperAdmin: boolean;
  modules: ModuleMap;
  features: Record<string, boolean>;
  /**
   * Per-resource quotas, or null for a SuperAdmin (charged to no tenant). Keys are
   * SNAKE_CASE — they come straight from the org_quotas resource strings.
   */
  quotas: Record<'max_users' | 'max_problems' | 'max_assignments', QuotaSnapshot> | null;
  /** True for a non-superadmin with no organization — the confined holding state. */
  isUnassigned: boolean;
  isValid: boolean;
}

/**
 * The per-resource shape inside `quotas`, mirroring `QuotaUsageDto`.
 *
 * `limit: null` means UNLIMITED and `0` means BLOCKED — never interchangeable.
 * `remaining` and `exceeded` are DERIVED SERVER-SIDE (#71) and must be rendered as
 * given: re-deriving them here would put the null-vs-0 arithmetic in a second
 * place, and `limit ?? 0` is how an uncapped org becomes a blocked one.
 */
export interface QuotaSnapshot {
  used: number;
  limit: number | null;
  /** null when unlimited; floored at 0. */
  remaining: number | null;
  exceeded: boolean;
}

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

export interface AcceptInviteInput {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
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

  async verify(): Promise<SessionContext> {
    const { data } = await apiClient.get<SessionContext>('/auth/verify');
    return data;
  },

  /**
   * Public. Mints cookies on success exactly as login and register do, which is
   * why it goes through AuthContext rather than being called directly — all three
   * share one session invalidation.
   */
  async acceptInvite(input: AcceptInviteInput): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>('/invites/accept', input);
    return data.user;
  },
};
