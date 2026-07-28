import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { FeatureKey } from '../enums/feature-key.enum';
import { isFeatureGatedRouter } from '../feature-gated-routers';
import { ModuleAccessService } from '../module-access.service';

/**
 * Global feature guard (#64), wired as an APP_GUARD alongside ModuleAccessGuard.
 * Resolves `@RequiresFeature` through the 8-layer precedence, so a feature is
 * reachable only if its module is, its role ceiling allows it, and no SuperAdmin
 * grant cap revoked it for the org.
 *
 * 403 `entitlement_required` — deliberately distinct from `module_disabled` (the
 * whole area is off, so the UI should redirect) and from 409 `quota_exceeded` (a
 * numeric limit, so the UI shows the numbers). Here the area is present but this
 * capability is not, so the UI should disable the control in place.
 *
 * Un-annotated routes pass, EXCEPT under a controller that opted into
 * deny-by-default (see FEATURE_GATED_ROUTER_PATHS): there, a missing annotation is
 * an entitlement hole, so it fails closed and logs what to annotate.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  private readonly logger = new Logger(FeatureGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly access: ModuleAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required) return this.allowUnannotated(ctx);

    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === Role.SUPERADMIN) return true; // layer 0, short-circuited

    const enabled = await this.access.isEnabled(required, user.role, user.organizationId);
    if (!enabled) {
      throw new ForbiddenException({ reason: 'entitlement_required', feature: required });
    }
    return true;
  }

  /**
   * No metadata: allow, unless this controller opted into fail-closed — in which
   * case an un-annotated route is a bug, and shipping it ungated is the failure
   * mode §9.11 exists to prevent.
   */
  private allowUnannotated(ctx: ExecutionContext): boolean {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, ctx.getClass()) as string | undefined;
    if (!isFeatureGatedRouter(controllerPath)) return true;

    this.logger.error(
      `${ctx.getClass().name}.${ctx.getHandler().name} is on a feature-gated router ` +
        `('${controllerPath}') but has no @RequiresFeature — denying. Annotate it.`,
    );
    throw new ForbiddenException({ reason: 'entitlement_required', feature: null });
  }
}
