import { SetMetadata } from '@nestjs/common';
import { AppModuleKey } from '../enums/app-module-key.enum';

export const MODULE_KEY = 'requiresModule';

/** Gates a controller/route behind an admin-toggleable module (per-role). */
export const RequiresModule = (moduleKey: AppModuleKey) => SetMetadata(MODULE_KEY, moduleKey);
