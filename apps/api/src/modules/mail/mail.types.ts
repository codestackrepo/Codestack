/**
 * The transactional templates (#103, extended by #118). Adding one means adding a
 * key here, a params interface below, and an entry in the TEMPLATES registry — the
 * compiler then refuses any enqueue whose params do not match its template.
 *
 * If the new template's params carry a URL with a token in it, it must ALSO be
 * added to `CREDENTIAL_PARAMS` in `mail-redaction.ts`, or a failed job retains a
 * live credential in Redis. `mail-redaction.spec.ts` iterates this enum and asserts
 * the credential set explicitly, so forgetting is a failing test rather than a leak.
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
  VERIFY_EMAIL = 'verify-email',
  WELCOME_OPEN = 'welcome-open',
  ACCOUNT_EXISTS = 'account-exists',
  ORG_APPLICATION_RECEIVED = 'org-application-received',
  ORG_APPLICATION_ALERT = 'org-application-alert',
  ORG_APPLICATION_APPROVED = 'org-application-approved',
  ORG_APPLICATION_REJECTED = 'org-application-rejected',
  PROFESSOR_APPLICATION_RECEIVED = 'professor-application-received',
  PROFESSOR_APPLICATION_ALERT = 'professor-application-alert',
  PROFESSOR_APPLICATION_APPROVED = 'professor-application-approved',
  PROFESSOR_APPLICATION_REJECTED = 'professor-application-rejected',
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

/**
 * The organization's own mark, for the "CodeStack × institution" lockup (#118).
 *
 * Structurally the API's `OrgBranding`, redeclared here rather than imported so
 * `mail.types` stays free of a domain dependency — this module is the contract for what
 * gets PERSISTED in a Redis job payload, and it should not drag the organizations
 * module in behind it.
 *
 * Optional everywhere. Absent means the plain CodeStack header, byte-identical to
 * pre-#118 output.
 */
export interface MailBranding {
  logoUrl?: string | null;
}

export interface InviteParams extends RecipientParams {
  orgName: string;
  inviterName?: string | null;
  /** Absolute accept URL — `{WEB_APP_URL}/invite/{token}`, built by MailService.webUrl. */
  acceptUrl: string;
  /** Rendered into the copy as "expires in N days". */
  expiresInDays: number;
  /**
   * Co-branding for the inviting organization, when it has any.
   *
   * Safe to carry in the queued payload: a logo URL is public by nature and is not a
   * credential, unlike `acceptUrl` beside it.
   */
  branding?: MailBranding | null;
}

export type InviteReminderParams = InviteParams;

/**
 * Every template whose params are exactly `InviteParams`.
 *
 * Exists so `InvitesService.sendInviteMail` can type its `template` argument as
 * something narrower than "any template at all". Without it, the one enqueue in the
 * codebase that carries a live accept token had to be cast to `never` to compile — and
 * that cast disabled the params check this whole module exists to provide, on precisely
 * the message where a wrong shape matters most.
 *
 * Adding a template here is a claim that it takes `InviteParams`; the `TEMPLATES`
 * registry will refuse the entry if that is untrue.
 */
export type InviteParamsTemplate =
  | MailTemplate.ORG_ADMIN_INVITE
  | MailTemplate.PROFESSOR_INVITE
  | MailTemplate.STUDENT_INVITE
  | MailTemplate.INVITE_REMINDER
  | MailTemplate.PROFESSOR_APPLICATION_APPROVED;

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

/**
 * No `orgName`. This mail belongs to the self-signup path, where the recipient
 * belongs to no tenant yet — and the community tenant they land in is our
 * bookkeeping, not something they chose to join.
 */
export interface VerifyEmailParams extends RecipientParams {
  /** Absolute verify URL — `{WEB_APP_URL}/verify-email/{token}`, built by MailService.webUrl. */
  verifyUrl: string;
  /** Rendered into the copy as "expires in N hours". */
  expiresInHours: number;
}

/**
 * Welcome for an OPEN-platform account. No `orgName`, unlike `WelcomeParams`: the
 * community tenant is our bookkeeping and naming it would tell someone they joined
 * an institution they never chose.
 */
export interface WelcomeOpenParams extends RecipientParams {
  loginUrl: string;
}

/**
 * Sent when someone tries to sign up with an address that already has a usable
 * account (#118).
 *
 * This mail is the ONLY thing that distinguishes that case, and it goes to the
 * mailbox owner rather than to the caller — which is the entire trick. The HTTP
 * response is identical to a successful signup, so a prober learns nothing, while
 * the actual owner gets told someone tried and is pointed at the two things they
 * might genuinely need.
 *
 * Carries page links only, never a token: this mail may be triggered by ANYONE who
 * can type an email address, so it must not be a way to send a live credential to
 * an inbox on demand.
 */
export interface AccountExistsParams extends RecipientParams {
  loginUrl: string;
  forgotPasswordUrl: string;
}

/**
 * Acknowledgement to whoever submitted an organization application (#118).
 *
 * Carries no token and promises no outcome: the endpoint is public, so anyone can
 * cause this mail to be sent to any address they type.
 */
export interface OrgApplicationReceivedParams extends RecipientParams {
  organizationName: string;
}

/**
 * Alert to every superadmin that an application is waiting.
 *
 * Sent as MAIL as well as an in-app notification because a superadmin may not be
 * logged in — and an application nobody looks at is an institution that gives up. The
 * applicant's own text is included so the reviewer can triage without opening the
 * console, and every field here is untrusted input escaped at render.
 */
export interface OrgApplicationAlertParams {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  website?: string | null;
  message?: string | null;
  /** Console page for the review queue. A page link, never a token. */
  reviewUrl: string;
}

/**
 * Told to the CONTACT that their application was approved.
 *
 * Deliberately separate from the admin invite, and only sent when the two addresses
 * differ. The invite itself is an `org-admin-invite` carrying the accept token; if the
 * contact IS the admin they receive that instead, and sending both would be two mails
 * about one event, one of which looks like it needs an action it does not.
 */
export interface OrgApplicationApprovedParams extends RecipientParams {
  organizationName: string;
  /** Where the invite went, so the contact knows who to chase. */
  adminEmail: string;
}

export interface OrgApplicationRejectedParams extends RecipientParams {
  organizationName: string;
  /** Superadmin-authored free text, or null. Escaped at render. */
  reason?: string | null;
}

/** Acknowledgement to an open-professor applicant. No token, no promise of an outcome. */
export type ProfessorApplicationReceivedParams = RecipientParams;

/** Alert to every superadmin. Mailed as well as raised in-app — they may not be logged in. */
export interface ProfessorApplicationAlertParams {
  applicantName: string;
  applicantEmail: string;
  institution?: string | null;
  message?: string | null;
  /** Console page. A page link, never a token. */
  reviewUrl: string;
}

export interface ProfessorApplicationRejectedParams extends RecipientParams {
  reason?: string | null;
}

/**
 * NOTE — there is no `ProfessorApplicationApprovedParams`.
 *
 * The approved mail IS an invite: it carries `acceptUrl`, so it reuses `InviteParams`
 * and goes out through the ordinary invite machinery with
 * `MailTemplate.PROFESSOR_APPLICATION_APPROVED` as a template override. Only the copy
 * differs from `professor-invite` — the default opens with "You've been invited to join
 * {orgName}", and rendering that as "CodeStack Community" would tell someone they
 * joined an institution that does not exist.
 *
 * Because it carries `acceptUrl`, it is credential-bearing and is covered by
 * `CREDENTIAL_PARAMS` automatically — the redaction census asserts it.
 */

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
  [MailTemplate.VERIFY_EMAIL]: VerifyEmailParams;
  [MailTemplate.WELCOME_OPEN]: WelcomeOpenParams;
  [MailTemplate.ACCOUNT_EXISTS]: AccountExistsParams;
  [MailTemplate.ORG_APPLICATION_RECEIVED]: OrgApplicationReceivedParams;
  [MailTemplate.ORG_APPLICATION_ALERT]: OrgApplicationAlertParams;
  [MailTemplate.ORG_APPLICATION_APPROVED]: OrgApplicationApprovedParams;
  [MailTemplate.ORG_APPLICATION_REJECTED]: OrgApplicationRejectedParams;
  [MailTemplate.PROFESSOR_APPLICATION_RECEIVED]: ProfessorApplicationReceivedParams;
  [MailTemplate.PROFESSOR_APPLICATION_ALERT]: ProfessorApplicationAlertParams;
  /** An invite in every respect but its copy — see the note above. */
  [MailTemplate.PROFESSOR_APPLICATION_APPROVED]: InviteParams;
  [MailTemplate.PROFESSOR_APPLICATION_REJECTED]: ProfessorApplicationRejectedParams;
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
