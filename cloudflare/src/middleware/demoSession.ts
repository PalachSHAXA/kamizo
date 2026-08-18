import type { User } from '../types';

const PRESENTATION_MUTATIONS = new Set([
  'POST /api/requests',
  'POST /api/requests/:id/assign',
  'POST /api/requests/:id/accept',
  'POST /api/requests/:id/start',
  'POST /api/requests/:id/complete',
  'POST /api/requests/:id/approve',
  'POST /api/requests/:id/reject',
  'POST /api/requests/:id/rate',
  'POST /api/requests/:id/pause',
  'POST /api/requests/:id/resume',
  'POST /api/meetings/:meetingid/schedule-votes',
  'POST /api/meetings/:meetingid/agenda/:agendaitemid/vote',
  'POST /api/agenda/:agendaitemid/comments',
  'POST /api/announcements/:id/view',
  'POST /api/chat/channels/support',
  'POST /api/chat/channels/:id/messages',
  'POST /api/chat/channels/:id/read',
  'POST /api/marketplace/cart',
  'DELETE /api/marketplace/cart/:productid',
  'DELETE /api/marketplace/cart',
  'POST /api/marketplace/favorites/:productid',
  'POST /api/marketplace/orders',
  'POST /api/marketplace/orders/:id/rate',
  'POST /api/guest-codes',
  'POST /api/guest-codes/validate',
  'POST /api/guest-codes/:id/use',
  'POST /api/training/proposals/:proposalid/votes',
  'DELETE /api/training/proposals/:proposalid/votes',
  'POST /api/training/proposals/:proposalid/register',
  'DELETE /api/training/proposals/:proposalid/register',
  'POST /api/training/proposals/:proposalid/feedback',
  'POST /api/notes',
  'PUT /api/notes/:id',
  'DELETE /api/notes/:id',
]);

const SENSITIVE_GET_PREFIXES = [
  '/api/super-admin',
  '/api/admin/metrics',
  '/api/admin/monitoring',
  '/api/admin/cache',
];

const SENSITIVE_GET_PATHS = new Set([
  '/api/health',
  '/api/tenants',
]);

function canonicalPath(rawPath: string): string | null {
  let path = rawPath;
  for (let pass = 0; pass < 3; pass++) {
    path = path.split(/[?#]/, 1)[0];
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      return null;
    }
  }
  path = path.split(/[?#]/, 1)[0].replace(/\/{2,}/g, '/').toLowerCase();
  return path.startsWith('/api/') || path === '/api' ? path : null;
}

function deniedResponse(): Response {
  const ru = 'Демо-сессия доступна только для презентационных действий';
  const uz = 'Demo sessiyada faqat taqdimot amallariga ruxsat berilgan';
  return new Response(JSON.stringify({ error: ru, error_ru: ru, error_uz: uz }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function enforceDemoSessionPolicy(
  request: Request,
  user: User | null,
  routePath: string,
): Response | null {
  if (user?.isDemoSession !== true) return null;

  const path = canonicalPath(routePath);
  if (!path) return deniedResponse();
  if (SENSITIVE_GET_PATHS.has(path)) return deniedResponse();
  if (SENSITIVE_GET_PREFIXES.some((prefix) => path.startsWith(prefix))) return deniedResponse();
  if (/(?:^|\/)(?:password|reset-password|forgot-password)(?:\/|$)/.test(path)) return deniedResponse();

  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (
    request.method === 'POST'
    && path === '/api/guest-codes/:id/revoke'
    && !['admin', 'director', 'manager'].includes(user.role)
  ) return null;
  if (PRESENTATION_MUTATIONS.has(`${request.method} ${path}`)) return null;
  return deniedResponse();
}
