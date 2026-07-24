import { useAuth } from '../context/auth-context';
import { AppModuleKey, Role } from '@/types/common';

/**
 * UX-only module gate. `canAccess` is a pure function of (user, modules, key):
 * admins always pass; a not-yet-loaded map fails open (the backend guard is the
 * real enforcement, and `ProtectedRoute` already blocks on `isLoading`, so we
 * avoid a flash of an empty app); an unknown key defaults visible.
 *
 * This is never a security boundary — every disabled module must still 403
 * server-side (#31).
 */
export function useModuleAccess() {
  const { user, modules } = useAuth();

  const canAccess = (key: AppModuleKey): boolean => {
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (!modules) return true;
    return modules[key] ?? true;
  };

  return { modules, canAccess };
}
