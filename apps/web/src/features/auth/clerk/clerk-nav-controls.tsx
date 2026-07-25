import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';

/**
 * Clerk-mode navbar cluster (#59): the org switcher + user button, replacing the
 * custom avatar dropdown. Both inherit the theme-synced appearance from
 * ClerkProvider. Rendered only when Clerk is enabled (they require ClerkProvider).
 */
export function ClerkNavControls() {
  return (
    <div className="flex items-center gap-2">
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/home" />
      <UserButton />
    </div>
  );
}
