import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateOrganizationApplicationDto } from './dto/organization-application.dto';
import { OrganizationApplicationsService } from './organization-applications.service';

@ApiTags('organization-applications')
@Controller('organization-applications')
export class OrganizationApplicationsController {
  constructor(private readonly applications: OrganizationApplicationsService) {}

  /**
   * Public: an institution applies for a tenant (#118).
   *
   * ALWAYS 202 with an identical body. Three cases create no row — a pending
   * application already exists for the address, a concurrent submission won the race,
   * or the same form was submitted twice — and none is distinguishable, because this is
   * unauthenticated and any difference is an oracle. The nastier one it also avoids:
   * rejecting a duplicate ORGANIZATION NAME would let an outsider discover which
   * universities use CodeStack by submitting names until one bounced.
   *
   * 202 rather than 201: nothing is created that the caller can go and look at, and
   * what happens next is a human review. It also keeps the "created / not created"
   * distinction out of the status code.
   *
   * THROTTLED HARD, because this is an unauthenticated write that sends mail — to the
   * applicant AND to every superadmin. Without a limit it is both a spam relay and a
   * way to bury the review queue. The global `AppThrottlerGuard` buckets unauthenticated
   * traffic by IP, so these limits are per-IP.
   */
  @Public()
  @Post()
  @HttpCode(202)
  @Throttle({ minute: { limit: 3, ttl: 60_000 }, day: { limit: 10, ttl: 86_400_000 } })
  async submit(@Body() dto: CreateOrganizationApplicationDto): Promise<{ message: string }> {
    await this.applications.submit(dto);
    return {
      message:
        "Thanks — we've got your application. We review each one by hand and will email you.",
    };
  }
}
