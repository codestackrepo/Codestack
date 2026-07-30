import {
  AccessChangeParams,
  OrgAssignedParams,
  PasswordResetParams,
  RenderedMail,
  WelcomeParams,
} from '../mail.types';
import { button, displayName, escapeHtml, oneLine, wrapHtml, wrapText } from './layout';

/** Sent once, after an invite is accepted and the account actually exists. */
export function welcome(p: WelcomeParams): RenderedMail {
  const org = oneLine(p.orgName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Welcome to CodeStack',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Your CodeStack account at <strong>${escapeHtml(org)}</strong> is ready.
      </p>
      ${button(p.loginUrl, 'Sign in')}
      <p style="margin:0;font-size:13px;color:#6b6f80">
        Keep this address handy — it's the one you sign in with.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `Your CodeStack account at ${org} is ready.`,
    '',
    `Sign in: ${p.loginUrl}`,
  ]);

  return { subject: `Welcome to ${org} on CodeStack`, html, text };
}

/**
 * Access revoked.
 *
 * The copy names NEITHER the acting staff member NOR the organization. A person
 * who has just lost access should not be handed a name to escalate at, and the
 * mail may be read long after the fact. It also does not say "you have been
 * signed out": revocation takes effect on the account's NEXT request (the auth
 * guard re-reads the row), so promising an immediate sign-out would be a lie on
 * a page they still have open.
 */
export function accessRevoked(p: AccessChangeParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Your CodeStack access has been turned off',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Your access to CodeStack has been turned off. You won't be able to sign in, and any open
        session will stop working on its next action.
      </p>
      <p style="margin:0;font-size:15px">
        If you think this is a mistake, contact whoever administers CodeStack where you study or work.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    "Your access to CodeStack has been turned off. You won't be able to sign in, and any",
    'open session will stop working on its next action.',
    '',
    'If you think this is a mistake, contact whoever administers CodeStack where you',
    'study or work.',
  ]);

  return { subject: 'Your CodeStack access has been turned off', html, text };
}

/** Access restored. Same reticence as the revoke mail — no actor, no org. */
export function accessRestored(p: AccessChangeParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Your CodeStack access has been restored',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0;font-size:15px">
        Your access to CodeStack has been restored — you can sign in again.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Your access to CodeStack has been restored — you can sign in again.',
  ]);

  return { subject: 'Your CodeStack access has been restored', html, text };
}

/**
 * A self-registered, previously unassigned student has been placed into an
 * organization by staff. They already have an account and a password, so this is
 * a sign-in link, not an accept link — there is no token in this mail.
 */
export function orgAssigned(p: OrgAssignedParams): RenderedMail {
  const org = oneLine(p.orgName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    "You've been added to an organization",
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        You've been added to <strong>${escapeHtml(org)}</strong> on CodeStack. Your classrooms,
        assignments and problems are available now — sign in with the account you already have.
      </p>
      ${button(p.loginUrl, 'Go to CodeStack')}`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `You've been added to ${org} on CodeStack. Your classrooms, assignments and problems`,
    'are available now — sign in with the account you already have.',
    '',
    `Go to CodeStack: ${p.loginUrl}`,
  ]);

  return { subject: `You've been added to ${org} on CodeStack`, html, text };
}

/**
 * Password reset.
 *
 * Sent only for an address that exists — the endpoint answers 200 either way, so
 * the absence of this mail is the only signal, and it never reaches an attacker
 * probing for valid addresses. Expiry is in MINUTES, not days, and single-use.
 */
export function passwordReset(p: PasswordResetParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Reset your CodeStack password',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        We received a request to reset your CodeStack password.
      </p>
      ${button(p.resetUrl, 'Reset password')}
      <p style="margin:0 0 8px;font-size:13px;color:#6b6f80">
        This link expires in ${p.expiresInMinutes} minutes and can be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6f80">
        If you didn't request this, ignore this email — your password stays as it is.<br />
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(p.resetUrl)}</span>
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'We received a request to reset your CodeStack password.',
    '',
    `Reset password: ${p.resetUrl}`,
    '',
    `This link expires in ${p.expiresInMinutes} minutes and can be used once.`,
    "If you didn't request this, ignore this email — your password stays as it is.",
  ]);

  return { subject: 'Reset your CodeStack password', html, text };
}
