import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { OrganizationType } from '../../organizations/enums/organization.enums';

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
}
