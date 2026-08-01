import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { UpdateModuleAccessDto } from './update-module-access.dto';

/**
 * Save many matrix cells in ONE request (#118 follow-up).
 *
 * The per-cell PATCH stays for single flips, but an admin re-planning a role's
 * access changes six or eight cells at once. Sent one-by-one that is N round trips,
 * N transactions and N Redis invalidations — and, between the third and fourth, the
 * org is in a state the admin never chose. `setCells` writes them in one transaction
 * and invalidates once, so other API instances only ever observe before-or-after.
 *
 * The cap is a denial-of-service bound, not a product limit: the matrix is
 * modules × roles plus features × roles, comfortably under 200, so a larger body is
 * not a legitimate client.
 */
export class UpdateModuleAccessBulkDto {
  @ApiProperty({ type: [UpdateModuleAccessDto], description: 'Cells to write. Applied atomically.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateModuleAccessDto)
  cells!: UpdateModuleAccessDto[];
}
