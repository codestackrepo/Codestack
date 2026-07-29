import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgQuota } from './entities/org-quota.entity';
import { QuotaService } from './quota.service';

/**
 * Per-org numeric limits (#66). Registers `org_quotas` for schema discovery; the
 * service itself works through the injected DataSource/EntityManager, because
 * enforcement has to run inside the CALLER's transaction — a repository bound to
 * its own connection would take its lock outside that transaction and release it
 * immediately, which is exactly the race the lock exists to prevent.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrgQuota])],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotasModule {}
