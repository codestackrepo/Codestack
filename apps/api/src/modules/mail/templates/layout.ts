/**
 * Shared rendering primitives. No template engine and no new dependency — the
 * templates are plain functions, so the only thing that needs to be rigorous is
 * escaping, and it lives here.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text destined for an HTML body.
 *
 * Every `firstName` / `lastName` / `orgName` / `inviterName` interpolation goes
 * through this. They are all user- or admin-supplied columns, and mail clients
 * that render HTML will execute what they are given.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Collapses a string to a single line — and this is a security control, not
 * cosmetics.
 *
 * `orgName` is admin-controlled `varchar(200)` and is interpolated into SUBJECT
 * lines. A subject is an SMTP header, so a bare CR or LF in it terminates the
 * header and lets the remainder be read as new headers — an injected `Bcc:` is
 * the obvious payload. Nodemailer guards its own headers, but this keeps the
 * value safe regardless of who renders it, and it also strips the U+2028/U+2029
 * line separators that some clients fold on.
 */
export function oneLine(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A recipient's display name, or a neutral fallback when we have neither part. */
export function displayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const name = `${oneLine(firstName)} ${oneLine(lastName)}`.trim();
  return name || 'there';
}

const BRAND = 'CodeStack';

/**
 * A call-to-action button. `url` is NOT escaped as text — it is built by
 * `MailService.webUrl` from configuration plus an opaque token, never from
 * user input, so treating it as a URL is correct. `label` is a literal at every
 * call site.
 */
export function button(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0">
      <tr>
        <td align="center" bgcolor="#4f46e5" style="border-radius:8px">
          <a href="${url}"
             style="display:inline-block;padding:12px 28px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Wraps body HTML in the shared shell. Table-based and inline-styled on purpose:
 * mail clients have no meaningful support for external CSS or modern layout.
 */
export function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#ffffff;border-radius:14px;padding:36px 32px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2233;line-height:1.6">
            <tr>
              <td>
                <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#4f46e5">${BRAND}</p>
                ${bodyHtml}
                <hr style="border:none;border-top:1px solid #e6e6ee;margin:32px 0 16px" />
                <p style="margin:0;font-size:12px;color:#6b6f80">
                  If you weren't expecting this email you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Normalizes a plain-text body: trims each line and collapses blank runs. */
export function wrapText(lines: string[]): string {
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n\n— ${BRAND}\n`;
}
