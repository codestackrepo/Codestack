import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import type { ApiErrorBody } from '@/types/common';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

/**
 * Never intercept 401s from these paths — retrying them would loop forever.
 *
 * The invite entries are the EXACT public paths, not the prefix '/invites/':
 * matching is `url.includes(p)`, so a prefix would also strip refresh-and-retry
 * from the AUTHENTICATED row actions `/invites/:id/resend` and `/invites/:id/revoke`,
 * which legitimately need it.
 */
const AUTH_BOOTSTRAP_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/invites/preview',
  '/invites/accept',
];

/** One toast per reason per burst — a page firing six requests should not stack six. */
const recentToasts = new Set<string>();
function toastOnce(key: string, message: string): void {
  if (recentToasts.has(key)) return;
  recentToasts.add(key);
  toast.error(message);
  setTimeout(() => recentToasts.delete(key), 3000);
}

let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  const promise: Promise<void> = apiClient
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  refreshPromise = promise;
  return promise;
}

// On a 401, refresh the access-token cookie once and retry the original
// request — the access/refresh tokens are httpOnly cookies the browser
// already sends, so there's no token to read/attach here, just a single
// retry after the refresh endpoint has re-set them. Concurrent 401s share
// one in-flight refresh (refreshPromise) instead of each firing their own.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetryableConfig | undefined;

    if (error.response?.status === 403) {
      const reason = error.response.data?.reason;
      // `/auth/verify` is NOT @Public and TenantContextGuard sits at slot 2, so a
      // tenant-level 403 comes back from verify itself. Invalidating the session
      // on THAT is an infinite refetch, and the redirect it triggers is a
      // /login -> verify 403 -> /login bounce. Every branch below is gated on it.
      const isVerify = config?.url?.includes('/auth/verify') ?? false;

      // A module disabled server-side (§9.7, #31) — independent of the 401 flow.
      // Covers the race where a module is turned off while the user sits on its
      // page: toast, then refetch the session so RequireModule re-evaluates and
      // redirects to /home. No full reload — the guard handles navigation.
      if (reason === 'module_disabled' && !isVerify) {
        toastOnce(reason, 'This section has been disabled by your administrator.');
        void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
        return Promise.reject(error);
      }

      // The tenant-level rejections. Refetching the session is what moves the user
      // to /pending or /suspended, since ProtectedRoute reads it.
      if ((reason === 'no_organization' || reason === 'org_suspended') && !isVerify) {
        toastOnce(
          reason,
          reason === 'org_suspended'
            ? 'Your organization has been suspended.'
            : 'You are not yet part of an organization.',
        );
        void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
        return Promise.reject(error);
      }
      return Promise.reject(error);
    }

    const isAuthBootstrap = AUTH_BOOTSTRAP_PATHS.some((p) => config?.url?.includes(p));

    if (error.response?.status !== 401 || !config || config._retried || isAuthBootstrap) {
      return Promise.reject(error);
    }

    config._retried = true;
    try {
      await refreshSession(); // re-set the httpOnly access-token cookie, once
      return apiClient(config);
    } catch {
      return Promise.reject(error);
    }
  },
);

export function parseApiError(error: unknown): ApiErrorBody {
  if (axios.isAxiosError(error) && error.response?.data) {
    return error.response.data as ApiErrorBody;
  }
  return {
    statusCode: 0,
    message: error instanceof Error ? error.message : 'An unexpected error occurred',
    error: 'NetworkError',
    path: '',
    timestamp: new Date().toISOString(),
  };
}
