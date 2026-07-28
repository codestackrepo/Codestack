import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { ModuleAccessService } from '../module-access.service';

/**
 * Global module-access guard (after the auth + roles guards): enforces per-role,
 * per-ORG module access. No `@RequiresModule` metadata → pass; `@Public` routes →
 * pass (no user by design); SUPERADMIN → bypass.
 *
 * ADMIN's unconditional bypass is GONE from this guard (#64) — every non-superadmin
 * role, admin included, now resolves through `ModuleAccessService.isEnabled`, where
 * admin immunity is layer 3 and a SuperAdmin org grant cap (layer 2) outranks it.
 * That is what makes "this tenant did not buy this module" bind the org's admin too.
 *
 * Throws 403 `module_disabled` when the module is off for the actor.
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
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

    const required = this.reflector.getAllAndOverride<AppModuleKey | undefined>(MODULE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true; // no metadata → allow

    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === Role.SUPERADMIN) return true; // sole unconditional bypass

    if (!(await this.access.isEnabled(required, user.role, user.organizationId))) {
      throw new ForbiddenException({ reason: 'module_disabled', module: required });
    }
    return true;
  }
}
