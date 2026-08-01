import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreateProfessorApplicationDto } from './dto/professor-application.dto';
import { ProfessorApplicationsService } from './professor-applications.service';

@ApiTags('professor-applications')
@Controller('professor-applications')
export class ProfessorApplicationsController {
  constructor(private readonly applications: ProfessorApplicationsService) {}

  /**
   * Public: apply to teach on the open platform (#118).
   *
   * ALWAYS 202 with an identical body. Two cases store nothing — a pending application
   * for the address, and an address that already has a CodeStack account — and neither
   * may be distinguishable, or this becomes an account-existence oracle for any address
   * an attacker types.
   *
   * Throttled hard: an unauthenticated write that mails the applicant AND every
   * superadmin is both a spam relay and a way to bury the review queue.
   */
  @Public()
  @Post()
  @HttpCode(202)
  @Throttle({ minute: { limit: 3, ttl: 60_000 }, day: { limit: 10, ttl: 86_400_000 } })
  async submit(@Body() dto: CreateProfessorApplicationDto): Promise<{ message: string }> {
    await this.applications.submit(dto);
    return {
      message: "Thanks — we've got your request. We review each one by hand and will email you.",
    };
  }
}
