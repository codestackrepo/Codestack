import { Injectable } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ModuleAccessService } from '../module-access/module-access.service';
import { OrganizationSummaryDto } from '../organizations/dto/organization-summary.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { SessionContextDto } from './dto/session-context.dto';

/**
 * Assembles the single GET /auth/verify session contract (#54) from the
 * subsystems that own each field. This is the seam the plan mandates: new
 * contributors (features #64, quotas #66) inject their service HERE and fill
 * their field — the auth controller is never edited again ("no parallel
 * controller edits", §6 shared-file ownership).
 *
 * Identity is always re-read fresh from the DB (authoritative for role/org),
 * never trusted from the possibly-stale session token, so a just-elevated or
 * just-moved user gets the correct modules/org on the next verify.
 */
@Injectable()
export class SessionContextService {
  constructor(
    private readonly users: UsersService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly organizations: OrganizationsService,
  ) {}

  async build(actor: AuthenticatedUser): Promise<SessionContextDto> {
    const user = await this.users.getById(actor.id);

    const org = user.organizationId ? await this.organizations.findById(user.organizationId) : null;

    return {
      user: UserResponseDto.from(user),
      organization: org ? OrganizationSummaryDto.from(org) : null,
      isSuperAdmin: user.role === Role.SUPERADMIN,
      modules: this.moduleAccess.effectiveMapForRole(user.role),
      // Populated by their subsystems as they land — the field exists now so the
      // client contract is stable across the M2 rollout.
      features: {}, // #64 per-org feature flags
      quotas: null, // #66 per-org quota limits + usage
      isValid: true,
    };
  }
}
