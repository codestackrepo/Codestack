export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Passed through to the provider's own idempotency mechanism. */
  idempotencyKey: string;
}

/** Provider-native subscription status string — the caller maps it to our SubscriptionStatus enum. */
export interface ProviderSubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface ParsedWebhookEvent {
  id: string;
  type: string;
  /** The event's `data.object` — shape depends on `type`; the caller narrows it. */
  data: unknown;
}

/**
 * Payment boundary. Concrete providers (Stripe today) map every method onto
 * their own SDK; callers never see provider-specific request/response shapes,
 * so swapping providers later never touches subscription/entitlement logic.
 */
export interface PaymentProvider {
  createCustomer(userId: string, email: string): Promise<string>;
  createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /** Verifies the HMAC signature over the raw body and returns the parsed event, or throws. */
  verifyWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot>;
  /**
   * Recovers the userId that created this customer (stashed as metadata at
   * `createCustomer` time). Needed because webhook delivery order isn't
   * guaranteed — a `customer.subscription.*` event can arrive before
   * `checkout.session.completed` has been processed, leaving no local row
   * to read the userId from.
   */
  getCustomerUserId(customerId: string): Promise<string | null>;
}
