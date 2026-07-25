import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '../billing/entities/webhook-event.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';
import { OrgInvite } from './entities/org-invite.entity';

/**
 * Clerk -> DB sync (#52). Consumes UsersService + OrganizationsService to
 * reconcile the local mirror from inbound Clerk webhooks. Re-registers the shared
 * `webhook_events` ledger (also registered by BillingModule — TypeORM allows the
 * same entity in multiple forFeature scopes) and owns the `org_invites` mirror.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent, OrgInvite]), UsersModule, OrganizationsModule],
  controllers: [ClerkWebhookController],
  providers: [ClerkWebhookService],
  exports: [ClerkWebhookService],
})
export class ClerkSyncModule {}
