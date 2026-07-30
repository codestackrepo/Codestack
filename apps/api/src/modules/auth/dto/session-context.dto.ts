import { ApiProperty } from '@nestjs/swagger';
import { AppModuleKey } from '../../module-access/enums/app-module-key.enum';
import { OrganizationSummaryDto } from '../../organizations/dto/organization-summary.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * The ONE session-bootstrap contract returned by GET /auth/verify (#54). It is
 * assembled by SessionContextService from several subsystems — module-access,
 * organizations, and (as they land) features (#64) and quotas (#66) — so those
 * subsystems contribute a FIELD to the aggregator, never a parallel edit to the
 * auth controller.
 *
 * `features` and `quotas` are present in the contract now but empty/null until
 * their subsystems ship, so the client shape is stable across the M2 rollout.
 */
export class SessionContextDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;

  @ApiProperty({ type: OrganizationSummaryDto, nullable: true })
  organization!: OrganizationSummaryDto | null;

  @ApiProperty({ description: 'true only for the platform SuperAdmin (no org).' })
  isSuperAdmin!: boolean;

  @ApiProperty({ description: 'Effective module visibility for the user’s role.' })
  modules!: Record<AppModuleKey, boolean>;

  @ApiProperty({ description: 'Per-org feature flags (#64). Empty until that subsystem ships.' })
  features!: Record<string, boolean>;

  @ApiProperty({
    nullable: true,
    description: 'Per-org quota limits + usage (#66). Null until that subsystem ships.',
  })
  quotas!: Record<string, unknown> | null;

  // Retained from the legacy contract so existing clients keep working; the
  // richer fields above are what the frontend actually consumes (#59).
  @ApiProperty({
    description:
      'True for a non-superadmin with no organization — the confined holding state. ' +
      'The frontend routes these users to /pending rather than the app shell.',
  })
  isUnassigned!: boolean;

  @ApiProperty() isValid!: boolean;
}
