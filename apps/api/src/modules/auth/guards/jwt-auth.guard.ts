import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { toAuthenticatedUser } from '../authenticated-user.util';

/**
 * Global authentication guard — APP_GUARD slot 1, single path: the httpOnly
 * access-token cookie via the passport 'jwt' strategy.
 *
 * It does one thing more than verify the cookie: it RE-STAMPS `request.user` from
 * the freshly-read DB row. `JwtStrategy.validate` can only see the token, so
 * without the re-stamp every downstream gate reads a snapshot up to
 * `JWT_ACCESS_TTL` old, and three things silently stop working:
 *
 *  - a student who was just assigned to an org keeps 403ing `no_organization`
 *    at `TenantContextGuard` until their token expires;
 *  - a revoke is not immediate — the disabled account keeps working;
 *  - a role change does not bind until re-login.
 *
 * The cost is one indexed primary-key read per authenticated request, which is
 * the same read the retired dual-auth guard already did for its `isActive`
 * check — so this is a re-projection, not an extra query.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public FIRST, before any cookie or DB work — a @Public route must never
    // depend on the database being reachable.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!(await super.canActivate(context))) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const authed = request.user as AuthenticatedUser | undefined;
    if (!authed) throw new UnauthorizedException();

    const local = await this.findById(authed.id);
    if (!local || !local.isActive) throw new UnauthorizedException('Account disabled');

    // Authoritative for role + organizationId. Overwrites what passport read out
    // of the token, deliberately.
    request.user = toAuthenticatedUser(local);
    return true;
  }

  /**
   * A signed token whose `sub` is not a uuid reaches the driver as an invalid
   * `uuid` literal and surfaces as a 500. It is an authentication failure, so it
   * answers 401 like every other unusable token.
   */
  private async findById(id: string): Promise<User | null> {
    try {
      return await this.users.findById(id);
    } catch {
      throw new UnauthorizedException();
    }
  }
}
