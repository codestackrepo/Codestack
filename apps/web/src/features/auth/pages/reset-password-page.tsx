import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { parseApiError } from '@/lib/api-client';
import { AuthLayout } from '../components/auth-layout';
import { passwordResetApi, type ResetTokenStatus } from '../api/password-reset.api';

/**
 * Mirrors RegisterForm's rule. A weaker one here would make the reset path the
 * cheapest way to plant a guessable password on an account whose mailbox was
 * briefly accessible.
 */
const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

const DEAD_COPY: Record<Exclude<ResetTokenStatus, 'valid'>, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'Reset links are valid for 60 minutes. Request a new one to continue.',
  },
  used: {
    title: 'This link has already been used',
    body: 'Each reset link works once. Request a new one if you still need to change your password.',
  },
  not_found: {
    title: 'This link is not valid',
    body: 'Check that you copied the whole link from the email, or request a new one.',
  },
};

/**
 * Consume a reset link.
 *
 * State handling mirrors the invite-accept page: loading, then one of
 * not-found / expired / used, or the form. The preview endpoint never 4xxs, so
 * every dead-link case is a normal 200 with a status to render — there is no
 * error branch to hit.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'reset-preview', token],
    queryFn: () => passwordResetApi.preview(token),
    retry: false,
    enabled: !!token,
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFormError(null);
    try {
      await passwordResetApi.reset(token, values.password);
      // The API signs the user in on success, so go straight to the app rather
      // than bouncing them to a login form to retype what they just chose.
      navigate('/home', { replace: true });
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  if (isLoading) {
    return (
      <AuthLayout title="Checking your link" description="One moment.">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </AuthLayout>
    );
  }

  if (!data || data.status !== 'valid') {
    const copy = DEAD_COPY[(data?.status ?? 'not_found') as Exclude<ResetTokenStatus, 'valid'>];
    return (
      <AuthLayout title={copy.title} description={copy.body}>
        <Link
          to="/forgot-password"
          className="block text-center text-sm font-semibold text-primary hover:underline"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description={
        data.maskedEmail ? `For ${data.maskedEmail}` : 'Pick something you have not used before.'
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      className="pl-9"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Set password and sign in'}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
