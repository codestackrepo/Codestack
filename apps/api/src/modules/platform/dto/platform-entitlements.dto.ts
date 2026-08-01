import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
import { AppModuleKey } from '../../module-access/enums/app-module-key.enum';
import { FeatureKey } from '../../module-access/enums/feature-key.enum';
import type { MatrixCell } from '../../module-access/module-access.service';
import { QuotaResource } from '../../quotas/enums/quota-resource.enum';
import type { QuotaUsageDto } from './platform-organization-detail.dto';

/**
 * One cell write. `key` is a plain string, not `@IsEnum`, on purpose: it accepts
 * BOTH an `AppModuleKey` and a dotted `FeatureKey`, and `ModuleAccessService.setCell`
 * is the single authority on which strings are valid — it already rejects an unknown
 * key, `role=admin` (immune, so a row would be a lie) and any cell the role ceiling
 * forbids. Duplicating that as two enums here would let the two disagree.
 */
export class UpdateOrgMatrixCellDto {
  @ApiProperty({ description: 'An AppModuleKey ("problems") or a FeatureKey ("problems.author").' })
  @IsString()
  key!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

/**
 * Many cells, applied atomically. The cap is a body-size bound, not a product limit —
 * modules × roles plus features × roles is comfortably under it.
 */
export class UpdateOrgMatrixBulkDto {
  @ApiProperty({ type: [UpdateOrgMatrixCellDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrgMatrixCellDto)
  cells!: UpdateOrgMatrixCellDto[];
}

export class SetOrgQuotaDto {
  @ApiProperty({ enum: QuotaResource })
  @IsEnum(QuotaResource)
  resource!: QuotaResource;

  /**
   * `null` = UNLIMITED, `0` = BLOCKED. Required — not optional.
   *
   * `ValidateIf(v => v !== null)` lets null through to the integer rules while
   * keeping the field mandatory, so an omitted `limitValue` is a 400. Making it
   * optional would mean "absent" had to be interpreted, and either reading is a
   * silent, load-bearing mistake: unlimited-becomes-blocked, or the reverse.
   */
  @ApiProperty({ nullable: true, description: 'null = unlimited; 0 = blocked.' })
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(0)
  limitValue!: number | null;
}

export class OrgMatrixResponseDto {
  @ApiProperty({ enum: AppModuleKey, isArray: true }) toggleable!: AppModuleKey[];
  @ApiProperty({ enum: AppModuleKey, isArray: true }) system!: AppModuleKey[];
  @ApiProperty({ enum: FeatureKey, isArray: true }) features!: FeatureKey[];
  /** Modules AND features in one array; `moduleKey` holds either kind of key. */
  @ApiProperty() matrix!: MatrixCell[];
}

export class OrgQuotaResponseDto {
  /**
   * Keyed by the snake_case `QuotaResource` values (`max_users`, ...), matching the
   * `quotas` block already on `GET /auth/verify` so the web app has one shape to
   * model rather than two.
   */
  @ApiProperty() usage!: Record<QuotaResource, QuotaUsageDto>;
}
