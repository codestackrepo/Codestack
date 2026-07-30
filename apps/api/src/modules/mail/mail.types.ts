/**
 * The nine transactional templates (#103). Adding one means adding a key here, a
 * params interface below, and an entry in the TEMPLATES registry — the compiler
 * then refuses any enqueue whose params do not match its template.
 */
export enum MailTemplate {
  ORG_ADMIN_INVITE = 'org-admin-invite',
  PROFESSOR_INVITE = 'professor-invite',
  STUDENT_INVITE = 'student-invite',
  INVITE_REMINDER = 'invite-reminder',
  WELCOME = 'welcome',
  ACCESS_REVOKED = 'access-revoked',
  ACCESS_RESTORED = 'access-restored',
  ORG_ASSIGNED = 'org-assigned',
  PASSWORD_RESET = 'password-reset',
}

/** What a template renders to. No engine, no new dependency — just functions. */
export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/** Common recipient-identity fields. Every one is untrusted, user-supplied text. */
interface RecipientParams {
  firstName?: string | null;
  lastName?: string | null;
}

export interface InviteParams extends RecipientParams {
  orgName: string;
  inviterName?: string | null;
  /** Absolute accept URL — `{WEB_APP_URL}/invite/{token}`, built by MailService.webUrl. */
  acceptUrl: string;
  /** Rendered into the copy as "expires in N days". */
  expiresInDays: number;
}

export type InviteReminderParams = InviteParams;

export interface WelcomeParams extends RecipientParams {
  orgName: string;
  loginUrl: string;
}

/**
 * Revoke/restore copy deliberately names NEITHER the acting staff member nor the
 * organization — a revoked user should not be handed a target, and a restored one
 * does not need to know who pressed the button.
 */
export type AccessChangeParams = RecipientParams;

export interface OrgAssignedParams extends RecipientParams {
  orgName: string;
  loginUrl: string;
}

export interface PasswordResetParams extends RecipientParams {
  resetUrl: string;
  expiresInMinutes: number;
}

/** Maps each template key to the exact params its renderer requires. */
export interface MailTemplateParams {
  [MailTemplate.ORG_ADMIN_INVITE]: InviteParams;
  [MailTemplate.PROFESSOR_INVITE]: InviteParams;
  [MailTemplate.STUDENT_INVITE]: InviteParams;
  [MailTemplate.INVITE_REMINDER]: InviteReminderParams;
  [MailTemplate.WELCOME]: WelcomeParams;
  [MailTemplate.ACCESS_REVOKED]: AccessChangeParams;
  [MailTemplate.ACCESS_RESTORED]: AccessChangeParams;
  [MailTemplate.ORG_ASSIGNED]: OrgAssignedParams;
  [MailTemplate.PASSWORD_RESET]: PasswordResetParams;
}

/**
 * A queued message. This is the shape that is PERSISTED in Redis, and it
 * deliberately carries `{template, params}` rather than the rendered bodies:
 * a failed job is retained for 24h, and `html`/`text` contain a live accept URL.
 * The processor re-renders from these params at delivery time.
 */
export interface MailMessage<T extends MailTemplate = MailTemplate> {
  to: string;
  template: T;
  params: MailTemplateParams[T];
}

/** Discriminated union over every template — what the processor receives. */
export type AnyMailMessage = {
  [K in MailTemplate]: MailMessage<K>;
}[MailTemplate];
