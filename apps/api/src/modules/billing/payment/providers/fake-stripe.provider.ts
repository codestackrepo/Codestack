import {
  CheckoutSessionParams,
  ParsedWebhookEvent,
  PaymentProvider,
  ProviderSubscriptionSnapshot,
} from '../payment-provider.interface';

/**
 * Deterministic test double — no network, no Stripe account needed. Tests
 * seed `subscriptions`/`webhookQueue` directly and assert against `calls`.
 */
export class FakeStripeProvider implements PaymentProvider {
  public readonly calls: { method: string; args: unknown[] }[] = [];
  private customerSeq = 0;
  private readonly subscriptions = new Map<string, ProviderSubscriptionSnapshot>();
  private readonly customerUsers = new Map<string, string>();
  private webhookQueue: ParsedWebhookEvent[] = [];

  seedSubscription(snapshot: ProviderSubscriptionSnapshot): void {
    this.subscriptions.set(snapshot.id, snapshot);
  }

  seedCustomer(customerId: string, userId: string): void {
    this.customerUsers.set(customerId, userId);
  }

  queueWebhookEvent(event: ParsedWebhookEvent): void {
    this.webhookQueue.push(event);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async createCustomer(userId: string, _email: string): Promise<string> {
    this.calls.push({ method: 'createCustomer', args: [userId, _email] });
    const id = `cus_fake_${++this.customerSeq}`;
    this.customerUsers.set(id, userId);
    return id;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getCustomerUserId(customerId: string): Promise<string | null> {
    this.calls.push({ method: 'getCustomerUserId', args: [customerId] });
    return this.customerUsers.get(customerId) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    this.calls.push({ method: 'createCheckoutSession', args: [params] });
    return { url: `https://checkout.stripe.test/session/${params.idempotencyKey}` };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    this.calls.push({ method: 'cancelSubscription', args: [providerSubscriptionId] });
    const existing = this.subscriptions.get(providerSubscriptionId);
    if (existing)
      this.subscriptions.set(providerSubscriptionId, { ...existing, cancelAtPeriodEnd: true });
  }

  verifyWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent {
    this.calls.push({ method: 'verifyWebhook', args: [rawBody, signature] });
    if (signature !== 'valid') {
      throw new Error('invalid signature');
    }
    const next = this.webhookQueue.shift();
    if (!next) throw new Error('FakeStripeProvider.verifyWebhook called with an empty queue');
    return next;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot> {
    this.calls.push({ method: 'getSubscription', args: [providerSubscriptionId] });
    const found = this.subscriptions.get(providerSubscriptionId);
    if (!found)
      throw new Error(`FakeStripeProvider has no seeded subscription ${providerSubscriptionId}`);
    return found;
  }
}
