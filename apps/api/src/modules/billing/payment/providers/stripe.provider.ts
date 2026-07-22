import Stripe from 'stripe';
import {
  CheckoutSessionParams,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderSubscriptionSnapshot,
} from '../payment-provider.interface';

export class StripeProvider implements PaymentProvider {
  private clientInstance: Stripe | null = null;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  /**
   * Constructed lazily, not in the constructor: `STRIPE_SECRET_KEY` is
   * deliberately optional at boot (Joi allows an empty string, matching
   * `LLM_API_KEY`'s pattern) so the app can start without billing configured
   * yet — the Stripe SDK's own constructor throws synchronously on an empty
   * key, which would otherwise crash the entire process at DI-instantiation
   * time just because billing wasn't set up.
   */
  private get client(): Stripe {
    if (!this.secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured — billing/subscription features are unavailable',
      );
    }
    if (!this.clientInstance) {
      this.clientInstance = new Stripe(this.secretKey);
    }
    return this.clientInstance;
  }

  async createCustomer(userId: string, email: string): Promise<string> {
    const customer = await this.client.customers.create({ email, metadata: { userId } });
    return customer.id;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    const session = await this.client.checkout.sessions.create(
      {
        customer: params.customerId,
        mode: 'subscription',
        line_items: [{ price: params.priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    if (!session.url) {
      throw new Error('Stripe did not return a checkout session URL');
    }
    return { url: session.url };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    // Graceful cancellation — access continues through the paid period's end;
    // the webhook-driven state machine flips to CANCELED when Stripe ends it.
    await this.client.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
  }

  verifyWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent {
    const event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return { id: event.id, type: event.type, data: event.data.object };
  }

  async getSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot> {
    const sub = await this.client.subscriptions.retrieve(providerSubscriptionId);
    return this.toSnapshot(sub);
  }

  async getCustomerUserId(customerId: string): Promise<string | null> {
    const customer = await this.client.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer.metadata.userId as string | undefined) ?? null;
  }

  toSnapshot(sub: Stripe.Subscription): ProviderSubscriptionSnapshot {
    const item = sub.items.data[0];
    return {
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      priceId: item?.price.id ?? '',
      currentPeriodStart: new Date(item.current_period_start * 1000),
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }
}
