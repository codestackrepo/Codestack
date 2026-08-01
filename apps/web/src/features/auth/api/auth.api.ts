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
   *
   * Must list every member of the server's `QuotaResource`: `getUsageSummary` maps
   * over `ALL_QUOTA_RESOURCES`, so a key missing here is a field that arrives at
   * runtime but cannot be read without a type error. The two per-role seat caps
   * (#118) were in that state.
   */
  quotas: Record<QuotaResourceKey, QuotaSnapshot> | null;
  /** True for a non-superadmin with no organization — the confined holding state. */
  isUnassigned: boolean;
  /**
   * How the account was created — provenance, and immutable (#118).
   *
   * NOT what to branch on for branding. An open-platform student who accepts a
   * university invite keeps `'open'` forever while genuinely being a member of that
   * university, so the ecosystem question is answered by `organization.type`
   * (`'community'` = the shared open tenant = render plain CodeStack).
   */
  origin: 'closed' | 'open';
  /**
   * Whether the address is confirmed. Effectively always true for a live session,
   * since an unverified account cannot log in — present for rendering, not gating.
   */
  emailVerified: boolean;
  isValid: boolean;
}

/** Mirrors the server's `QuotaResource` enum (`quota-resource.enum.ts`). */
export type QuotaResourceKey =
  'max_users' | 'max_problems' | 'max_assignments' | 'max_professors' | 'max_students';

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

/** What `GET /auth/verify-email/:token/preview` answers. Never throws server-side. */
export interface VerificationPreview {
  status: 'valid' | 'expired' | 'used' | 'not_found';
  /** Present only for `valid` — masked, e.g. `ad••••••••@example.edu`. */
  maskedEmail?: string;
}

export const authApi = {
  async login(input: LoginInput): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>('/auth/login', input);
    return data.user;
  },

  /**
   * Signup. Returns only a message, and mints NO session (#118).
   *
   * The response is deliberately identical whether an account was created, the
   * address was already taken, or a pending signup was re-sent its link — the server
   * will not say which, because `users.email` is unique and this endpoint is public.
   * So there is no user to return and nothing for the caller to branch on: the only
   * correct UI is "check your inbox".
   */
  async register(input: RegisterInput): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/auth/register', input);
    return data;
  },

  /** Describes a verification token without consuming it. Never 4xxs. */
  async previewVerification(token: string): Promise<VerificationPreview> {
    const { data } = await apiClient.get<VerificationPreview>(
      `/auth/verify-email/${encodeURIComponent(token)}/preview`,
    );
    return data;
  },

  /**
   * Consumes the token, confirms the address and MINTS COOKIES — the third
   * cookie-minting call alongside login and acceptInvite, which is why it belongs in
   * AuthContext rather than being called directly. The link is how a verified
   * account gets its first session.
   */
  async verifyEmail(token: string): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>('/auth/verify-email', { token });
    return data.user;
  },

  /** Uniform 200 whatever the address turns out to be. Nothing to branch on. */
  async resendVerification(email: string): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/auth/resend-verification', {
      email,
    });
    return data;
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
