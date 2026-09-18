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
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
    <tr><td style="background:#EA580C;background:linear-gradient(135deg,#F97316,#EA580C);padding:22px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;width:44px;">
          <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.2);text-align:center;line-height:44px;color:#ffffff;font-size:22px;font-weight:800;font-family:${FONT};">K</div>
        </td>
        <td style="vertical-align:middle;padding-left:13px;">
          <div style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:-0.02em;font-family:${FONT};">Kamizo</div>
          <div style="color:rgba(255,255,255,0.88);font-size:12.5px;margin-top:2px;font-family:${FONT};">Вход в аккаунт · Hisobga kirish</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 24px 24px;font-family:${FONT};">
      <div style="font-size:15px;color:#1C1917;">Ваш код для входа<span style="color:#A8A29E;"> · Kirish kodingiz</span></div>
      <div style="margin:16px 0 10px;background:#FFF3EA;border:1px solid #FBD9BE;border-radius:16px;padding:18px 0;text-align:center;">
        <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#EA580C;font-family:${FONT};">${esc(code)}</span>
      </div>
      <div style="font-size:13px;color:#6F6A62;text-align:center;">Код действует 2 минуты · Kod 2 daqiqa amal qiladi</div>
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
