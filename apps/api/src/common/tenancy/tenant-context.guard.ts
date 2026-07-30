import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOWS_UNASSIGNED_KEY } from '../decorators/allows-unassigned.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user';
import { OrganizationCache } from '../../modules/organizations/organization-cache.service';
import { OrganizationStatus } from '../../modules/organizations/enums/organization.enums';

/**
 * Coarse per-request tenant gate. Registered as a global guard at APP_GUARD slot 2
 * (`auth.module.ts`), directly after the JwtAuthGuard that re-stamps
 * `request.user` from the fresh DB row — so the org it reads here is the org the
 * user has NOW, not the one their token was minted with.
 *
 * Fine-grained row isolation is NOT this guard's job — that stays in scopeToOrg
 * at the service layer (#50). This only rejects the two whole-tenant conditions:
 * a non-superadmin with no org, and a member of a suspended org.
 *
 * The org-less rejection has one exemption, `@AllowsUnassigned()` (#104), which
 * is what lets a self-registered student reach the small set of owner- and
 * token-scoped handlers their holding state depends on — `/auth/verify` above
 * all, without which the frontend cannot even tell them why they are confined.
 * Note there is deliberately NO `role === STUDENT` sub-gate on that exemption: an
 * org-less ADMIN or PROFESSOR (a mis-provisioned row) would otherwise 403 on
 * `/auth/verify` and loop /login -> verify 403 -> /login with no diagnostic.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly orgs: OrganizationCache,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === Role.SUPERADMIN) return true; // cross-org, org-less

    // The org-less branch precedes the suspension lookup on purpose: there is no
    // org id to look up, and getStatus(null) must never be reached.
    if (!user.organizationId) {
      const allowsUnassigned = this.reflector.getAllAndOverride<boolean>(ALLOWS_UNASSIGNED_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (allowsUnassigned) return true;
      throw new ForbiddenException({ reason: 'no_organization' });
    }

    if (this.orgs.getStatus(user.organizationId) === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException({ reason: 'org_suspended' });
    }
    return true;
  }
}
