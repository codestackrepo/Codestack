import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  type AcceptInviteInput,
  type LoginInput,
  type QuotaSnapshot,
  type QuotaResourceKey,
  type RegisterInput,
} from '../api/auth.api';
import type { ApiErrorBody, ModuleMap } from '@/types/common';
import type { OrganizationSummary } from '@/types/organization';
import type { User } from '@/types/user';

interface AuthContextValue {
  user: User | null;
  /** The user's org, or null for a SuperAdmin and for an unassigned student. */
  organization: OrganizationSummary | null;
  /** Effective per-role module map from `/auth/verify`; null while the session loads. */
  modules: ModuleMap | null;
  /**
   * Feature × role entitlements resolved for THIS user (#72). Already on
   * `/auth/verify` — `SessionContextService` builds it from `effectiveFeatureMap`,
   * so it is the same 8-layer answer `FeatureGuard` gives, not a client guess.
   */
  features: Record<string, boolean> | null;
  /**
   * Per-resource quotas; null for a SuperAdmin. `limit: null` means UNLIMITED.
   * Keys are defined once, next to the session contract they arrive on.
   */
  quotas: Record<QuotaResourceKey, QuotaSnapshot> | null;
  /** True for a non-superadmin with no organization — routed to /pending. */
  isUnassigned: boolean;
  isLoading: boolean;
  /**
   * The `reason` from a failed /auth/verify, so ProtectedRoute can tell a
   * suspended tenant from a plain unauthenticated visitor.
   */
  sessionError: ApiErrorBody | null;
  /**
   * How the account was created — provenance, immutable (#118). For "should this
   * render as a co-branded ecosystem?" read `organization.type` instead: an open
   * student who joins a university is `'open'` forever but renders as a member.
   */
  origin: 'closed' | 'open' | null;
  login: (input: LoginInput) => Promise<User>;
  /**
   * Signup. Resolves to a MESSAGE, not a user, and mints no session — the server
   * answers identically whether an account was created or the address was taken, so
   * there is nothing to branch on and nobody to sign in.
   */
  register: (input: RegisterInput) => Promise<{ message: string }>;
  acceptInvite: (input: AcceptInviteInput) => Promise<User>;
  /** Consumes a verification token. Cookie-minting, hence routed through here. */
  verifyEmail: (token: string) => Promise<User>;
  /** Uniform response; resolves whatever the address turns out to be. */
  resendVerification: (email: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The one session cache key.
 *
 * It used to carry a trailing org id, so `['auth','session']` from the
 * login/register/api-client invalidations only matched it by PREFIX. Writing the
 * key once — and using it for both the query and `setQueryData` — is what makes
 * logout's exact-key write actually hit the row the query reads.
 */
export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: authApi.verify,
    retry: false,
    staleTime: 5 * 60_000,
  });

  // login/register resolve to a bare User (no module map), so we invalidate the
  // session query on success and let `verify` refetch { user, modules } as the
  // single source of truth. logout clears it outright.
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'session'] }),
  });

  /**
   * NO session invalidation on register any more (#118).
   *
   * Signup used to mint cookies, so invalidating made `verify` refetch a live
   * session. It no longer does: the account is unverified and an unverified account
   * may not hold one. Invalidating here would fire a `verify` that 401s, which
   * ProtectedRoute would read as "signed out" and which would clobber the
   * "check your inbox" screen the user is supposed to be looking at.
   */
  const registerMutation = useMutation({ mutationFn: authApi.register });

  // The third cookie-minting call. Routed through here so all three share one
  // invalidation rather than each page remembering to refetch the session.
  const acceptInviteMutation = useMutation({
    mutationFn: authApi.acceptInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  // The FOURTH cookie-minting call, and the one that gives an open signup its first
  // session — the verification link is the way in, which is what makes
  // "no login until verified" tolerable rather than a dead end.
  const verifyEmailMutation = useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  // Mints nothing, so no invalidation: the answer is a fixed message either way.
  const resendVerificationMutation = useMutation({ mutationFn: authApi.resendVerification });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout, // clears the httpOnly cookies server-side
    onSuccess: () => {
      /*
       * CLEAR THE WHOLE CACHE, not just the session (#72).
       *
       * This previously only nulled the session key, which left every other cached
       * response in place: `['assignments','list']`, `['classrooms','list','all']`,
       * `['problems','list',...]`, the module-access matrix, and so on. Sign out,
       * sign in as somebody from a DIFFERENT organization on the same browser
       * profile, and React Query serves the previous tenant's rows from cache until
       * each refetch lands — visible data belonging to an org the new user is not in.
       *
       * Scoping keys by org (below, and in the problems list) narrows that, but it
       * cannot fix it on its own: any key without an org in it still collides. The
       * identity changed, so nothing cached under the old one is valid.
       *
       * clear() BEFORE seeding null, or the seed is wiped by the clear and
       * ProtectedRoute sees "loading" instead of "signed out".
       */
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      organization: sessionQuery.data?.organization ?? null,
      modules: sessionQuery.data?.modules ?? null,
      features: sessionQuery.data?.features ?? null,
      quotas: sessionQuery.data?.quotas ?? null,
      isUnassigned: sessionQuery.data?.isUnassigned ?? false,
      isLoading: sessionQuery.isLoading,
      sessionError: parseSessionError(sessionQuery.error),
      origin: sessionQuery.data?.origin ?? null,
      login: loginMutation.mutateAsync,
      register: registerMutation.mutateAsync,
      acceptInvite: acceptInviteMutation.mutateAsync,
      verifyEmail: verifyEmailMutation.mutateAsync,
      resendVerification: resendVerificationMutation.mutateAsync,
      logout: logoutMutation.mutateAsync,
    }),
    [
      sessionQuery.data,
      sessionQuery.isLoading,
      sessionQuery.error,
      loginMutation.mutateAsync,
      registerMutation.mutateAsync,
      acceptInviteMutation.mutateAsync,
      verifyEmailMutation.mutateAsync,
      resendVerificationMutation.mutateAsync,
      logoutMutation.mutateAsync,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Extracts the API error body from a failed session query, if there is one. */
function parseSessionError(error: unknown): ApiErrorBody | null {
  if (!error) return null;
  const body = (error as { response?: { data?: ApiErrorBody } }).response?.data;
  return body ?? null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
