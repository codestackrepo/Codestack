import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
import { AppModuleKey } from '../enums/app-module-key.enum';

/**
 * Toggle one Module × Role cell. The global ValidationPipe runs with
 * forbidNonWhitelisted, so exactly these three fields are accepted. SYSTEM keys
 * and role=admin pass @IsEnum but are rejected downstream by setCell (§9.7).
 */
export class UpdateModuleAccessDto {
  @ApiProperty({ enum: AppModuleKey })
  @IsEnum(AppModuleKey)
  moduleKey!: AppModuleKey;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
