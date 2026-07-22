// Feature-local billing types. Const-object enums (NOT TS `enum`) because the
// tsconfig has `erasableSyntaxOnly` on. String values match the backend DTOs
// byte-for-byte (see the billing module DTOs / enums on the server).

/** Billing interval a plan is charged on. */
export const PlanInterval = {
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
} as const;
export type PlanInterval = (typeof PlanInterval)[keyof typeof PlanInterval];

/** Lifecycle status of a subscription (mirrors Stripe). */
export const SubscriptionStatus = {
  INCOMPLETE: 'incomplete',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** A subscription in one of these states grants access / counts as "on a plan". */
export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

/** Settlement status of an invoice. */
export const InvoiceStatus = {
  PAID: 'paid',
  OPEN: 'open',
  UNCOLLECTIBLE: 'uncollectible',
  VOID: 'void',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

/** Paid entitlements the platform gates features behind. */
export const Entitlement = {
  AI: 'ai',
} as const;
export type Entitlement = (typeof Entitlement)[keyof typeof Entitlement];

/** GET /billing/plans — one active plan. */
export interface PlanResponseDto {
  id: string;
  code: string;
  name: string;
  interval: PlanInterval;
  /** Integer minor currency units (e.g. cents). Divide by 100 for display. */
  priceMinorUnits: number;
  /** 3-char lowercase ISO currency code, e.g. 'usd'. */
  currency: string;
  features: Record<string, boolean>;
}

/** POST /billing/checkout response. */
export interface CheckoutResponseDto {
  /** Stripe hosted checkout URL to redirect the browser to. */
  url: string;
}

/** GET /billing/subscription — the user's latest subscription (or null). */
export interface SubscriptionResponseDto {
  id: string;
  status: SubscriptionStatus;
  planCode: string | null;
  /** ISO 8601 date string. */
  currentPeriodStart: string;
  /** ISO 8601 date string. */
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

/** GET /billing/invoices — one invoice. */
export interface InvoiceResponseDto {
  id: string;
  status: InvoiceStatus;
  /** Integer minor currency units (e.g. cents). Divide by 100 for display. */
  amountPaid: number;
  /** 3-char lowercase ISO currency code, e.g. 'usd'. */
  currency: string;
  /** ISO 8601 date string. */
  periodStart: string;
  /** ISO 8601 date string. */
  periodEnd: string;
  hostedInvoiceUrl: string | null;
}
