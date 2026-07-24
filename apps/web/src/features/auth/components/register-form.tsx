import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { GraduationCap, Lock, Mail, User } from 'lucide-react';
import { onboardingApi } from '@/features/onboarding/api/onboarding.api';
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
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const { data: invitePreview } = useQuery({
    queryKey: ['onboarding', 'invite-preview', inviteToken],
    queryFn: () => onboardingApi.previewInvite(inviteToken!),
    enabled: !!inviteToken,
    retry: false,
  });
  const invitedAsProfessor = !!invitePreview?.valid;

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: invitePreview?.email ?? '',
      password: '',
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      await register({ ...values, inviteToken });
      navigate('/home', { replace: true });
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          {invitedAsProfessor
            ? 'Complete your professor account to get started.'
            : 'Start solving problems on CodeStack.'}
        </p>
      </div>

      {invitedAsProfessor && (
        <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand" />
          <p>
            You&apos;ve been invited to join as a <span className="font-semibold">professor</span>.
            Finish signing up and you&apos;ll have teaching access right away.
          </p>
        </div>
      )}

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
