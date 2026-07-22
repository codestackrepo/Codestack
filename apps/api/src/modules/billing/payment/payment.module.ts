import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingConfig } from '../../../config/configuration';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { StripeProvider } from './providers/stripe.provider';

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const billing = config.getOrThrow<BillingConfig>('billing');
        return new StripeProvider(billing.stripeSecretKey, billing.stripeWebhookSecret);
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
