import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { Invoice } from './entities/invoice.entity';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { EntitlementGuard } from './guards/entitlement.guard';
import { PaymentModule } from './payment/payment.module';
import { BillingWebhookService } from './services/billing-webhook.service';
import { EntitlementService } from './services/entitlement.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Subscription, WebhookEvent, Invoice]), PaymentModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    SubscriptionService,
    BillingWebhookService,
    EntitlementService,
    EntitlementGuard,
  ],
  exports: [EntitlementService, EntitlementGuard, SubscriptionService],
})
export class BillingModule {}
