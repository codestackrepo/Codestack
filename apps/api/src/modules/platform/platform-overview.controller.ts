import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Platform } from './decorators/platform.decorator';
import { PlatformOverviewDto } from './dto/platform-overview.dto';
import { PlatformService } from './platform.service';

/**
 * Cross-org platform KPIs (#63). Separate from PlatformController only because
 * that one is rooted at `platform/organizations`; both are @Platform-gated (a
 * fresh-DB SUPERADMIN + no-org check) and both are deliberately unscoped by org.
 *
 * The org-admin counterpart is `GET /admin/overview`, which reports the same
 * figures narrowed to the caller's own tenant.
 */
@ApiTags('platform')
@Platform()
@Controller('platform')
export class PlatformOverviewController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Cross-org KPIs plus one census tile per organization.' })
  overview(): Promise<PlatformOverviewDto> {
    return this.platform.overview();
  }
}
