import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLE_RANK, Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Enforces @Roles(...) on a handler/controller. Runs after the auth guard, so
 * request.user is populated. Rank-aware (§RBAC): SUPERADMIN passes every gate;
 * any other actor passes when its rank ≥ the lowest required rank — so ADMIN
 * still passes every `@Roles(ADMIN, ...)` route exactly as before, but is now
 * blocked from `@Roles(SUPERADMIN)` routes. (There is no `@Roles(STUDENT)`
 * exclusive route, so "minimum rank" is behaviour-preserving for all callers.)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === Role.SUPERADMIN) return true; // top of the hierarchy
    const minRank = Math.min(...required.map((r) => ROLE_RANK[r]));
    if (ROLE_RANK[user.role] >= minRank) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
