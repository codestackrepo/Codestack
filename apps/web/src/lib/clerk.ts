/**
 * Clerk cutover switch (#59). The app runs in ONE of two auth modes, chosen at
 * build/runtime by whether a Clerk publishable key is configured:
 *   - key present -> Clerk mode (ClerkProvider, bearer tokens, Clerk UI)
 *   - key absent  -> legacy JWT-cookie mode (unchanged)
 * `isClerkEnabled` is a module constant (never changes during a session), so it
 * is safe to branch component trees on it without violating the rules of hooks.
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

export const isClerkEnabled = Boolean(CLERK_PUBLISHABLE_KEY);
