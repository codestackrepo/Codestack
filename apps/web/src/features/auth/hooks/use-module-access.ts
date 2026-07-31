import { useAuth } from '../context/auth-context';
import { AppModuleKey, Role, atLeast } from '@/types/common';

/**
 * UX-only module gate. `canAccess` is a pure function of (user, modules, key):
 * staff (admin+) always pass; a not-yet-loaded map fails open (the backend guard
 * is the real enforcement, and `ProtectedRoute` already blocks on `isLoading`,
 * so we avoid a flash of an empty app); an unknown key defaults visible.
 *
 * This is never a security boundary — every disabled module must still 403
 * server-side (#31).
 */
export function useModuleAccess() {
  const { user, modules, features } = useAuth();

  const canAccess = (key: AppModuleKey): boolean => {
    if (!user) return false;
    if (atLeast(user.role, Role.ADMIN)) return true; // admin + superadmin
    if (!modules) return true;
    return modules[key] ?? true;
  };

  /**
   * The feature twin of `canAccess` (#72), and it does NOT short-circuit staff.
   *
   * `canAccess` lets admin+ through because a MODULE is a section of the app an
   * admin administers. A FEATURE is a capability, and the resolver applies a
   * non-overridable role ceiling to it — `problems.global` is SuperAdmin-only even
   * for an admin. Copying the admin bypass here would show controls that 403 the
   * moment they are used, which is worse than not showing them.
   *
   * A not-yet-loaded map fails OPEN, matching `canAccess`: the server is the real
   * enforcement, and failing closed would blank the UI on every cold load.
   */
  const canAccessFeature = (key: string): boolean => {
    if (!user) return false;
    if (!features) return true;
    return features[key] ?? true; // unknown key -> visible; the guard still decides
  };

  return { modules, features, canAccess, canAccessFeature };
}
