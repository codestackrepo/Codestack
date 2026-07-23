import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { GraduationCap } from 'lucide-react';
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
import { AuthLayout } from '../components/auth-layout';
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

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? undefined;
  const [formError, setFormError] = useState<string | null>(null);

  // Validate an invite token (if present) to render the "invited as professor" banner.
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
    <AuthLayout
      title="Create your account"
      description={
        invitedAsProfessor
          ? 'Complete your professor account to get started.'
          : 'Start solving problems on CodeStack.'
      }
    >
      {invitedAsProfessor && (
        <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand" />
          <p>
            You've been invited to join as a <span className="font-semibold">professor</span>.
            Finish signing up and you'll have teaching access right away.
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
                    <Input autoComplete="given-name" {...field} />
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
                    <Input autoComplete="family-name" {...field} />
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
                  <Input type="email" autoComplete="email" placeholder="you@school.edu" {...field} />
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
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button
            type="submit"
            size="lg"
            className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
