import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginInput, type RegisterInput } from '../api/auth.api';
import type { ModuleMap } from '@/types/common';
import type { User } from '@/types/user';

interface AuthContextValue {
  user: User | null;
  /** Effective per-role module map from `/auth/verify`; null while the session loads. */
  modules: ModuleMap | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /** Clerk mode (#59): logout signs out of Clerk instead of hitting /auth/logout. */
  clerkEnabled?: boolean;
  /** Active Clerk org id — keyed into the session query so switching orgs refetches. */
  clerkOrgId?: string | null;
  clerkSignOut?: () => Promise<void>;
}

export function AuthProvider({
  children,
  clerkEnabled = false,
  clerkOrgId = null,
  clerkSignOut,
}: AuthProviderProps) {
  const queryClient = useQueryClient();

  // Org id is part of the key so the OrganizationSwitcher (#59) forces a fresh
  // /auth/verify (new org -> new role/modules) rather than serving a stale session.
  const sessionQueryKey = ['auth', 'session', clerkOrgId] as const;

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
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

  const logoutMutation = useMutation({
    // Clerk mode: sign out of Clerk (clears its session + token); otherwise clear
    // the httpOnly cookies via /auth/logout. Either way, drop the cached session.
    mutationFn: async () => {
      if (clerkEnabled && clerkSignOut) await clerkSignOut();
      else await authApi.logout();
    },
    onSuccess: () => queryClient.setQueryData(sessionQueryKey, null),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      modules: sessionQuery.data?.modules ?? null,
      isLoading: sessionQuery.isLoading,
      login: loginMutation.mutateAsync,
      register: registerMutation.mutateAsync,
      logout: logoutMutation.mutateAsync,
    }),
    [
      sessionQuery.data,
      sessionQuery.isLoading,
      loginMutation.mutateAsync,
      registerMutation.mutateAsync,
      logoutMutation.mutateAsync,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
