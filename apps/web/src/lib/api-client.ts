import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { CROSS_CUTTING_REASONS } from '@/lib/toast-reasons';
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
  // #118. All @Public, and all reachable by someone with NO session — an unverified
  // signup and a stranger applying have nothing to refresh. Listed for the same reason
  // the entries above are: a refresh-and-retry on a path that can never be authenticated
  // is a wasted round trip at best, and these are the paths most likely to be hit by a
  // browser that holds a stale or absent cookie.
  '/auth/verify-email',
  '/auth/resend-verification',
  '/organization-applications',
  '/professor-applications',
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

      // A FEATURE denied by the 8-layer resolver (#64/#65). The reason string is
      // `entitlement_required`, NOT `feature_disabled` — FeatureGuard throws
      // `{ reason: 'entitlement_required', feature }`, and `feature` is null on the
      // fail-closed branch, so nothing may assume it is present.
      if (reason === 'entitlement_required' && !isVerify) {
        toastOnce(reason, 'Your organization does not have access to this capability.');
        // Same reasoning as module_disabled: refetch so RequireFeature re-evaluates
        // rather than leaving the user on a page whose controls all fail.
        void queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
        return Promise.reject(error);
      }

      /*
       * #118. A member of the open community tenant hit an org-staff surface.
       *
       * Cross-cutting like the two above — it can come back from the member list, the
       * unassigned pool, search, or any invite route — so it is handled here rather
       * than at four call sites.
       *
       * NO session invalidation, unlike the cases around it. Those refetch because the
       * user's entitlements may have just changed and the guards need to re-evaluate.
       * Nothing has changed here: being in the community tenant is a stable fact, and a
       * refetch would return the identical session while making a failed click look like
       * a state transition.
       */
      if (reason === 'community_restricted' && !isVerify) {
        toastOnce(reason, CROSS_CUTTING_REASONS.community_restricted);
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

    // 409 quota_exceeded is deliberately NOT handled here.
    //
    // A global toast would be actively worse than nothing: the body carries
    // `limit`, `current`, `attempted` and `wouldBe`, and those numbers are the whole
    // answer to "why was I blocked and what do I do". The create call-sites render
    // them (bulk invite has done so since #106), so this passes the error through
    // untouched rather than replacing a precise explanation with a vague one.
    //
    // Listed explicitly so nobody adds a handler here later thinking it was missed.

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
