import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
import { AppModuleKey } from '../enums/app-module-key.enum';
import { ALL_FEATURES } from '../enums/feature-key.enum';

/** Every key the matrix can address: a module or a dotted feature (#64). */
const GATEABLE_KEYS: string[] = [...Object.values(AppModuleKey), ...ALL_FEATURES];

/**
 * Toggle one cell of the Module/Feature × Role matrix. The global ValidationPipe
 * runs with forbidNonWhitelisted, so exactly these three fields are accepted.
 * SYSTEM keys, role=admin, and roles above a feature's ceiling pass validation but
 * are rejected downstream by setCell (§9.7) — validation checks the SHAPE, the
 * service owns the policy, and keeping it that way means one place to audit.
 */
export class UpdateModuleAccessDto {
  @ApiProperty({
    description: 'Module key (`problems`) or dotted feature key (`problems.author`).',
    example: AppModuleKey.PROBLEMS,
  })
  @IsIn(GATEABLE_KEYS)
  moduleKey!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
