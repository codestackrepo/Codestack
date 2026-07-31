import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/auth-context';
import { useModuleAccess } from '@/features/auth/hooks/use-module-access';
import { AppModuleKey, Role, atLeast } from '@/types/common';

export function ProtectedRoute() {
  const { user, isLoading, sessionError } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  // A suspended tenant fails /auth/verify with a reason rather than a 401, so it
  // must be distinguished BEFORE the unauthenticated branch — otherwise every
  // member of a suspended org is bounced to /login, signs in fine, and bounces
  // again, with nothing on screen explaining why.
  if (sessionError?.reason === 'org_suspended') return <Navigate to="/suspended" replace />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // A SUPERADMIN is org-less BY DESIGN (chk_users_org_required) and must not be
  // trapped in the holding state — the exclusion is the whole reason this is not
  // just `organizationId === null`.
  const awaitingOrg = user.role !== Role.SUPERADMIN && user.organizationId === null;
  const onPending = location.pathname.startsWith('/pending');

  if (awaitingOrg && !onPending) return <Navigate to="/pending" replace />;
  // The INVERSE redirect matters as much: without it /pending is a dead end after
  // staff assign the student, since nothing else would ever navigate them away.
  if (!awaitingOrg && onPending) return <Navigate to="/home" replace />;

  return <Outlet />;
}

/**
 * Nest inside <ProtectedRoute> to additionally restrict by role. Rank-aware:
 * an actor passes when it outranks or equals the lowest required role (so
 * SUPERADMIN and ADMIN still pass every existing staff route), mirroring the
 * backend RolesGuard.
 */
export function RequireRole({ roles, exclude = [] }: { roles: Role[]; exclude?: Role[] }) {
  const { user } = useAuth();
  if (!user) return null;
  // `exclude` exists because rank-awareness cuts the wrong way for the org
  // console: roles={[PROFESSOR]} passes a SUPERADMIN, and scopeToOrg no-ops for
  // them — so a SuperAdmin landing on /home/admin/users would get a CROSS-ORG
  // list under an "Everyone in {organization.name}" heading where `organization`
  // is null. Hiding the sidebar link does not gate the route.
  if (exclude.includes(user.role)) return <Navigate to="/home" replace />;
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
