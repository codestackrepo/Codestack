import {
  AccountExistsParams,
  RenderedMail,
  VerifyEmailParams,
  WelcomeOpenParams,
} from '../mail.types';
import { button, displayName, escapeHtml, wrapHtml, wrapText } from './layout';

/**
 * Verify your address — the first mail an open-platform signup ever receives.
 *
 * Names NO organization, and that is not an omission. This mail exists for the
 * self-signup path, where the person belongs to no tenant yet; the community
 * tenant they are placed in is an implementation detail of ours, not a thing they
 * chose or should be told they joined. Closed-ecosystem members never see this mail
 * at all — accepting an invite proves mailbox access on its own.
 *
 * Deliberately un-co-branded for the same reason `passwordReset` is: this is an
 * account-security artifact, and keeping it visually invariant makes a phishing
 * lookalike easier to spot than a mail whose appearance legitimately varies.
 *
 * The "ignore this" line is load-bearing. Someone who never signed up is reading a
 * mail about an account in their name, and the honest thing to tell them is that
 * doing nothing costs them nothing: an unverified account cannot be signed into.
 */
export function verifyEmail(p: VerifyEmailParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Confirm your email address',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Confirm this address to finish setting up your CodeStack account.
      </p>
      ${button(p.verifyUrl, 'Confirm email address')}
      <p style="margin:0 0 8px;font-size:13px;color:#6b6f80">
        This link expires in ${p.expiresInHours} hours and can be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6f80">
        If you didn't create a CodeStack account, ignore this email — an unconfirmed address
        can't be signed in to, and the account will never become usable.<br />
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(p.verifyUrl)}</span>
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Confirm this address to finish setting up your CodeStack account.',
    '',
    `Confirm email address: ${p.verifyUrl}`,
    '',
    `This link expires in ${p.expiresInHours} hours and can be used once.`,
    "If you didn't create a CodeStack account, ignore this email — an unconfirmed",
    "address can't be signed in to.",
  ]);

  return { subject: 'Confirm your email address', html, text };
}

/**
 * Sent once, after an OPEN-platform signup confirms its address.
 *
 * Names no organization — the counterpart to `welcome`, which names one because its
 * recipient genuinely joined an institution. Saying "welcome to CodeStack Community"
 * would tell this person they joined a thing they never chose; from their side they
 * joined CodeStack.
 */
export function welcomeOpen(p: WelcomeOpenParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Welcome to CodeStack',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Your address is confirmed and your CodeStack account is ready. Practice problems and
        the playground are open to you now.
      </p>
      ${button(p.loginUrl, 'Start practising')}
      <p style="margin:0;font-size:13px;color:#6b6f80">
        Keep this address handy — it's the one you sign in with.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Your address is confirmed and your CodeStack account is ready. Practice problems',
    'and the playground are open to you now.',
    '',
    `Start practising: ${p.loginUrl}`,
  ]);

  return { subject: 'Welcome to CodeStack', html, text };
}

/**
 * Someone tried to sign up with an address that already has a usable account.
 *
 * This mail is the only thing that distinguishes that case, and it is sent to the
 * MAILBOX OWNER rather than reflected to the caller — which is the whole design. The
 * HTTP response is byte-identical to a fresh signup, so a prober learns nothing;
 * meanwhile the person who actually owns the address is told what happened and
 * pointed at the two things they plausibly wanted.
 *
 * Deliberately carries NO token. Anyone who can type an email address can trigger
 * this, so mailing a live credential here would turn signup into an on-demand
 * "send a working link to someone else's inbox" primitive. Both links are ordinary
 * pages that prove nothing by themselves.
 *
 * The copy avoids alarm on purpose: overwhelmingly the trigger is the owner
 * themselves, having forgotten they already signed up.
 */
export function accountExists(p: AccountExistsParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'You already have a CodeStack account',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Someone just tried to sign up for CodeStack with this address — but it already has an
        account, so we didn't create a second one.
      </p>
      ${button(p.loginUrl, 'Sign in')}
      <p style="margin:0;font-size:13px;color:#6b6f80">
        Forgotten your password? Reset it here:<br />
        <span style="word-break:break-all">${escapeHtml(p.forgotPasswordUrl)}</span>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b6f80">
        If that wasn't you, no action is needed — nothing about your account has changed.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Someone just tried to sign up for CodeStack with this address — but it already has',
    "an account, so we didn't create a second one.",
    '',
    `Sign in: ${p.loginUrl}`,
    `Reset your password: ${p.forgotPasswordUrl}`,
    '',
    "If that wasn't you, no action is needed — nothing about your account has changed.",
  ]);

  return { subject: 'You already have a CodeStack account', html, text };
}
