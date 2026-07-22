import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ENTITLEMENT_KEY } from '../decorators/requires-entitlement.decorator';
import { Entitlement } from '../enums/billing.enums';
import { EntitlementService } from '../services/entitlement.service';

/** Runs after the JWT auth guard, so request.user is populated. */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Entitlement | undefined>(ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const allowed = await this.entitlements.hasActiveEntitlement(user.id, required);
    if (!allowed) {
      // Machine-readable reason so the frontend can deep-link to the upsell/pricing page.
      throw new ForbiddenException({ reason: 'entitlement_required', entitlement: required });
    }
    return true;
  }
}
