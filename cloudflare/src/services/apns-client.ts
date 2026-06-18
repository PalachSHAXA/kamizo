// APNs HTTP/2 push client (Sprint 86).
//
// Sends provider-token-auth-style notifications to Apple Push
// Notification service. No third-party dependency — Node 18+ ships
// Web Crypto via globalThis.crypto + native fetch with HTTP/2 fallback,
// which is exactly the pattern already used by cloudflare/src/utils/
// crypto.ts for the app's own JWTs. Adding `jose` or `node-apn` here
// would buy us nothing the platform doesn't already provide.
//
// What this module exposes:
//   • generateApnsJWT()      — ES256-signed bearer token for APNs
//                              (60-min validity per Apple; we cache
//                              for 50 to refresh proactively)
//   • sendApnsNotification() — POSTs to api.push.apple.com/3/device/...
//                              with the cached JWT, returns the
//                              normalised { ok, statusCode, reason }
//
// What this module does NOT do:
//   • Trigger any push from a business event. That wiring is the
//     next sprint — this commit only sets up the plumbing so
//     test-push from super-admin works.
//   • Read the .p8 file on Cloudflare Workers. The Workers runtime
//     has no `node:fs`, and the production push path runs on the
//     VPS Node.js backend anyway. We dynamic-import `node:fs` and
//     no-op cleanly when it isn't available.
//
// Security notes:
//   • Device tokens are secret-equivalent — never log in plaintext.
//     This module truncates to the first 8 hex chars in any error
//     return surface.
//   • The .p8 is read once per JWT-refresh cycle (≤ once/50min) and
//     held only as an imported CryptoKey object — never logged, never
//     returned out of the module.

import type { Env } from '../types';

// ── Lazy fs ────────────────────────────────────────────────────────
//
// `node:fs/promises` is only present on the VPS Node.js path.
// On the Cloudflare Workers build it doesn't exist; pretending it
// does would crash the whole Worker on module evaluation. We resolve
// it on first call instead, and any push-send path that does land on
// Workers just returns ok=false with a clear reason.

// We deliberately type the dynamic import as `any`. The cloudflare/
// tsconfig.json targets the Workers runtime and doesn't include
// @types/node — a static `import('node:fs/promises')` reference would
// fail typecheck even though the code path only runs on the VPS Node
// build. The string-variable indirection prevents the bundler from
// resolving the spec at build time too.
let fsPromisesPromise: Promise<{ readFile: (p: string, enc: string) => Promise<string> } | null> | null = null;
function getFsPromises(): Promise<{ readFile: (p: string, enc: string) => Promise<string> } | null> {
  if (!fsPromisesPromise) {
    fsPromisesPromise = (async () => {
      try {
        const spec = 'node:fs/promises';
        const mod = await (Function('s', 'return import(s)')(spec) as Promise<any>);
        return mod;
      } catch {
        return null;
      }
    })();
  }
  return fsPromisesPromise;
}

// ── JWT cache ─────────────────────────────────────────────────────
//
// Apple invalidates the provider token if you re-issue more than
// once every 20 minutes (per their throttle docs), and they hard-fail
// it after 60 minutes. 50 minutes is the standard middle ground:
// always inside Apple's TTL window, always outside their re-issue
// throttle.

const JWT_TTL_MS = 50 * 60 * 1000; // 50 min cache
interface CachedJwt {
  token: string;
  signedAt: number;
  keyId: string;
  teamId: string;
}
let cachedJwt: CachedJwt | null = null;

// CryptoKey is also cached — re-importing on every JWT refresh would
// re-read the .p8 from disk 28 times a day for no reason.
let cachedSigningKey: { key: CryptoKey; keyPath: string } | null = null;

// ── PEM → ArrayBuffer (PKCS#8) ────────────────────────────────────
//
// Apple's .p8 file is a PEM-armoured PKCS#8 ECPrivateKey for the
// secp256r1 (P-256) curve. Web Crypto's importKey accepts the raw
// DER bytes; we strip the BEGIN/END lines and base64-decode.

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64url(input: string | Uint8Array): string {
  const str = typeof input === 'string'
    ? btoa(input)
    : btoa(String.fromCharCode(...input));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Load & cache the signing key ──────────────────────────────────

async function loadSigningKey(keyPath: string): Promise<CryptoKey | null> {
  if (cachedSigningKey && cachedSigningKey.keyPath === keyPath) {
    return cachedSigningKey.key;
  }
  const fsp = await getFsPromises();
  if (!fsp) return null;

  let pem: string;
  try {
    pem = await fsp.readFile(keyPath, 'utf8');
  } catch {
    return null;
  }
  const pkcs8 = pemToArrayBuffer(pem);
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    cachedSigningKey = { key, keyPath };
    return key;
  } catch {
    return null;
  }
}

// ── ECDSA signature: DER → IEEE-P1363 ─────────────────────────────
//
// Web Crypto's ECDSA implementation already returns raw IEEE-P1363
// (r||s, fixed 64 bytes for P-256), which is exactly what JWS ES256
// wants. Older Node versions returned DER; we don't currently target
// any of them, but the conversion is small and bulletproof — if Apple
// ever rejects a signature with reason "InvalidProviderToken" the
// first suspect to rule out is this format.

// ── Public: generateApnsJWT ───────────────────────────────────────
//
// Returns a base64url-encoded ES256 JWT signed with the .p8 key
// pointed at by env.APNS_KEY_PATH. Cached for 50 minutes.
//
// Errors are returned as null rather than thrown, so the caller can
// degrade gracefully if push isn't configured on this deploy. The
// only error reasons:
//   • env vars not set                       (Workers / dev)
//   • node:fs/promises unavailable          (Workers)
//   • .p8 file missing or unreadable        (misconfigured VPS)
//   • PEM not a valid PKCS#8 P-256 key      (wrong key file)

export async function generateApnsJWT(env: Env): Promise<string | null> {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_KEY_PATH) return null;

  const now = Date.now();
  if (
    cachedJwt &&
    cachedJwt.keyId === env.APNS_KEY_ID &&
    cachedJwt.teamId === env.APNS_TEAM_ID &&
    now - cachedJwt.signedAt < JWT_TTL_MS
  ) {
    return cachedJwt.token;
  }

  const key = await loadSigningKey(env.APNS_KEY_PATH);
  if (!key) return null;

  const header = { alg: 'ES256', typ: 'JWT', kid: env.APNS_KEY_ID };
  const payload = {
    iss: env.APNS_TEAM_ID,
    iat: Math.floor(now / 1000),
  };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  let sigBuf: ArrayBuffer;
  try {
    sigBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    );
  } catch {
    return null;
  }
  const token = `${signingInput}.${base64url(new Uint8Array(sigBuf))}`;

  cachedJwt = {
    token,
    signedAt: now,
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
  };
  return token;
}

// ── Public: sendApnsNotification ──────────────────────────────────

export interface ApnsAlert {
  title: string;
  body?: string;
  subtitle?: string;
}

export interface ApnsPayload {
  alert: ApnsAlert;
  badge?: number;
  sound?: string;
  category?: string;
  // Custom payload merged into the top-level APS JSON (NOT inside aps).
  // Apple silently rejects custom keys nested under aps.
  data?: Record<string, unknown>;
}

export interface SendApnsOptions {
  // 'alert' = visible push (priority 10), 'background' = silent (priority 5).
  pushType?: 'alert' | 'background';
  // Collapse-id: APNs dedupes pending pushes that share the same value.
  collapseId?: string;
  // Override sandbox/production routing. Default reads env.APNS_ENVIRONMENT.
  environment?: 'production' | 'sandbox';
}

export interface ApnsSendResult {
  ok: boolean;
  statusCode: number;
  // Apple returns a JSON body like { reason: "BadDeviceToken" } on
  // failure. We forward verbatim plus an "apns-id" header for log
  // correlation. On network failure (no response from Apple) the
  // statusCode is 0 and reason is the JS error message.
  reason?: string;
  apnsId?: string;
}

const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

// Redact a token for logs/errors. APNs tokens are 64 hex chars and
// treating them as secret-equivalent means never leaking enough
// material to correlate two pushes targeting the same device.
function redactToken(t: string): string {
  if (!t) return '';
  return `${t.slice(0, 8)}…(${t.length})`;
}

export async function sendApnsNotification(
  env: Env,
  deviceToken: string,
  payload: ApnsPayload,
  options: SendApnsOptions = {}
): Promise<ApnsSendResult> {
  if (!deviceToken || typeof deviceToken !== 'string') {
    return { ok: false, statusCode: 0, reason: 'empty device token' };
  }
  if (!env.APNS_TOPIC) {
    return { ok: false, statusCode: 0, reason: 'APNS_TOPIC not configured' };
  }

  const jwt = await generateApnsJWT(env);
  if (!jwt) {
    return {
      ok: false,
      statusCode: 0,
      reason: 'APNs JWT unavailable (env / .p8 not configured?)',
    };
  }

  const pushType: 'alert' | 'background' = options.pushType ?? 'alert';
  const environment: 'production' | 'sandbox' =
    options.environment ?? (env.APNS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production');

  // APNs payload contract: aps is reserved by Apple, everything else
  // is forwarded to the app as user-info on tap.
  const apnsBody: Record<string, unknown> = {
    aps: {
      alert: payload.alert,
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      sound: payload.sound ?? 'default',
      ...(payload.category ? { category: payload.category } : {}),
      ...(pushType === 'background' ? { 'content-available': 1 } : {}),
    },
    ...(payload.data ?? {}),
  };

  const url = `${APNS_HOSTS[environment]}/3/device/${deviceToken}`;
  const headers: Record<string, string> = {
    'authorization': `bearer ${jwt}`,
    'apns-topic': env.APNS_TOPIC,
    'apns-push-type': pushType,
    'apns-priority': pushType === 'background' ? '5' : '10',
    'content-type': 'application/json',
  };
  if (options.collapseId) headers['apns-collapse-id'] = options.collapseId;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(apnsBody),
    });
  } catch (e) {
    return {
      ok: false,
      statusCode: 0,
      reason: `network error sending to ${redactToken(deviceToken)}: ${(e as Error).message}`,
    };
  }

  const apnsId = res.headers.get('apns-id') ?? undefined;

  if (res.status === 200) {
    return { ok: true, statusCode: 200, apnsId };
  }

  let reason: string | undefined;
  try {
    const errBody = await res.json() as { reason?: string };
    reason = errBody?.reason;
  } catch {
    // Apple sometimes returns an empty body on 410 Unregistered.
  }
  return {
    ok: false,
    statusCode: res.status,
    reason: reason ?? `APNs returned ${res.status}`,
    apnsId,
  };
}
