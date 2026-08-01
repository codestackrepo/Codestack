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
 * The web origin mails link back to — `http://localhost:5173` in dev, the real
 * public origin in a deployment.
 *
 * Set ONCE at boot by `MailService`, which `mail.service.ts` documents as the single
 * reader of `WEB_APP_URL`. Templates are otherwise pure functions of their params, so
 * reading `process.env` here would both break that purity and put a second reader of
 * the same variable in the codebase — and the two could disagree about the trailing
 * slash, which is exactly the class of bug `webUrl` centralises away.
 *
 * Defaults to the local origin so a unit test that renders a template without booting
 * the module still produces a working link rather than `undefined/`.
 */
let webOrigin = 'http://localhost:5173';

/** Called by MailService at construction. Idempotent; last call wins. */
export function setMailWebOrigin(origin: string): void {
  webOrigin = origin.replace(/\/+$/, '');
}

/**
 * The brand mark, DRAWN rather than fetched.
 *
 * Mail clients block remote images by default, so an <img> logo shows a broken icon
 * to most recipients on first open — the one impression that matters. A rounded cell
 * with the `</>` glyph is just a table and inline styles, so it renders in Outlook,
 * Gmail and Apple Mail with no download and no permission prompt. Partner logos stay
 * as <img> because there is no way to draw an arbitrary institution's mark.
 */
function logoMark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;vertical-align:middle">
                  <tr>
                    <td width="34" height="34" align="center" valign="middle"
                        bgcolor="#4f46e5"
                        style="width:34px;height:34px;border-radius:9px;background:#4f46e5;color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:14px;font-weight:700;line-height:34px;text-align:center">
                      &lt;/&gt;
                    </td>
                  </tr>
                </table>`;
}

/**
 * Hidden one-line summary shown by most clients next to the subject in the inbox
 * list. Without it they scrape the first visible text, which here is the brand name —
 * so every mail previews identically as "CodeStack" and the recipient learns nothing.
 *
 * The trailing entity run is the standard trick to stop the client spilling body text
 * into the preview after the intended sentence.
 */
function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f7;opacity:0">
      ${escapeHtml(oneLine(text))}
      ${'&#8199;&#65279;&#847; '.repeat(30)}
    </div>`;
}

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
        <td align="center" bgcolor="#4f46e5" style="border-radius:10px">
          <a href="${url}"
             style="display:inline-block;padding:13px 30px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
    <!-- The same URL in copyable text. A button is a link, and a link is what a
         corporate mail gateway rewrites, what a plain-text client drops, and what a
         cautious recipient wants to read before clicking. Without this a rewritten
         button leaves them no way in at all. -->
    <p style="margin:-8px 0 24px;font-size:12px;line-height:1.5;color:#8a8fa3;word-break:break-all">
      Or paste this into your browser:<br />
      <span style="color:#6b6f80">${escapeHtml(url)}</span>
    </p>`;
}

/**
 * Wraps body HTML in the shared shell. Table-based and inline-styled on purpose:
 * mail clients have no meaningful support for external CSS or modern layout.
 */
/**
 * The optional co-branding lockup: `CodeStack × Acme University` (#118).
 *
 * Additive by construction — with no partner it returns the plain brand line that was
 * there before, BYTE FOR BYTE, so every existing template's output is unchanged and the
 * snapshot tests still pass. That is the property worth protecting: co-branding must be
 * something an organization opts into, never a rewrite of every mail.
 *
 * The logo is rendered only when a URL is present, and it never carries the whole
 * lockup: the text always renders too. Mail clients block remote images by default, so
 * a logo-only header would show a broken icon and nothing else to the majority of
 * recipients. `alt=""` because the name is already right there in text — a screen
 * reader announcing it twice is worse than not announcing the image at all.
 *
 * The community tenant NEVER reaches here with a partner. Its members are strangers,
 * not an institution's cohort, and "CodeStack × CodeStack Community" would name a
 * thing nobody joined.
 */
function brandLockup(partner?: { name: string; logoUrl?: string | null }): string {
  const wordmark = `<td style="padding-left:10px;font-size:19px;font-weight:700;color:#1f2233;vertical-align:middle;letter-spacing:-0.2px">Code<span style="color:#4f46e5">Stack</span></td>`;

  if (!partner) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0">
                  <tr>
                    <td style="vertical-align:middle">${logoMark()}</td>
                    ${wordmark}
                  </tr>
                </table>`;
  }

  const name = escapeHtml(oneLine(partner.name));
  const logo = partner.logoUrl
    ? `<img src="${escapeHtml(partner.logoUrl)}" alt="" height="24" style="height:24px;width:auto;vertical-align:middle;display:inline-block" />`
    : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0">
                  <tr>
                    <td style="vertical-align:middle">${logoMark()}</td>
                    ${wordmark}
                    <td style="padding:0 10px;font-size:15px;color:#9aa0b4;vertical-align:middle">&times;</td>
                    <td style="font-size:16px;font-weight:600;color:#1f2233;vertical-align:middle">${logo}${logo ? '&nbsp;' : ''}${name}</td>
                  </tr>
                </table>`;
}

export function wrapHtml(
  title: string,
  bodyHtml: string,
  /** Present only for a member of a REAL organization that has set branding. */
  partner?: { name: string; logoUrl?: string | null },
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef0f6;-webkit-font-smoothing:antialiased">
    ${preheader(title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2233;line-height:1.6;border:1px solid #e2e5ef">
            <!-- Header band. Tinted rather than white so the mark has something to sit
                 on, and light rather than dark so a partner logo (usually dark ink on
                 transparent) stays legible on it. -->
            <tr>
              <td style="padding:22px 32px;background:#f7f8fc;border-bottom:1px solid #e6e8f2">
                ${brandLockup(partner)}
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 24px;background:#f7f8fc;border-top:1px solid #e6e8f2">
                <p style="margin:0 0 6px;font-size:12px;color:#6b6f80">
                  <a href="${webOrigin}" style="color:#4f46e5;text-decoration:none;font-weight:600">Open ${BRAND}</a>
                </p>
                <p style="margin:0;font-size:12px;color:#8a8fa3">
                  If you weren't expecting this email you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:560px;margin:16px auto 0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:11px;line-height:1.5;color:#9aa0b4;text-align:center">
            Sent by ${BRAND}. This is an automated message — replies are not monitored.
          </p>
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
