export enum PlanInterval {
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

/** Mirrors Stripe's own subscription status vocabulary (kept 1:1 — no translation layer to drift). */
export enum SubscriptionStatus {
  INCOMPLETE = 'incomplete',
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

export enum WebhookEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  FAILED = 'failed',
  IGNORED = 'ignored',
}

export enum InvoiceStatus {
  PAID = 'paid',
  OPEN = 'open',
  UNCOLLECTIBLE = 'uncollectible',
  VOID = 'void',
}

/** Feature flags gated behind an active subscription — currently just 'ai'. */
export enum Entitlement {
  AI = 'ai',
}
