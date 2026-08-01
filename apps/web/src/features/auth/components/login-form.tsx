import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Lock, Mail } from 'lucide-react';
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
import { PasswordInput } from '@/components/ui/password-input';

const FIELD = 'h-10 bg-muted/30 pl-9 transition-colors focus-visible:bg-transparent';
const ICON =
  'pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground';
import { useAuth } from '../context/auth-context';
import { parseApiError } from '@/lib/api-client';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** Login form body (heading + fields + switch link). Used inside AuthPage. */
export function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * Set when the credentials were RIGHT but the address is unconfirmed (#118).
   *
   * Kept separate from `formError` because the remedy is completely different: a
   * wrong password means "try again", an unconfirmed address means "go and click the
   * link, or ask for a new one". Rendering the second as a plain red line under the
   * password field would send people to re-check a password that was already correct.
   *
   * Reaching this state at all means the password was verified server-side — the API
   * checks credentials BEFORE this gate, precisely so the response cannot tell a
   * stranger whether an address has an account.
   */
  const [unverified, setUnverified] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    setUnverified(false);
    try {
      await login(values);
      const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/home';
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.reason === 'email_unverified') {
        setUnverified(true);
        return;
      }
      setFormError(parsed.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to CodeStack.</p>
      </div>
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
                    <Mail className={ICON} />
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@school.edu"
                      className={FIELD}
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className={ICON} />
                    <PasswordInput
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className={FIELD}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          {/*
            An unconfirmed address is not a failed sign-in, so it does not look like
            one. The password was right; the only thing missing is the click in the
            inbox, and the resend link is the way out of a lost mail.
          */}
          {unverified && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Confirm your email address to sign in</p>
              <p className="mt-1 text-muted-foreground">
                We sent a link when you signed up. Open it to finish setting up your account.
              </p>
              <Link
                to="/resend-verification"
                className="mt-2 inline-block font-semibold text-primary hover:underline"
              >
                Send me a new link
              </Link>
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Register
        </button>
      </p>
    </div>
  );
}
