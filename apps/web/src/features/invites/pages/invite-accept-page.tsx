import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
import { parseApiError } from '@/lib/api-client';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { useAuth } from '@/features/auth/context/auth-context';
import { passwordConfirmSchema } from '@/features/auth/password-schema';
import { invitesApi, inviteKeys } from '../api/invites.api';

const schema = passwordConfirmSchema;
type FormValues = z.infer<typeof schema>;

/**
 * Accept an organization invitation.
 *
 * DISCLOSURE RULE: only the `valid` branch may render the email, organization or
 * role. A spent, revoked or expired token sitting in browser history or a
 * forwarded mail would otherwise be a permanent oracle for "who was invited where"
 * — so every other branch renders the status and nothing else. That is why the
 * server's preview returns all-null identity fields when `valid` is false, and
 * this page must not undo it by remembering what it saw.
 */
export function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, acceptInvite, logout } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: preview, isLoading } = useQuery({
    queryKey: inviteKeys.preview(token),
    queryFn: () => invitesApi.preview(token),
    // The token is immutable and the answer cannot change while this page is
    // open; refetching would only re-send it over the wire.
    retry: false,
    staleTime: Infinity,
    enabled: !!token,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await acceptInvite({ token, password: values.password });
      navigate('/home', { replace: true });
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  if (isLoading) {
    return (
      <AuthLayout title="Checking your invitation" description="One moment.">
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-2/3 animate-pulse rounded-md bg-muted" />
        </div>
      </AuthLayout>
    );
  }

  // Everything that is not a live invitation. Deliberately identical copy for
  // every cause: distinguishing "revoked" from "already accepted" tells the holder
  // of a stale link something about an account they may not own.
  if (!preview?.valid) {
    return (
      <AuthLayout
        title="This invitation is no longer valid"
        description="It may have expired, been withdrawn, or already been used."
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>Ask whoever invited you to send a new one.</p>
          <Link
            to="/login"
            className="block text-center font-semibold text-primary hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Signed in as somebody else. Accepting would create a SECOND account for a
  // person already holding a session, so make the conflict explicit rather than
  // silently minting cookies over the top of theirs.
  if (user) {
    const sameAccount = user.email.toLowerCase() === (preview.email ?? '').toLowerCase();
    return (
      <AuthLayout
        title="You're already signed in"
        description={`This invitation is for ${preview.email}.`}
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            You&apos;re signed in as{' '}
            <span className="font-medium text-foreground">{user.email}</span>
            {sameAccount
              ? ' — accept it from your pending invitations instead.'
              : '. Sign out to accept this invitation.'}
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={async () => {
              await logout();
            }}
          >
            Sign out and continue
          </Button>
          <Link to="/home" className="block text-center text-muted-foreground hover:underline">
            Stay signed in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${preview.organizationName}`}
      description={`Set a password for ${preview.email} to finish setting up your account.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormItem>
            <FormLabel>Email</FormLabel>
            {/* Read-only from the preview: the invite is addressed to this
                address, and the server would reject any other. */}
            <Input value={preview.email ?? ''} readOnly disabled />
          </FormItem>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
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
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating your account…' : 'Accept invitation'}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
