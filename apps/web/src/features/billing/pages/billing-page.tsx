import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/api-client';
import { SubscriptionCard } from '../components/subscription-card';
import { PlansGrid } from '../components/plans-grid';
import { InvoicesCard } from '../components/invoices-card';
import { billingKeys, useInvoices, usePlans, useSubscription } from '../hooks/use-billing';
import { ACTIVE_SUBSCRIPTION_STATUSES } from '../types';

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const subscriptionQuery = useSubscription();
  const plansQuery = usePlans();
  const invoicesQuery = useInvoices();

  const subscription = subscriptionQuery.data ?? null;
  const isActive = !!subscription && ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);
  const currentPlanCode = isActive ? subscription.planCode : null;

  // Returning from Stripe hosted checkout: there's no WS channel for billing,
  // so re-fetch subscription + invoices to observe the new state, surface a
  // toast, and clear the query param so a refresh doesn't repeat it.
  const checkoutResult = searchParams.get('checkout');
  useEffect(() => {
    if (!checkoutResult) return;
    if (checkoutResult === 'success') {
      toast.success('Payment received — updating your subscription…');
    } else if (checkoutResult === 'cancel') {
      toast('Checkout cancelled. No changes were made.');
    }
    void queryClient.invalidateQueries({ queryKey: billingKeys.subscription });
    void queryClient.invalidateQueries({ queryKey: billingKeys.invoices });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('checkout');
        return next;
      },
      { replace: true },
    );
  }, [checkoutResult, queryClient, setSearchParams]);

  // Surface load failures as toasts (React Query v5 has no onError on queries).
  useEffect(() => {
    if (subscriptionQuery.error) {
      toast.error(parseApiError(subscriptionQuery.error).message);
    }
  }, [subscriptionQuery.error]);
  useEffect(() => {
    if (plansQuery.error) {
      toast.error(parseApiError(plansQuery.error).message);
    }
  }, [plansQuery.error]);
  useEffect(() => {
    if (invoicesQuery.error) {
      toast.error(parseApiError(invoicesQuery.error).message);
    }
  }, [invoicesQuery.error]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing &amp; subscription</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, payment, and billing history.
        </p>
      </div>

      <SubscriptionCard subscription={subscription} isLoading={subscriptionQuery.isLoading} />

      <PlansGrid
        plans={plansQuery.data}
        isLoading={plansQuery.isLoading}
        currentPlanCode={currentPlanCode}
      />

      <InvoicesCard invoices={invoicesQuery.data} isLoading={invoicesQuery.isLoading} />
    </div>
  );
}
