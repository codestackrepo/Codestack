import { apiClient } from '@/lib/api-client';
import type {
  CheckoutResponseDto,
  InvoiceResponseDto,
  PlanResponseDto,
  SubscriptionResponseDto,
} from '../types';

export const billingApi = {
  /** GET /billing/plans — public, bare JSON array ordered by price ASC. */
  async listPlans(): Promise<PlanResponseDto[]> {
    const { data } = await apiClient.get<PlanResponseDto[]>('/billing/plans');
    return data;
  },

  /**
   * GET /billing/subscription — the user's latest subscription, or literal
   * `null` (HTTP 200) when they have never subscribed.
   */
  async getSubscription(): Promise<SubscriptionResponseDto | null> {
    const { data } = await apiClient.get<SubscriptionResponseDto | null>('/billing/subscription');
    return data;
  },

  /** POST /billing/checkout — returns a Stripe hosted checkout URL. */
  async checkout(planCode: string): Promise<CheckoutResponseDto> {
    const { data } = await apiClient.post<CheckoutResponseDto>('/billing/checkout', { planCode });
    return data;
  },

  /** POST /billing/subscription/cancel — soft cancel (cancel-at-period-end). */
  async cancelSubscription(): Promise<SubscriptionResponseDto> {
    const { data } = await apiClient.post<SubscriptionResponseDto>('/billing/subscription/cancel');
    return data;
  },

  /** GET /billing/invoices — bare JSON array ordered by createdAt DESC. */
  async listInvoices(): Promise<InvoiceResponseDto[]> {
    const { data } = await apiClient.get<InvoiceResponseDto[]>('/billing/invoices');
    return data;
  },
};
