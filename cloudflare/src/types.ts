// Shared types for the backend

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  DEMO_LOGIN_GLOBAL_LIMIT?: string;
  JWT_SECRET: string;
  BASE_DOMAIN: string;
  VAPID_EMAIL: string;
  VAPID_PRIVATE_KEY: string;
  SENTRY_DSN?: string;
  EMERGENCY_RESET_SECRET?: string;
  SETUP_TOKEN?: string;
  SUPERADMIN_BOOTSTRAP_PASSWORD?: string;
  // Sprint 5 Task 3: секрет для VPS-cron endpoint'а auto-billing.
  // Setup: /opt/kamizo/app/.env → CRON_SECRET=<random 32 bytes>
  CRON_SECRET?: string;
  ASSETS: Fetcher;
  RATE_LIMITER: KVNamespace;
  CONNECTION_MANAGER?: DurableObjectNamespace;
  // Sprint 85 — tenant contract PDFs. On Cloudflare Workers this is
  // the real R2Bucket binding declared in wrangler.toml; on the VPS
  // Node.js path the shim at /opt/kamizo/app/src/shim/r2.js exposes
  // the same .put / .get / .delete / .head surface backed by the
  // local filesystem at /opt/kamizo/data/contracts/.
  CONTRACTS_BUCKET: R2Bucket;

  // Bug 2 (2026-06-18) — VPS-only env triple. Used by
  // `mirrorTenantWriteToD1()` in routes/super-admin.ts to dual-write
  // tenant rows to Cloudflare D1 so the kamizo Worker's subdomain
  // lookup (env.DB SELECT in cloudflare/src/index.ts) keeps pace with
  // the VPS SQLite source-of-truth. All three must be set for the
  // mirror to run; if any is missing (e.g. inside the Cloudflare
  // Worker itself, where env.DB IS D1 and a HTTP-API mirror would
  // be redundant), the mirror silently no-ops. Remove this triple
  // once Variant #3 (KV cache + D1 decommission) lands.
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_D1_DATABASE_ID?: string;

  // Sprint 86 — APNs push provider config. All four are required for
  // sendApnsNotification to actually fire; missing → the call returns
  // ok=false with a "not configured" reason and the request continues.
  // .p8 file lives at APNS_KEY_PATH on the VPS, mode 600, never in git.
  // APNS_ENVIRONMENT='sandbox' targets api.sandbox.push.apple.com for
  // debug/TestFlight builds; default is production. See
  // cloudflare/src/services/apns-client.ts for the contract.
  APNS_TEAM_ID?: string;
  APNS_KEY_ID?: string;
  APNS_KEY_PATH?: string;
  APNS_TOPIC?: string;
  APNS_ENVIRONMENT?: 'production' | 'sandbox';

  // Telegram-бот. Все три живут в /opt/kamizo/app/.env, в git не
  // попадают. Без TELEGRAM_BOT_TOKEN клиент в utils/telegram.ts
  // возвращает ok=false с причиной 'not configured' и НЕ бросает — тот
  // же контракт, что у APNs выше: не настроенный канал уведомлений не
  // должен ронять бизнес-операцию, которая его дёрнула.
  //
  // TELEGRAM_BOT_TOKEN      — от @BotFather. Секрет-эквивалент: даёт
  //                           полный контроль над ботом, включая чтение
  //                           всех входящих сообщений.
  // TELEGRAM_WEBHOOK_SECRET — общий секрет, передаётся в setWebhook как
  //                           secret_token и возвращается в заголовке
  //                           X-Telegram-Bot-Api-Secret-Token. Это
  //                           ЕДИНСТВЕННОЕ, что отличает настоящий
  //                           апдейт от подделки: без проверки любой,
  //                           кто знает URL вебхука, привяжет свой
  //                           Telegram к чужому аккаунту Kamizo.
  // TELEGRAM_BOT_USERNAME   — без @. Нужен только чтобы собрать
  //                           deep-link https://t.me/<username>?start=…
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;

  // Антиспам умного диспетчера (ТЗ §14: «Конкретное значение должно быть
  // настраиваемым»). Обе величины подбираются по живым чатам, поэтому
  // читаются из окружения, а не зашиты в код.
  //
  // TELEGRAM_COOLDOWN_HOURS  — не чаще одного предложения человеку в
  //                            одной группе за это время. Умолчание 2.
  // TELEGRAM_DEDUPE_MINUTES  — не повторять предложение по той же
  //                            категории в той же группе. Умолчание 30.
  //
  // 0 отключает соответствующую проверку — удобно для тестов, но в
  // проде означает, что бот ответит на каждое подходящее сообщение.
  TELEGRAM_COOLDOWN_HOURS?: string;
  TELEGRAM_DEDUPE_MINUTES?: string;
}

export interface User {
  id: string;
  login: string;
  phone: string;
  name: string;
  role: string;
  specialization?: string;
  address?: string;
  apartment?: string;
  building_id?: string;
  entrance?: string;
  floor?: string;
  account_type?: string;
  tenant_id?: string;
  email?: string;
  isImpersonated?: true;
  impersonatedBy?: string;
  isDemoSession?: true;
}

export type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

export interface Route {
  method: string;
  // Original path template, e.g. '/api/agenda/:agendaItemId/comments'.
  // Sprint 74: used as the rate-limit key so buckets don't multiply per
  // resolved id.
  path: string;
  pattern: RegExp;
  handler: Handler;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}
