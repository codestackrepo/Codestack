import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { OrganizationType } from '../../organizations/enums/organization.enums';

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiPropertyOptional({
    description: 'URL slug; derived from the name when omitted.',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  slug?: string;

  @ApiPropertyOptional({ enum: OrganizationType })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;
}
