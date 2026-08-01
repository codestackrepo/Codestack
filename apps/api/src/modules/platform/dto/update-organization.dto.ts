import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { OrganizationType } from '../../organizations/enums/organization.enums';
import { OrgBranding } from '../../organizations/org-branding';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional({ enum: OrganizationType })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  /**
   * Co-branding for the "CodeStack × institution" lockup (#118).
   *
   * Only shape-checked here; the real validation is `parseOrgBranding` in the service —
   * https-only absolute URL, length caps. That lives outside the DTO deliberately,
   * because the same rules must apply to every writer of this field, and a decorator
   * only protects the one endpoint it decorates.
   *
   * Send `null` to clear it.
   */
  @ApiPropertyOptional({ description: 'Logo URL and display name. Null clears it.' })
  @IsOptional()
  @IsObject()
  branding?: OrgBranding | null;
}
