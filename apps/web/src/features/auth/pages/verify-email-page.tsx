import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseApiError } from '@/lib/api-client';
import { AuthLayout } from '../components/auth-layout';
import { authApi, type VerificationPreview } from '../api/auth.api';
import { useAuth } from '../context/auth-context';

const DEAD_COPY: Record<
  Exclude<VerificationPreview['status'], 'valid'>,
  { title: string; body: string }
> = {
  expired: {
    title: 'This link has expired',
    body: 'Confirmation links are valid for 24 hours. Request a new one and it will arrive in a moment.',
  },
  used: {
    title: 'This address is already confirmed',
    body: 'Each confirmation link works once — this one has been used, which means you are all set. Sign in to continue.',
  },
  not_found: {
    title: 'This link is not valid',
    body: 'Check that you copied the whole link from the email. If it was split across two lines, the end may be missing.',
  },
};

/**
 * Consume a verification link (#118).
 *
 * Mirrors the reset-password page's state machine — loading, then one of
 * not-found / expired / used, or the action — because the preview endpoint never
 * 4xxs. Every dead-link case is a normal 200 carrying a status, so there is no error
 * branch to render and no way for a token to reach the log via an exception path.
 *
 * ONE DELIBERATE DIFFERENCE from reset-password: this page does NOT auto-consume the
 * token on mount. Mail clients and security scanners pre-fetch links, and an
 * auto-consuming GET would let a scanner burn the single-use token before the human
 * ever clicked — leaving them with "already used" and no way in. So the preview
 * (which consumes nothing) runs automatically and the consume waits for a real click.
 */
export function VerifyEmailPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Guards against a double-submit racing itself into "token already used". */
  const submitted = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'verify-preview', token],
    queryFn: () => authApi.previewVerification(token),
    retry: false,
    enabled: !!token,
  });

  async function onConfirm() {
    if (submitted.current) return;
    submitted.current = true;
    setConfirming(true);
    setFormError(null);
    try {
      await verifyEmail(token);
      // Verifying mints cookies, so go straight into the app. Bouncing someone who
      // has just proved mailbox access to a login form would be asking them to
      // authenticate twice for one arrival.
      navigate('/onboarding', { replace: true });
    } catch (error) {
      submitted.current = false;
      setFormError(parseApiError(error).message);
    } finally {
      setConfirming(false);
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
    const status = (data?.status ?? 'not_found') as Exclude<VerificationPreview['status'], 'valid'>;
    const copy = DEAD_COPY[status];
    return (
      <AuthLayout title={copy.title} description={copy.body}>
        {/*
         * An ALREADY-USED link is a success, not a failure: the address is confirmed
         * and the account works. Sending that person to "request a new link" would be
         * telling them to fix something that is not broken.
         */}
        <Link
          to={status === 'used' ? '/login' : '/resend-verification'}
          className="block text-center text-sm font-semibold text-primary hover:underline"
        >
          {status === 'used' ? 'Sign in' : 'Send me a new link'}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Confirm your email address"
      description={
        data.maskedEmail
          ? `You're confirming ${data.maskedEmail}.`
          : 'One click and your account is ready.'
      }
    >
      <div className="space-y-4">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={onConfirm}
          disabled={confirming}
        >
          {confirming ? 'Confirming…' : 'Confirm and continue'}
        </Button>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Confirming signs you in on this device. The link then stops working.
        </p>
      </div>
    </AuthLayout>
  );
}
