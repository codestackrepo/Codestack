import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { ModuleAccessService } from '../module-access.service';

/**
 * 3rd global guard (after JwtAuthGuard + RolesGuard): enforces per-role module
 * access. No `@RequiresModule` metadata → pass; `@Public` routes → pass (no user
 * by design); admin → bypass. Otherwise throws 403 `module_disabled` when the
 * caller's role has the required module turned off.
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
    if (user.role === Role.ADMIN) return true; // admin never locked out
    if (!this.access.isEnabled(required, user.role)) {
      throw new ForbiddenException({ reason: 'module_disabled', module: required });
    }
    return true;
  }
}
