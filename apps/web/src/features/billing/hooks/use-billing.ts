import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { billingApi } from '../api/billing.api';
import { parseApiError } from '@/lib/api-client';

export const billingKeys = {
  plans: ['billing', 'plans'] as const,
  subscription: ['billing', 'subscription'] as const,
  invoices: ['billing', 'invoices'] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: billingApi.listPlans,
    staleTime: 5 * 60_000,
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: billingKeys.subscription,
    queryFn: billingApi.getSubscription,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: billingKeys.invoices,
    queryFn: billingApi.listInvoices,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (planCode: string) => billingApi.checkout(planCode),
    onSuccess: ({ url }) => {
      // Hand the browser off to Stripe's hosted checkout.
      window.location.assign(url);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: billingApi.cancelSubscription,
    onSuccess: (subscription) => {
      queryClient.setQueryData(billingKeys.subscription, subscription);
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription });
      toast.success('Your subscription will cancel at the end of the current period.');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
