/**
 * Machine-readable API `reason` codes → the sentence a person should read (#118).
 *
 * The backend already returns a stable `reason` on every deliberate rejection; this is
 * the one place that turns those into copy, so the same failure never gets two different
 * explanations in two different components.
 *
 * THE GOVERNING RULE: **page-state for arrival, toast for action.**
 *
 * A toast is for something the user just DID — a click that failed, a save that
 * worked. It is the wrong shape for the state a page is in when it loads: a toast that
 * fires on mount is easy to miss, cannot be re-read, and leaves the page looking
 * functional underneath. So an expired invite, a used verification link and a rejected
 * application are all PAGE STATES with their own copy and their own next step; only the
 * failures below are toasts.
 *
 * That is also why the token-preview endpoints never 4xx — they answer 200 with a
 * status precisely so the page can render a state instead of catching an error.
 */

/**
 * Cross-cutting reasons, handled centrally by the api-client interceptor.
 *
 * These can come back from ANY request, so handling them per-call-site would mean
 * remembering them everywhere.
 */
export const CROSS_CUTTING_REASONS: Record<string, string> = {
  module_disabled: 'This section has been disabled by your administrator.',
  entitlement_required: 'Your organization does not have access to this capability.',
  org_suspended: 'Your organization has been suspended.',
  no_organization: 'You are not yet part of an organization.',
  /**
   * #118. A member of the open community tenant hit an org-staff surface. Deliberately
   * NOT phrased as a permission failure — they have done nothing wrong, and the feature
   * genuinely does not apply to someone who is not in an institution.
   */
  community_restricted:
    'Member directories are only available inside an organization, not on the open platform.',
};

/**
 * Flow-specific reasons, handled by the mutation that provoked them.
 *
 * Kept out of the interceptor on purpose: each one has a specific next step that only
 * the calling screen can offer, and a generic global toast would replace a precise
 * explanation with a vague one.
 */
export const FLOW_REASONS: Record<string, string> = {
  // Auth
  email_unverified: 'Confirm your email address to sign in. Check your inbox for the link we sent.',
  verify_token_invalid: 'That confirmation link is not valid. Request a new one.',
  verify_token_used: 'That link has already been used — your address is confirmed.',
  verify_token_expired: 'That confirmation link has expired. Request a new one.',
  reset_token_invalid: 'That reset link is not valid. Request a new one.',
  reset_token_used: 'That reset link has already been used.',
  reset_token_expired: 'That reset link has expired. Request a new one.',
  account_disabled: 'This account is disabled. Contact your administrator.',

  // Invites
  invite_not_found: 'We could not find that invitation.',
  invite_already_accepted: 'That invitation has already been accepted.',
  invite_revoked: 'That invitation was withdrawn.',
  invite_expired: 'That invitation has expired. Ask for a new one.',
  invite_already_pending: 'There is already a pending invitation for that address.',
  invite_email_mismatch: 'That invitation was sent to a different email address.',
  email_unavailable: 'That address cannot be used here.',
  account_exists: 'That address already has an account.',
  account_ineligible: 'That account cannot accept this invitation.',
  role_not_invitable: 'You cannot invite someone at that role.',
  role_not_assignable: 'You cannot assign that role.',

  // Applications (#118)
  application_not_found: 'We could not find that application.',
  application_already_reviewed: 'Someone has already reviewed this application.',
  slug_unavailable: 'Could not derive a unique short name for this organization. Try renaming it.',
  invalid_branding: 'That logo URL is not valid. It must be an absolute https:// address.',

  // Quotas
  quota_exceeded: 'That would exceed a limit set for your organization.',
};

/**
 * The message for a reason code, or a fallback.
 *
 * Prefers the SERVER's message when the reason is unknown to this map: the API writes
 * specific, contextual messages (a quota error names the resource and the numbers), and
 * a generic client string would throw that detail away. This map exists to make copy
 * consistent where it would otherwise be invented per component, not to override the
 * backend.
 */
export function toastMessageFor(reason: string | undefined, serverMessage?: string): string {
  if (reason && FLOW_REASONS[reason]) return FLOW_REASONS[reason];
  if (reason && CROSS_CUTTING_REASONS[reason]) return CROSS_CUTTING_REASONS[reason];
  return serverMessage || 'Something went wrong. Please try again.';
}
