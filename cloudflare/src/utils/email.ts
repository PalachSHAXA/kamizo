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
export function renderLoginCodeEmail(
  code: string,
  meta: { device?: string | null; ip?: string | null }
): { subject: string; html: string; text: string } {
  const rows = [
    meta.device ? `<div style="color:#6F6A62;font-size:13px">Устройство · Qurilma: ${esc(meta.device)}</div>` : '',
    meta.ip ? `<div style="color:#6F6A62;font-size:13px">IP: ${esc(meta.ip)}</div>` : '',
  ].join('');

  const html = `<!doctype html><html><body style="margin:0;background:#F4F0E8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:1px solid #E6DFD2;border-radius:20px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#F97316,#EA580C);padding:20px 22px;color:#fff">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em">Kamizo</div>
        <div style="font-size:13px;opacity:.85;margin-top:2px">Вход в аккаунт · Hisobga kirish</div>
      </div>
      <div style="padding:22px">
        <div style="font-size:15px;color:#1C1917">Ваш код для входа · Kirish kodingiz:</div>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#1C1917;margin:14px 0;text-align:center;font-variant-numeric:tabular-nums">${esc(code)}</div>
        <div style="font-size:13px;color:#6F6A62;text-align:center">Код действует 2 минуты · Kod 2 daqiqa amal qiladi</div>
        ${rows ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #EDE7DB">${rows}</div>` : ''}
        <div style="margin-top:16px;font-size:12.5px;color:#A8A29E;line-height:1.5">
          Если это были не вы — не вводите код и смените пароль.<br/>
          Agar bu siz bo'lmasangiz — kodni kiritmang va parolni o'zgartiring.
        </div>
      </div>
    </div>
    <div style="text-align:center;color:#A8A29E;font-size:11.5px;margin-top:14px">© Kamizo · kamizo.uz</div>
  </div></body></html>`;

  const text = `Kamizo — код для входа: ${code}\nКод действует 2 минуты.\nЕсли это были не вы — не вводите код и смените пароль.`;

  return { subject: `Код входа в Kamizo: ${code}`, html, text };
}
