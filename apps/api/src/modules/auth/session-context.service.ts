import { Injectable } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ModuleAccessService } from '../module-access/module-access.service';
import { QuotaService } from '../quotas/quota.service';
import { OrganizationSummaryDto } from '../organizations/dto/organization-summary.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { QuotaUsageDto } from '../platform/dto/platform-organization-detail.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AppModuleKey, SYSTEM_MODULES } from '../module-access/enums/app-module-key.enum';
import { SessionContextDto } from './dto/session-context.dto';

/**
 * Every module key false except the structural ones. Dashboard/profile/settings
 * stay on so a confined user still has somewhere to land and a way to sign out.
 */
function allFalseExcept(alwaysOn: AppModuleKey[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const key of Object.values(AppModuleKey)) map[key] = false;
  for (const key of alwaysOn) map[key] = true;
  return map;
}

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
    private readonly quotas: QuotaService,
  ) {}

  async build(actor: AuthenticatedUser): Promise<SessionContextDto> {
    const user = await this.users.getById(actor.id);

    // A non-superadmin with no org is in the confined holding state (#104).
    const isUnassigned = user.role !== Role.SUPERADMIN && user.organizationId === null;

    const org = user.organizationId ? await this.organizations.findById(user.organizationId) : null;

    // Both maps resolve through the 8-layer precedence against the user's OWN org
    // (#64), so a SuperAdmin org grant cap shows up here immediately — this is the
    // payload the frontend gates its nav and controls on.
    //
    // For an UNASSIGNED user the resolver is bypassed entirely. Resolving
    // MODULE_ACCESS_DEFAULTS for them would report classrooms, problems,
    // assignments, playground and topics as enabled — so the nav would advertise
    // five areas that every request 403s `no_organization` on, which reads as the
    // app being broken rather than as an account awaiting setup.
    //
    // This projection lives HERE, not in ModuleAccessService.resolveModule. Pushing
    // it into the resolver would make `getMatrix(null)` — the platform console's
    // own defaults view — render all-false, and the module/feature guards are never
    // reached by an org-less actor anyway, since no @AllowsUnassigned route carries
    // @RequiresModule.
    const [modules, features, quotas] = await Promise.all([
      isUnassigned
        ? Promise.resolve(allFalseExcept(SYSTEM_MODULES))
        : this.moduleAccess.effectiveMapForRole(user.role, user.organizationId),
      isUnassigned
        ? Promise.resolve(this.moduleAccess.allFalseFeatureMap())
        : this.moduleAccess.effectiveFeatureMap(user.role, user.organizationId),
      // A SuperAdmin has no org and is charged nothing, so it has no quotas (#66).
      user.organizationId ? this.quotas.getUsageSummary(user.organizationId) : null,
    ]);

    return {
      user: UserResponseDto.from(user),
      organization: org ? OrganizationSummaryDto.from(org) : null,
      isSuperAdmin: user.role === Role.SUPERADMIN,
      isUnassigned,
      origin: user.origin,
      // Always true in practice for a live session, since an unverified account
      // cannot log in. Shipped anyway so the client can render account state without
      // inferring it, and so a future confined-unverified mode would not need a
      // contract change to become expressible.
      emailVerified: user.emailVerifiedAt !== null,
      modules,
      features,
      /*
       * Derived here, not by each consumer (#71). `getUsageSummary` returns
       * `{used, limit}`; `remaining` and `exceeded` come from
       * `limit === null ? null : max(0, limit - used)`. That arithmetic is where
       * null-means-unlimited gets accidentally coalesced to 0, so it lives in one
       * place — the same `QuotaUsageDto.of` the platform console reads.
       */
      quotas: quotas
        ? (Object.fromEntries(
            Object.entries(quotas).map(([resource, u]) => [
              resource,
              QuotaUsageDto.of(u.used, u.limit),
            ]),
          ) as Record<string, QuotaUsageDto>)
        : null,
      isValid: true,
    };
  }
}
