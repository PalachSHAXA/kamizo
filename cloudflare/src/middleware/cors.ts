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

// Default to production-only origins (secure by default).
// initCors() adds DEV_ORIGINS when environment !== 'production'.
let allowedOrigins = [...PRODUCTION_ORIGINS];
let devMode = false;

// Call once at startup to configure CORS based on environment
export function initCors(environment: string): void {
  if (environment === 'production') {
    allowedOrigins = [...PRODUCTION_ORIGINS];
    devMode = false;
  } else {
    allowedOrigins = [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];
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
