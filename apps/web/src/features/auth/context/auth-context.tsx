import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginInput, type RegisterInput } from '../api/auth.api';
import type { ModuleMap } from '@/types/common';
import type { User } from '@/types/user';

const SESSION_QUERY_KEY = ['auth', 'session'] as const;

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => queryClient.setQueryData(SESSION_QUERY_KEY, null),
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
