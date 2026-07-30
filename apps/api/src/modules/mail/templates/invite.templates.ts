import { InviteParams, InviteReminderParams, RenderedMail } from '../mail.types';
import { button, displayName, escapeHtml, oneLine, wrapHtml, wrapText } from './layout';

/**
 * Invite mails. All four share one body builder because the only real difference
 * is what the recipient is being invited to DO — the accept mechanics, the
 * expiry line and the "paste this link" fallback are identical, and divergence
 * there is how one variant quietly loses its plain-text URL.
 *
 * `acceptUrl` is `{WEB_APP_URL}/invite/{token}` and is built by
 * `MailService.webUrl`. It is the ONLY place the raw token exists in a mail.
 */
function inviteBody(
  p: InviteParams,
  opts: { intro: string; roleNote?: string; cta: string },
): RenderedMail & { subject: string } {
  const org = oneLine(p.orgName);
  const name = displayName(p.firstName, p.lastName);
  const inviter = oneLine(p.inviterName);
  const byLine = inviter ? ` by ${escapeHtml(inviter)}` : '';
  const byLineText = inviter ? ` by ${inviter}` : '';

  const html = wrapHtml(
    opts.cta,
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        You've been invited${byLine} to join <strong>${escapeHtml(org)}</strong> on CodeStack ${opts.intro}.
      </p>
      ${opts.roleNote ? `<p style="margin:0 0 16px;font-size:15px">${opts.roleNote}</p>` : ''}
      ${button(p.acceptUrl, opts.cta)}
      <p style="margin:0 0 8px;font-size:13px;color:#6b6f80">
        This invitation expires in ${p.expiresInDays} day${p.expiresInDays === 1 ? '' : 's'}.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6f80">
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(p.acceptUrl)}</span>
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `You've been invited${byLineText} to join ${org} on CodeStack ${opts.intro}.`,
    '',
    `${opts.cta}: ${p.acceptUrl}`,
    '',
    `This invitation expires in ${p.expiresInDays} day${p.expiresInDays === 1 ? '' : 's'}.`,
  ]);

  return { subject: '', html, text };
}

export function orgAdminInvite(p: InviteParams): RenderedMail {
  const body = inviteBody(p, {
    intro: 'as an administrator',
    roleNote:
      'As an admin you can invite and manage the people in your organization, and see everything they submit.',
    cta: 'Accept invitation',
  });
  return { ...body, subject: `You're invited to administer ${oneLine(p.orgName)} on CodeStack` };
}

export function professorInvite(p: InviteParams): RenderedMail {
  const body = inviteBody(p, {
    intro: 'as a professor',
    roleNote:
      'As a professor you can create classrooms and assignments, and grade the work your students submit.',
    cta: 'Accept invitation',
  });
  return { ...body, subject: `You're invited to teach at ${oneLine(p.orgName)} on CodeStack` };
}

export function studentInvite(p: InviteParams): RenderedMail {
  const body = inviteBody(p, {
    intro: 'as a student',
    roleNote: 'Accept the invitation to set your password and start solving.',
    cta: 'Accept invitation',
  });
  return { ...body, subject: `You're invited to join ${oneLine(p.orgName)} on CodeStack` };
}

/**
 * Resend of an unaccepted invite. A resend ROTATES the token, so this always
 * carries a fresh `acceptUrl` and every previously mailed link is already dead —
 * the copy says so rather than letting someone dig up the older mail.
 */
export function inviteReminder(p: InviteReminderParams): RenderedMail {
  const org = oneLine(p.orgName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Reminder: your invitation is waiting',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Just a reminder that your invitation to join <strong>${escapeHtml(org)}</strong> on CodeStack
        is still waiting.
      </p>
      ${button(p.acceptUrl, 'Accept invitation')}
      <p style="margin:0 0 8px;font-size:13px;color:#6b6f80">
        This link expires in ${p.expiresInDays} day${p.expiresInDays === 1 ? '' : 's'}, and it
        replaces any earlier invitation link — older ones no longer work.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6f80">
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(p.acceptUrl)}</span>
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `A reminder that your invitation to join ${org} on CodeStack is still waiting.`,
    '',
    `Accept invitation: ${p.acceptUrl}`,
    '',
    `This link expires in ${p.expiresInDays} day${p.expiresInDays === 1 ? '' : 's'} and replaces`,
    'any earlier invitation link — older ones no longer work.',
  ]);

  return { subject: `Reminder: your ${org} invitation is waiting`, html, text };
}
