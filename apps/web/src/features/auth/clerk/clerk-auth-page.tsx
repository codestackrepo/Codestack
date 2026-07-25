import { SignIn, SignUp } from '@clerk/clerk-react';
import { Logo } from '@/components/shared/logo';
import { AuthBrandPanel } from '../components/auth-brand-panel';

/**
 * Clerk-mode auth surface (#59): the brand panel beside Clerk's prebuilt
 * <SignIn>/<SignUp>. Hash routing keeps both flows self-contained on /login and
 * /register without wiring Clerk into react-router. Replaces the custom
 * login/register forms only when Clerk is enabled — the legacy forms remain for
 * cookie mode.
 */
export function ClerkAuthPage({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="relative flex min-h-svh bg-background text-foreground">
      <div className="hidden w-1/2 overflow-hidden lg:block">
        <AuthBrandPanel />
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center lg:hidden">
            <Logo wordmarkClassName="text-foreground" />
          </div>
          {mode === 'login' ? (
            <SignIn routing="hash" signUpUrl="/register" fallbackRedirectUrl="/home" />
          ) : (
            <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/home" />
          )}
        </div>
      </div>
    </div>
  );
}
