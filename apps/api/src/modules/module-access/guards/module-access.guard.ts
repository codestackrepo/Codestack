import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { ModuleAccessService } from '../module-access.service';

/**
 * Global module-access guard (after the auth + roles guards): enforces per-role
 * module access. No `@RequiresModule` metadata → pass; `@Public` routes → pass
 * (no user by design); SUPERADMIN → bypass. Every other role (incl. ADMIN) is
 * resolved through `ModuleAccessService.isEnabled`, which keeps ADMIN enabled
 * today but becomes the seam where a SuperAdmin org-grant can gate an org's
 * admin (#64). Throws 403 `module_disabled` when the module is off for the role.
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ModuleAccessService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
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
    if (!this.access.isEnabled(required, user.role)) {
      throw new ForbiddenException({ reason: 'module_disabled', module: required });
    }
    return true;
  }
}
