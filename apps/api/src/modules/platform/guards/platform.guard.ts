import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../../common/enums/role.enum';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { UsersService } from '../../users/users.service';

interface PlatformRequest extends Request {
  user?: AuthenticatedUser;
  isPlatformScope?: boolean;
}

/**
 * Controller-scoped guard for @Platform routes (#62). Platform authority is the
 * highest-privilege gate in the system, so — unlike RolesGuard which trusts the
 * request.user role from the token — this does a FRESH DB read and fails CLOSED:
 * the caller must be an active SUPERADMIN with NO organization. Stamps
 * request.isPlatformScope so downstream code can assert cross-org intent.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const authed = request.user;
    if (!authed) throw new ForbiddenException('Authentication required');

    // Never trust the token's role/org for platform authority — re-read the DB.
    const user = await this.users.findById(authed.id);
    if (!user || !user.isActive || user.role !== Role.SUPERADMIN || user.organizationId !== null) {
      throw new ForbiddenException('Platform access requires an active SuperAdmin');
    }

    request.isPlatformScope = true;
    return true;
  }
}
