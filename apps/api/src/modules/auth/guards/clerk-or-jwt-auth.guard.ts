import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UsersService } from '../../users/users.service';
import { ClerkService } from '../clerk/clerk.service';
import { resolveLocalUserFromClerk, toAuthenticatedUser } from '../clerk/clerk-identity.util';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Unified authn guard (dual-auth #51). APP_GUARD slot 1, replacing JwtAuthGuard.
 * Two independent auth paths, one output contract (request.user = full
 * AuthenticatedUser whose `id` is the LOCAL uuid):
 *   - `Authorization: Bearer <clerk jwt>` present AND Clerk configured -> Clerk
 *     verify + JIT-resolve the local user by clerk_user_id.
 *   - otherwise -> the UNCHANGED passport 'jwt' cookie strategy (super.canActivate).
 * Both paths enforce the local isActive kill-switch and ALWAYS populate
 * request.user (required by AppThrottlerGuard / RolesGuard / @CurrentUser).
 *
 * Extending AuthGuard('jwt') keeps the cookie fallback byte-identical to the
 * retired JwtAuthGuard (just `super.canActivate`), so the app still boots + runs
 * fully on JWT when CLERK_* is unset.
 */
@Injectable()
export class ClerkOrJwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly clerk: ClerkService,
    private readonly users: UsersService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // (1) @Public FIRST — before any Bearer/cookie/DB logic (identical to the
    // retired JwtAuthGuard) so a @Public route hit with a stray Bearer isn't 401'd.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const bearer = this.extractBearer(request);

    // (2) Clerk path — only when a Bearer is present AND Clerk is wired, so
    // cookie-only traffic is untouched and the app boots on JWT with CLERK_* unset.
    if (bearer && this.clerk.isConfigured()) {
      const claims = await this.clerk.verifyToken(bearer); // throws -> 401
      const user = await resolveLocalUserFromClerk(claims, {
        users: this.users,
        clerk: this.clerk,
      });
      if (!user.isActive) throw new UnauthorizedException('Account disabled');
      request.user = toAuthenticatedUser(user); // id = LOCAL uuid, never Clerk sub
      return true;
    }

    // (3) JWT cookie fallback — run the unchanged passport 'jwt' strategy (it sets
    // request.user via JwtStrategy.validate), then enforce isActive (the strategy
    // only validates the signature, not the local kill-switch).
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const authed = request.user as AuthenticatedUser | undefined;
    if (!authed) throw new UnauthorizedException();
    const local = await this.users.findById(authed.id);
    if (!local || !local.isActive) throw new UnauthorizedException('Account disabled');
    return true; // request.user already set by passport (id is the local uuid)
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers?.authorization;
    if (!header) return null;
    return BEARER.exec(header)?.[1] ?? null;
  }
}
