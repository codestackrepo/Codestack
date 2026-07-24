import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { AppModuleKey, Role } from '@/types/common';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}

/** Nest inside <ProtectedRoute> to additionally restrict by role (admin always passes). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== Role.ADMIN && !roles.includes(user.role)) {
    return <Navigate to="/home" replace />;
  }
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
