// CORS middleware
// For datacenter migration: replace with cors npm package or framework middleware

const ALLOWED_ORIGINS = [
  'https://app.kamizo.uz',
  'https://kamizo.uz',
  'https://www.kamizo.uz',
  'http://localhost:5173',
  'http://localhost:3000',
];

let currentCorsOrigin = 'https://app.kamizo.uz';

export function setCorsOrigin(request: Request): void {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    currentCorsOrigin = origin;
  } else if (/^https:\/\/[a-z0-9-]+\.kamizo\.uz$/.test(origin)) {
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
