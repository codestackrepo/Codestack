import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { PlatformGuard } from '../guards/platform.guard';

export const IS_PLATFORM_KEY = 'isPlatform';

/**
 * Marks a controller/handler as SuperAdmin platform scope (#62): binds
 * PlatformGuard (fresh-DB SUPERADMIN + no-org check) and tags the route for
 * introspection. The global RolesGuard still runs first; PlatformGuard is the
 * authoritative, fail-closed check.
 */
export function Platform(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    SetMetadata(IS_PLATFORM_KEY, true),
    UseGuards(PlatformGuard),
    ApiCookieAuth('access_token'),
  );
}
