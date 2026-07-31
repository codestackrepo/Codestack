import { useState } from 'react';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Mail } from 'lucide-react';
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
import { AuthLayout } from '../components/auth-layout';
import { passwordResetApi } from '../api/password-reset.api';

const schema = z.object({ email: z.string().email('Enter a valid email address') });

/**
 * Request a reset link.
 *
 * Shows the SAME confirmation whatever the server did, matching the endpoint's
 * non-enumerable contract. Branching the UI on "we found you" would reintroduce
 * the account-enumeration oracle the API is careful not to be — the API can
 * answer identically all it likes if the page then says "no such user".
 */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(null);
    try {
      await passwordResetApi.forgot(values.email);
      setSent(true);
    } catch {
      // Only a network/throttle failure can land here — the endpoint itself is
      // always 200. Deliberately generic, so a 429 does not become a signal.
      setError('Something went wrong. Please try again in a moment.');
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        description="If an account exists for that address, a reset link is on its way."
      >
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              The link expires in 60 minutes and can be used once. If it doesn&apos;t arrive, check
              your spam folder.
            </p>
          </div>
          <Link
            to="/login"
            className="block text-center text-sm font-semibold text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We'll email you a link to choose a new one."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@university.edu"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </Form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
