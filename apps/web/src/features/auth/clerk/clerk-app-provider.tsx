import { useEffect, useMemo, type ReactNode } from 'react';
import { ClerkProvider, useAuth as useClerkAuth, useOrganization } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { useTheme } from 'next-themes';
import { AuthProvider } from '@/features/auth/context/auth-context';
import { setClerkTokenGetter } from '@/lib/api-client';
import { CLERK_PUBLISHABLE_KEY, isClerkEnabled } from '@/lib/clerk';

/**
 * Bridges Clerk into the app-wide AuthProvider (#59). It registers Clerk's
 * `getToken` with the api-client singleton (so requests carry a bearer), and
 * feeds the active org id + `signOut` down to AuthProvider. Rendered only inside
 * ClerkProvider, so its Clerk hooks are always valid.
 */
function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, signOut } = useClerkAuth();
  const { organization } = useOrganization();

  useEffect(() => {
    setClerkTokenGetter((opts) => getToken(opts));
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return (
    <AuthProvider clerkEnabled clerkOrgId={organization?.id ?? null} clerkSignOut={() => signOut()}>
      {children}
    </AuthProvider>
  );
}

/** ClerkProvider with its appearance kept in sync with the app light/dark theme. */
function ClerkThemedProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  // `theme` is the current appearance key (baseTheme is deprecated in Clerk v5).
  // Memoized so Clerk's updateProps effect fires only on an actual theme change.
  const appearance = useMemo(
    () => ({ theme: resolvedTheme === 'dark' ? dark : undefined }),
    [resolvedTheme],
  );
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/login"
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  );
}

/**
 * Single auth entry point (#59). In Clerk mode it wraps the app in a
 * theme-synced ClerkProvider + the token bridge; with no publishable key it
 * falls straight through to the legacy JWT-cookie AuthProvider — so the app is
 * bootable in both modes and cookie-mode behaviour is unchanged.
 */
export function ClerkAppProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) {
    return <AuthProvider>{children}</AuthProvider>;
  }
  return (
    <ClerkThemedProvider>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkThemedProvider>
  );
}
