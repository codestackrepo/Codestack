import {
  InviteParams,
  OrgApplicationAlertParams,
  OrgApplicationApprovedParams,
  OrgApplicationReceivedParams,
  OrgApplicationRejectedParams,
  ProfessorApplicationAlertParams,
  ProfessorApplicationReceivedParams,
  ProfessorApplicationRejectedParams,
  RenderedMail,
} from '../mail.types';
import { button, displayName, escapeHtml, oneLine, wrapHtml, wrapText } from './layout';

/**
 * Organization-application mails (#118).
 *
 * Every one of these renders APPLICANT-SUPPLIED text — organization name, contact
 * name, website, free-form message — into a subject line or an HTML body. So
 * `oneLine` guards every subject (a bare CR/LF in a header terminates it and lets the
 * rest be parsed as new headers, i.e. an injected Bcc) and `escapeHtml` guards every
 * interpolation. This is a PUBLIC endpoint: the person choosing that text is not
 * authenticated and is not necessarily acting in good faith.
 *
 * None of these carry a token. The one mail in this flow that does is the ordinary
 * `org-admin-invite`, minted by the existing invite machinery at approval — reusing
 * it rather than inventing a parallel credential is what keeps the accept path, the
 * TTL, the resend cooldown and the redaction rules identical for every invite.
 */

/** Acknowledgement to the applicant. Promises a review, not an outcome. */
export function orgApplicationReceived(p: OrgApplicationReceivedParams): RenderedMail {
  const org = oneLine(p.organizationName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'We have your application',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Thanks — we've received the application for <strong>${escapeHtml(org)}</strong> to use
        CodeStack. Our team reviews each one by hand, so give us a little time.
      </p>
      <p style="margin:0;font-size:15px">
        When it's approved we'll email the administrator with a link to set up the workspace.
        Nothing is needed from you in the meantime.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `Thanks — we've received the application for ${org} to use CodeStack. Our team`,
    'reviews each one by hand, so give us a little time.',
    '',
    "When it's approved we'll email the administrator with a link to set up the",
    'workspace. Nothing is needed from you in the meantime.',
  ]);

  return { subject: `We've received your CodeStack application for ${org}`, html, text };
}

/**
 * Alert to the platform superadmins.
 *
 * Mailed as well as raised in-app because a superadmin may not be logged in, and an
 * application nobody looks at is an institution that gives up and goes elsewhere.
 */
export function orgApplicationAlert(p: OrgApplicationAlertParams): RenderedMail {
  const org = oneLine(p.organizationName);
  const contact = oneLine(p.contactName);

  const detail = (label: string, value?: string | null): string =>
    value
      ? `<p style="margin:0 0 6px;font-size:14px"><span style="color:#6b6f80">${label}:</span> ${escapeHtml(value)}</p>`
      : '';

  const html = wrapHtml(
    'New organization application',
    `
      <p style="margin:0 0 16px;font-size:15px">
        <strong>${escapeHtml(org)}</strong> has applied to use CodeStack.
      </p>
      <div style="margin:0 0 16px;padding:12px;background:#f6f7f9;border-radius:6px">
        ${detail('Contact', contact)}
        ${detail('Email', p.contactEmail)}
        ${detail('Website', p.website)}
        ${p.message ? `<p style="margin:8px 0 0;font-size:14px;white-space:pre-wrap">${escapeHtml(p.message)}</p>` : ''}
      </div>
      ${button(p.reviewUrl, 'Review the application')}
      <p style="margin:0;font-size:13px;color:#6b6f80">
        Approving it creates the organization, sets its seat limits and invites its administrator.
      </p>`,
  );

  const text = wrapText([
    `${org} has applied to use CodeStack.`,
    '',
    `Contact: ${contact}`,
    `Email: ${p.contactEmail}`,
    ...(p.website ? [`Website: ${p.website}`] : []),
    ...(p.message ? ['', p.message] : []),
    '',
    `Review: ${p.reviewUrl}`,
  ]);

  return { subject: `New CodeStack application: ${org}`, html, text };
}

/**
 * Approved — sent to the CONTACT, and only when they are not the administrator.
 *
 * When the contact IS the admin they get the `org-admin-invite` instead, which carries
 * the accept link. Sending both would be two mails about one event, one of which looks
 * like it needs an action it does not.
 */
export function orgApplicationApproved(p: OrgApplicationApprovedParams): RenderedMail {
  const org = oneLine(p.organizationName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'Your application was approved',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Good news — <strong>${escapeHtml(org)}</strong> is approved on CodeStack.
      </p>
      <p style="margin:0;font-size:15px">
        We've sent the setup invitation to <strong>${escapeHtml(p.adminEmail)}</strong>. Once they
        accept it and set a password, they can start inviting professors and students.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `Good news — ${org} is approved on CodeStack.`,
    '',
    `We've sent the setup invitation to ${p.adminEmail}. Once they accept it and set a`,
    'password, they can start inviting professors and students.',
  ]);

  return { subject: `${org} is approved on CodeStack`, html, text };
}

/**
 * Declined.
 *
 * The reason is optional and superadmin-authored. Rendered with `white-space:pre-wrap`
 * so a multi-line explanation survives, and escaped like every other untrusted string
 * — a reviewer is trusted to be honest, not to avoid typing a `<`.
 */
export function orgApplicationRejected(p: OrgApplicationRejectedParams): RenderedMail {
  const org = oneLine(p.organizationName);
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'About your CodeStack application',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Thanks for your interest in CodeStack. We aren't able to approve the application for
        <strong>${escapeHtml(org)}</strong> at this time.
      </p>
      ${
        p.reason
          ? `<div style="margin:0 0 16px;padding:12px;background:#f6f7f9;border-radius:6px;font-size:14px;white-space:pre-wrap">${escapeHtml(p.reason)}</div>`
          : ''
      }
      <p style="margin:0;font-size:15px">
        If something has changed, or you think we've misunderstood, you're welcome to apply again.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    `Thanks for your interest in CodeStack. We aren't able to approve the application`,
    `for ${org} at this time.`,
    ...(p.reason ? ['', p.reason] : []),
    '',
    "If something has changed, or you think we've misunderstood, you're welcome to",
    'apply again.',
  ]);

  return { subject: `About your CodeStack application for ${org}`, html, text };
}

// ---------------------------------------------------------------------------
// Open-professor applications (#118)
// ---------------------------------------------------------------------------

/** Acknowledgement to someone applying to teach on the open platform. */
export function professorApplicationReceived(p: ProfessorApplicationReceivedParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'We have your request',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Thanks for asking to teach on CodeStack. A member of our team reviews every request by
        hand, so give us a little time.
      </p>
      <p style="margin:0;font-size:15px">
        If it's approved we'll email you a link to set a password and get started. You don't need
        to do anything until then.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Thanks for asking to teach on CodeStack. A member of our team reviews every',
    'request by hand, so give us a little time.',
    '',
    "If it's approved we'll email you a link to set a password and get started.",
    "You don't need to do anything until then.",
  ]);

  return { subject: "We've received your request to teach on CodeStack", html, text };
}

/** Alert to the platform superadmins that a professor request is waiting. */
export function professorApplicationAlert(p: ProfessorApplicationAlertParams): RenderedMail {
  const applicant = oneLine(p.applicantName);

  const detail = (label: string, value?: string | null): string =>
    value
      ? `<p style="margin:0 0 6px;font-size:14px"><span style="color:#6b6f80">${label}:</span> ${escapeHtml(value)}</p>`
      : '';

  const html = wrapHtml(
    'New professor request',
    `
      <p style="margin:0 0 16px;font-size:15px">
        <strong>${escapeHtml(applicant)}</strong> has asked to teach on CodeStack.
      </p>
      <div style="margin:0 0 16px;padding:12px;background:#f6f7f9;border-radius:6px">
        ${detail('Email', p.applicantEmail)}
        ${detail('Institution', p.institution)}
        ${p.message ? `<p style="margin:8px 0 0;font-size:14px;white-space:pre-wrap">${escapeHtml(p.message)}</p>` : ''}
      </div>
      ${button(p.reviewUrl, 'Review the request')}
      <p style="margin:0;font-size:13px;color:#6b6f80">
        Approving it emails them a link to set a password and start teaching.
      </p>`,
  );

  const text = wrapText([
    `${applicant} has asked to teach on CodeStack.`,
    '',
    `Email: ${p.applicantEmail}`,
    ...(p.institution ? [`Institution: ${p.institution}`] : []),
    ...(p.message ? ['', p.message] : []),
    '',
    `Review: ${p.reviewUrl}`,
  ]);

  return { subject: `New CodeStack professor request: ${applicant}`, html, text };
}

/**
 * Approved — and this mail IS the invite. It carries `acceptUrl`, so it is
 * credential-bearing and `verifyUrl`/`acceptUrl` redaction covers it automatically.
 *
 * Takes `InviteParams` because it goes out through the ordinary invite machinery as a
 * template override. `orgName` is therefore present and deliberately IGNORED: the
 * organization is the community tenant, and telling someone they have joined "CodeStack
 * Community" would name an institution that does not exist. From their side they were
 * approved to teach on CodeStack, so that is what the copy says.
 */
export function professorApplicationApproved(p: InviteParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    "You're approved to teach on CodeStack",
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Good news — your request to teach on CodeStack has been approved. Set a password and
        you're in.
      </p>
      ${button(p.acceptUrl, 'Set your password')}
      <p style="margin:0 0 8px;font-size:13px;color:#6b6f80">
        This link expires in ${p.expiresInDays} days and can be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6f80">
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(p.acceptUrl)}</span>
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    'Good news — your request to teach on CodeStack has been approved. Set a password',
    "and you're in.",
    '',
    `Set your password: ${p.acceptUrl}`,
    '',
    `This link expires in ${p.expiresInDays} days and can be used once.`,
  ]);

  return { subject: "You're approved to teach on CodeStack", html, text };
}

/** Declined. Optional superadmin-authored reason, escaped like all untrusted text. */
export function professorApplicationRejected(p: ProfessorApplicationRejectedParams): RenderedMail {
  const name = displayName(p.firstName, p.lastName);

  const html = wrapHtml(
    'About your CodeStack request',
    `
      <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px">
        Thanks for your interest in teaching on CodeStack. We aren't able to approve your request
        at this time.
      </p>
      ${
        p.reason
          ? `<div style="margin:0 0 16px;padding:12px;background:#f6f7f9;border-radius:6px;font-size:14px;white-space:pre-wrap">${escapeHtml(p.reason)}</div>`
          : ''
      }
      <p style="margin:0;font-size:15px">
        You're welcome to apply again, and you can always use CodeStack as a learner in the
        meantime.
      </p>`,
  );

  const text = wrapText([
    `Hi ${name},`,
    '',
    "Thanks for your interest in teaching on CodeStack. We aren't able to approve your",
    'request at this time.',
    ...(p.reason ? ['', p.reason] : []),
    '',
    "You're welcome to apply again, and you can always use CodeStack as a learner in",
    'the meantime.',
  ]);

  return { subject: 'About your CodeStack request', html, text };
}
