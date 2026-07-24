import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { AppModuleKey, Role, atLeast } from '@/types/common';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}

/**
 * Nest inside <ProtectedRoute> to additionally restrict by role. Rank-aware:
 * an actor passes when it outranks or equals the lowest required role (so
 * SUPERADMIN and ADMIN still pass every existing staff route), mirroring the
 * backend RolesGuard.
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.some((r) => atLeast(user.role, r))) {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
}

/**
 * Platform-only gate. Unlike the module/feature gates it fails CLOSED: it blocks
 * until the session resolves and then requires an explicit SUPERADMIN role,
 * never defaulting visible.
 */
export function RequireSuperAdmin() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user || user.role !== Role.SUPERADMIN) return <Navigate to="/home" replace />;
  return <Outlet />;
}

/**
 * Nest inside <ProtectedRoute> to gate a route on a toggleable module (§9.8).
 * Admin always passes; a disabled module redirects to /home. Cosmetic only —
 * the backend guard (#31) is the real enforcement.
 */
export function RequireModule({ module }: { module: AppModuleKey }) {
  const { user } = useAuth();
  const { canAccess } = useModuleAccess();
  if (!user) return null;
  if (!canAccess(module)) return <Navigate to="/home" replace />;
  return <Outlet />;
}
