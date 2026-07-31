import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  type AcceptInviteInput,
  type LoginInput,
  type QuotaSnapshot,
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
  /** Per-resource quotas; null for a SuperAdmin. `limit: null` means UNLIMITED. */
  quotas: Record<'max_users' | 'max_problems' | 'max_assignments', QuotaSnapshot> | null;
  /** True for a non-superadmin with no organization — routed to /pending. */
  isUnassigned: boolean;
  isLoading: boolean;
  /**
   * The `reason` from a failed /auth/verify, so ProtectedRoute can tell a
   * suspended tenant from a plain unauthenticated visitor.
   */
  sessionError: ApiErrorBody | null;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  acceptInvite: (input: AcceptInviteInput) => Promise<User>;
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

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'session'] }),
  });

  // The third cookie-minting call. Routed through here so all three share one
  // invalidation rather than each page remembering to refetch the session.
  const acceptInviteMutation = useMutation({
    mutationFn: authApi.acceptInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout, // clears the httpOnly cookies server-side
    onSuccess: () => queryClient.setQueryData(SESSION_QUERY_KEY, null),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      organization: sessionQuery.data?.organization ?? null,
      modules: sessionQuery.data?.modules ?? null,
      quotas: sessionQuery.data?.quotas ?? null,
      isUnassigned: sessionQuery.data?.isUnassigned ?? false,
      isLoading: sessionQuery.isLoading,
      sessionError: parseSessionError(sessionQuery.error),
      login: loginMutation.mutateAsync,
      register: registerMutation.mutateAsync,
      acceptInvite: acceptInviteMutation.mutateAsync,
      logout: logoutMutation.mutateAsync,
    }),
    [
      sessionQuery.data,
      sessionQuery.isLoading,
      sessionQuery.error,
      loginMutation.mutateAsync,
      registerMutation.mutateAsync,
      acceptInviteMutation.mutateAsync,
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
