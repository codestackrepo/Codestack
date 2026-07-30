import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Lock, Mail, User } from 'lucide-react';
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

const FIELD = 'h-10 bg-muted/30 pl-9 transition-colors focus-visible:bg-transparent';
const ICON = 'pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground';
import { useAuth } from '../context/auth-context';
import { parseApiError } from '@/lib/api-client';

const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(150),
  lastName: z.string().min(1, 'Last name is required').max(150),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

/** Register form body (heading + fields + switch link). Used inside AuthPage. */
export function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // No invite handling here any more. Self-registration always produces an
  // org-less STUDENT; an invitee lands on /invite/:token instead, which is its own
  // surface with its own accept call. Reading `?invite=` here would have kept a
  // second, quota-free path into a role.

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      await register(values);
      navigate('/home', { replace: true });
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Start solving problems on CodeStack.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className={ICON} />
                      <Input autoComplete="given-name" className={FIELD} {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className={ICON} />
                      <Input autoComplete="family-name" className={FIELD} {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
                    <Input
                      type="password"
                      autoComplete="new-password"
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
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
