// CORS middleware
// For datacenter migration: replace with cors npm package or framework middleware

const PRODUCTION_ORIGINS = [
  'https://app.kamizo.uz',
  'https://kamizo.uz',
  'https://www.kamizo.uz',
];

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

// Native app (Capacitor) webview origins. The published iOS/Android apps load
// the bundled web build locally, so their requests to the cross-origin API
// (api.kamizo.uz) carry one of these origins, NOT https://app.kamizo.uz:
//   - Android (capacitor.config androidScheme: 'https') -> https://localhost
//   - iOS (default Capacitor scheme)                    -> capacitor://localhost
// These must be allowed in production too, otherwise every API call from the
// native app is CORS-blocked ("Failed to fetch") and it can't even log in.
const NATIVE_ORIGINS = [
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
];

// Default to production + native origins (native apps are first-party).
// initCors() adds DEV_ORIGINS when environment !== 'production'.
let allowedOrigins = [...PRODUCTION_ORIGINS, ...NATIVE_ORIGINS];
let devMode = false;

// Call once at startup to configure CORS based on environment
export function initCors(environment: string): void {
  if (environment === 'production') {
    allowedOrigins = [...PRODUCTION_ORIGINS, ...NATIVE_ORIGINS];
    devMode = false;
  } else {
    allowedOrigins = [...PRODUCTION_ORIGINS, ...NATIVE_ORIGINS, ...DEV_ORIGINS];
    devMode = true;
  }
}

let currentCorsOrigin = 'https://app.kamizo.uz';

export function setCorsOrigin(request: Request): void {
  const origin = request.headers.get('Origin') || '';
  if (allowedOrigins.includes(origin)) {
    currentCorsOrigin = origin;
  } else if (/^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)?kamizo\.uz$/.test(origin)) {
    // Dynamic tenant subdomains (production only, RFC-compliant label check)
    currentCorsOrigin = origin;
  } else if (devMode && /^http:\/\/localhost:\d+$/.test(origin)) {
    // Any localhost port in dev mode
    currentCorsOrigin = origin;
  } else if (!origin) {
    currentCorsOrigin = 'https://app.kamizo.uz';
  } else {
    currentCorsOrigin = 'https://app.kamizo.uz';
  }
}

export function getCurrentCorsOrigin() {
  return currentCorsOrigin;
}

// Race-free, request-scoped origin resolution. Pure function — derives the
// allowed Access-Control-Allow-Origin directly from THIS request's Origin
// header, with no shared mutable state.
//
// Why this exists: `currentCorsOrigin` above is a module-level global mutated
// per request by setCorsOrigin(). On Cloudflare Workers that was tolerable,
// but on the Node.js VPS (@hono/node-server, single process, many concurrent
// requests) it is a race: the resident home screen fires ~8 parallel API
// calls, they overwrite each other's global, and a response can be sent with
// another request's Origin (or the app.kamizo.uz default) — the browser then
// rejects it as a CORS failure (`TypeError: Load failed`). index.ts now sets
// the header from this per-request function on every API response.
export function resolveCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  if (allowedOrigins.includes(origin)) return origin;
  // Dynamic tenant subdomains (production), RFC-compliant label check
  if (/^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)?kamizo\.uz$/.test(origin)) return origin;
  if (devMode && /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return 'https://app.kamizo.uz';
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': currentCorsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function handleCorsPreflightResponse(): Response {
  return new Response(null, { headers: corsHeaders() });
}
