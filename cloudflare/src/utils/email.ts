// Transactional email via Resend (https://resend.com).
//
// Chosen over SMTP/nodemailer because the backend already talks to everything
// over fetch() and Resend is a single authenticated HTTP POST — no SMTP socket,
// no connection pooling, works identically on the VPS runtime and in tests.
//
// Config (VPS /opt/kamizo/app/.env):
//   RESEND_API_KEY   — required, "re_..." key from the Resend dashboard.
//   RESEND_FROM      — optional, verified sender. Default below. The sending
//                      domain (kamizo.uz) must be verified in Resend with SPF +
//                      DKIM, otherwise delivery lands in spam or is rejected.
//
// Like sendTelegramMessage, this NEVER throws: callers on the login path treat
// a failed send as "second factor unavailable" and fail open, so a Resend
// outage can't lock everyone out of their accounts.

import type { Env } from '../types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Kamizo <no-reply@kamizo.uz>';

export interface SendEmailResult {
  ok: boolean;
  reason?: string;
  id?: string;
}

export async function sendEmail(
  env: Env,
  message: { to: string; subject: string; html: string; text?: string }
): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'RESEND_API_KEY not configured' };

  const from = env.RESEND_FROM || DEFAULT_FROM;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return { ok: false, reason: `resend ${resp.status}: ${detail.slice(0, 200)}` };
    }

    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, reason: String((err as Error)?.message || err) };
  }
}

// Minimal HTML escape for interpolating user-controlled values (device string)
// into the email body.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

// Branded, bilingual (RU/UZ) login-code email. Kept here so the code and its
// presentation live together and the login-approval module stays about flow.
//
// Table-based layout with inline styles and a declared UTF-8 charset — the
// combination that survives Gmail, Apple Mail, and the Outlook (Word) engine.
// The <meta charset> is mandatory: without it Cyrillic renders as mojibake.
//
// Palette matches the app (index.css): cream --app-bg #F4F0E8, white card,
// charcoal #1C1917 text, orange --brand #F97316 / --brand-dark #EA580C accents.
// The logo is the real app icon served from the app's public /icons; email
// clients can only load images over https, so a hosted URL (not a data: URI,
// which Gmail strips) is required.
//
// One-tap copy inside an email is not possible — every major client strips
// <script> and on* handlers — so the code span uses user-select:all instead:
// a single tap/click selects the whole code, then the native copy action (and
// iOS Mail's one-time-code autofill) takes over.
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LOGO_URL = 'https://app.kamizo.uz/icons/apple-touch-icon.png';

export function renderLoginCodeEmail(
  code: string,
  meta: { device?: string | null; ip?: string | null }
): { subject: string; html: string; text: string } {
  const metaRows = [
    meta.device ? `<div style="color:#6F6A62;font-size:13px;line-height:1.5">Устройство · Qurilma: ${esc(meta.device)}</div>` : '',
    meta.ip ? `<div style="color:#6F6A62;font-size:13px;line-height:1.5;margin-top:2px">IP: ${esc(meta.ip)}</div>` : '',
  ].join('');

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Код входа в Kamizo</title>
</head>
<body style="margin:0;padding:0;background:#F4F0E8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0E8;">
<tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #E6DFD2;border-radius:22px;overflow:hidden;">
    <tr><td style="height:4px;line-height:4px;font-size:0;background:#F97316;background:linear-gradient(90deg,#F97316,#EA580C);">&nbsp;</td></tr>
    <tr><td style="padding:24px 24px 6px;font-family:${FONT};">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;width:52px;">
          <img src="${LOGO_URL}" width="52" height="52" alt="Kamizo" style="display:block;width:52px;height:52px;border-radius:13px;border:1px solid #E6DFD2;">
        </td>
        <td style="vertical-align:middle;padding-left:13px;">
          <div style="color:#1C1917;font-size:19px;font-weight:800;letter-spacing:-0.02em;">Kamizo</div>
          <div style="color:#8A8177;font-size:12.5px;margin-top:2px;">Вход в аккаунт · Hisobga kirish</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;font-family:${FONT};">
      <div style="font-size:15px;color:#1C1917;">Ваш код для входа<span style="color:#A8A29E;"> · Kirish kodingiz</span></div>
      <div style="margin:14px 0 8px;background:#FFF3EA;border:1px solid #FBD9BE;border-radius:16px;padding:18px 0;text-align:center;">
        <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#EA580C;font-family:${FONT};-webkit-user-select:all;user-select:all;">${esc(code)}</span>
      </div>
      <div style="font-size:12.5px;color:#A8A29E;text-align:center;">Нажмите на код, чтобы выделить и скопировать</div>
      <div style="font-size:13px;color:#6F6A62;text-align:center;margin-top:6px;">Код действует 2 минуты · Kod 2 daqiqa amal qiladi</div>
      ${metaRows ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #EDE7DB;">${metaRows}</div>` : ''}
      <div style="margin-top:16px;font-size:12.5px;color:#A8A29E;line-height:1.55;">
        Если это были не вы — не вводите код и смените пароль.<br>
        Agar bu siz bo'lmasangiz — kodni kiritmang va parolni o'zgartiring.
      </div>
    </td></tr>
  </table>
  <div style="color:#A8A29E;font-size:11.5px;margin-top:14px;font-family:${FONT};">© Kamizo · kamizo.uz</div>
</td></tr>
</table>
</body>
</html>`;

  const text = `Kamizo — код для входа: ${code}\nКод действует 2 минуты.\nЕсли это были не вы — не вводите код и смените пароль.`;

  return { subject: `Код входа в Kamizo: ${code}`, html, text };
}
