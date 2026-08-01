import { useState } from 'react';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Mail, MailCheck } from 'lucide-react';
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
import { useAuth } from '../context/auth-context';

const schema = z.object({ email: z.string().email('Enter a valid email address') });

/**
 * Request a fresh confirmation link (#118).
 *
 * Structurally identical to forgot-password, and for the same reason: the endpoint is
 * public and keyed on an email address, so it answers one fixed 200 whether the
 * address is unknown, already confirmed, or disabled. There is therefore nothing to
 * branch on — the success state is unconditional, and rendering anything
 * address-specific would reintroduce the enumeration oracle the API avoids.
 *
 * It also never reports failure from the request itself. A throttled or offline
 * attempt still lands on the same screen: telling the user "that didn't work" invites
 * them to retry immediately against a 3/min limit, when the far likelier truth is
 * that the mail is already on its way.
 */
export function ResendVerificationPage() {
  const { resendVerification } = useAuth();
  const [sent, setSent] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    try {
      await resendVerification(values.email);
    } catch {
      // Swallowed on purpose — see the class comment. The user sees the same screen.
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="If that address still needs confirming, a new link is on its way. It works once and expires in 24 hours."
      >
        <div className="space-y-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="size-6 text-primary" aria-hidden="true" />
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
      title="Resend your confirmation link"
      description="Enter the address you signed up with and we'll send a fresh link."
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
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@school.edu"
                      className="pl-9"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send the link'}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
