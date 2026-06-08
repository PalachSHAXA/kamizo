// SMS provider abstraction for 2FA-on-login.
//
// The login flow only depends on the `SmsProvider` interface; it never
// imports Eskiz directly. `createSmsProvider(env)` picks the right
// implementation at runtime:
//   - MockProvider when Eskiz creds are missing OR TWO_FA_DEV_MODE='1'
//   - EskizProvider otherwise
// Adding the real Eskiz credentials via `wrangler secret put ESKIZ_EMAIL
// / ESKIZ_PASSWORD / ESKIZ_FROM` switches production from Mock → Eskiz
// with NO code change. Until those secrets are set, every "send" stays
// in-process (no real SMS is dispatched, no money spent).

import type { Env } from '../types';

export type SmsSendResult =
  | { ok: true; provider: 'mock' | 'eskiz'; messageId?: string; devCode?: string }
  | { ok: false; provider: 'mock' | 'eskiz'; error: string };

export interface SmsProvider {
  readonly name: 'mock' | 'eskiz';
  sendCode(phone: string, code: string, lang: 'ru' | 'uz'): Promise<SmsSendResult>;
}

const isTruthyFlag = (v: string | undefined): boolean =>
  v === '1' || v === 'true' || v === 'yes';

// ─── Mock (no real SMS) ────────────────────────────────────────────────
class MockProvider implements SmsProvider {
  readonly name = 'mock' as const;
  private readonly returnDevCode: boolean;
  constructor(returnDevCode: boolean) { this.returnDevCode = returnDevCode; }
  async sendCode(phone: string, code: string, _lang: 'ru' | 'uz'): Promise<SmsSendResult> {
    // Never log the full code in prod-leaning environments. Even in dev,
    // mask the middle digits in the log line — only the API response
    // (gated by TWO_FA_DEV_MODE) carries the real code, and only when
    // explicitly requested.
    const masked = code.length === 6 ? `${code.slice(0, 1)}····${code.slice(-1)}` : '······';
    console.log(`[sms.mock] would send to ${phone}: code ${masked}`);
    return {
      ok: true,
      provider: 'mock',
      messageId: `mock-${Date.now()}`,
      ...(this.returnDevCode ? { devCode: code } : {}),
    };
  }
}

// ─── Eskiz.uz (real SMS) ──────────────────────────────────────────────
//
// Eskiz Notify HTTP API:
//   POST /api/auth/login   { email, password } → { data: { token } }
//   POST /api/message/sms/send { mobile_phone, message, from? } → { id, ... }
//
// Tokens last 30 days. We cache a single token PER WORKER INSTANCE in
// memory; on 401 we re-login and retry once. The Eskiz API base is
// overridable via env for tests.
class EskizProvider implements SmsProvider {
  readonly name = 'eskiz' as const;
  private readonly email: string;
  private readonly password: string;
  private readonly from: string | undefined;
  private readonly apiBase: string;
  private token: string | null = null;
  private tokenIssuedAt = 0;

  constructor(email: string, password: string, from: string | undefined, apiBase: string) {
    this.email = email;
    this.password = password;
    this.from = from || undefined;
    // Strip trailing slash so we can string-concat without worrying.
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  private async login(): Promise<void> {
    const form = new FormData();
    form.append('email', this.email);
    form.append('password', this.password);
    const res = await fetch(`${this.apiBase}/auth/login`, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`Eskiz auth failed: HTTP ${res.status}`);
    }
    const json = await res.json() as { data?: { token?: string } };
    const token = json?.data?.token;
    if (!token) throw new Error('Eskiz auth: missing token in response');
    this.token = token;
    this.tokenIssuedAt = Date.now();
  }

  private async sendOnce(phone: string, message: string): Promise<{ ok: true; id?: string } | { ok: false; status: number; body: string }> {
    if (!this.token) await this.login();
    const form = new FormData();
    // Eskiz expects phone digits only, no `+`. The caller already
    // normalises Uzbek numbers; we just strip non-digits as a guard.
    form.append('mobile_phone', phone.replace(/\D/g, ''));
    form.append('message', message);
    if (this.from) form.append('from', this.from);
    const res = await fetch(`${this.apiBase}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (res.status === 401) {
      // token rotated server-side or expired; clear cache so caller can retry
      this.token = null;
      const body = await res.text().catch(() => '');
      return { ok: false, status: 401, body };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body };
    }
    const json = await res.json().catch(() => ({} as any)) as { id?: string | number };
    return { ok: true, id: json?.id != null ? String(json.id) : undefined };
  }

  async sendCode(phone: string, code: string, lang: 'ru' | 'uz'): Promise<SmsSendResult> {
    // Approved template-style text. Keep it short and template-stable
    // so Eskiz's moderation accepts it without per-message review.
    const message = lang === 'uz'
      ? `Kamizo: kirish kodi ${code}. Hech kimga aytmang.`
      : `Kamizo: код входа ${code}. Никому не сообщайте.`;

    try {
      let result = await this.sendOnce(phone, message);
      if (!result.ok && result.status === 401) {
        // token expired mid-flight; re-login once and retry
        await this.login();
        result = await this.sendOnce(phone, message);
      }
      if (!result.ok) {
        return { ok: false, provider: 'eskiz', error: `Eskiz send failed: HTTP ${result.status}` };
      }
      return { ok: true, provider: 'eskiz', messageId: result.id };
    } catch (e) {
      return { ok: false, provider: 'eskiz', error: (e as Error).message || 'eskiz error' };
    }
  }
}

// ─── Selector ─────────────────────────────────────────────────────────
//
// Decision tree (no code change required to flip provider):
//   1. If TWO_FA_DEV_MODE is on               → MockProvider (returns dev_code)
//   2. If ESKIZ_EMAIL + ESKIZ_PASSWORD set    → EskizProvider
//   3. Otherwise                              → MockProvider (does NOT leak the code)
//
// The dev-code echo is gated by TWO_FA_DEV_MODE explicitly, NOT by
// the absence of Eskiz creds, so production with missing creds is still
// safe (no real SMS sent, no code leaked back to the API caller).
export function createSmsProvider(env: Env): SmsProvider {
  const devMode = isTruthyFlag(env.TWO_FA_DEV_MODE);
  const haveEskiz = !!(env.ESKIZ_EMAIL && env.ESKIZ_PASSWORD);
  if (devMode || !haveEskiz) {
    return new MockProvider(devMode);
  }
  return new EskizProvider(
    env.ESKIZ_EMAIL!,
    env.ESKIZ_PASSWORD!,
    env.ESKIZ_FROM,
    env.ESKIZ_API_BASE || 'https://notify.eskiz.uz/api',
  );
}

// Re-export so route files can `isTwoFaEnabled(env)` instead of
// duplicating the flag-parse rule.
export function isTwoFaEnabled(env: Env): boolean {
  return isTruthyFlag(env.TWO_FA_ENABLED);
}
