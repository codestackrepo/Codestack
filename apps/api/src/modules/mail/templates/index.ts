import { AnyMailMessage, MailTemplate, RenderedMail } from '../mail.types';
import {
  accessRestored,
  accessRevoked,
  orgAssigned,
  passwordReset,
  welcome,
} from './account.templates';
import { inviteReminder, orgAdminInvite, professorInvite, studentInvite } from './invite.templates';

/**
 * The one place a template key becomes a renderer.
 *
 * Typed as a mapped type over `MailTemplate`, so omitting a key or wiring a
 * renderer whose params do not match the key is a COMPILE error rather than a
 * runtime `undefined is not a function` on the worker, hours later, with the
 * job already retried five times.
 */
const TEMPLATES: {
  [K in MailTemplate]: (params: Extract<AnyMailMessage, { template: K }>['params']) => RenderedMail;
} = {
  [MailTemplate.ORG_ADMIN_INVITE]: orgAdminInvite,
  [MailTemplate.PROFESSOR_INVITE]: professorInvite,
  [MailTemplate.STUDENT_INVITE]: studentInvite,
  [MailTemplate.INVITE_REMINDER]: inviteReminder,
  [MailTemplate.WELCOME]: welcome,
  [MailTemplate.ACCESS_REVOKED]: accessRevoked,
  [MailTemplate.ACCESS_RESTORED]: accessRestored,
  [MailTemplate.ORG_ASSIGNED]: orgAssigned,
  [MailTemplate.PASSWORD_RESET]: passwordReset,
};

/**
 * Renders a queued message.
 *
 * Called twice per mail by design: once at ENQUEUE, to fail fast in the request
 * path if params are wrong, and once at DELIVERY, because the retained job
 * payload carries only `{template, params}` — never the rendered bodies, which
 * contain a live token and would sit in Redis for 24h on a failed job.
 */
export function renderMail(message: AnyMailMessage): RenderedMail {
  const render = TEMPLATES[message.template] as (params: unknown) => RenderedMail;
  if (!render) throw new Error(`Unknown mail template: ${String(message.template)}`);
  return render(message.params);
}

export { TEMPLATES };
