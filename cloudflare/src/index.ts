// UK CRM API - Cloudflare Workers with D1
// Оптимизировано для 5000+ одновременных пользователей

import {
  cachedQuery,
  cachedQueryWithArgs,
  invalidateOnChange,
  getCacheStats,
  CacheTTL,
  CachePrefix,
} from './cache';
import {
  metricsAggregator,
  withMonitoring,
  healthCheck,
  AlertManager,
  logAnalyticsEvent,
} from './monitoring';

interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ASSETS: Fetcher;
  RATE_LIMITER: KVNamespace;
  CONNECTION_MANAGER: DurableObjectNamespace;
}

interface User {
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
  account_type?: string; // 'advertiser' | 'coupon_checker' for special accounts
}

// ==================== CORS CONFIGURATION ====================
// Allowed origins for CORS (security: restrict to known domains)
const ALLOWED_ORIGINS = [
  'https://app.kamizo.uz',
  'https://kamizo.uz',
  'https://www.kamizo.uz',
  'http://localhost:5173', // Dev only
  'http://localhost:3000', // Dev only
];

// Current request origin (set at the start of each request)
let currentCorsOrigin = 'https://app.kamizo.uz';

function setCorsOrigin(request: Request): void {
  const origin = request.headers.get('Origin') || '';
  // Return the origin if it's in our allowed list, otherwise return the main domain
  if (ALLOWED_ORIGINS.includes(origin)) {
    currentCorsOrigin = origin;
  } else if (!origin) {
    // For same-origin requests (no Origin header), allow the request
    currentCorsOrigin = 'https://app.kamizo.uz';
  } else {
    // For unknown origins, still set a valid origin to avoid CORS errors
    // The real security is handled by authentication
    currentCorsOrigin = 'https://app.kamizo.uz';
  }
}

// ==================== PERFORMANCE OPTIMIZATIONS ====================
// Simple in-memory cache for frequently accessed data (per-isolate)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
  // Cleanup old entries periodically
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expires < now) cache.delete(k);
    }
  }
}

function invalidateCache(pattern: string) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// Simple router
type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler) {
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  routes.push({ method, pattern, handler });
}

function matchRoute(method: string, path: string) {
  for (const r of routes) {
    if (r.method === method) {
      const match = path.match(r.pattern);
      if (match) {
        return { handler: r.handler, params: match.groups || {} };
      }
    }
  }
  return null;
}

// Helpers
function json(data: any, status = 200, cacheControl?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': currentCorsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Добавляем Cache-Control для статических данных
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
}

function generateId() {
  return crypto.randomUUID();
}

// Helper: Check if user has management-level access (admin, director, or manager)
function isManagement(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'director' || user.role === 'manager';
}

// Helper: Check if user has admin-level access (admin or director)
function isAdminLevel(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'director';
}

// Helper: Fetch meeting with agenda items and schedule options
async function getMeetingWithDetails(env: Env, meetingId: string): Promise<any> {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first() as any;
  if (!meeting) return null;

  // Fetch agenda items
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(meetingId).all();

  // Fetch schedule options with vote counts
  const { results: scheduleOptions } = await env.DB.prepare(
    `SELECT so.*, COALESCE(SUM(sv.vote_weight), 0) as vote_weight, COUNT(sv.id) as vote_count
     FROM meeting_schedule_options so
     LEFT JOIN meeting_schedule_votes sv ON so.id = sv.option_id
     WHERE so.meeting_id = ?
     GROUP BY so.id
     ORDER BY so.date_time`
  ).bind(meetingId).all();

  meeting.agenda_items = agendaItems || [];
  meeting.schedule_options = scheduleOptions || [];

  return meeting;
}

// Secure password hashing with PBKDF2 and salt
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2 with 100,000 iterations
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  );

  // Combine salt and hash in format: base64(salt):base64(hash)
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

  return `${saltB64}:${hashB64}`;
}

// Verify password against stored hash
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();

  // Check if it's old SHA-256 format (no colon) or new PBKDF2 format (has colon)
  if (!storedHash.includes(':')) {
    // Legacy SHA-256 verification for backward compatibility
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hash);

    // Try hex format first (most common for legacy)
    const hexHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hexHash === storedHash) {
      return true;
    }

    // Fallback to base64 format
    const base64Hash = btoa(String.fromCharCode(...hashArray));
    return base64Hash === storedHash;
  }

  // New PBKDF2 verification
  const [saltB64, expectedHashB64] = storedHash.split(':');

  // Decode salt from base64
  const salt = new Uint8Array(
    atob(saltB64).split('').map(c => c.charCodeAt(0))
  );

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key with same parameters
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  // Compare hashes
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return hashB64 === expectedHashB64;
}

// Pagination helper
interface PaginationParams {
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
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

function getPaginationParams(url: URL): PaginationParams {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 5000); // Max 5000 items per page

  return {
    page: Math.max(1, page),
    limit: Math.max(1, limit)
  };
}

function createPaginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 500;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

// Rate limiting with Workers KV
interface RateLimitConfig {
  maxRequests: number;  // Max requests per window
  windowSeconds: number; // Time window in seconds
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Authentication endpoints - strict limits
  'POST:/api/auth/login': { maxRequests: 5, windowSeconds: 60 },  // 5 login attempts per minute
  'POST:/api/auth/register': { maxRequests: 3, windowSeconds: 3600 }, // 3 registrations per hour
  'POST:/api/auth/register-bulk': { maxRequests: 10, windowSeconds: 3600 }, // 10 bulk imports per hour

  // API endpoints - moderate limits
  'GET:/api/requests': { maxRequests: 60, windowSeconds: 60 },    // 60 requests per minute
  'POST:/api/requests': { maxRequests: 20, windowSeconds: 60 },   // 20 creates per minute
  'GET:/api/users': { maxRequests: 30, windowSeconds: 60 },       // 30 requests per minute
  'GET:/api/announcements': { maxRequests: 30, windowSeconds: 60 }, // 30 requests per minute

  // Default for other endpoints
  'default': { maxRequests: 100, windowSeconds: 60 }  // 100 requests per minute
};

async function checkRateLimit(
  env: Env,
  identifier: string, // IP or user ID
  endpoint: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const key = `ratelimit:${endpoint}:${identifier}`;

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  // Get current count from KV
  const data = await env.RATE_LIMITER.get(key, 'json') as { count: number; resetAt: number } | null;

  if (!data || data.resetAt < now) {
    // New window - allow and set counter
    const resetAt = now + windowMs;
    await env.RATE_LIMITER.put(
      key,
      JSON.stringify({ count: 1, resetAt }),
      { expirationTtl: config.windowSeconds }
    );

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt
    };
  }

  if (data.count >= config.maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetAt: data.resetAt
    };
  }

  // Increment counter
  const newCount = data.count + 1;
  const ttlSeconds = Math.max(60, Math.ceil((data.resetAt - now) / 1000)); // KV minimum TTL is 60 seconds
  await env.RATE_LIMITER.put(
    key,
    JSON.stringify({ count: newCount, resetAt: data.resetAt }),
    { expirationTtl: ttlSeconds }
  );

  return {
    allowed: true,
    remaining: config.maxRequests - newCount,
    resetAt: data.resetAt
  };
}

// Get client identifier (IP or user ID)
function getClientIdentifier(request: Request, user?: User | null): string {
  // If authenticated, use user ID
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Otherwise use IP address
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For') ||
             'unknown';
  return `ip:${ip}`;
}

// Auth middleware with caching
async function getUser(request: Request, env: Env): Promise<User | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  // Check cache first
  const cacheKey = `user:${token}`;
  const cachedUser = getCached<User>(cacheKey);
  if (cachedUser) {
    return cachedUser;
  }

  let result = await env.DB.prepare(
    'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type FROM users WHERE id = ?'
  ).bind(token).first();

  if (result) {
    // Map login to director role (since DB constraint doesn't allow 'director' role yet)
    const user = result as any;
    if (user.login === 'ukdirector') {
      user.role = 'director';
    }
    setCache(cacheKey, user, 60000); // Cache user for 1 minute
    return user as User;
  }

  return null;
}

// ==================== SSE (Server-Sent Events) ====================

// SSE endpoint for real-time updates
route('GET', '/api/events', async (request, env) => {
  // EventSource doesn't support custom headers, so accept token via query param
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token');

  let user: User | null = null;

  if (tokenFromQuery) {
    const result = await env.DB.prepare(
      'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
    ).bind(tokenFromQuery).first();
    user = result as User | null;
  } else {
    user = await getUser(request, env);
  }

  if (!user) {
    return error('Unauthorized', 401);
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId: user.id, role: user.role })}\n\n`));

      // Keep connection alive and send updates
      let lastCheck = Date.now();
      let lastRequestsHash = '';
      let isActive = true;

      let lastMeetingsHash = '';
      let lastAnnouncementsHash = '';
      let lastExecutorsHash = '';

      const checkForUpdates = async () => {
        if (!isActive) return;

        try {
          // Get latest requests for this user
          let query = '';
          let params: any[] = [];

          if (user.role === 'resident') {
            query = `SELECT id, status, executor_id, updated_at FROM requests WHERE resident_id = ? ORDER BY updated_at DESC LIMIT 20`;
            params = [user.id];
          } else if (user.role === 'executor') {
            query = `SELECT id, status, updated_at FROM requests WHERE executor_id = ? OR status = 'new' ORDER BY updated_at DESC LIMIT 20`;
            params = [user.id];
          } else {
            // Manager/admin sees all
            query = `SELECT id, status, executor_id, updated_at FROM requests ORDER BY updated_at DESC LIMIT 50`;
          }

          const { results } = await env.DB.prepare(query).bind(...params).all();
          const currentHash = JSON.stringify(results);

          // If data changed, send update
          if (currentHash !== lastRequestsHash) {
            lastRequestsHash = currentHash;
            if (lastCheck !== Date.now()) { // Skip first check
              controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ type: 'requests', timestamp: Date.now() })}\n\n`));
            }
          }

          // Check for meetings updates (for all users - собрания касаются всех)
          const buildingId = user.building_id || null;
          let meetingsQuery = `SELECT id, status, updated_at, building_id FROM meetings WHERE status NOT IN ('cancelled', 'protocol_approved') ORDER BY updated_at DESC LIMIT 10`;

          if (buildingId) {
            meetingsQuery = `SELECT id, status, updated_at, building_id FROM meetings WHERE building_id = ? AND status NOT IN ('cancelled', 'protocol_approved') ORDER BY updated_at DESC LIMIT 10`;
          }

          const meetingsResult = buildingId
            ? await env.DB.prepare(meetingsQuery).bind(buildingId).all()
            : await env.DB.prepare(meetingsQuery).all();

          const meetingsHash = JSON.stringify(meetingsResult.results);

          if (meetingsHash !== lastMeetingsHash) {
            const hadPreviousData = lastMeetingsHash !== '';
            lastMeetingsHash = meetingsHash;
            if (hadPreviousData) {
              // Отправляем обновление о собраниях
              controller.enqueue(encoder.encode(`event: meeting_update\ndata: ${JSON.stringify({
                type: 'meetings',
                timestamp: Date.now(),
                meetings: meetingsResult.results
              })}\n\n`));
            }
          }

          // Check for announcements updates
          const announcementsQuery = buildingId
            ? `SELECT id, title, type, priority, created_at FROM announcements WHERE (building_id = ? OR building_id IS NULL) AND is_active = 1 ORDER BY created_at DESC LIMIT 10`
            : `SELECT id, title, type, priority, created_at FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 10`;

          const announcementsResult = buildingId
            ? await env.DB.prepare(announcementsQuery).bind(buildingId).all()
            : await env.DB.prepare(announcementsQuery).all();

          const announcementsHash = JSON.stringify(announcementsResult.results);

          if (announcementsHash !== lastAnnouncementsHash) {
            const hadPreviousAnnouncements = lastAnnouncementsHash !== '';
            lastAnnouncementsHash = announcementsHash;
            if (hadPreviousAnnouncements) {
              // Отправляем обновление об объявлениях
              controller.enqueue(encoder.encode(`event: announcement_update\ndata: ${JSON.stringify({
                type: 'announcements',
                timestamp: Date.now(),
                announcements: announcementsResult.results
              })}\n\n`));
            }
          }

          // Check for executors updates (for managers, admins, department_heads)
          if (['admin', 'director', 'manager', 'department_head'].includes(user.role)) {
            const executorsQuery = `SELECT id, name, specialization, status, created_at FROM users WHERE role = 'executor' ORDER BY created_at DESC LIMIT 50`;
            const executorsResult = await env.DB.prepare(executorsQuery).all();
            const executorsHash = JSON.stringify(executorsResult.results);

            if (executorsHash !== lastExecutorsHash) {
              const hadPreviousExecutors = lastExecutorsHash !== '';
              lastExecutorsHash = executorsHash;
              if (hadPreviousExecutors) {
                // Отправляем обновление об исполнителях
                controller.enqueue(encoder.encode(`event: executor_update\ndata: ${JSON.stringify({
                  type: 'executors',
                  timestamp: Date.now()
                })}\n\n`));
              }
            }
          }

          lastCheck = Date.now();

          // Send heartbeat every 15 seconds to keep connection alive
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));

          // Schedule next check in 2 seconds
          setTimeout(checkForUpdates, 2000);
        } catch (e) {
          console.error('SSE error:', e);
          isActive = false;
          controller.close();
        }
      };

      // Start checking for updates
      setTimeout(checkForUpdates, 2000);

      // Handle client disconnect (Cloudflare Workers limitation - we can't detect this directly)
      // The stream will be closed when the client disconnects
    },
    cancel() {
      // Client disconnected
      console.log('SSE client disconnected');
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': currentCorsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
});

// ==================== WEBSOCKET (DURABLE OBJECTS) ====================
// New WebSocket endpoint - replaces SSE for real-time updates
// Reduces D1 reads from 60,000/min to 6/min (99.99% reduction)

route('GET', '/api/ws', async (request, env) => {
  const url = new URL(request.url);
  const upgradeHeader = request.headers.get('Upgrade');

  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return error('Expected WebSocket upgrade', 400);
  }

  // Authenticate user
  const tokenFromQuery = url.searchParams.get('token');
  let user: User | null = null;

  if (tokenFromQuery) {
    const result = await env.DB.prepare(
      'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
    ).bind(tokenFromQuery).first();
    user = result as User | null;
    // Map login to director role (since DB constraint doesn't allow 'director' role yet)
    if (user && (user as any).login === 'ukdirector') {
      (user as any).role = 'director';
    }
  } else {
    user = await getUser(request, env);
  }

  if (!user) {
    return error('Unauthorized', 401);
  }

  // Get or create Durable Object instance
  // Shard by building for better distribution
  const shardKey = user.building_id || 'global';
  const id = env.CONNECTION_MANAGER.idFromName(shardKey);
  const stub = env.CONNECTION_MANAGER.get(id);

  // Forward request to Durable Object with user info
  const doUrl = new URL(request.url);
  doUrl.searchParams.set('userId', user.id);
  doUrl.searchParams.set('userName', user.name);
  doUrl.searchParams.set('role', user.role);
  if (user.building_id) {
    doUrl.searchParams.set('buildingId', user.building_id);
  }

  return stub.fetch(doUrl.toString(), request);
});

// ==================== AUTH ROUTES ====================

// Cache stats endpoint (для мониторинга)
route('GET', '/api/admin/cache/stats', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = getCacheStats();
  return json(stats);
});

// Seed initial users (for setup) - Demo accounts for all roles
route('POST', '/api/seed', async (request, env) => {
  const initialUsers = [
    // Demo accounts (password: kamizo) - matching LoginPage demo buttons
    { login: 'admin', password: 'palach27', name: 'Администратор', role: 'admin', phone: '+998901234567' },
    { login: 'director', password: 'kamizo', name: 'Директор Демо', role: 'director', phone: '+998901000000' },
    { login: 'manager', password: 'kamizo', name: 'Управляющий', role: 'manager', phone: '+998901111111' },
    { login: 'department_head', password: 'kamizo', name: 'Глава отдела', role: 'department_head', phone: '+998901222222' },
    { login: 'resident', password: 'kamizo', name: 'Житель Демо', role: 'resident', phone: '+998902222222', address: 'ул. Мустакиллик, 15', apartment: '42' },
    { login: 'executor', password: 'kamizo', name: 'Исполнитель Демо', role: 'executor', phone: '+998903333333', specialization: 'plumber' },
    { login: 'dispatcher', password: 'kamizo', name: 'Диспетчер Демо', role: 'dispatcher', phone: '+998904444444' },
    { login: 'security', password: 'kamizo', name: 'Охранник Демо', role: 'security', phone: '+998905555555' },
    { login: 'coupon_checker', password: 'kamizo', name: 'Чекер купонов Демо', role: 'coupon_checker', phone: '+998907777777' },
    { login: 'advertiser', password: 'kamizo', name: 'Рекламодатель Демо', role: 'advertiser', phone: '+998906666666' },
  ];

  const results = [];

  for (const u of initialUsers) {
    // Check if exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?').bind(u.login).first();
    if (existing) {
      results.push({ login: u.login, status: 'exists' });
      continue;
    }

    const id = generateId();
    const passwordHash = await hashPassword(u.password);

    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, phone, specialization, address, apartment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, u.login, passwordHash, u.name, u.role, u.phone,
      (u as any).specialization || null,
      (u as any).address || null,
      (u as any).apartment || null
    ).run();

    results.push({ login: u.login, status: 'created' });
  }

  return json({ results });
});

// Auth: Login
route('POST', '/api/auth/login', async (request, env) => {
  // Check rate limit (by IP before authentication)
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(env, identifier, 'POST:/api/auth/login');

  if (!rateLimit.allowed) {
    const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return new Response(JSON.stringify({
      error: `Too many login attempts. Try again in ${resetIn} seconds.`
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        'Retry-After': resetIn.toString()
      }
    });
  }

  const { login, password } = await request.json() as { login: string; password: string };

  if (!login || !password) {
    return error('Login and password required');
  }

  // Fetch user with password hash
  const userWithHash = await env.DB.prepare(
    'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type FROM users WHERE login = ?'
  ).bind(login.trim()).first() as any;

  if (!userWithHash) {
    return error('Invalid credentials', 401);
  }

  // Verify password using new secure method (supports both legacy SHA-256 and new PBKDF2)
  const isValidPassword = await verifyPassword(password, userWithHash.password_hash);

  if (!isValidPassword) {
    // Fallback: check if password matches plain text (for demo/initial users)
    if (userWithHash.password_hash !== password) {
      return error('Invalid credentials', 401);
    }
  }

  // Auto-migrate legacy password to new PBKDF2 format on successful login
  if (!userWithHash.password_hash.includes(':')) {
    const newHash = await hashPassword(password);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, userWithHash.id).run();
  }

  // Remove password_hash from response
  const { password_hash, ...user } = userWithHash;

  // Map login to director role (since DB constraint doesn't allow 'director' role yet)
  if (user.login === 'ukdirector') {
    user.role = 'director';
  }

  // Create response with rate limit headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': currentCorsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-RateLimit-Limit': '5',
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': rateLimit.resetAt.toString()
  };

  return new Response(JSON.stringify({ user, token: user.id }), {
    status: 200,
    headers
  });
});

// Auth: Register (protected - only admin/manager can create users)
route('POST', '/api/auth/register', async (request, env) => {
  // SECURITY: Require authentication
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized - login required', 401);
  }

  // SECURITY: Only admin, director, manager, and department_head can create users
  if (authUser.role !== 'admin' && authUser.role !== 'director' && authUser.role !== 'manager' && authUser.role !== 'department_head') {
    return error('Only admin, director, manager, or department head can create users', 403);
  }

  const body = await request.json() as any;
  const { login, password, name, role = 'resident', phone, address, apartment, building_id, entrance, floor, specialization, branch, building } = body;

  if (!login || !password || !name) {
    return error('Login, password, and name required');
  }

  // SECURITY: Only admin can create admin accounts
  if (role === 'admin' && authUser.role !== 'admin') {
    return error('Only admin can create admin accounts', 403);
  }

  // SECURITY: Only admin can create director accounts
  if (role === 'director' && authUser.role !== 'admin') {
    return error('Only admin can create director accounts', 403);
  }

  // SECURITY: Only admin or director can create manager accounts
  if (role === 'manager' && !isAdminLevel(authUser)) {
    return error('Only admin or director can create manager accounts', 403);
  }

  // SECURITY: Department head can only create executors of their own department
  if (authUser.role === 'department_head') {
    if (role !== 'executor') {
      return error('Department head can only create executors', 403);
    }
    if (specialization !== authUser.specialization) {
      return error('Department head can only create executors in their own department', 403);
    }
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?').bind(login.trim()).first();
  if (existing) {
    return error('Login already exists');
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);

  // Store plain password only for staff roles (for admin convenience)
  const staffRoles = ['manager', 'department_head', 'executor'];
  const passwordPlain = staffRoles.includes(role) ? password : null;

  await env.DB.prepare(`
    INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, login.trim(), passwordHash, passwordPlain, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null).run();

  return json({ user: { id, login, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, password: passwordPlain } }, 201);
});

// Auth: Bulk register (for Excel import) - now updates existing users instead of skipping
route('POST', '/api/auth/register-bulk', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { users } = await request.json() as { users: any[] };
  const created: any[] = [];
  const updated: any[] = [];

  for (const u of users) {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?').bind(u.login.trim()).first() as any;

    if (existing) {
      // UPDATE existing user with new data (building_id, apartment, address, etc.)
      await env.DB.prepare(`
        UPDATE users SET
          name = ?, address = ?, apartment = ?, building_id = ?, entrance = ?, floor = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        u.name, u.address || null, u.apartment || null, u.building_id || null,
        u.entrance || null, u.floor || null, existing.id
      ).run();

      // Also update password if provided
      if (u.password) {
        const passwordHash = await hashPassword(u.password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
          .bind(passwordHash, existing.id).run();
      }

      updated.push({ id: existing.id, login: u.login, name: u.name });
    } else {
      // CREATE new user
      const id = generateId();
      const passwordHash = await hashPassword(u.password || 'kamizo');

      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, total_area)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, u.login.trim(), passwordHash, u.name, 'resident',
        u.phone || null, u.address || null, u.apartment || null, u.building_id || null, u.entrance || null, u.floor || null, u.total_area || null
      ).run();

      created.push({ id, login: u.login, name: u.name });
    }
  }

  return json({ created, updated }, 201);
});

// Users: Get current user
route('GET', '/api/users/me', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  return json({ user });
});

// Users: Update profile
route('PATCH', '/api/users/me', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const updates = await request.json() as any;
  const allowed = ['phone', 'name', 'address', 'language'];
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (setClauses.length === 0) return json({ user });

  setClauses.push('updated_at = datetime("now")');
  values.push(user.id);

  await env.DB.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).bind(...values).run();

  // Fetch updated user
  const updatedUser = await env.DB.prepare(
    'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
  ).bind(user.id).first();

  return json({ user: updatedUser });
});

// Users: Mark contract as signed (for onboarding tracking)
route('POST', '/api/users/me/contract-signed', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare('UPDATE users SET contract_signed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(user.id).run();

  return json({ success: true, contract_signed_at: new Date().toISOString() });
});

// Users: Change password
route('POST', '/api/users/me/password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { current_password, new_password } = await request.json() as any;

  // Fetch current password hash
  const userWithHash = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id).first() as any;

  if (!userWithHash) {
    return error('User not found', 404);
  }

  // Verify current password
  const isValid = await verifyPassword(current_password, userWithHash.password_hash);

  if (!isValid) {
    return error('Current password is incorrect', 400);
  }

  // Hash new password with PBKDF2
  const newHash = await hashPassword(new_password);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_changed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(newHash, user.id).run();

  return json({ success: true, password_changed_at: new Date().toISOString() });
});

// Users: Admin change password
route('POST', '/api/users/:id/password', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { new_password } = await request.json() as any;
  const newHash = await hashPassword(new_password);

  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').bind(newHash, params.id).run();

  return json({ success: true });
});

// Users: List all users (admin/manager only)
route('GET', '/api/users', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const building_id = url.searchParams.get('building_id');
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }
  if (building_id) {
    whereClause += ' AND building_id = ?';
    params.push(building_id);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, created_at
    FROM users
    ${whereClause}
    ORDER BY name
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ users: response.data, pagination: response.pagination });
});

// Users: Delete
route('DELETE', '/api/users/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== VEHICLES ROUTES ====================

// Vehicles: List for user (with owner info from users table)
// Supports both user_id (new) and resident_id (legacy) columns
route('GET', '/api/vehicles', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE COALESCE(v.user_id, v.resident_id) = ?
    ORDER BY v.is_primary DESC, v.created_at DESC
  `).bind(user.id).all();

  return json({ vehicles: results });
});

// Vehicles: Create (with all fields)
route('POST', '/api/vehicles', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary } = body;

  if (!plate_number) {
    return error('Plate number required');
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO vehicles (id, resident_id, user_id, plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, user.id, plate_number.toUpperCase(),
    brand || null, model || null, color || null, year || null,
    vehicle_type || 'car', owner_type || 'individual',
    company_name || null, parking_spot || null, notes || null,
    is_primary ? 1 : 0
  ).run();

  // Return vehicle with owner info
  const created = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.id = ?
  `).bind(id).first();

  return json({ vehicle: created }, 201);
});

// Vehicles: Update
route('PATCH', '/api/vehicles/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const allowedFields = ['plate_number', 'brand', 'model', 'color', 'year', 'vehicle_type', 'owner_type', 'company_name', 'parking_spot', 'notes', 'is_primary'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'plate_number') {
        updates.push(`${field} = ?`);
        values.push(body[field].toUpperCase());
      } else if (field === 'is_primary') {
        updates.push(`${field} = ?`);
        values.push(body[field] ? 1 : 0);
      } else {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return json({ success: true });
  }

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  values.push(user.id);
  values.push(user.id);

  await env.DB.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ? AND (user_id = ? OR resident_id = ?)`).bind(...values).run();

  // Return updated vehicle
  const updated = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.id = ?
  `).bind(params.id).first();

  return json({ vehicle: updated });
});

// Vehicles: Delete (supports both user_id and resident_id)
route('DELETE', '/api/vehicles/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare('DELETE FROM vehicles WHERE id = ? AND (user_id = ? OR resident_id = ?)').bind(params.id, user.id, user.id).run();
  return json({ success: true });
});

// Vehicles: Get ALL vehicles (for security/managers/admins only)
// Оптимизировано для 5000+ пользователей с пагинацией
route('GET', '/api/vehicles/all', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only allow staff roles to see all vehicles
  const allowedRoles = ['admin', 'director', 'manager', 'executor', 'department_head'];
  if (!allowedRoles.includes(user.role)) {
    return error('Forbidden', 403);
  }

  const url = new URL(request.url);
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toUpperCase();

  // Build WHERE clause for search
  let whereClause = '';
  const params: any[] = [];

  if (search && search.length >= 2) {
    whereClause = 'WHERE v.plate_number LIKE ? OR u.name LIKE ? OR u.apartment LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count total
  const countQuery = `
    SELECT COUNT(*) as total FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    ${whereClause}
  `;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    ${whereClause}
    ORDER BY v.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ vehicles: response.data, pagination: response.pagination });
});

// Vehicles: Search (for security/managers) - also search by plate param
// Supports both user_id and resident_id columns
route('GET', '/api/vehicles/search', async (request, env) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.toUpperCase() || url.searchParams.get('plate')?.toUpperCase();

  if (!query || query.length < 2) {
    return json({ vehicles: [] });
  }

  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.plate_number LIKE ?
    ORDER BY v.plate_number
    LIMIT 20
  `).bind(`%${query}%`).all();

  return json({ vehicles: results });
});

// ==================== RENTAL APARTMENTS ROUTES ====================

// My apartments: For tenants/commercial_owners to see their own apartments and records
route('GET', '/api/rentals/my-apartments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only tenants and commercial_owners can access this
  if (user.role !== 'tenant' && user.role !== 'commercial_owner') {
    return error('Access denied', 403);
  }

  // Get apartments owned by this user
  const { results: apartments } = await env.DB.prepare(`
    SELECT
      ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type,
      ra.is_active, ra.created_at
    FROM rental_apartments ra
    WHERE ra.owner_id = ?
    ORDER BY ra.created_at DESC
  `).bind(user.id).all();

  // Get all records for all of user's apartments
  const apartmentIds = apartments.map((a: any) => a.id);
  let records: any[] = [];

  if (apartmentIds.length > 0) {
    const placeholders = apartmentIds.map(() => '?').join(',');
    const { results: recordResults } = await env.DB.prepare(`
      SELECT
        rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
        rr.check_in_date, rr.check_out_date, rr.amount, rr.currency,
        rr.notes, rr.created_at
      FROM rental_records rr
      WHERE rr.apartment_id IN (${placeholders})
      ORDER BY rr.check_in_date DESC
    `).bind(...apartmentIds).all();
    records = recordResults || [];
  }

  // Transform to frontend format
  const transformedApartments = apartments.map((r: any) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartment: r.apartment,
    ownerId: r.owner_id,
    ownerName: user.name,
    ownerPhone: user.phone,
    ownerLogin: user.login,
    ownerType: r.owner_type,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  }));

  const transformedRecords = records.map((r: any) => ({
    id: r.id,
    apartmentId: r.apartment_id,
    guestNames: r.guest_names,
    passportInfo: r.passport_info,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    amount: r.amount,
    currency: r.currency || 'UZS',
    notes: r.notes,
    createdAt: r.created_at,
  }));

  return json({
    apartments: transformedApartments,
    records: transformedRecords
  });
});

// Rental apartments: List all (for managers/admins)
route('GET', '/api/rentals/apartments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT
      ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type,
      ra.is_active, ra.created_at,
      u.name as owner_name, u.phone as owner_phone, u.login as owner_login,
      u.password_plain as owner_password
    FROM rental_apartments ra
    LEFT JOIN users u ON u.id = ra.owner_id
    ORDER BY ra.created_at DESC
  `).all();

  // Transform to frontend format
  const apartments = results.map((r: any) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartment: r.apartment,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerPhone: r.owner_phone,
    ownerLogin: r.owner_login,
    ownerPassword: r.owner_password,
    ownerType: r.owner_type,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  }));

  return json({ apartments });
});

// Rental apartments: Create (creates user + apartment)
route('POST', '/api/rentals/apartments', async (request, env) => {
  try {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    if (!isManagement(user)) return error('Access denied', 403);

    const body = await request.json() as any;
    console.log('[API] Rental create body received:', JSON.stringify(body));

    const { name, address, apartment, ownerName, ownerPhone, ownerLogin, ownerPassword, ownerType = 'tenant' } = body;

    if (!name || !address || !ownerLogin || !ownerPassword) {
      console.log('[API] Missing fields:', { name: !!name, address: !!address, ownerLogin: !!ownerLogin, ownerPassword: !!ownerPassword });
      return error('Name, address, login and password required');
    }

    // Check if login exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?').bind(ownerLogin.trim()).first();
    if (existing) {
      console.log('[API] Login already exists:', ownerLogin);
      return error('Login already exists', 400);
    }

    console.log('[API] Creating rental apartment:', { name, address, apartment, ownerLogin, ownerType });

    // Create user (tenant or commercial_owner)
    const userId = generateId();
    console.log('[API] Generated userId:', userId);

    const passwordHash = await hashPassword(ownerPassword);
    console.log('[API] Password hashed successfully');

    console.log('[API] Inserting user...');
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, password_plain, name, role, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, ownerLogin.trim(), passwordHash, ownerPassword, ownerName || name, ownerType, ownerPhone || null).run();
    console.log('[API] User created successfully');

    // Create rental apartment
    const apartmentId = generateId();
    console.log('[API] Inserting apartment...');
    await env.DB.prepare(`
      INSERT INTO rental_apartments (id, name, address, apartment, owner_id, owner_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(apartmentId, name, address, apartment || null, userId, ownerType).run();
    console.log('[API] Apartment created successfully');

    return json({
      apartment: {
        id: apartmentId,
        name,
        address,
        apartment,
        ownerId: userId,
        ownerName: ownerName || name,
        ownerPhone,
        ownerLogin,
        ownerPassword,
        ownerType,
        isActive: true,
        createdAt: new Date().toISOString(),
      }
    }, 201);
  } catch (err: any) {
    console.error('[API] Error creating rental apartment:', err);
    console.error('[API] Error message:', err.message);
    console.error('[API] Error stack:', err.stack);
    // Check for specific errors
    if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('login')) {
      return error('Login already exists', 400);
    }
    return error(`Failed to create apartment: ${err.message}`, 500);
  }
});

// Rental apartments: Update
route('PATCH', '/api/rentals/apartments/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.address) { updates.push('address = ?'); values.push(body.address); }
  if (body.apartment !== undefined) { updates.push('apartment = ?'); values.push(body.apartment); }
  if (body.isActive !== undefined) { updates.push('is_active = ?'); values.push(body.isActive ? 1 : 0); }

  if (updates.length > 0) {
    values.push(params.id);
    await env.DB.prepare(`
      UPDATE rental_apartments SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?
    `).bind(...values).run();
  }

  return json({ success: true });
});

// Rental apartments: Delete (also deletes owner user and records)
route('DELETE', '/api/rentals/apartments/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  // Get apartment to find owner
  const apt = await env.DB.prepare('SELECT owner_id FROM rental_apartments WHERE id = ?').bind(params.id).first() as any;
  if (!apt) {
    return error('Apartment not found', 404);
  }

  // Delete rental records first (cascade should handle, but be safe)
  await env.DB.prepare('DELETE FROM rental_records WHERE apartment_id = ?').bind(params.id).run();

  // Delete apartment
  await env.DB.prepare('DELETE FROM rental_apartments WHERE id = ?').bind(params.id).run();

  // Delete owner user
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(apt.owner_id).run();

  return json({ success: true });
});

// Rental records: List all or by apartment
route('GET', '/api/rentals/records', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const apartmentId = url.searchParams.get('apartmentId');

  let query = `
    SELECT
      rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
      rr.check_in_date, rr.check_out_date, rr.amount, rr.currency,
      rr.notes, rr.created_by, rr.created_at
    FROM rental_records rr
  `;
  const params: any[] = [];

  if (apartmentId) {
    query += ' WHERE rr.apartment_id = ?';
    params.push(apartmentId);
  }

  query += ' ORDER BY rr.check_in_date DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Transform to frontend format
  const records = results.map((r: any) => ({
    id: r.id,
    apartmentId: r.apartment_id,
    guestNames: r.guest_names,
    passportInfo: r.passport_info,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    amount: r.amount,
    currency: r.currency,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  return json({ records });
});

// Rental records: Create
route('POST', '/api/rentals/records', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const { apartmentId, guestNames, passportInfo, checkInDate, checkOutDate, amount, currency, notes } = body;

  if (!apartmentId || !guestNames || !checkInDate || !checkOutDate) {
    return error('Apartment, guest names, and dates required');
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO rental_records (id, apartment_id, guest_names, passport_info, check_in_date, check_out_date, amount, currency, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, apartmentId, guestNames, passportInfo || null, checkInDate, checkOutDate, amount || 0, currency || 'UZS', notes || null, user.id).run();

  return json({
    record: {
      id,
      apartmentId,
      guestNames,
      passportInfo,
      checkInDate,
      checkOutDate,
      amount: amount || 0,
      currency: currency || 'UZS',
      notes,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    }
  }, 201);
});

// Rental records: Update
route('PATCH', '/api/rentals/records/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.guestNames) { updates.push('guest_names = ?'); values.push(body.guestNames); }
  if (body.passportInfo !== undefined) { updates.push('passport_info = ?'); values.push(body.passportInfo); }
  if (body.checkInDate) { updates.push('check_in_date = ?'); values.push(body.checkInDate); }
  if (body.checkOutDate) { updates.push('check_out_date = ?'); values.push(body.checkOutDate); }
  if (body.amount !== undefined) { updates.push('amount = ?'); values.push(body.amount); }
  if (body.currency) { updates.push('currency = ?'); values.push(body.currency); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }

  if (updates.length > 0) {
    values.push(params.id);
    await env.DB.prepare(`
      UPDATE rental_records SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?
    `).bind(...values).run();
  }

  return json({ success: true });
});

// Rental records: Delete
route('DELETE', '/api/rentals/records/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  await env.DB.prepare('DELETE FROM rental_records WHERE id = ?').bind(params.id).run();

  return json({ success: true });
});

// ==================== GUEST ACCESS ROUTES ====================

// Guest codes: List for user (with auto-expire check)
route('GET', '/api/guest-codes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Check if user is management (admin, director, manager)
  const isManagementUser = ['admin', 'director', 'manager'].includes(user.role);

  // Auto-expire old codes
  if (isManagementUser) {
    // Expire all codes for management view
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND valid_until < datetime('now')
    `).run();
  } else {
    // Expire only user's codes
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'expired', updated_at = datetime('now')
      WHERE user_id = ? AND status = 'active' AND valid_until < datetime('now')
    `).bind(user.id).run();
  }

  let results;
  if (isManagementUser) {
    // Management sees all codes from all residents
    const response = await env.DB.prepare(`
      SELECT g.*, u.name as creator_name, u.apartment as creator_apartment, u.phone as creator_phone
      FROM guest_access_codes g
      LEFT JOIN users u ON u.id = g.user_id
      ORDER BY g.created_at DESC
      LIMIT 200
    `).all();
    results = response.results;
  } else {
    // Regular users see only their own codes
    const response = await env.DB.prepare(`
      SELECT * FROM guest_access_codes
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(user.id).all();
    results = response.results;
  }

  return json({ codes: results });
});

// Guest codes: Create (full data)
route('POST', '/api/guest-codes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Calculate validity based on access_type
  let validUntil: string;
  let maxUses = 1;
  const now = new Date();
  const validFrom = body.valid_from ? new Date(body.valid_from) : now;

  switch (body.access_type) {
    case 'single_use':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
      maxUses = 1;
      break;
    case 'day':
      const endOfDay = new Date(validFrom);
      endOfDay.setHours(23, 59, 59, 999);
      validUntil = body.valid_until || endOfDay.toISOString();
      maxUses = 999;
      break;
    case 'week':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999;
      break;
    case 'month':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999;
      break;
    default:
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  // Create QR token (self-contained)
  const tokenData = {
    i: id,
    rn: body.resident_name || user.name,
    rp: body.resident_phone || user.phone,
    ra: body.resident_apartment || user.apartment,
    rd: body.resident_address || user.address,
    vt: body.visitor_type || 'guest',
    at: body.access_type || 'single_use',
    vf: validFrom.getTime(),
    vu: new Date(validUntil).getTime(),
    mx: maxUses,
    vn: body.visitor_name || '',
    vp: body.visitor_phone || '',
    vv: body.visitor_vehicle_plate || '',
  };

  const jsonString = JSON.stringify(tokenData);
  const qrToken = 'GAPASS:' + btoa(unescape(encodeURIComponent(jsonString)));

  await env.DB.prepare(`
    INSERT INTO guest_access_codes (
      id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
      access_type, valid_from, valid_until, max_uses, current_uses, status,
      resident_name, resident_phone, resident_apartment, resident_address, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, qrToken,
    body.visitor_type || 'guest',
    body.visitor_name || null,
    body.visitor_phone || null,
    body.visitor_vehicle_plate || null,
    body.access_type || 'single_use',
    validFrom.toISOString(),
    validUntil,
    maxUses,
    body.resident_name || user.name,
    body.resident_phone || user.phone,
    body.resident_apartment || user.apartment,
    body.resident_address || user.address,
    body.notes || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(id).first();
  return json({ code: created }, 201);
});

// Guest codes: Get single code
route('GET', '/api/guest-codes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ? AND user_id = ?')
    .bind(params.id, user.id).first();

  if (!code) return error('Not found', 404);
  return json({ code });
});

// Guest codes: Revoke
route('POST', '/api/guest-codes/:id/revoke', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE guest_access_codes
    SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).bind(user.id, body.reason || null, params.id, user.id).run();

  return json({ success: true });
});

// Guest codes: Delete
route('DELETE', '/api/guest-codes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare('DELETE FROM guest_access_codes WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  return json({ success: true });
});

// Guest codes: Validate and use (for security scanning)
route('POST', '/api/guest-codes/validate', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const { qr_token } = await request.json() as { qr_token: string };

  // Decode QR token
  if (!qr_token.startsWith('GAPASS:')) {
    return json({ valid: false, error: 'invalid', message: 'Invalid QR format' });
  }

  let tokenData: any;
  try {
    const base64Data = qr_token.substring(7);
    const decoded = decodeURIComponent(escape(atob(base64Data)));
    tokenData = JSON.parse(decoded);
  } catch (e) {
    return json({ valid: false, error: 'invalid', message: 'Failed to decode QR' });
  }

  const codeId = tokenData.i;
  const now = new Date();

  // Check if code exists in DB
  let code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first() as any;

  // If not in DB, create from token data (for backward compatibility)
  if (!code) {
    // Code was created before DB sync, create it now
    const qrToken = qr_token;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO guest_access_codes (
        id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
        access_type, valid_from, valid_until, max_uses, current_uses, status,
        resident_name, resident_phone, resident_apartment, resident_address
      ) VALUES (?, 'from-token', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)
    `).bind(
      codeId, qrToken,
      tokenData.vt, tokenData.vn || null, tokenData.vp || null, tokenData.vv || null,
      tokenData.at, new Date(tokenData.vf).toISOString(), new Date(tokenData.vu).toISOString(),
      tokenData.mx, tokenData.rn, tokenData.rp, tokenData.ra, tokenData.rd
    ).run();

    code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first();
  }

  if (!code) {
    return json({ valid: false, error: 'invalid', message: 'Code not found' });
  }

  // Check expiry
  if (now > new Date(code.valid_until)) {
    if (code.status === 'active') {
      await env.DB.prepare(`UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    }
    return json({ valid: false, error: 'expired', message: 'Code expired', code });
  }

  // Check status
  if (code.status === 'revoked') {
    return json({ valid: false, error: 'revoked', message: 'Code revoked', code });
  }

  if (code.status === 'used') {
    return json({ valid: false, error: 'already_used', message: 'Code already used', code });
  }

  // Check max uses
  if (code.current_uses >= code.max_uses) {
    await env.DB.prepare(`UPDATE guest_access_codes SET status = 'used', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    return json({ valid: false, error: 'already_used', message: 'Maximum uses reached', code });
  }

  // Valid!
  return json({ valid: true, code });
});

// Guest codes: Use (mark as used after allowing entry)
route('POST', '/api/guest-codes/:id/use', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(params.id).first() as any;
  if (!code) return error('Not found', 404);

  const newUses = (code.current_uses || 0) + 1;
  const newStatus = newUses >= code.max_uses ? 'used' : 'active';

  await env.DB.prepare(`
    UPDATE guest_access_codes
    SET current_uses = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newUses, newStatus, params.id).run();

  // Log the usage
  await env.DB.prepare(`
    INSERT INTO guest_access_logs (id, code_id, scanned_by_id, scanned_by_name, scanned_by_role, action, visitor_type, resident_name, resident_apartment)
    VALUES (?, ?, ?, ?, ?, 'entry_allowed', ?, ?, ?)
  `).bind(
    generateId(), params.id, authUser.id, authUser.name, authUser.role,
    code.visitor_type, code.resident_name, code.resident_apartment
  ).run();

  // Return updated code
  const updated = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(params.id).first();
  return json({ success: true, code: updated });
});

// Guest codes: Get usage logs for a code
route('GET', '/api/guest-codes/:id/logs', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM guest_access_logs WHERE code_id = ? ORDER BY scanned_at DESC
  `).bind(params.id).all();

  return json({ logs: results });
});

// ==================== CHAT ROUTES ====================

// Chat channels: List for user
// Оптимизировано: использует LEFT JOIN вместо множественных subqueries
route('GET', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let query: string;
  let params: any[];

  if (isManagement(user)) {
    // Admins/directors/managers see all channels with unread count
    // Оптимизировано: один JOIN для last_message вместо 4 subqueries
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at,
        lm.sender_id as last_sender_id,
        COALESCE(unread.cnt, 0) as unread_count
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as cnt FROM chat_messages
        WHERE sender_id != ? AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        GROUP BY channel_id
      ) unread ON unread.channel_id = c.id
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 100
    `;
    params = [user.id, user.id];
  } else {
    // Regular users see their channels
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      WHERE c.type = 'uk_general'
        OR c.resident_id = ?
        OR c.building_id = ?
        OR c.id IN (SELECT channel_id FROM chat_participants WHERE user_id = ?)
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 50
    `;
    params = [user.id, user.building_id, user.id];
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ channels: results });
});

// Chat: Get or create private support channel
route('POST', '/api/chat/channels/support', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents can create support channels
  if (user.role !== 'resident') {
    return error('Only residents can create support channels', 403);
  }

  // Check if channel exists
  let channel = await env.DB.prepare(
    'SELECT * FROM chat_channels WHERE type = ? AND resident_id = ?'
  ).bind('private_support', user.id).first();

  if (!channel) {
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO chat_channels (id, type, name, description, resident_id)
      VALUES (?, 'private_support', ?, ?, ?)
    `).bind(id, user.name, user.apartment ? `кв. ${user.apartment}` : 'Личный чат', user.id).run();

    channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  }

  return json(channel);
});

// Chat messages: List for channel
route('GET', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const before = url.searchParams.get('before'); // message ID for pagination

  // Get messages with read_by info - with pagination support
  let query = `
    SELECT m.*, u.name as sender_name, u.role as sender_role,
      (SELECT GROUP_CONCAT(user_id) FROM chat_message_reads WHERE message_id = m.id) as read_by_str
    FROM chat_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.channel_id = ?`;

  const bindParams: any[] = [channelId];

  // If 'before' is provided, get messages before that message ID
  if (before) {
    query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)`;
    bindParams.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT ?`;
  bindParams.push(limit);

  const { results: messages } = await env.DB.prepare(query).bind(...bindParams).all();

  // Reverse to get chronological order (newest last)
  const orderedMessages = (messages || []).reverse();

  // Convert read_by_str to array
  const messagesWithReadBy = orderedMessages.map((m: any) => ({
    ...m,
    read_by: m.read_by_str ? m.read_by_str.split(',') : []
  }));

  // Mark as read (exclude own messages)
  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
  `).bind(user.id, channelId, user.id).run();

  return json({ messages: messagesWithReadBy });
});

// Chat messages: Send
route('POST', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { content } = await request.json() as { content: string };
  if (!content) return error('Content required');

  const id = generateId();
  const channelId = params.id;

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content)
      VALUES (?, ?, ?, ?)
    `).bind(id, channelId, user.id, content).run();
  } catch (e: any) {
    console.error('Failed to insert chat message:', e);
    return error(`Failed to send message: ${e.message || 'Database error'}`, 500);
  }

  const created_at = new Date().toISOString();
  const message = {
    id,
    channel_id: channelId,
    sender_id: user.id,
    sender_name: user.name,
    sender_role: user.role,
    content,
    created_at
  };

  // Send WebSocket notification for real-time chat
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    // Get channel info to determine recipient
    const channel = await env.DB.prepare(
      'SELECT * FROM chat_channels WHERE id = ?'
    ).bind(channelId).first() as any;

    if (channel) {
      // Build channels list for WebSocket routing
      const channels: string[] = [`chat:channel:${channelId}`];

      if (channel.type === 'private_support') {
        // Notify admin/managers and the resident
        channels.push('chat:all'); // admins/managers
        if (channel.resident_id) {
          channels.push(`chat:user:${channel.resident_id}`);
        }

        // Send push notification to recipient (resident or manager)
        // If sender is manager/admin, notify resident
        // If sender is resident, notify managers
        if (['manager', 'admin', 'department_head'].includes(user.role) && channel.resident_id) {
          // UK отвечает жителю
          sendPushNotification(env, channel.resident_id, {
            title: '💬 Ответ от УК',
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
            type: 'chat_message',
            tag: `chat-${channelId}`,
            data: { channelId, url: '/chat' },
            requireInteraction: false
          }).catch(() => {});
        } else if (user.role === 'resident') {
          // Житель пишет в УК - уведомляем менеджеров
          const { results: managers } = await env.DB.prepare(
            `SELECT id FROM users WHERE role IN ('manager', 'admin') AND is_active = 1`
          ).all();

          for (const mgr of (managers || []) as any[]) {
            sendPushNotification(env, mgr.id, {
              title: '💬 Новое сообщение от жителя',
              body: `${user.name}: ${content.length > 80 ? content.substring(0, 80) + '...' : content}`,
              type: 'chat_message',
              tag: `chat-${channelId}`,
              data: { channelId, url: '/chat' },
              requireInteraction: false
            }).catch(() => {});
          }
        }
      } else {
        // Group chat - notify all subscribers via WebSocket
        channels.push('chat:all');

        // Send push notifications to group chat participants (except sender)
        // For building_general, notify residents of that building
        if (channel.type === 'building_general' && channel.building_id) {
          const { results: residents } = await env.DB.prepare(
            `SELECT id FROM users WHERE building_id = ? AND id != ? AND role = 'resident' AND is_active = 1 LIMIT 100`
          ).bind(channel.building_id, user.id).all();

          // Send in batches to avoid blocking
          const BATCH = 10;
          for (let i = 0; i < (residents?.length || 0); i += BATCH) {
            const batch = (residents || []).slice(i, i + BATCH) as any[];
            Promise.all(batch.map(r =>
              sendPushNotification(env, r.id, {
                title: `💬 ${channel.name || 'Чат дома'}`,
                body: `${user.name}: ${content.length > 60 ? content.substring(0, 60) + '...' : content}`,
                type: 'chat_message',
                tag: `chat-group-${channelId}`,
                data: { channelId, url: '/chat' },
                requireInteraction: false
              }).catch(() => {})
            ));
          }
        }
      }

      await connManager.fetch('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'chat_message',
          data: { message },
          channels
        })
      });
    }
  } catch (e) {
    console.error('Failed to send chat WebSocket notification:', e);
  }

  return json({ message }, 201);
});

// Chat: Create channel (general)
route('POST', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { type, name, description, building_id } = body;

  if (!type || !name) {
    return error('Type and name required');
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO chat_channels (id, type, name, description, building_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, type, name, description || null, building_id || null, user.id).run();

  const channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  return json({ channel }, 201);
});

// Chat: Mark channel as read
route('POST', '/api/chat/channels/:id/read', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;

  // Update last_read_at for this user in this channel
  await env.DB.prepare(`
    INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
  `).bind(channelId, user.id).run();

  // Also mark all messages in channel as read
  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
  `).bind(user.id, channelId, user.id).run();

  // Send read receipt via WebSocket
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'chat_read',
        data: {
          channel_id: channelId,
          user_id: user.id,
          user_name: user.name
        },
        channels: [`chat:channel:${channelId}`]
      })
    });
  } catch (e) {
    console.error('Failed to send read receipt:', e);
  }

  return json({ success: true });
});

// Chat: Get unread count for sidebar badge
route('GET', '/api/chat/unread-count', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  let count = 0;

  if (isManagement(user)) {
    // Count unread messages from all private_support channels
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
    `).bind(user.id, user.id).first();
    count = (result as any)?.count || 0;
  } else if (user.role === 'resident') {
    // Count unread messages in resident's support channel
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND c.resident_id = ?
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
    `).bind(user.id, user.id, user.id).first();
    count = (result as any)?.count || 0;
  }

  return json({ unread_count: count });
});

// ==================== ANNOUNCEMENTS ROUTES ====================

// Announcements: List
route('GET', '/api/announcements', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const pagination = getPaginationParams(url);

  let whereClause: string;
  let params: any[] = [];

  if (isManagement(user)) {
    // Admins/directors/managers see all
    whereClause = 'WHERE 1=1';
  } else if (user.role === 'resident') {
    // Residents see announcements targeted to them
    // Logic:
    // 1. Show ALL announcements with target_type = NULL, '', 'all' (universal announcements)
    // 2. Show BRANCH-specific if user's building is in that branch
    // 3. Show BUILDING-specific if user has building_id and it matches
    // 4. Show ENTRANCE-specific if user's building AND entrance match
    // 5. Show FLOOR-specific if user's building, entrance AND floor match
    // 6. Show CUSTOM if user's login is in the list (exact match with delimiters)

    const hasBuilding = user.building_id !== null && user.building_id !== undefined;
    const userEntrance = user.entrance || null;
    const userFloor = user.floor || null;

    // Get user's branch code from their building
    let userBranchCode: string | null = null;
    if (hasBuilding) {
      const buildingInfo = await env.DB.prepare(
        'SELECT branch_code FROM buildings WHERE id = ?'
      ).bind(user.building_id).first() as any;
      userBranchCode = buildingInfo?.branch_code || null;
    }

    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'residents' OR type = 'all')
        AND (
          target_type IS NULL
          OR target_type = ''
          OR target_type = 'all'
          ${userBranchCode ? `OR (target_type = 'branch' AND target_branch = ?)` : ''}
          ${hasBuilding ? `OR (target_type = 'building' AND target_building_id = ?)` : ''}
          ${hasBuilding && userEntrance ? `OR (target_type = 'entrance' AND target_building_id = ? AND target_entrance = ?)` : ''}
          ${hasBuilding && userEntrance && userFloor ? `OR (target_type = 'floor' AND target_building_id = ? AND target_entrance = ? AND target_floor = ?)` : ''}
          OR (target_type = 'custom' AND (',' || target_logins || ',') LIKE ?)
        )
    `;

    params = [];
    if (userBranchCode) params.push(userBranchCode);
    if (hasBuilding) params.push(user.building_id);
    if (hasBuilding && userEntrance) {
      params.push(user.building_id, userEntrance);
    }
    if (hasBuilding && userEntrance && userFloor) {
      params.push(user.building_id, userEntrance, userFloor);
    }
    // Use exact match with delimiters: ,login, to avoid partial matches
    params.push(`%,${user.login || ''},%`);
  } else {
    // Employees (executors, department_heads) see employee announcements
    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'employees' OR type = 'staff' OR type = 'all')
    `;
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM announcements ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data with view counts
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT a.*,
      (SELECT COUNT(*) FROM announcement_views WHERE announcement_id = a.id) as view_count,
      (SELECT name FROM users WHERE id = a.created_by) as author_name
    FROM announcements a
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();

  // For current user, check which announcements they've viewed
  const announcementIds = (results as any[]).map(a => a.id);
  let viewedByUser: Set<string> = new Set();

  if (announcementIds.length > 0) {
    const placeholders = announcementIds.map(() => '?').join(',');
    const { results: views } = await env.DB.prepare(
      `SELECT announcement_id FROM announcement_views WHERE user_id = ? AND announcement_id IN (${placeholders})`
    ).bind(user.id, ...announcementIds).all();
    viewedByUser = new Set((views as any[]).map(v => v.announcement_id));
  }

  // Add viewed_by_user flag to each announcement
  const enrichedResults = (results as any[]).map(a => ({
    ...a,
    viewed_by_user: viewedByUser.has(a.id)
  }));

  const response = createPaginatedResponse(enrichedResults, total || 0, pagination);

  return json({ announcements: response.data, pagination: response.pagination });
});

// Announcements: Create
route('POST', '/api/announcements', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments ? JSON.stringify(body.attachments) : null;

  await env.DB.prepare(`
    INSERT INTO announcements (id, title, content, type, target_type, target_branch, target_building_id, target_logins, priority, expires_at, attachments, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, body.title, body.content, body.type || 'residents',
    body.target_type || 'all', body.target_branch || null, body.target_building_id || null,
    body.target_logins || null, body.priority || 'normal',
    body.expires_at || null, attachments, authUser.id
  ).run();

  // Send push notifications to target users
  const isUrgent = body.priority === 'urgent';
  const icon = isUrgent ? '🚨' : '📢';
  const targetType = body.target_type || 'all';

  // Get target users based on target_type and announcement type
  let targetUsers: any[] = [];

  if (body.type === 'residents' || body.type === 'all') {
    // Build query based on target_type
    let query = "SELECT id FROM users WHERE role = 'resident' AND is_active = 1";
    const params: any[] = [];

    if (targetType === 'branch' && body.target_branch) {
      // Get all buildings in this branch, then get residents in those buildings
      query = `SELECT u.id FROM users u
               INNER JOIN buildings b ON u.building_id = b.id
               WHERE u.role = 'resident' AND u.is_active = 1 AND b.branch_code = ?`;
      params.push(body.target_branch);
    } else if (targetType === 'building' && body.target_building_id) {
      query += ' AND building_id = ?';
      params.push(body.target_building_id);
    } else if (targetType === 'custom' && body.target_logins) {
      // Custom targeting by specific logins
      const logins = body.target_logins.split(',').map((l: string) => l.trim()).filter(Boolean);
      if (logins.length > 0) {
        const placeholders = logins.map(() => '?').join(',');
        query += ` AND login IN (${placeholders})`;
        params.push(...logins);
      }
    }
    // For 'all' - no additional filters

    const { results } = await env.DB.prepare(query).bind(...params).all();
    targetUsers = results as any[];
  }

  if (body.type === 'employees' || body.type === 'staff' || body.type === 'all') {
    // Get active staff members (executors, department_heads)
    const { results } = await env.DB.prepare(
      "SELECT id FROM users WHERE role IN ('executor', 'department_head') AND is_active = 1"
    ).all();
    targetUsers = [...targetUsers, ...(results as any[])];
  }

  // Send push to all target users (in parallel batches for performance)
  const BATCH_SIZE = 10;
  for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
    const batch = targetUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(targetUser =>
      sendPushNotification(env, targetUser.id, {
        title: `${icon} ${body.title}`,
        body: body.content.substring(0, 200) + (body.content.length > 200 ? '...' : ''),
        type: 'announcement',
        tag: `announcement-${id}`,
        data: {
          announcementId: id,
          priority: body.priority,
          targetType: targetType,
          url: '/announcements'
        },
        requireInteraction: isUrgent
      }).catch(err => console.error(`[Push] Failed for user ${targetUser.id}:`, err))
    ));
  }

  console.log(`[Announcement] Created announcement ${id}, sent push to ${targetUsers.length} users`);

  // Create in-app notifications for target users
  const notificationId = generateId();
  const notificationTitle = `${icon} ${body.title}`;
  const notificationBody = body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '');

  for (const targetUser of targetUsers) {
    try {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, data)
        VALUES (?, ?, ?, ?, 'announcement', ?)
      `).bind(
        `${notificationId}-${targetUser.id}`,
        targetUser.id,
        notificationTitle,
        notificationBody,
        JSON.stringify({ announcementId: id, url: '/announcements' })
      ).run();
    } catch (err) {
      console.error(`[Notification] Failed to create for user ${targetUser.id}:`, err);
    }
  }

  // Invalidate cache and broadcast WebSocket update
  invalidateCache('announcements:');

  try {
    const stub = env.CONNECTION_MANAGER.get(env.CONNECTION_MANAGER.idFromName('global'));
    await stub.fetch('https://internal/invalidate-cache', {
      method: 'POST',
      body: JSON.stringify({ prefix: 'announcements:' })
    });
  } catch (err) {
    console.error('[WebSocket] Failed to broadcast announcement update:', err);
  }

  return json({ id }, 201);
});

// Announcements: Update
route('PUT', '/api/announcements/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments !== undefined
    ? (body.attachments ? JSON.stringify(body.attachments) : null)
    : undefined;

  await env.DB.prepare(`
    UPDATE announcements
    SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        priority = COALESCE(?, priority),
        target_type = ?,
        target_building_id = ?,
        target_logins = ?,
        expires_at = ?,
        attachments = COALESCE(?, attachments),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.title || null,
    body.content || null,
    body.type || null,
    body.priority || null,
    body.target_type || 'all',
    body.target_building_id || null,
    body.target_logins || null,
    body.expires_at || null,
    attachments,
    params.id
  ).run();

  invalidateCache('announcements:');
  const updated = await env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(params.id).first();
  return json({ announcement: updated });
});

// Announcements: Delete
route('DELETE', '/api/announcements/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(params.id).run();
  invalidateCache('announcements:');
  return json({ success: true });
});

// Announcements: Mark as viewed
route('POST', '/api/announcements/:id/view', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;

  // Check if already viewed
  const existing = await env.DB.prepare(
    'SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ?'
  ).bind(announcementId, user.id).first();

  if (!existing) {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO announcement_views (id, announcement_id, user_id) VALUES (?, ?, ?)'
    ).bind(id, announcementId, user.id).run();
  }

  return json({ success: true });
});

// Announcements: Get view count and viewers list with statistics
route('GET', '/api/announcements/:id/views', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;

  // Get announcement details for targeting
  const announcement = await env.DB.prepare(
    'SELECT * FROM announcements WHERE id = ?'
  ).bind(announcementId).first() as any;

  if (!announcement) {
    return error('Announcement not found', 404);
  }

  // Get total view count
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM announcement_views WHERE announcement_id = ?'
  ).bind(announcementId).first() as any;

  const viewCount = countResult?.count || 0;

  // Calculate target audience size based on targeting
  let targetAudienceSize = 0;
  let targetAudienceQuery = "SELECT COUNT(*) as count FROM users WHERE role = 'resident'";
  const queryParams: any[] = [];

  if (announcement.target_type === 'building' && announcement.target_building_id) {
    targetAudienceQuery += ' AND building_id = ?';
    queryParams.push(announcement.target_building_id);
  } else if (announcement.target_type === 'custom' && announcement.target_logins) {
    const logins = announcement.target_logins.split(',').filter(Boolean);
    if (logins.length > 0) {
      const placeholders = logins.map(() => '?').join(',');
      targetAudienceQuery += ` AND login IN (${placeholders})`;
      queryParams.push(...logins);
    }
  }
  // For 'all' or no targeting - count all residents

  const audienceResult = await env.DB.prepare(targetAudienceQuery).bind(...queryParams).first() as any;
  targetAudienceSize = audienceResult?.count || 0;

  // Calculate percentage
  const viewPercentage = targetAudienceSize > 0 ? Math.round((viewCount / targetAudienceSize) * 100) : 0;

  // For admin/director/manager - also get list of viewers
  let viewers: any[] = [];
  if (isManagement(user)) {
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.name, u.login, u.apartment, u.address, av.viewed_at
      FROM announcement_views av
      JOIN users u ON av.user_id = u.id
      WHERE av.announcement_id = ?
      ORDER BY av.viewed_at DESC
      LIMIT 100
    `).bind(announcementId).all();
    viewers = results as any[];
  }

  // Check if current user has viewed
  const userViewed = await env.DB.prepare(
    'SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ?'
  ).bind(announcementId, user.id).first();

  return json({
    count: viewCount,
    targetAudienceSize,
    viewPercentage,
    viewers,
    userViewed: !!userViewed
  });
});

// ==================== EXECUTORS/EMPLOYEES ROUTES ====================

// Team: Get all staff (managers, department_heads, executors) - Admin and Director
// Оптимизировано: добавлены LIMIT и кэширование для 5000+ пользователей
route('GET', '/api/team', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get('role'); // 'manager', 'department_head', 'executor'
  const search = url.searchParams.get('search');

  // Build WHERE clause
  let whereClause = "WHERE u.role IN ('manager', 'department_head', 'executor')";
  const params: any[] = [];

  if (roleFilter) {
    whereClause += ' AND u.role = ?';
    params.push(roleFilter);
  }

  if (search && search.length >= 2) {
    whereClause += ' AND (u.name LIKE ? OR u.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Get all staff with stats (limited to 500 max for performance)
  // Include password_plain for admin convenience
  const { results: staff } = await env.DB.prepare(`
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.is_active, u.created_at,
      u.password_plain as password,
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_count, 0) as active_count,
      COALESCE(stats.avg_rating, 0) as avg_rating
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_count,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as avg_rating
      FROM requests
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY
      CASE u.role
        WHEN 'manager' THEN 1
        WHEN 'department_head' THEN 2
        WHEN 'executor' THEN 3
      END,
      u.name
    LIMIT 500
  `).bind(...params).all();

  // Group by role
  const managers = staff.filter((s: any) => s.role === 'manager');
  const departmentHeads = staff.filter((s: any) => s.role === 'department_head');
  const executors = staff.filter((s: any) => s.role === 'executor');

  return json({
    managers,
    departmentHeads,
    executors,
    total: staff.length
  });
});

// Team: Get single staff member by ID (for live data refresh with password)
route('GET', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const staff = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at, password_plain as password
    FROM users
    WHERE id = ? AND role IN ('manager', 'department_head', 'executor', 'director')
  `).bind(params.id).first();

  if (!staff) {
    return error('Staff member not found', 404);
  }

  return json({ user: staff });
});

// Admin: Update any user's password (admin only)
route('POST', '/api/admin/reset-password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can reset passwords', 403);

  const body = await request.json() as any;
  const { login, password } = body;

  if (!login || !password) {
    return error('Login and password are required');
  }

  // Find user by login
  const targetUser = await env.DB.prepare(
    'SELECT id, login, name, role FROM users WHERE login = ?'
  ).bind(login).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  // Hash and update password
  const hashedPassword = await hashPassword(password);
  await env.DB.prepare(`
    UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?
  `).bind(hashedPassword, password, targetUser.id).run();

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Password updated for ${targetUser.name}`,
    user: { login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Team: Update staff member
route('PATCH', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.phone) { updates.push('phone = ?'); values.push(body.phone); }
  if (body.login) { updates.push('login = ?'); values.push(body.login); }
  // Hash password and also store plain version for admin convenience
  if (body.password) {
    const hashedPassword = await hashPassword(body.password);
    updates.push('password_hash = ?');
    values.push(hashedPassword);
    // Store plain password for staff roles (admin convenience)
    updates.push('password_plain = ?');
    values.push(body.password);
  }
  if (body.specialization) { updates.push('specialization = ?'); values.push(body.specialization); }
  if (body.status) { updates.push('status = ?'); values.push(body.status); }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  values.push(params.id);

  await env.DB.prepare(`
    UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?
  `).bind(...values).run();

  // Инвалидируем кэш
  await invalidateOnChange('users', env.RATE_LIMITER);

  const updated = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at, password_plain as password FROM users WHERE id = ?
  `).bind(params.id).first();

  return json({ user: updated });
});

// Team: Delete staff member
route('DELETE', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  // Check if user exists and is a staff member
  const targetUser = await env.DB.prepare(
    'SELECT id, role FROM users WHERE id = ?'
  ).bind(params.id).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  // Only allow deleting staff members (not residents, admins)
  const staffRoles = ['manager', 'department_head', 'executor'];
  if (!staffRoles.includes(targetUser.role)) {
    return error('Can only delete staff members', 400);
  }

  // SECURITY: Directors cannot delete managers
  if (user.role === 'director' && targetUser.role === 'manager') {
    return error('Directors cannot delete managers', 403);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(params.id).run();

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({ success: true });
});

// Team: Reset passwords for all staff members without password_plain
// This is a one-time admin operation to fix existing staff without visible passwords
route('POST', '/api/team/reset-all-passwords', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can perform this operation', 403);

  // Find all staff members without password_plain
  const staffRoles = ['manager', 'department_head', 'executor'];
  const { results: staffWithoutPassword } = await env.DB.prepare(`
    SELECT id, login, name, role FROM users
    WHERE role IN (?, ?, ?)
    AND (password_plain IS NULL OR password_plain = '')
  `).bind(...staffRoles).all();

  if (!staffWithoutPassword || staffWithoutPassword.length === 0) {
    return json({ message: 'All staff members already have passwords set', updated: 0 });
  }

  // Generate and set passwords for each staff member
  const results: { id: string; login: string; name: string; password: string }[] = [];

  for (const staff of staffWithoutPassword as any[]) {
    // Generate a password based on login + role first letter + random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newPassword = `${staff.login}${staff.role.charAt(0)}${randomSuffix}`;

    // Hash and store password
    const hashedPassword = await hashPassword(newPassword);

    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?
    `).bind(hashedPassword, newPassword, staff.id).run();

    results.push({
      id: staff.id,
      login: staff.login,
      name: staff.name,
      password: newPassword
    });
  }

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    message: `Updated ${results.length} staff members with new passwords`,
    updated: results.length,
    staff: results
  });
});

// Executors: List all (protected with role-based filtering)
route('GET', '/api/executors', async (request, env) => {
  // SECURITY: Require authentication
  const user = await getUser(request, env);
  if (!user) {
    return error('Unauthorized - login required', 401);
  }

  // SECURITY: Allow staff roles and residents (for rating executors) to see executors
  const allowedRoles = ['admin', 'director', 'manager', 'department_head', 'executor', 'resident'];
  if (!allowedRoles.includes(user.role)) {
    return error('Access denied', 403);
  }

  // Check if requesting all executors (for colleagues page)
  const url = new URL(request.url);
  const showAll = url.searchParams.get('all') === 'true';
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toLowerCase();

  // Build WHERE clause (use u. alias for users table in JOIN query)
  let whereClause = `WHERE u.role = 'executor'`;
  const bindValues: any[] = [];

  // SECURITY: Department heads only see executors in their department (specialization)
  // Unless they request all (for colleagues page)
  if (user.role === 'department_head' && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  // Executors only see colleagues in their department
  // Unless they request all (for colleagues page)
  if (user.role === 'executor' && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  // Search filter
  if (search) {
    whereClause += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.phone) LIKE ? OR LOWER(u.specialization) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern, searchPattern);
  }

  // Count total for pagination (use alias u to match whereClause)
  const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  // Paginated data query
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);

  // Include password for admin/manager/director roles only
  const includePassword = ['admin', 'director', 'manager'].includes(user.role);

  // Query with statistics from requests table
  const dataQuery = `
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.is_active, u.created_at${includePassword ? ', u.password_plain as password' : ''},
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_requests, 0) as active_requests,
      COALESCE(stats.rating, 5.0) as rating,
      COALESCE(stats.avg_completion_time, 0) as avg_completion_time,
      0 as total_earnings
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_requests,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as rating,
        ROUND(AVG(CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60
          ELSE NULL END), 0) as avg_completion_time
      FROM requests
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY u.name
    LIMIT ? OFFSET ?
  `;

  const dataStmt = env.DB.prepare(dataQuery);
  const { results } = bindValues.length > 0
    ? await dataStmt.bind(...bindValues, pagination.limit, offset).all()
    : await dataStmt.bind(pagination.limit, offset).all();

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ executors: response.data, pagination: response.pagination });
});

// Executors: Get single executor by ID (for live data refresh)
route('GET', '/api/executors/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Allow staff roles to view executor details
  const allowedRoles = ['admin', 'director', 'manager', 'department_head'];
  if (!allowedRoles.includes(user.role)) {
    return error('Access denied', 403);
  }

  // Include password for admin/manager/director roles only
  const includePassword = ['admin', 'director', 'manager'].includes(user.role);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at${includePassword ? ', password_plain as password' : ''}
    FROM users
    WHERE id = ? AND role IN ('executor', 'department_head')
  `).bind(params.id).first();

  if (!executor) {
    return error('Executor not found', 404);
  }

  return json({ executor });
});

// Executors: Update status (available/busy/offline)
route('PATCH', '/api/executors/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only executor themselves or admin/manager can update status
  if (user.id !== params.id && !['admin', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const status = body.status;

  if (!['available', 'busy', 'offline'].includes(status)) {
    return error('Invalid status. Must be: available, busy, or offline');
  }

  await env.DB.prepare(`
    UPDATE users SET status = ? WHERE id = ? AND role = 'executor'
  `).bind(status, params.id).run();

  // Инвалидируем кэш исполнителей
  await invalidateOnChange('users', env.RATE_LIMITER);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status FROM users WHERE id = ?
  `).bind(params.id).first();

  return json({ executor });
});

// Executors: Get stats for specific executor
route('GET', '/api/executors/:id/stats', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Get executor info
  const executor = await env.DB.prepare(`
    SELECT id, name, specialization, status FROM users WHERE id = ? AND role = 'executor'
  `).bind(params.id).first();

  if (!executor) return error('Executor not found', 404);

  // Calculate stats from requests table
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Total completed
  const totalCompleted = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM requests
    WHERE executor_id = ? AND status IN ('completed', 'closed')
  `).bind(params.id).first() as { count: number };

  // This week completed
  const weekCompleted = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM requests
    WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ?
  `).bind(params.id, weekAgo).first() as { count: number };

  // This month completed
  const monthCompleted = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM requests
    WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ?
  `).bind(params.id, monthAgo).first() as { count: number };

  // Average rating from requests
  const avgRating = await env.DB.prepare(`
    SELECT AVG(rating) as avg FROM requests
    WHERE executor_id = ? AND rating IS NOT NULL
  `).bind(params.id).first() as { avg: number | null };

  // Average completion time (in minutes) - calculate from started_at to completed_at
  const avgTime = await env.DB.prepare(`
    SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_minutes
    FROM requests
    WHERE executor_id = ? AND started_at IS NOT NULL AND completed_at IS NOT NULL
  `).bind(params.id).first() as { avg_minutes: number | null };

  // Count requests by status for this executor
  const statusCounts = await env.DB.prepare(`
    SELECT status, COUNT(*) as count FROM requests
    WHERE executor_id = ?
    GROUP BY status
  `).bind(params.id).all();

  return json({
    stats: {
      totalCompleted: totalCompleted?.count || 0,
      thisWeek: weekCompleted?.count || 0,
      thisMonth: monthCompleted?.count || 0,
      rating: avgRating?.avg ? Math.round(avgRating.avg * 10) / 10 : 5.0,
      avgCompletionTime: avgTime?.avg_minutes ? Math.round(avgTime.avg_minutes) : 0,
      statusBreakdown: statusCounts.results || []
    }
  });
});

// ==================== BRANCHES ROUTES ====================

// Branches: List all
route('GET', '/api/branches', async (request, env) => {
  const { results } = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident') as residents_count
    FROM branches b
    ORDER BY b.name
  `).all();

  return json({ branches: results });
});

// Branches: Get single
route('GET', '/api/branches/:id', async (request, env, params) => {
  const branch = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident') as residents_count
    FROM branches b
    WHERE b.id = ?
  `).bind(params.id).first();

  if (!branch) return error('Branch not found', 404);
  return json({ branch });
});

// Branches: Create
route('POST', '/api/branches', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const { code, name, address, phone } = body;

  if (!code || !name) {
    return error('Code and name are required', 400);
  }

  // Check if code is unique
  const existing = await env.DB.prepare(
    'SELECT id FROM branches WHERE code = ?'
  ).bind(code.toUpperCase()).first();

  if (existing) {
    return error('Branch with this code already exists', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO branches (id, code, name, address, phone)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, code.toUpperCase(), name, address || null, phone || null).run();

  const branch = await env.DB.prepare('SELECT * FROM branches WHERE id = ?').bind(id).first();
  return json({ branch }, 201);
});

// Branches: Update
route('PATCH', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    values.push(body.name);
  }
  if (body.address !== undefined) {
    updates.push('address = ?');
    values.push(body.address);
  }
  if (body.phone !== undefined) {
    updates.push('phone = ?');
    values.push(body.phone);
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return error('No fields to update', 400);
  }

  values.push(params.id);
  await env.DB.prepare(`
    UPDATE branches SET ${updates.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const branch = await env.DB.prepare('SELECT * FROM branches WHERE id = ?').bind(params.id).first();
  return json({ branch });
});

// Branches: Delete
route('DELETE', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  // Check if branch has buildings
  const buildingsCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM buildings WHERE branch_id = ?'
  ).bind(params.id).first() as any;

  if (buildingsCount?.count > 0) {
    return error('Cannot delete branch with buildings. Remove buildings first.', 400);
  }

  await env.DB.prepare('DELETE FROM branches WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== BUILDINGS ROUTES (CRM) ====================

// Buildings: List all with stats (supports branch_id filter + pagination)
route('GET', '/api/buildings', async (request, env) => {
  const url = new URL(request.url);
  const branchCode = url.searchParams.get('branch_code');
  const search = url.searchParams.get('search')?.toLowerCase();
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const bindValues: any[] = [];

  if (branchCode) {
    whereClause += ` AND b.branch_code = ?`;
    bindValues.push(branchCode);
  }

  if (search) {
    whereClause += ` AND (LOWER(b.name) LIKE ? OR LOWER(b.address) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM buildings b ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  // Paginated data query
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT b.*,
      br.code as branch_code_from_branch,
      br.name as branch_name,
      (SELECT COUNT(*) FROM users WHERE building_id = b.id AND role = 'resident') as residents_count,
      (SELECT COUNT(*) FROM entrances WHERE building_id = b.id) as entrances_actual,
      (SELECT COUNT(*) FROM apartments WHERE building_id = b.id) as apartments_actual,
      (SELECT COUNT(*) FROM requests WHERE resident_id IN (SELECT id FROM users WHERE building_id = b.id) AND status NOT IN ('completed', 'cancelled', 'closed')) as active_requests_count
    FROM buildings b
    LEFT JOIN branches br ON b.branch_code = br.code
    ${whereClause}
    ORDER BY b.name
    LIMIT ? OFFSET ?
  `;

  const dataStmt = env.DB.prepare(dataQuery);
  const { results } = bindValues.length > 0
    ? await dataStmt.bind(...bindValues, pagination.limit, offset).all()
    : await dataStmt.bind(pagination.limit, offset).all();

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ buildings: response.data, pagination: response.pagination });
});

// Buildings: Get single with full details
route('GET', '/api/buildings/:id', async (request, env, params) => {
  // Кэшируем данные здания на 5 минут (включает динамические счетчики)
  const data = await cachedQueryWithArgs(
    CachePrefix.BUILDING,
    CacheTTL.BUILDING_STATS,
    [params.id],
    async (buildingId: string) => {
      const building = await env.DB.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM users WHERE building_id = b.id AND role = 'resident') as residents_count,
          (SELECT COUNT(*) FROM entrances WHERE building_id = b.id) as entrances_actual,
          (SELECT COUNT(*) FROM apartments WHERE building_id = b.id) as apartments_actual,
          (SELECT COUNT(*) FROM requests WHERE resident_id IN (SELECT id FROM users WHERE building_id = b.id) AND status NOT IN ('completed', 'cancelled', 'closed')) as active_requests_count
        FROM buildings b
        WHERE b.id = ?
      `).bind(buildingId).first();

      if (!building) return null;

      // Get entrances
      const { results: entrances } = await env.DB.prepare(
        'SELECT * FROM entrances WHERE building_id = ? ORDER BY number'
      ).bind(buildingId).all();

      // Get documents
      const { results: documents } = await env.DB.prepare(
        'SELECT * FROM building_documents WHERE building_id = ? AND is_active = 1 ORDER BY uploaded_at DESC'
      ).bind(buildingId).all();

      return { building, entrances, documents };
    },
    env.RATE_LIMITER
  );

  if (!data || !data.building) return error('Building not found', 404);

  return json(data);
});

// Buildings: Create (full)
route('POST', '/api/buildings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO buildings (
      id, name, address, zone, cadastral_number, branch_code, building_number, branch_id,
      floors, entrances_count, apartments_count, total_area, living_area, common_area, land_area,
      year_built, year_renovated, building_type, roof_type, wall_material, foundation_type,
      has_elevator, elevator_count, has_gas, heating_type, has_hot_water, water_supply_type, sewerage_type,
      has_intercom, has_video_surveillance, has_concierge, has_parking_lot, parking_spaces, has_playground,
      manager_id, manager_name, management_start_date, contract_number, contract_end_date,
      monthly_budget, reserve_fund, total_debt, collection_rate,
      latitude, longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.address,
    body.zone || null,
    body.cadastral_number || body.cadastralNumber || null,
    body.branch_code || body.branchCode || 'YS',
    body.building_number || body.buildingNumber || null,
    body.branch_id || body.branchId || null,
    body.floors || null,
    body.entrances_count || body.entrances || 1,
    body.apartments_count || body.totalApartments || null,
    body.total_area || body.totalArea || null,
    body.living_area || body.livingArea || null,
    body.common_area || body.commonArea || null,
    body.land_area || body.landArea || null,
    body.year_built || body.yearBuilt || null,
    body.year_renovated || body.yearRenovated || null,
    body.building_type || body.buildingType || 'monolith',
    body.roof_type || body.roofType || 'flat',
    body.wall_material || body.wallMaterial || null,
    body.foundation_type || body.foundationType || null,
    body.has_elevator || body.hasElevator ? 1 : 0,
    body.elevator_count || body.elevatorCount || 0,
    body.has_gas || body.hasGas ? 1 : 0,
    body.heating_type || body.heatingType || 'central',
    body.has_hot_water || body.hasHotWater ? 1 : 0,
    body.water_supply_type || body.waterSupplyType || 'central',
    body.sewerage_type || body.sewerageType || 'central',
    body.has_intercom || body.hasIntercom ? 1 : 0,
    body.has_video_surveillance || body.hasVideoSurveillance ? 1 : 0,
    body.has_concierge || body.hasConcierge ? 1 : 0,
    body.has_parking_lot || body.hasParkingLot ? 1 : 0,
    body.parking_spaces || body.parkingSpaces || 0,
    body.has_playground || body.hasPlayground ? 1 : 0,
    body.manager_id || body.managerId || null,
    body.manager_name || body.managerName || null,
    body.management_start_date || body.managementStartDate || null,
    body.contract_number || body.contractNumber || null,
    body.contract_end_date || body.contractEndDate || null,
    body.monthly_budget || body.monthlyBudget || 0,
    body.reserve_fund || body.reserveFund || 0,
    body.total_debt || body.totalDebt || 0,
    body.collection_rate || body.collectionRate || 0,
    body.latitude || null,
    body.longitude || null
  ).run();

  // Инвалидируем кэш зданий
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  const created = await env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(id).first();
  return json({ building: created }, 201);
});

// Buildings: Update
route('PATCH', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  // Map all possible fields (support both snake_case and camelCase)
  const fieldMappings: Record<string, string> = {
    name: 'name', address: 'address', zone: 'zone',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    branch_code: 'branch_code', branchCode: 'branch_code',
    building_number: 'building_number', buildingNumber: 'building_number',
    floors: 'floors', entrances_count: 'entrances_count', entrances: 'entrances_count',
    apartments_count: 'apartments_count', totalApartments: 'apartments_count',
    total_area: 'total_area', totalArea: 'total_area',
    living_area: 'living_area', livingArea: 'living_area',
    common_area: 'common_area', commonArea: 'common_area',
    land_area: 'land_area', landArea: 'land_area',
    year_built: 'year_built', yearBuilt: 'year_built',
    year_renovated: 'year_renovated', yearRenovated: 'year_renovated',
    building_type: 'building_type', buildingType: 'building_type',
    roof_type: 'roof_type', roofType: 'roof_type',
    wall_material: 'wall_material', wallMaterial: 'wall_material',
    foundation_type: 'foundation_type', foundationType: 'foundation_type',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_count: 'elevator_count', elevatorCount: 'elevator_count',
    has_gas: 'has_gas', hasGas: 'has_gas',
    heating_type: 'heating_type', heatingType: 'heating_type',
    has_hot_water: 'has_hot_water', hasHotWater: 'has_hot_water',
    water_supply_type: 'water_supply_type', waterSupplyType: 'water_supply_type',
    sewerage_type: 'sewerage_type', sewerageType: 'sewerage_type',
    has_intercom: 'has_intercom', hasIntercom: 'has_intercom',
    has_video_surveillance: 'has_video_surveillance', hasVideoSurveillance: 'has_video_surveillance',
    has_concierge: 'has_concierge', hasConcierge: 'has_concierge',
    has_parking_lot: 'has_parking_lot', hasParkingLot: 'has_parking_lot',
    parking_spaces: 'parking_spaces', parkingSpaces: 'parking_spaces',
    has_playground: 'has_playground', hasPlayground: 'has_playground',
    manager_id: 'manager_id', managerId: 'manager_id',
    manager_name: 'manager_name', managerName: 'manager_name',
    management_start_date: 'management_start_date', managementStartDate: 'management_start_date',
    contract_number: 'contract_number', contractNumber: 'contract_number',
    contract_end_date: 'contract_end_date', contractEndDate: 'contract_end_date',
    monthly_budget: 'monthly_budget', monthlyBudget: 'monthly_budget',
    reserve_fund: 'reserve_fund', reserveFund: 'reserve_fund',
    total_debt: 'total_debt', totalDebt: 'total_debt',
    collection_rate: 'collection_rate', collectionRate: 'collection_rate',
    latitude: 'latitude', longitude: 'longitude',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      // Convert boolean to integer for SQLite
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE buildings SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Инвалидируем кэш зданий
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  const updated = await env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(params.id).first();
  return json({ building: updated });
});

// Buildings: Delete
route('DELETE', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const buildingId = params.id;

  // First, unlink users from this building (set building_id to NULL)
  await env.DB.prepare('UPDATE users SET building_id = NULL WHERE building_id = ?').bind(buildingId).run();

  // Unlink announcements
  await env.DB.prepare('UPDATE announcements SET target_building_id = NULL WHERE target_building_id = ?').bind(buildingId).run();

  // Delete chat channels for this building
  await env.DB.prepare('DELETE FROM chat_channels WHERE building_id = ?').bind(buildingId).run();

  // Delete executor zones
  await env.DB.prepare('DELETE FROM executor_zones WHERE building_id = ?').bind(buildingId).run();

  // Delete meeting voting units
  await env.DB.prepare('DELETE FROM meeting_voting_units WHERE building_id = ?').bind(buildingId).run();

  // Delete meeting building settings
  await env.DB.prepare('DELETE FROM meeting_building_settings WHERE building_id = ?').bind(buildingId).run();

  // Now delete the building - cascades will handle entrances, documents, apartments, meetings, etc.
  await env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(buildingId).run();

  // Invalidate cache
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  return json({ success: true });
});

// ==================== ENTRANCES ROUTES (CRM) ====================

// Entrances: List by building
route('GET', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const { results } = await env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM apartments WHERE building_id = e.building_id AND entrance_id = e.id) as apartments_count
    FROM entrances e
    WHERE e.building_id = ?
    ORDER BY e.number
  `).bind(params.buildingId).all();
  return json({ entrances: results });
});

// Entrances: Create
route('POST', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO entrances (
      id, building_id, number, floors_from, floors_to, apartments_from, apartments_to,
      has_elevator, elevator_id, intercom_type, intercom_code, cleaning_schedule, responsible_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.buildingId,
    body.number,
    body.floors_from || body.floorsFrom || 1,
    body.floors_to || body.floorsTo || null,
    body.apartments_from || body.apartmentsFrom || null,
    body.apartments_to || body.apartmentsTo || null,
    body.has_elevator || body.hasElevator ? 1 : 0,
    body.elevator_id || body.elevatorId || null,
    body.intercom_type || body.intercomType || null,
    body.intercom_code || body.intercomCode || null,
    body.cleaning_schedule || body.cleaningSchedule || null,
    body.responsible_id || body.responsibleId || null,
    body.notes || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(id).first();
  return json({ entrance: created }, 201);
});

// Entrances: Update
route('PATCH', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    number: 'number',
    floors_from: 'floors_from', floorsFrom: 'floors_from',
    floors_to: 'floors_to', floorsTo: 'floors_to',
    apartments_from: 'apartments_from', apartmentsFrom: 'apartments_from',
    apartments_to: 'apartments_to', apartmentsTo: 'apartments_to',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_id: 'elevator_id', elevatorId: 'elevator_id',
    intercom_type: 'intercom_type', intercomType: 'intercom_type',
    intercom_code: 'intercom_code', intercomCode: 'intercom_code',
    cleaning_schedule: 'cleaning_schedule', cleaningSchedule: 'cleaning_schedule',
    responsible_id: 'responsible_id', responsibleId: 'responsible_id',
    last_inspection: 'last_inspection', lastInspection: 'last_inspection',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE entrances SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(params.id).first();
  return json({ entrance: updated });
});

// Entrances: Delete
route('DELETE', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM entrances WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== BUILDING DOCUMENTS ROUTES ====================

// Building Documents: List
route('GET', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const { results } = await env.DB.prepare(
    'SELECT * FROM building_documents WHERE building_id = ? ORDER BY uploaded_at DESC'
  ).bind(params.buildingId).all();
  return json({ documents: results });
});

// Building Documents: Create
route('POST', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO building_documents (id, building_id, name, type, file_url, file_size, uploaded_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.buildingId,
    body.name,
    body.type || 'other',
    body.file_url || body.fileUrl,
    body.file_size || body.fileSize || 0,
    authUser.id,
    body.expires_at || body.expiresAt || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM building_documents WHERE id = ?').bind(id).first();
  return json({ document: created }, 201);
});

// Building Documents: Delete
route('DELETE', '/api/building-documents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM building_documents WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== APARTMENTS ROUTES (CRM) ====================

// Apartments: List by building
route('GET', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const url = new URL(request.url);
  const entranceId = url.searchParams.get('entrance_id');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = (page - 1) * limit;

  let query = `
    SELECT a.*,
      o.full_name as owner_name,
      o.phone as owner_phone,
      pa.number as account_number,
      pa.current_debt,
      pa.balance
    FROM apartments a
    LEFT JOIN owners o ON a.primary_owner_id = o.id
    LEFT JOIN personal_accounts pa ON a.personal_account_id = pa.id
    WHERE a.building_id = ?
  `;
  const bindings: any[] = [params.buildingId];

  if (entranceId) {
    query += ' AND a.entrance_id = ?';
    bindings.push(entranceId);
  }
  if (status) {
    query += ' AND a.status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY CAST(a.number AS INTEGER), a.number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM apartments WHERE building_id = ?';
  const countBindings: any[] = [params.buildingId];
  if (entranceId) {
    countQuery += ' AND entrance_id = ?';
    countBindings.push(entranceId);
  }
  if (status) {
    countQuery += ' AND status = ?';
    countBindings.push(status);
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    apartments: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Apartments: Get single with details
route('GET', '/api/apartments/:id', async (request, env, params) => {
  const apartment = await env.DB.prepare(`
    SELECT a.*,
      b.name as building_name,
      b.address as building_address,
      e.number as entrance_number
    FROM apartments a
    LEFT JOIN buildings b ON a.building_id = b.id
    LEFT JOIN entrances e ON a.entrance_id = e.id
    WHERE a.id = ?
  `).bind(params.id).first();

  if (!apartment) return error('Apartment not found', 404);

  // Get owners
  const { results: owners } = await env.DB.prepare(`
    SELECT o.*, oa.ownership_share, oa.is_primary, oa.start_date
    FROM owners o
    JOIN owner_apartments oa ON o.id = oa.owner_id
    WHERE oa.apartment_id = ?
    ORDER BY oa.is_primary DESC
  `).bind(params.id).all();

  // Get personal account
  const account = await env.DB.prepare(
    'SELECT * FROM personal_accounts WHERE apartment_id = ?'
  ).bind(params.id).first();

  return json({ apartment, owners, personalAccount: account });
});

// Apartments: Create
route('POST', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO apartments (
      id, building_id, entrance_id, number, floor,
      total_area, living_area, kitchen_area, balcony_area, rooms,
      has_balcony, has_loggia, ceiling_height, window_view,
      ownership_type, ownership_share, cadastral_number,
      status, is_commercial, primary_owner_id, personal_account_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.buildingId,
    body.entrance_id || body.entranceId || null,
    body.number,
    body.floor || null,
    body.total_area || body.totalArea || null,
    body.living_area || body.livingArea || null,
    body.kitchen_area || body.kitchenArea || null,
    body.balcony_area || body.balconyArea || null,
    body.rooms || null,
    body.has_balcony || body.hasBalcony ? 1 : 0,
    body.has_loggia || body.hasLoggia ? 1 : 0,
    body.ceiling_height || body.ceilingHeight || null,
    body.window_view || body.windowView || null,
    body.ownership_type || body.ownershipType || 'private',
    body.ownership_share || body.ownershipShare || 1.0,
    body.cadastral_number || body.cadastralNumber || null,
    body.status || 'occupied',
    body.is_commercial || body.isCommercial ? 1 : 0,
    body.primary_owner_id || body.primaryOwnerId || null,
    body.personal_account_id || body.personalAccountId || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM apartments WHERE id = ?').bind(id).first();
  return json({ apartment: created }, 201);
});

// Apartments: Update
route('PATCH', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    entrance_id: 'entrance_id', entranceId: 'entrance_id',
    number: 'number', floor: 'floor',
    total_area: 'total_area', totalArea: 'total_area',
    living_area: 'living_area', livingArea: 'living_area',
    kitchen_area: 'kitchen_area', kitchenArea: 'kitchen_area',
    balcony_area: 'balcony_area', balconyArea: 'balcony_area',
    rooms: 'rooms',
    has_balcony: 'has_balcony', hasBalcony: 'has_balcony',
    has_loggia: 'has_loggia', hasLoggia: 'has_loggia',
    ceiling_height: 'ceiling_height', ceilingHeight: 'ceiling_height',
    window_view: 'window_view', windowView: 'window_view',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    status: 'status',
    is_commercial: 'is_commercial', isCommercial: 'is_commercial',
    primary_owner_id: 'primary_owner_id', primaryOwnerId: 'primary_owner_id',
    personal_account_id: 'personal_account_id', personalAccountId: 'personal_account_id',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE apartments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM apartments WHERE id = ?').bind(params.id).first();
  return json({ apartment: updated });
});

// Apartments: Delete
route('DELETE', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM apartments WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== OWNERS ROUTES (CRM) ====================

// Owners: List all
route('GET', '/api/owners', async (request, env) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM owners WHERE 1=1';
  const bindings: any[] = [];

  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (search) {
    query += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY full_name LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  // Get total
  let countQuery = 'SELECT COUNT(*) as total FROM owners WHERE 1=1';
  const countBindings: any[] = [];
  if (type) {
    countQuery += ' AND type = ?';
    countBindings.push(type);
  }
  if (search) {
    countQuery += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern);
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    owners: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Owners: Get single with apartments
route('GET', '/api/owners/:id', async (request, env, params) => {
  const owner = await env.DB.prepare('SELECT * FROM owners WHERE id = ?').bind(params.id).first();
  if (!owner) return error('Owner not found', 404);

  // Get apartments
  const { results: apartments } = await env.DB.prepare(`
    SELECT a.*, oa.ownership_share, oa.is_primary,
      b.name as building_name, b.address as building_address
    FROM apartments a
    JOIN owner_apartments oa ON a.id = oa.apartment_id
    JOIN buildings b ON a.building_id = b.id
    WHERE oa.owner_id = ?
  `).bind(params.id).all();

  return json({ owner, apartments });
});

// Owners: Create
route('POST', '/api/owners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Build full name if not provided
  let fullName = body.full_name || body.fullName;
  if (!fullName && body.type !== 'legal_entity') {
    fullName = [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName]
      .filter(Boolean).join(' ');
  }

  await env.DB.prepare(`
    INSERT INTO owners (
      id, type, last_name, first_name, middle_name, full_name,
      company_name, inn, ogrn, legal_address,
      phone, email, preferred_contact,
      passport_series, passport_number, passport_issued_by, passport_issued_date, registration_address,
      ownership_type, ownership_share, ownership_start_date,
      ownership_document, ownership_document_number, ownership_document_date,
      is_active, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.type || 'individual',
    body.last_name || body.lastName || null,
    body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null,
    fullName,
    body.company_name || body.companyName || null,
    body.inn || null,
    body.ogrn || null,
    body.legal_address || body.legalAddress || null,
    body.phone || null,
    body.email || null,
    body.preferred_contact || body.preferredContact || 'phone',
    body.passport_series || body.passportSeries || null,
    body.passport_number || body.passportNumber || null,
    body.passport_issued_by || body.passportIssuedBy || null,
    body.passport_issued_date || body.passportIssuedDate || null,
    body.registration_address || body.registrationAddress || null,
    body.ownership_type || body.ownershipType || 'owner',
    body.ownership_share || body.ownershipShare || 100,
    body.ownership_start_date || body.ownershipStartDate || null,
    body.ownership_document || body.ownershipDocument || null,
    body.ownership_document_number || body.ownershipDocumentNumber || null,
    body.ownership_document_date || body.ownershipDocumentDate || null,
    body.is_active !== false ? 1 : 0,
    body.notes || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM owners WHERE id = ?').bind(id).first();
  return json({ owner: created }, 201);
});

// Owners: Update
route('PATCH', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    type: 'type',
    last_name: 'last_name', lastName: 'last_name',
    first_name: 'first_name', firstName: 'first_name',
    middle_name: 'middle_name', middleName: 'middle_name',
    full_name: 'full_name', fullName: 'full_name',
    company_name: 'company_name', companyName: 'company_name',
    inn: 'inn', ogrn: 'ogrn',
    legal_address: 'legal_address', legalAddress: 'legal_address',
    phone: 'phone', email: 'email',
    preferred_contact: 'preferred_contact', preferredContact: 'preferred_contact',
    passport_series: 'passport_series', passportSeries: 'passport_series',
    passport_number: 'passport_number', passportNumber: 'passport_number',
    passport_issued_by: 'passport_issued_by', passportIssuedBy: 'passport_issued_by',
    passport_issued_date: 'passport_issued_date', passportIssuedDate: 'passport_issued_date',
    registration_address: 'registration_address', registrationAddress: 'registration_address',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    ownership_start_date: 'ownership_start_date', ownershipStartDate: 'ownership_start_date',
    ownership_document: 'ownership_document', ownershipDocument: 'ownership_document',
    ownership_document_number: 'ownership_document_number', ownershipDocumentNumber: 'ownership_document_number',
    ownership_document_date: 'ownership_document_date', ownershipDocumentDate: 'ownership_document_date',
    is_active: 'is_active', isActive: 'is_active',
    is_verified: 'is_verified', isVerified: 'is_verified',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE owners SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM owners WHERE id = ?').bind(params.id).first();
  return json({ owner: updated });
});

// Owners: Delete
route('DELETE', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM owners WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// Owner-Apartment: Link owner to apartment
route('POST', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO owner_apartments (owner_id, apartment_id, ownership_share, is_primary, start_date)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    params.ownerId,
    params.apartmentId,
    body.ownership_share || body.ownershipShare || 100,
    body.is_primary || body.isPrimary ? 1 : 0,
    body.start_date || body.startDate || new Date().toISOString().split('T')[0]
  ).run();

  // Update apartment's primary owner if this is primary
  if (body.is_primary || body.isPrimary) {
    await env.DB.prepare('UPDATE apartments SET primary_owner_id = ? WHERE id = ?')
      .bind(params.ownerId, params.apartmentId).run();
  }

  return json({ success: true }, 201);
});

// Owner-Apartment: Unlink
route('DELETE', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM owner_apartments WHERE owner_id = ? AND apartment_id = ?')
    .bind(params.ownerId, params.apartmentId).run();

  // Clear primary owner if needed
  await env.DB.prepare('UPDATE apartments SET primary_owner_id = NULL WHERE id = ? AND primary_owner_id = ?')
    .bind(params.apartmentId, params.ownerId).run();

  return json({ success: true });
});

// ==================== PERSONAL ACCOUNTS ROUTES (CRM) ====================

// Personal Accounts: List by building
route('GET', '/api/buildings/:buildingId/accounts', async (request, env, params) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const hasDebt = url.searchParams.get('has_debt');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM personal_accounts WHERE building_id = ?';
  const bindings: any[] = [params.buildingId];

  if (status) {
    query += ' AND status = ?';
    bindings.push(status);
  }
  if (hasDebt === 'true') {
    query += ' AND current_debt > 0';
  }

  query += ' ORDER BY apartment_number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  let countQuery = 'SELECT COUNT(*) as total FROM personal_accounts WHERE building_id = ?';
  const countBindings: any[] = [params.buildingId];
  if (status) {
    countQuery += ' AND status = ?';
    countBindings.push(status);
  }
  if (hasDebt === 'true') {
    countQuery += ' AND current_debt > 0';
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    accounts: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Personal Accounts: Get single
route('GET', '/api/accounts/:id', async (request, env, params) => {
  const account = await env.DB.prepare(`
    SELECT pa.*,
      a.number as apt_number, a.floor, a.rooms,
      b.name as building_name, b.address as building_address
    FROM personal_accounts pa
    LEFT JOIN apartments a ON pa.apartment_id = a.id
    LEFT JOIN buildings b ON pa.building_id = b.id
    WHERE pa.id = ?
  `).bind(params.id).first();

  if (!account) return error('Account not found', 404);

  return json({ account });
});

// Personal Accounts: Create
route('POST', '/api/accounts', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Generate account number if not provided
  const accountNumber = body.number || `ЛС-${Date.now().toString(36).toUpperCase()}`;

  await env.DB.prepare(`
    INSERT INTO personal_accounts (
      id, number, apartment_id, building_id, primary_owner_id,
      owner_name, apartment_number, address, total_area,
      residents_count, registered_count,
      balance, current_debt, penalty_amount,
      has_subsidy, subsidy_amount, subsidy_end_date,
      has_discount, discount_percent, discount_reason,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    accountNumber,
    body.apartment_id || body.apartmentId,
    body.building_id || body.buildingId,
    body.primary_owner_id || body.primaryOwnerId || null,
    body.owner_name || body.ownerName || null,
    body.apartment_number || body.apartmentNumber || null,
    body.address || null,
    body.total_area || body.totalArea || null,
    body.residents_count || body.residentsCount || 0,
    body.registered_count || body.registeredCount || 0,
    body.balance || 0,
    body.current_debt || body.currentDebt || 0,
    body.penalty_amount || body.penaltyAmount || 0,
    body.has_subsidy || body.hasSubsidy ? 1 : 0,
    body.subsidy_amount || body.subsidyAmount || 0,
    body.subsidy_end_date || body.subsidyEndDate || null,
    body.has_discount || body.hasDiscount ? 1 : 0,
    body.discount_percent || body.discountPercent || 0,
    body.discount_reason || body.discountReason || null,
    body.status || 'active'
  ).run();

  // Link account to apartment
  if (body.apartment_id || body.apartmentId) {
    await env.DB.prepare('UPDATE apartments SET personal_account_id = ? WHERE id = ?')
      .bind(id, body.apartment_id || body.apartmentId).run();
  }

  const created = await env.DB.prepare('SELECT * FROM personal_accounts WHERE id = ?').bind(id).first();
  return json({ account: created }, 201);
});

// Personal Accounts: Update
route('PATCH', '/api/accounts/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    owner_name: 'owner_name', ownerName: 'owner_name',
    apartment_number: 'apartment_number', apartmentNumber: 'apartment_number',
    address: 'address',
    total_area: 'total_area', totalArea: 'total_area',
    residents_count: 'residents_count', residentsCount: 'residents_count',
    registered_count: 'registered_count', registeredCount: 'registered_count',
    balance: 'balance',
    current_debt: 'current_debt', currentDebt: 'current_debt',
    penalty_amount: 'penalty_amount', penaltyAmount: 'penalty_amount',
    last_payment_date: 'last_payment_date', lastPaymentDate: 'last_payment_date',
    last_payment_amount: 'last_payment_amount', lastPaymentAmount: 'last_payment_amount',
    has_subsidy: 'has_subsidy', hasSubsidy: 'has_subsidy',
    subsidy_amount: 'subsidy_amount', subsidyAmount: 'subsidy_amount',
    subsidy_end_date: 'subsidy_end_date', subsidyEndDate: 'subsidy_end_date',
    has_discount: 'has_discount', hasDiscount: 'has_discount',
    discount_percent: 'discount_percent', discountPercent: 'discount_percent',
    discount_reason: 'discount_reason', discountReason: 'discount_reason',
    status: 'status',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE personal_accounts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM personal_accounts WHERE id = ?').bind(params.id).first();
  return json({ account: updated });
});

// Personal Accounts: Get debtors
route('GET', '/api/accounts/debtors', async (request, env) => {
  const url = new URL(request.url);
  const minDebt = parseInt(url.searchParams.get('min_debt') || '0');
  const buildingId = url.searchParams.get('building_id');

  let query = `
    SELECT pa.*,
      b.name as building_name
    FROM personal_accounts pa
    JOIN buildings b ON pa.building_id = b.id
    WHERE pa.current_debt > ?
  `;
  const bindings: any[] = [minDebt];

  if (buildingId) {
    query += ' AND pa.building_id = ?';
    bindings.push(buildingId);
  }

  query += ' ORDER BY pa.current_debt DESC';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ debtors: results });
});

// ==================== CRM RESIDENTS ROUTES ====================

// CRM Residents: List by apartment
route('GET', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const url = new URL(request.url);
  const isActive = url.searchParams.get('is_active');

  let query = 'SELECT * FROM crm_residents WHERE apartment_id = ?';
  const bindings: any[] = [params.apartmentId];

  if (isActive !== null) {
    query += ' AND is_active = ?';
    bindings.push(isActive === 'true' ? 1 : 0);
  }

  query += ' ORDER BY resident_type, full_name';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ residents: results });
});

// CRM Residents: Get single
route('GET', '/api/residents/:id', async (request, env, params) => {
  const resident = await env.DB.prepare(`
    SELECT r.*,
      a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address,
      o.full_name as owner_name, o.phone as owner_phone
    FROM crm_residents r
    LEFT JOIN apartments a ON r.apartment_id = a.id
    LEFT JOIN buildings b ON a.building_id = b.id
    LEFT JOIN owners o ON r.owner_id = o.id
    WHERE r.id = ?
  `).bind(params.id).first();

  if (!resident) return error('Resident not found', 404);

  return json({ resident });
});

// CRM Residents: Create
route('POST', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Build full_name if not provided
  const fullName = body.full_name || body.fullName ||
    [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName]
      .filter(Boolean).join(' ');

  await env.DB.prepare(`
    INSERT INTO crm_residents (
      id, apartment_id, owner_id,
      last_name, first_name, middle_name, full_name, birth_date,
      resident_type, relation_to_owner,
      registration_type, registration_date, registration_end_date,
      phone, additional_phone, email,
      is_active, moved_in_date,
      passport_series, passport_number,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.apartmentId,
    body.owner_id || body.ownerId || null,
    body.last_name || body.lastName || null,
    body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null,
    fullName,
    body.birth_date || body.birthDate || null,
    body.resident_type || body.residentType || 'owner',
    body.relation_to_owner || body.relationToOwner || null,
    body.registration_type || body.registrationType || 'permanent',
    body.registration_date || body.registrationDate || null,
    body.registration_end_date || body.registrationEndDate || null,
    body.phone || null,
    body.additional_phone || body.additionalPhone || null,
    body.email || null,
    body.is_active !== false ? 1 : 0,
    body.moved_in_date || body.movedInDate || new Date().toISOString().split('T')[0],
    body.passport_series || body.passportSeries || null,
    body.passport_number || body.passportNumber || null,
    body.notes || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM crm_residents WHERE id = ?').bind(id).first();
  return json({ resident: created }, 201);
});

// CRM Residents: Update
route('PATCH', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    last_name: 'last_name', lastName: 'last_name',
    first_name: 'first_name', firstName: 'first_name',
    middle_name: 'middle_name', middleName: 'middle_name',
    full_name: 'full_name', fullName: 'full_name',
    birth_date: 'birth_date', birthDate: 'birth_date',
    resident_type: 'resident_type', residentType: 'resident_type',
    relation_to_owner: 'relation_to_owner', relationToOwner: 'relation_to_owner',
    registration_type: 'registration_type', registrationType: 'registration_type',
    registration_date: 'registration_date', registrationDate: 'registration_date',
    registration_end_date: 'registration_end_date', registrationEndDate: 'registration_end_date',
    phone: 'phone',
    additional_phone: 'additional_phone', additionalPhone: 'additional_phone',
    email: 'email',
    is_active: 'is_active', isActive: 'is_active',
    moved_in_date: 'moved_in_date', movedInDate: 'moved_in_date',
    moved_out_date: 'moved_out_date', movedOutDate: 'moved_out_date',
    moved_out_reason: 'moved_out_reason', movedOutReason: 'moved_out_reason',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE crm_residents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM crm_residents WHERE id = ?').bind(params.id).first();
  return json({ resident: updated });
});

// CRM Residents: Delete
route('DELETE', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM crm_residents WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// CRM Residents: Move out (soft delete)
route('POST', '/api/residents/:id/move-out', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE crm_residents
    SET is_active = 0, moved_out_date = ?, moved_out_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.moved_out_date || body.movedOutDate || new Date().toISOString().split('T')[0],
    body.reason || null,
    params.id
  ).run();

  return json({ success: true });
});

// ==================== METERS ROUTES (CRM) ====================

// Meters: List by apartment
route('GET', '/api/apartments/:apartmentId/meters', async (request, env, params) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isActive = url.searchParams.get('is_active');

  let query = 'SELECT * FROM meters WHERE apartment_id = ?';
  const bindings: any[] = [params.apartmentId];

  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (isActive !== null) {
    query += ' AND is_active = ?';
    bindings.push(isActive === 'true' ? 1 : 0);
  }

  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: List common meters by building
route('GET', '/api/buildings/:buildingId/meters', async (request, env, params) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isCommon = url.searchParams.get('is_common');

  let query = 'SELECT * FROM meters WHERE building_id = ?';
  const bindings: any[] = [params.buildingId];

  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (isCommon !== null) {
    query += ' AND is_common = ?';
    bindings.push(isCommon === 'true' ? 1 : 0);
  }

  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: Get single with latest readings
route('GET', '/api/meters/:id', async (request, env, params) => {
  const meter = await env.DB.prepare(`
    SELECT m.*,
      a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address
    FROM meters m
    LEFT JOIN apartments a ON m.apartment_id = a.id
    LEFT JOIN buildings b ON COALESCE(m.building_id, a.building_id) = b.id
    WHERE m.id = ?
  `).bind(params.id).first();

  if (!meter) return error('Meter not found', 404);

  // Get last 12 readings
  const { results: readings } = await env.DB.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ?
    ORDER BY reading_date DESC
    LIMIT 12
  `).bind(params.id).all();

  return json({ meter, readings });
});

// Meters: Create
route('POST', '/api/meters', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meters (
      id, apartment_id, building_id,
      type, is_common,
      serial_number, model, brand,
      install_date, install_location, initial_value,
      verification_date, next_verification_date, seal_number, seal_date,
      is_active, current_value, last_reading_date,
      tariff_zone, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.apartment_id || body.apartmentId || null,
    body.building_id || body.buildingId || null,
    body.type,
    body.is_common || body.isCommon ? 1 : 0,
    body.serial_number || body.serialNumber,
    body.model || null,
    body.brand || null,
    body.install_date || body.installDate || null,
    body.install_location || body.installLocation || body.location || null,
    body.initial_value || body.initialValue || 0,
    body.verification_date || body.verificationDate || null,
    body.next_verification_date || body.nextVerificationDate || null,
    body.seal_number || body.sealNumber || null,
    body.seal_date || body.sealDate || null,
    body.is_active !== false ? 1 : 0,
    body.current_value || body.currentValue || body.initial_value || body.initialValue || 0,
    body.last_reading_date || body.lastReadingDate || null,
    body.tariff_zone || body.tariffZone || 'single',
    body.notes || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meters WHERE id = ?').bind(id).first();
  return json({ meter: created }, 201);
});

// Meters: Update
route('PATCH', '/api/meters/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    serial_number: 'serial_number', serialNumber: 'serial_number',
    model: 'model',
    brand: 'brand',
    install_date: 'install_date', installDate: 'install_date',
    install_location: 'install_location', installLocation: 'install_location', location: 'install_location',
    verification_date: 'verification_date', verificationDate: 'verification_date',
    next_verification_date: 'next_verification_date', nextVerificationDate: 'next_verification_date',
    seal_number: 'seal_number', sealNumber: 'seal_number',
    seal_date: 'seal_date', sealDate: 'seal_date',
    is_active: 'is_active', isActive: 'is_active',
    current_value: 'current_value', currentValue: 'current_value',
    last_reading_date: 'last_reading_date', lastReadingDate: 'last_reading_date',
    tariff_zone: 'tariff_zone', tariffZone: 'tariff_zone',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE meters SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM meters WHERE id = ?').bind(params.id).first();
  return json({ meter: updated });
});

// Meters: Delete
route('DELETE', '/api/meters/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM meters WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// Meters: Decommission
route('POST', '/api/meters/:id/decommission', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meters
    SET is_active = 0, decommissioned_at = datetime('now'), decommissioned_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.reason || null, params.id).run();

  return json({ success: true });
});

// ==================== METER READINGS ROUTES ====================

// Meter Readings: List by meter
route('GET', '/api/meters/:meterId/readings', async (request, env, params) => {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM meter_readings WHERE meter_id = ?';
  const bindings: any[] = [params.meterId];

  if (status) {
    query += ' AND status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY reading_date DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ readings: results });
});

// Meter Readings: Submit reading (resident or inspector)
route('POST', '/api/meters/:meterId/readings', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Get meter's current value as previous value
  const meter = await env.DB.prepare('SELECT current_value, last_reading_date FROM meters WHERE id = ?')
    .bind(params.meterId).first() as any;

  if (!meter) return error('Meter not found', 404);

  const previousValue = meter.current_value || 0;
  const newValue = body.value;
  const consumption = newValue - previousValue;
  const readingDate = body.reading_date || body.readingDate || new Date().toISOString().split('T')[0];

  // Determine source based on user role
  const source = authUser.role === 'resident' ? 'resident' :
                 (authUser.role === 'executor' ? 'inspector' : body.source || 'resident');

  await env.DB.prepare(`
    INSERT INTO meter_readings (
      id, meter_id,
      value, previous_value, consumption, reading_date,
      source, submitted_by, submitted_at,
      photo_url, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `).bind(
    id,
    params.meterId,
    newValue,
    previousValue,
    consumption,
    readingDate,
    source,
    authUser.id,
    body.photo_url || body.photoUrl || null,
    'pending',
    body.notes || null
  ).run();

  // Update meter's current value and last reading date
  await env.DB.prepare(`
    UPDATE meters
    SET current_value = ?, last_reading_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newValue, readingDate, params.meterId).run();

  const created = await env.DB.prepare('SELECT * FROM meter_readings WHERE id = ?').bind(id).first();
  return json({ reading: created }, 201);
});

// Meter Readings: Approve/Reject
route('POST', '/api/meter-readings/:id/verify', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const status = body.approved ? 'approved' : 'rejected';

  await env.DB.prepare(`
    UPDATE meter_readings
    SET status = ?, is_verified = ?, verified_by = ?, verified_at = datetime('now'),
        rejection_reason = ?
    WHERE id = ?
  `).bind(
    status,
    body.approved ? 1 : 0,
    authUser.id,
    body.rejection_reason || body.rejectionReason || null,
    params.id
  ).run();

  // If rejected, revert meter's current value to previous reading
  if (!body.approved) {
    const reading = await env.DB.prepare('SELECT meter_id, previous_value FROM meter_readings WHERE id = ?')
      .bind(params.id).first() as any;

    if (reading) {
      await env.DB.prepare('UPDATE meters SET current_value = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(reading.previous_value, reading.meter_id).run();
    }
  }

  return json({ success: true });
});

// Meter Readings: Get last reading
route('GET', '/api/meters/:meterId/last-reading', async (request, env, params) => {
  const reading = await env.DB.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ?
    ORDER BY reading_date DESC
    LIMIT 1
  `).bind(params.meterId).first();

  return json({ reading: reading || null });
});

// ==================== REQUESTS ROUTES ====================

// Requests: List
route('GET', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // Filter by role
  if (user.role === 'resident') {
    whereClause += ' AND r.resident_id = ?';
    params.push(user.id);
  } else if (user.role === 'executor') {
    whereClause += ` AND (r.executor_id = ? OR (r.status = 'new' AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)))`;
    params.push(user.id);
    params.push(user.specialization || 'other');
  } else if (user.role === 'department_head' && user.specialization) {
    // SECURITY: Department heads only see requests in their department (by category specialization)
    whereClause += ` AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)`;
    params.push(user.specialization);
  }

  if (status && status !== 'all') {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }

  if (category) {
    whereClause += ' AND r.category_id = ?';
    params.push(category);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address, u.building_id,
           eu.name as executor_name, eu.phone as executor_phone, eu.specialization as executor_specialization,
           b.name as building_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    LEFT JOIN buildings b ON u.building_id = b.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ requests: response.data, pagination: response.pagination });
});

// Requests: Create
route('POST', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Determine the resident ID - managers/admins can create requests on behalf of residents
  let residentId = user.id;
  let residentData: any = null;

  // If manager/admin/director is creating request on behalf of a resident
  if (['manager', 'admin', 'director', 'department_head'].includes(user.role) && body.resident_id) {
    residentId = body.resident_id;
    // Get the actual resident's data for branch code and address
    residentData = await env.DB.prepare(
      'SELECT id, branch, building_id, address, name, phone, apartment FROM users WHERE id = ?'
    ).bind(body.resident_id).first() as any;
  }

  // Get branch code from address or building
  let branchCode = 'UK'; // Default branch code

  // Check resident or current user for branch info
  const userForBranch = residentData || await env.DB.prepare(
    'SELECT branch, building_id, address FROM users WHERE id = ?'
  ).bind(residentId).first() as any;

  if (userForBranch?.branch) {
    branchCode = userForBranch.branch.toUpperCase();
  } else if (userForBranch?.address) {
    // Try to extract branch from address
    const address = userForBranch.address.toLowerCase();
    if (address.includes('юнусобод') || address.includes('yunusobod') || address.includes('юнусота')) {
      branchCode = 'YS';
    } else if (address.includes('чиланзар') || address.includes('chilanzar')) {
      branchCode = 'CH';
    } else if (address.includes('сергели') || address.includes('sergeli')) {
      branchCode = 'SR';
    } else if (address.includes('мирзо') || address.includes('mirzo')) {
      branchCode = 'MU';
    }
  }

  // Get category code for unique numbering per service type
  // S=Сантехника, E=Электрика, L=Лифт, D=Домофон, C=Уборка, O=Охрана, X=Другое
  const categoryCodeMap: Record<string, string> = {
    'plumber': 'S',      // Сантехника
    'electrician': 'E',  // Электрика
    'elevator': 'L',     // Лифт
    'intercom': 'D',     // Домофон
    'cleaning': 'C',     // Уборка (Cleaning)
    'security': 'O',     // Охрана
    'carpenter': 'T',    // Столяр (Table/wood)
    'boiler': 'B',       // Котёл (Boiler)
    'ac': 'A',           // Кондиционер (AC)
    'other': 'X',        // Другое
  };
  const categoryCode = categoryCodeMap[body.category_id] || 'X';

  // Get next request number for this branch + category combination
  // e.g., YS-L-% for all elevator requests in Yunusabad
  const prefix = `${branchCode}-${categoryCode}`;
  const maxNum = await env.DB.prepare(
    'SELECT COALESCE(MAX(number), 1000) as max_num FROM requests WHERE request_number LIKE ?'
  ).bind(prefix + '-%').first() as any;
  const number = (maxNum?.max_num || 1000) + 1;

  // Create request number with branch + category prefix (e.g., YS-L-1001)
  const requestNumber = `${prefix}-${number}`;

  await env.DB.prepare(`
    INSERT INTO requests (id, number, request_number, resident_id, category_id, title, description, priority, access_info, scheduled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, number, requestNumber, residentId, body.category_id, body.title,
    body.description || null, body.priority || 'medium',
    body.access_info || null, body.scheduled_at || null
  ).run();

  // Return the created request with user info
  const created = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ?
  `).bind(id).first() as any;

  // Notify managers and department heads about new request
  const categoryLabels: Record<string, string> = {
    'plumber': 'Сантехника', 'electrician': 'Электрика', 'elevator': 'Лифт',
    'intercom': 'Домофон', 'cleaning': 'Уборка', 'security': 'Охрана',
    'carpenter': 'Столяр', 'boiler': 'Котёл', 'ac': 'Кондиционер', 'other': 'Другое'
  };
  const categoryLabel = categoryLabels[body.category_id] || body.category_id;

  // Get managers and department heads to notify
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'department_head') AND is_active = 1`
  ).all();

  // Send notification to each manager (in background, don't await all)
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '📝 Новая заявка',
      body: `#${requestNumber} - ${body.title}. ${categoryLabel}. От: ${created?.resident_name || 'Житель'}`,
      type: 'request_created',
      tag: `request-new-${id}`,
      data: { requestId: id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
  }

  return json({ request: created }, 201);
});

// Requests: Update
route('PATCH', '/api/requests/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Get request before update for notifications
  const requestBefore = await env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(params.id).first() as any;

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.status) {
    updates.push('status = ?');
    values.push(body.status);

    if (body.status === 'in_progress') updates.push('started_at = datetime("now")');
    if (body.status === 'completed') updates.push('completed_at = datetime("now")');
  }

  if (body.executor_id !== undefined) {
    updates.push('executor_id = ?');
    values.push(body.executor_id);
  }

  if (body.rating) {
    updates.push('rating = ?');
    values.push(body.rating);
  }

  if (body.feedback) {
    updates.push('feedback = ?');
    values.push(body.feedback);
  }

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  await env.DB.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Send notifications on status change
  if (body.status && requestBefore && body.status !== requestBefore.status) {
    const reqNum = requestBefore.request_number || params.id.slice(0, 8);

    // Notify resident on important status changes
    if (requestBefore.resident_id && ['in_progress', 'completed', 'pending_approval'].includes(body.status)) {
      const statusLabels: Record<string, string> = {
        in_progress: 'Работа началась',
        completed: 'Работа выполнена',
        pending_approval: 'Ожидает подтверждения'
      };
      sendPushNotification(env, requestBefore.resident_id, {
        title: `📋 Заявка #${reqNum}`,
        body: `${statusLabels[body.status] || body.status}`,
        type: 'request_status',
        tag: `request-status-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: body.status === 'pending_approval'
      }).catch(() => {});
    }

    // Notify executor when request rejected back to them
    if (requestBefore.executor_id && body.status === 'in_progress' && requestBefore.status === 'pending_approval') {
      sendPushNotification(env, requestBefore.executor_id, {
        title: `⚠️ Заявка #${reqNum} отклонена`,
        body: `Житель отклонил выполнение. Требуется доработка.`,
        type: 'request_rejected',
        tag: `request-rejected-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: true
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Assign executor
route('POST', '/api/requests/:id/assign', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || (user.role !== 'admin' && user.role !== 'director' && user.role !== 'manager' && user.role !== 'dispatcher' && user.role !== 'executor' && user.role !== 'department_head')) {
    return error('Not authorized to assign requests', 403);
  }

  const body = await request.json() as any;
  const executorId = body.executor_id;

  // Get executor info
  const executor = await env.DB.prepare(
    'SELECT id, name, phone, specialization FROM users WHERE id = ? AND role = ?'
  ).bind(executorId, 'executor').first() as any;

  if (!executor) {
    return error('Executor not found', 404);
  }

  // SECURITY: Department head can only assign to executors in their department
  if (user.role === 'department_head' && user.specialization && executor.specialization !== user.specialization) {
    return error('Department head can only assign to executors in their department', 403);
  }

  // Get request info before update
  const requestBefore = await env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE requests SET executor_id = ?, status = 'assigned', assigned_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(executorId, user.id, params.id).run();

  // Get updated request
  const updated = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address,
           eu.name as executor_name, eu.phone as executor_phone
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ?
  `).bind(params.id).first() as any;

  // Send push notification to executor - new request assigned
  await sendPushNotification(env, executorId, {
    title: '📋 Новая заявка назначена',
    body: `Заявка #${updated?.request_number || requestBefore?.request_number}: ${updated?.title || requestBefore?.title}. Адрес: ${updated?.address || 'не указан'}`,
    type: 'request_assigned',
    tag: `request-assigned-${params.id}`,
    data: {
      requestId: params.id,
      url: '/'
    },
    requireInteraction: true
  });

  // Send push notification to resident - executor assigned
  if (requestBefore?.resident_id) {
    await sendPushNotification(env, requestBefore.resident_id, {
      title: '👷 Исполнитель назначен',
      body: `На вашу заявку #${updated?.request_number || requestBefore?.request_number} назначен исполнитель: ${executor.name}`,
      type: 'request_status',
      tag: `request-executor-${params.id}`,
      data: {
        requestId: params.id,
        url: '/'
      },
      requireInteraction: false
    });
  }

  return json({ request: updated });
});

// Requests: Accept (executor accepts assigned request)
route('POST', '/api/requests/:id/accept', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can accept requests', 403);
  }

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ?
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'accepted', updated_at = datetime('now')
    WHERE id = ? AND executor_id = ?
  `).bind(params.id, user.id).run();

  // Send push notification to resident - executor accepted
  if (requestData.resident_id) {
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Заявка принята',
      body: `Исполнитель ${user.name} принял вашу заявку #${requestData.request_number}. Ожидайте начала работ.`,
      type: 'request_status',
      tag: `request-accepted-${params.id}`,
      data: {
        requestId: params.id,
        url: '/'
      },
      requireInteraction: false
    });
  }

  return json({ success: true });
});

// Requests: Decline/Release (executor declines or releases request - returns to 'new' status)
route('POST', '/api/requests/:id/decline', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can decline requests', 403);
  }

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Get request info - must be assigned to this executor and in appropriate status
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ?
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Can only decline if assigned, accepted, or in_progress
  if (!['assigned', 'accepted', 'in_progress'].includes(requestData.status)) {
    return error('Cannot decline request in current status', 400);
  }

  // Update request: clear executor and return to 'new' status
  // Note: Table doesn't have assigned_at, accepted_at, decline_reason columns
  // Only: started_at, completed_at, closed_at exist
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'new',
      executor_id = NULL,
      assigned_by = NULL,
      started_at = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  // Update executor's active request count
  await env.DB.prepare(`
    UPDATE users SET
      active_requests = CASE WHEN active_requests > 0 THEN active_requests - 1 ELSE 0 END,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(user.id).run();

  // Send push notification to resident
  if (requestData.resident_id) {
    await sendPushNotification(env, requestData.resident_id, {
      title: '⚠️ Исполнитель освободил заявку',
      body: `Исполнитель ${user.name} освободил заявку #${requestData.request_number}. Причина: ${reason}. Заявка возвращена в очередь.`,
      type: 'request_declined',
      tag: `request-declined-${params.id}`,
      data: {
        requestId: params.id,
        reason,
        url: '/'
      },
      requireInteraction: true
    });
  }

  // Notify managers and department heads
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'director', 'department_head') AND is_active = 1`
  ).all();

  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '⚠️ Исполнитель отказался от заявки',
      body: `${user.name} отказался от заявки #${requestData.request_number}. Причина: ${reason}`,
      type: 'request_declined',
      tag: `request-declined-manager-${params.id}`,
      data: { requestId: params.id, reason, url: '/requests' },
      requireInteraction: true
    }).catch(() => {});
  }

  return json({ success: true });
});

// ==================== RESCHEDULE REQUESTS ====================

// Create reschedule request (перенос времени)
route('POST', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents and executors can create reschedule requests
  if (!['resident', 'executor'].includes(user.role)) {
    return error('Only residents and executors can request reschedule', 403);
  }

  const body = await request.json() as any;
  const { proposed_date, proposed_time, reason, reason_text } = body;

  if (!proposed_date || !proposed_time || !reason) {
    return error('Missing required fields: proposed_date, proposed_time, reason', 400);
  }

  // Get request info
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, eu.name as executor_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ?
  `).bind(params.id).first() as any;

  if (!requestData) {
    return error('Request not found', 404);
  }

  // Verify user is involved in this request
  const isResident = user.role === 'resident' && requestData.resident_id === user.id;
  const isExecutor = user.role === 'executor' && requestData.executor_id === user.id;

  if (!isResident && !isExecutor) {
    return error('You are not involved in this request', 403);
  }

  // Check for existing pending reschedule
  const existingPending = await env.DB.prepare(`
    SELECT id FROM reschedule_requests
    WHERE request_id = ? AND status = 'pending'
  `).bind(params.id).first();

  if (existingPending) {
    return error('There is already a pending reschedule request', 400);
  }

  const initiator = user.role as 'resident' | 'executor';
  const recipientId = isResident ? requestData.executor_id : requestData.resident_id;
  const recipientName = isResident ? requestData.executor_name : requestData.resident_name;
  const recipientRole = isResident ? 'executor' : 'resident';

  if (!recipientId) {
    return error('No recipient found for reschedule request', 400);
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await env.DB.prepare(`
    INSERT INTO reschedule_requests (
      id, request_id, initiator, initiator_id, initiator_name,
      recipient_id, recipient_name, recipient_role,
      current_date, current_time, proposed_date, proposed_time,
      reason, reason_text, status, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    id, params.id, initiator, user.id, user.name,
    recipientId, recipientName, recipientRole,
    requestData.scheduled_at?.split('T')[0] || null,
    requestData.scheduled_at?.split('T')[1]?.substring(0, 5) || null,
    proposed_date, proposed_time,
    reason, reason_text || null, expiresAt
  ).run();

  const reschedule = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ?
  `).bind(id).first();

  // Send push notification to recipient
  await sendPushNotification(env, recipientId, {
    title: '⏰ Запрос на перенос времени',
    body: `${user.name} просит перенести заявку на ${proposed_date} ${proposed_time}`,
    type: 'reschedule_requested',
    tag: `reschedule-${id}`,
    data: { rescheduleId: id, requestId: params.id },
    requireInteraction: true
  }).catch(() => {});

  return json({ reschedule }, 201);
});

// Get reschedule requests for current user (both as recipient and initiator)
route('GET', '/api/reschedule-requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Get pending reschedules where user is recipient OR initiator
  const { results } = await env.DB.prepare(`
    SELECT rr.*, r.title as request_title, r.status as request_status, r.number as request_number
    FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE (rr.recipient_id = ? OR rr.initiator_id = ?) AND rr.status = 'pending'
    ORDER BY rr.created_at DESC
  `).bind(user.id, user.id).all();

  return json({ reschedules: results });
});

// Get reschedule requests for a specific request
route('GET', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM reschedule_requests
    WHERE request_id = ?
    ORDER BY created_at DESC
  `).bind(params.id).all();

  return json({ reschedules: results });
});

// Respond to reschedule request (accept/reject)
route('POST', '/api/reschedule-requests/:id/respond', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { accepted, response_note } = body;

  if (typeof accepted !== 'boolean') {
    return error('Missing required field: accepted (boolean)', 400);
  }

  // Get reschedule request
  const reschedule = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ?
  `).bind(params.id).first() as any;

  if (!reschedule) {
    return error('Reschedule request not found', 404);
  }

  if (reschedule.status !== 'pending') {
    return error('Reschedule request is not pending', 400);
  }

  // Verify user is the recipient
  if (reschedule.recipient_id !== user.id) {
    return error('You are not the recipient of this reschedule request', 403);
  }

  const newStatus = accepted ? 'accepted' : 'rejected';

  // Update reschedule status
  await env.DB.prepare(`
    UPDATE reschedule_requests
    SET status = ?, response_note = ?, responded_at = datetime('now')
    WHERE id = ?
  `).bind(newStatus, response_note || null, params.id).run();

  // If accepted, update the request's scheduled time
  if (accepted) {
    await env.DB.prepare(`
      UPDATE requests
      SET scheduled_at = datetime(? || 'T' || ? || ':00'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(reschedule.proposed_date, reschedule.proposed_time, reschedule.request_id).run();
  }

  const updated = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ?
  `).bind(params.id).first();

  // Send push notification to initiator
  const statusText = accepted ? 'принял' : 'отклонил';
  await sendPushNotification(env, reschedule.initiator_id, {
    title: accepted ? '✅ Перенос согласован' : '❌ Перенос отклонен',
    body: `${user.name} ${statusText} ваш запрос на перенос времени`,
    type: 'reschedule_responded',
    tag: `reschedule-response-${params.id}`,
    data: { rescheduleId: params.id }
  }).catch(() => {});

  return json({ reschedule: updated });
});

// Requests: Start work
route('POST', '/api/requests/:id/start', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can start work', 403);
  }

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ?
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ?
  `).bind(params.id, user.id).run();

  // Send push notification to resident - work started
  if (requestData.resident_id) {
    await sendPushNotification(env, requestData.resident_id, {
      title: '🔧 Работа началась',
      body: `Исполнитель ${user.name} начал работу по заявке #${requestData.request_number}.`,
      type: 'request_status',
      tag: `request-started-${params.id}`,
      data: {
        requestId: params.id,
        url: '/'
      },
      requireInteraction: false
    });
  }

  // Notify department heads about work started
  const { results: deptHeadsStart } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1`
  ).all();

  for (const head of (deptHeadsStart || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '🔧 Работа началась',
      body: `${user.name} начал работу по заявке #${requestData.request_number}`,
      type: 'request_started',
      tag: `request-started-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
  }

  return json({ success: true });
});

// Requests: Complete work (executor marks work as done, waiting for resident approval)
route('POST', '/api/requests/:id/complete', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can complete work', 403);
  }

  // Get request info for notification
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ?
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Update status to pending_approval (waiting for resident confirmation)
  await env.DB.prepare(`
    UPDATE requests SET status = 'pending_approval', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ?
  `).bind(params.id, user.id).run();

  // Send push notification to resident - work completed, please approve
  if (requestData.resident_id) {
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Работа завершена!',
      body: `Исполнитель ${user.name} завершил работу по заявке #${requestData.request_number}. Пожалуйста, подтвердите выполнение и оцените работу.`,
      type: 'request_completed',
      tag: `request-completed-${params.id}`,
      data: {
        requestId: params.id,
        url: '/'
      },
      requireInteraction: true
    });
  }

  // Notify department heads about completed work
  const { results: deptHeads } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1`
  ).all();

  for (const head of (deptHeads || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '✅ Исполнитель завершил работу',
      body: `${user.name} завершил заявку #${requestData.request_number}. Ожидается подтверждение жителя.`,
      type: 'request_completed',
      tag: `request-completed-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
  }

  return json({ success: true });
});

// Requests: Pause work
route('POST', '/api/requests/:id/pause', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can pause work', 403);
  }

  // Check request exists and is in_progress
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress'
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not in progress', 404);
  }

  // Check if already paused
  if (requestData.is_paused) {
    return error('Request is already paused', 400);
  }

  // Update request to paused state
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 1, paused_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ?`).bind(params.id).first();

  return json({ success: true, request: updated });
});

// Requests: Resume work
route('POST', '/api/requests/:id/resume', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Only executors can resume work', 403);
  }

  // Check request exists and is paused
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' AND is_paused = 1
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not paused', 404);
  }

  // Calculate paused duration in seconds
  const pausedAt = new Date(requestData.paused_at).getTime();
  const now = Date.now();
  const pausedDuration = Math.floor((now - pausedAt) / 1000);
  const newTotalPausedTime = (requestData.total_paused_time || 0) + pausedDuration;

  // Update request - resume work
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 0, paused_at = NULL, total_paused_time = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newTotalPausedTime, params.id).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ?`).bind(params.id).first();

  return json({ success: true, request: updated, pausedDuration, totalPausedTime: newTotalPausedTime });
});

// Requests: Approve (resident confirms work is done)
route('POST', '/api/requests/:id/approve', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { rating, feedback } = body;

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval'
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Update status to completed
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'completed',
      rating = ?,
      feedback = ?,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ?
  `).bind(rating || null, feedback || null, params.id, user.id).run();

  // Send push notification to executor - work approved
  if (requestData.executor_id) {
    const ratingText = rating ? ` Оценка: ${'⭐'.repeat(rating)}` : '';
    await sendPushNotification(env, requestData.executor_id, {
      title: '🎉 Работа подтверждена!',
      body: `Житель подтвердил выполнение заявки #${requestData.request_number}.${ratingText}`,
      type: 'request_approved',
      tag: `request-approved-${params.id}`,
      data: {
        requestId: params.id,
        rating,
        url: '/'
      },
      requireInteraction: false
    });

    // Get executor name for notification
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about approved work with rating
    const { results: deptHeads } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1`
    ).all();

    const ratingStars = rating ? '⭐'.repeat(rating) : 'без оценки';
    for (const head of (deptHeads || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '✅ Заявка закрыта',
        body: `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number} подтверждена. ${ratingStars}`,
        type: 'request_approved',
        tag: `request-approved-head-${params.id}`,
        data: { requestId: params.id, rating, url: '/requests' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Reject (resident rejects work, sends back to executor)
route('POST', '/api/requests/:id/reject', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval'
  `).bind(params.id, user.id).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Get current rejection count
  const currentCount = requestData.rejection_count || 0;

  // Update status back to in_progress
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'in_progress',
      rejection_reason = ?,
      rejection_count = ?,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ?
  `).bind(reason, currentCount + 1, params.id, user.id).run();

  // Send push notification to executor - work rejected
  if (requestData.executor_id) {
    await sendPushNotification(env, requestData.executor_id, {
      title: '❌ Работа отклонена',
      body: `Житель отклонил работу по заявке #${requestData.request_number}. Причина: ${reason}`,
      type: 'request_rejected',
      tag: `request-rejected-${params.id}`,
      data: {
        requestId: params.id,
        reason,
        url: '/'
      },
      requireInteraction: true
    });

    // Get executor name for notification to department heads
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about rejected work
    const { results: deptHeadsReject } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1`
    ).all();

    for (const head of (deptHeadsReject || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '❌ Работа отклонена жителем',
        body: `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number}. Причина: ${reason}`,
        type: 'request_rejected',
        tag: `request-rejected-head-${params.id}`,
        data: { requestId: params.id, reason, url: '/requests' },
        requireInteraction: true
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Cancel
route('POST', '/api/requests/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const reason = body.reason || 'Без причины';

  // Get request data
  const requestData = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(params.id).first();
  if (!requestData) return error('Request not found', 404);

  // Check permissions
  // Residents can cancel only before work starts (new, assigned, accepted)
  // Managers/Admins can cancel any request not completed
  const isResident = user.role === 'resident';
  const canResidentCancel = ['new', 'assigned', 'accepted'].includes(requestData.status as string);
  const canManagerCancel = requestData.status !== 'completed';

  if (isResident && requestData.resident_id !== user.id) {
    return error('Forbidden', 403);
  }

  if (isResident && !canResidentCancel) {
    return error('Cannot cancel request in this status', 400);
  }

  if (!isResident && !canManagerCancel) {
    return error('Cannot cancel completed request', 400);
  }

  const cancelledBy = isResident ? 'resident' : user.role;

  await env.DB.prepare(`
    UPDATE requests
    SET status = 'cancelled',
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  // Add to history
  await env.DB.prepare(`
    INSERT INTO request_history (id, request_id, user_id, action, old_status, new_status, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    params.id,
    user.id,
    'cancelled',
    requestData.status,
    'cancelled',
    `Отменена (${cancelledBy}): ${reason}`
  ).run();

  // Send notification to executor if assigned
  if (requestData.executor_id && !isResident) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'))
    `).bind(
      generateId(),
      requestData.executor_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`
    ).run();
  }

  // Send notification to resident if cancelled by manager/admin
  if (!isResident && requestData.resident_id) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'))
    `).bind(
      generateId(),
      requestData.resident_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`
    ).run();
  }

  invalidateCache('requests');

  return json({ success: true });
});

// Requests: Rate (legacy endpoint, now uses approve)
route('POST', '/api/requests/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, status = 'completed', updated_at = datetime('now')
    WHERE id = ? AND resident_id = ?
  `).bind(body.rating, body.feedback || null, params.id, user.id).run();

  return json({ success: true });
});

// ==================== CATEGORIES ROUTES ====================

route('GET', '/api/categories', async (request, env) => {
  // Кэшируем категории на 24 часа (статические данные)
  const results = await cachedQuery(
    CachePrefix.CATEGORIES_ALL,
    CacheTTL.CATEGORIES,
    async () => {
      const { results } = await env.DB.prepare('SELECT * FROM categories WHERE is_active = 1').all();
      return results;
    },
    env.RATE_LIMITER
  );

  return json(results, 200, 'public, max-age=86400'); // 24 hours
});

// ==================== RATINGS ROUTES ====================

// Ratings: Create
route('POST', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO employee_ratings (id, executor_id, resident_id, quality, speed, politeness, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.executor_id, user.id, body.quality, body.speed, body.politeness, body.comment || null).run();

  return json({ id }, 201);
});

// Ratings: Get for user
route('GET', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM employee_ratings WHERE resident_id = ?
  `).bind(user.id).all();

  return json(results);
});

// ==================== TRAINING SYSTEM ROUTES ====================

// Training Partners: List all
route('GET', '/api/training/partners', async (request, env) => {
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let query = 'SELECT * FROM training_partners';
  if (activeOnly) {
    query += ' WHERE is_active = 1';
  }
  query += ' ORDER BY name';

  const { results } = await env.DB.prepare(query).all();
  return json({ partners: results });
});

// Training Partners: Get by ID
route('GET', '/api/training/partners/:id', async (request, env, params) => {
  const partner = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?')
    .bind(params.id).first();

  if (!partner) {
    return error('Partner not found', 404);
  }
  return json({ partner });
});

// Training Partners: Create
route('POST', '/api/training/partners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO training_partners (
      id, name, position, specialization, email, phone, bio, avatar_url, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.position || null,
    body.specialization || null,
    body.email || null,
    body.phone || null,
    body.bio || null,
    body.avatar_url || body.avatarUrl || null,
    body.is_active !== false ? 1 : 0
  ).run();

  const created = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(id).first();
  return json({ partner: created }, 201);
});

// Training Partners: Update
route('PATCH', '/api/training/partners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'name', db: 'name' },
    { api: 'position', db: 'position' },
    { api: 'specialization', db: 'specialization' },
    { api: 'email', db: 'email' },
    { api: 'phone', db: 'phone' },
    { api: 'bio', db: 'bio' },
    { api: 'avatarUrl', db: 'avatar_url' },
    { api: 'avatar_url', db: 'avatar_url' },
    { api: 'isActive', db: 'is_active' },
    { api: 'is_active', db: 'is_active' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      if (field.db === 'is_active') {
        values.push(body[field.api] ? 1 : 0);
      } else {
        values.push(body[field.api]);
      }
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    await env.DB.prepare(`
      UPDATE training_partners SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(params.id).first();
  return json({ partner: updated });
});

// Training Partners: Delete
route('DELETE', '/api/training/partners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  await env.DB.prepare('DELETE FROM training_partners WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// Training Proposals: List
route('GET', '/api/training/proposals', async (request, env) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const partnerId = url.searchParams.get('partner_id') || url.searchParams.get('partnerId');
  const authorId = url.searchParams.get('author_id') || url.searchParams.get('authorId');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM training_proposals WHERE 1=1';
  const params: any[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (partnerId) {
    query += ' AND partner_id = ?';
    params.push(partnerId);
  }
  if (authorId) {
    query += ' AND author_id = ?';
    params.push(authorId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Get vote counts and registered counts for each proposal
  const proposalsWithCounts = await Promise.all(results.map(async (p: any) => {
    const [voteCount, regCount] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?').bind(p.id).first(),
      env.DB.prepare('SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ?').bind(p.id).first()
    ]);
    return {
      ...p,
      vote_count: (voteCount as any)?.count || 0,
      registered_count: (regCount as any)?.count || 0,
      preferred_time_slots: p.preferred_time_slots ? JSON.parse(p.preferred_time_slots) : []
    };
  }));

  return json({ proposals: proposalsWithCounts });
});

// Training Proposals: Get by ID with full details
route('GET', '/api/training/proposals/:id', async (request, env, params) => {
  const proposal = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?')
    .bind(params.id).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  // Get votes, registrations, feedback
  const [votes, registrations, feedback] = await Promise.all([
    env.DB.prepare('SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_registrations WHERE proposal_id = ? ORDER BY registered_at DESC')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC')
      .bind(params.id).all()
  ]);

  return json({
    proposal: {
      ...proposal,
      preferred_time_slots: proposal.preferred_time_slots ? JSON.parse(proposal.preferred_time_slots) : [],
      votes: votes.results,
      registrations: registrations.results,
      feedback: feedback.results
    }
  });
});

// Training Proposals: Create
route('POST', '/api/training/proposals', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Get default vote threshold from settings
  const thresholdSetting = await env.DB.prepare(
    "SELECT value FROM training_settings WHERE key = 'vote_threshold'"
  ).first() as any;
  const voteThreshold = parseInt(thresholdSetting?.value || '5');

  // Get partner name
  const partner = await env.DB.prepare('SELECT name FROM training_partners WHERE id = ?')
    .bind(body.partner_id || body.partnerId).first() as any;

  if (!partner) {
    return error('Partner not found', 404);
  }

  await env.DB.prepare(`
    INSERT INTO training_proposals (
      id, topic, description,
      author_id, author_name, is_author_anonymous,
      partner_id, partner_name,
      format, preferred_time_slots, vote_threshold, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting')
  `).bind(
    id,
    body.topic,
    body.description || null,
    authUser.id,
    authUser.name,
    body.is_author_anonymous || body.isAuthorAnonymous ? 1 : 0,
    body.partner_id || body.partnerId,
    partner.name,
    body.format || 'offline',
    JSON.stringify(body.preferred_time_slots || body.preferredTimeSlots || []),
    voteThreshold
  ).run();

  // Create notification for all employees about new proposal
  const notifyAll = await env.DB.prepare(
    "SELECT value FROM training_settings WHERE key = 'notify_all_on_new_proposal'"
  ).first() as any;

  if (notifyAll?.value === 'true') {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'new_proposal', ?, 'all', 'employee', ?, ?)
    `).bind(
      notifId, id,
      'Новое предложение тренинга',
      `Предложена тема: "${body.topic}"`
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(id).first();
  return json({ proposal: created }, 201);
});

// Training Proposals: Update
route('PATCH', '/api/training/proposals/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'topic', db: 'topic' },
    { api: 'description', db: 'description' },
    { api: 'format', db: 'format' },
    { api: 'status', db: 'status' },
    { api: 'scheduledDate', db: 'scheduled_date' },
    { api: 'scheduled_date', db: 'scheduled_date' },
    { api: 'scheduledTime', db: 'scheduled_time' },
    { api: 'scheduled_time', db: 'scheduled_time' },
    { api: 'scheduledLocation', db: 'scheduled_location' },
    { api: 'scheduled_location', db: 'scheduled_location' },
    { api: 'scheduledLink', db: 'scheduled_link' },
    { api: 'scheduled_link', db: 'scheduled_link' },
    { api: 'maxParticipants', db: 'max_participants' },
    { api: 'max_participants', db: 'max_participants' },
    { api: 'partnerResponse', db: 'partner_response' },
    { api: 'partner_response', db: 'partner_response' },
    { api: 'partnerResponseNote', db: 'partner_response_note' },
    { api: 'partner_response_note', db: 'partner_response_note' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.preferredTimeSlots || body.preferred_time_slots) {
    updates.push('preferred_time_slots = ?');
    values.push(JSON.stringify(body.preferredTimeSlots || body.preferred_time_slots));
  }

  if (body.partnerResponse || body.partner_response) {
    updates.push("partner_response_at = datetime('now')");
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    await env.DB.prepare(`
      UPDATE training_proposals SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Delete
route('DELETE', '/api/training/proposals/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  await env.DB.prepare('DELETE FROM training_proposals WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// Training Proposals: Schedule
route('POST', '/api/training/proposals/:id/schedule', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'scheduled',
        scheduled_date = ?,
        scheduled_time = ?,
        scheduled_location = ?,
        scheduled_link = ?,
        max_participants = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.scheduledDate || body.scheduled_date,
    body.scheduledTime || body.scheduled_time,
    body.scheduledLocation || body.scheduled_location || null,
    body.scheduledLink || body.scheduled_link || null,
    body.maxParticipants || body.max_participants || null,
    params.id
  ).run();

  // Notify all voters about scheduling
  const proposal = await env.DB.prepare('SELECT topic FROM training_proposals WHERE id = ?')
    .bind(params.id).first() as any;
  const { results: votes } = await env.DB.prepare('SELECT DISTINCT voter_id FROM training_votes WHERE proposal_id = ?')
    .bind(params.id).all();

  for (const vote of votes) {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'training_scheduled', ?, ?, 'employee', ?, ?)
    `).bind(
      notifId, params.id, (vote as any).voter_id,
      'Тренинг запланирован',
      `Тренинг "${proposal.topic}" состоится ${body.scheduledDate || body.scheduled_date} в ${body.scheduledTime || body.scheduled_time}`
    ).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Complete
route('POST', '/api/training/proposals/:id/complete', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;

  // Get actual participants count
  const regCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ? AND attended = 1'
  ).bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'completed',
        completed_at = datetime('now'),
        actual_participants_count = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.actualParticipantsCount || body.actual_participants_count || regCount?.count || 0,
    params.id
  ).run();

  // Update partner's trainings_conducted count
  const proposal = await env.DB.prepare('SELECT partner_id FROM training_proposals WHERE id = ?')
    .bind(params.id).first() as any;

  if (proposal) {
    await env.DB.prepare(`
      UPDATE training_partners
      SET trainings_conducted = trainings_conducted + 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(proposal.partner_id).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Votes: Add vote
route('POST', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Check if already voted
  const existing = await env.DB.prepare(
    'SELECT id FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already voted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_votes (
      id, proposal_id, voter_id, voter_name, participation_intent, is_anonymous
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.participationIntent || body.participation_intent || 'definitely',
    body.isAnonymous || body.is_anonymous ? 1 : 0
  ).run();

  // Check if threshold reached
  const proposal = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?')
    .bind(params.proposalId).first() as any;
  const voteCount = await env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?')
    .bind(params.proposalId).first() as any;

  if (proposal && proposal.status === 'voting' && voteCount.count >= proposal.vote_threshold) {
    // Update status to review
    await env.DB.prepare(`
      UPDATE training_proposals SET status = 'review', updated_at = datetime('now') WHERE id = ?
    `).bind(params.proposalId).run();

    // Notify admin
    const notifId1 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'threshold_reached', ?, 'admin', 'admin', ?, ?)
    `).bind(
      notifId1, params.proposalId,
      'Порог голосов достигнут',
      `Предложение "${proposal.topic}" набрало необходимое количество голосов`
    ).run();

    // Notify partner
    const notifId2 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'threshold_reached', ?, ?, 'partner', ?, ?)
    `).bind(
      notifId2, params.proposalId, proposal.partner_id,
      'Приглашение провести тренинг',
      `Вас выбрали лектором для тренинга "${proposal.topic}"`
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_votes WHERE id = ?').bind(id).first();
  return json({ vote: created }, 201);
});

// Training Votes: Remove vote
route('DELETE', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  await env.DB.prepare(
    'DELETE FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Votes: Get for proposal
route('GET', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const { results } = await env.DB.prepare(
    'SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC'
  ).bind(params.proposalId).all();

  return json({ votes: results });
});

// Training Registrations: Register
route('POST', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Check if already registered
  const existing = await env.DB.prepare(
    'SELECT id FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already registered', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_registrations (id, proposal_id, user_id, user_name)
    VALUES (?, ?, ?, ?)
  `).bind(id, params.proposalId, authUser.id, authUser.name).run();

  const created = await env.DB.prepare('SELECT * FROM training_registrations WHERE id = ?').bind(id).first();
  return json({ registration: created }, 201);
});

// Training Registrations: Unregister
route('DELETE', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  await env.DB.prepare(
    'DELETE FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Registrations: Confirm attendance
route('POST', '/api/training/proposals/:proposalId/attendance/:userId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  await env.DB.prepare(`
    UPDATE training_registrations
    SET attended = 1, attendance_confirmed_at = datetime('now')
    WHERE proposal_id = ? AND user_id = ?
  `).bind(params.proposalId, params.userId).run();

  return json({ success: true });
});

// Training Feedback: Add
route('POST', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Check if already submitted feedback
  const existing = await env.DB.prepare(
    'SELECT id FROM training_feedback WHERE proposal_id = ? AND reviewer_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Feedback already submitted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_feedback (
      id, proposal_id, reviewer_id, reviewer_name, is_anonymous,
      rating, content_rating, presenter_rating, usefulness_rating, comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.isAnonymous || body.is_anonymous ? 1 : 0,
    body.rating,
    body.contentRating || body.content_rating || null,
    body.presenterRating || body.presenter_rating || null,
    body.usefulnessRating || body.usefulness_rating || null,
    body.comment || null
  ).run();

  // Update partner's average rating
  const proposal = await env.DB.prepare('SELECT partner_id FROM training_proposals WHERE id = ?')
    .bind(params.proposalId).first() as any;

  if (proposal) {
    const avgRating = await env.DB.prepare(`
      SELECT AVG(rating) as avg FROM training_feedback f
      JOIN training_proposals p ON f.proposal_id = p.id
      WHERE p.partner_id = ?
    `).bind(proposal.partner_id).first() as any;

    await env.DB.prepare(`
      UPDATE training_partners SET average_rating = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(avgRating?.avg || 0, proposal.partner_id).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_feedback WHERE id = ?').bind(id).first();
  return json({ feedback: created }, 201);
});

// Training Feedback: Get for proposal
route('GET', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  const { results } = await env.DB.prepare(
    'SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC'
  ).bind(params.proposalId).all();

  return json({ feedback: results });
});

// Training Notifications: Get for user
route('GET', '/api/training/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = `
    SELECT * FROM training_notifications
    WHERE recipient_id = ? OR recipient_id = 'all'
  `;

  if (isAdminLevel(authUser)) {
    query = `
      SELECT * FROM training_notifications
      WHERE recipient_id = ? OR recipient_id = 'all' OR recipient_id = 'admin'
    `;
  }

  if (unreadOnly) {
    query += ' AND is_read = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(authUser.id).all();
  return json({ notifications: results });
});

// Training Notifications: Mark as read
route('POST', '/api/training/notifications/:id/read', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  await env.DB.prepare('UPDATE training_notifications SET is_read = 1 WHERE id = ?')
    .bind(params.id).run();

  return json({ success: true });
});

// Training Notifications: Mark all as read
route('POST', '/api/training/notifications/read-all', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  await env.DB.prepare(`
    UPDATE training_notifications SET is_read = 1
    WHERE recipient_id = ? OR recipient_id = 'all'
  `).bind(authUser.id).run();

  if (isAdminLevel(authUser)) {
    await env.DB.prepare(`
      UPDATE training_notifications SET is_read = 1 WHERE recipient_id = 'admin'
    `).run();
  }

  return json({ success: true });
});

// Training Settings: Get all
route('GET', '/api/training/settings', async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM training_settings').all();

  // Convert to object
  const settings: Record<string, any> = {};
  for (const row of results) {
    const r = row as any;
    // Parse boolean values
    if (r.value === 'true') settings[r.key] = true;
    else if (r.value === 'false') settings[r.key] = false;
    else if (!isNaN(Number(r.value))) settings[r.key] = Number(r.value);
    else settings[r.key] = r.value;
  }

  return json({ settings });
});

// Training Settings: Update
route('PATCH', '/api/training/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;

  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO training_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(key, String(value)).run();
  }

  return json({ success: true });
});

// Training Stats
route('GET', '/api/training/stats', async (request, env) => {
  const [
    totalProposals,
    votingProposals,
    scheduledTrainings,
    completedTrainings,
    totalVotes,
    totalRegistrations,
    avgRating
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM training_proposals').first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM training_proposals WHERE status = 'voting'").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM training_proposals WHERE status = 'scheduled'").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM training_proposals WHERE status = 'completed'").first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM training_votes').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM training_registrations').first(),
    env.DB.prepare('SELECT AVG(rating) as avg FROM training_feedback').first()
  ]);

  return json({
    stats: {
      totalProposals: (totalProposals as any)?.count || 0,
      votingProposals: (votingProposals as any)?.count || 0,
      scheduledTrainings: (scheduledTrainings as any)?.count || 0,
      completedTrainings: (completedTrainings as any)?.count || 0,
      totalVotes: (totalVotes as any)?.count || 0,
      totalParticipants: (totalRegistrations as any)?.count || 0,
      averageRating: (avgRating as any)?.avg || 0
    }
  });
});

// ==================== MEETING SYSTEM ROUTES ====================

// Helper: Generate vote hash
const generateVoteHash = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
};

// Helper: Generate OTP code
const generateOTPCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Meetings: List (with caching for performance)
route('GET', '/api/meetings', async (request, env) => {
  const url = new URL(request.url);
  let buildingId = url.searchParams.get('building_id');
  const status = url.searchParams.get('status');
  const organizerId = url.searchParams.get('organizer_id');
  const onlyActive = url.searchParams.get('only_active') === 'true'; // ✅ NEW: Filter for active meetings only

  // ✅ FIX: For residents, automatically filter by their building
  const authUser = await getUser(request, env);
  if (authUser?.role === 'resident' && authUser.building_id) {
    buildingId = authUser.building_id; // Force filter by user's building
  }

  // ✅ OPTIMIZED: Cache key includes only_active flag and user's building for residents
  const cacheKey = `meetings:${buildingId || 'all'}:${status || 'all'}:${organizerId || 'all'}:${onlyActive ? 'active' : 'all'}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return json({ meetings: cached });
  }

  let query = 'SELECT * FROM meetings WHERE 1=1';
  const params: any[] = [];

  if (buildingId) {
    query += ' AND building_id = ?';
    params.push(buildingId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (organizerId) {
    query += ' AND organizer_id = ?';
    params.push(organizerId);
  }

  // ✅ NEW: Filter only active meetings (includes draft for creators/admins)
  if (onlyActive) {
    query += ` AND status IN ('draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved')`;
  }

  // ✅ OPTIMIZED: Reduced limit for active-only queries
  const limit = onlyActive ? 20 : 50;
  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Batch fetch related data for all meetings at once (reduces N+1)
  const meetingIds = results.map((m: any) => m.id);

  if (meetingIds.length === 0) {
    return json({ meetings: [] });
  }

  // Parallel fetch all related data (including agenda votes)
  const [allOptions, allAgenda, allParticipation, allAgendaVotes] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) ORDER BY item_order`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT meeting_id, COUNT(*) as count FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) GROUP BY meeting_id`).bind(...meetingIds).all(),
    // Fetch agenda votes to show voting progress
    env.DB.prepare(`SELECT meeting_id, agenda_item_id, choice, voter_id FROM meeting_vote_records WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) AND is_revote = 0`).bind(...meetingIds).all()
  ]);

  // Get votes for options in batch (include vote_weight for proper weighting)
  const optionIds = (allOptions.results as any[]).map(o => o.id);
  let allVotes: any[] = [];
  if (optionIds.length > 0) {
    const votesResult = await env.DB.prepare(
      `SELECT option_id, voter_id, vote_weight FROM meeting_schedule_votes WHERE option_id IN (${optionIds.map(() => '?').join(',')})`
    ).bind(...optionIds).all();
    allVotes = votesResult.results as any[];
  }

  // Build lookup maps for O(1) access
  const optionsMap = new Map<string, any[]>();
  for (const opt of allOptions.results as any[]) {
    if (!optionsMap.has(opt.meeting_id)) optionsMap.set(opt.meeting_id, []);
    const optionVotes = allVotes.filter(v => v.option_id === opt.id);
    const totalWeight = optionVotes.reduce((sum, v) => sum + (v.vote_weight || 0), 0);
    optionsMap.get(opt.meeting_id)!.push({
      ...opt,
      votes: optionVotes.map(v => v.voter_id),
      voteWeight: totalWeight, // Total area (sq.m) voting for this option
      voteCount: optionVotes.length // Count of voters
    });
  }

  // Group agenda votes by meeting_id and agenda_item_id
  const agendaVotesMap = new Map<string, Map<string, { for: string[], against: string[], abstain: string[] }>>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!agendaVotesMap.has(vote.meeting_id)) {
      agendaVotesMap.set(vote.meeting_id, new Map());
    }
    const meetingVotes = agendaVotesMap.get(vote.meeting_id)!;
    if (!meetingVotes.has(vote.agenda_item_id)) {
      meetingVotes.set(vote.agenda_item_id, { for: [], against: [], abstain: [] });
    }
    const itemVotes = meetingVotes.get(vote.agenda_item_id)!;
    if (vote.choice in itemVotes) {
      itemVotes[vote.choice as 'for' | 'against' | 'abstain'].push(vote.voter_id);
    }
  }

  const agendaMap = new Map<string, any[]>();
  for (const item of allAgenda.results as any[]) {
    if (!agendaMap.has(item.meeting_id)) agendaMap.set(item.meeting_id, []);
    // Get votes for this agenda item
    const meetingVotes = agendaVotesMap.get(item.meeting_id);
    const itemVotes = meetingVotes?.get(item.id) || { for: [], against: [], abstain: [] };
    agendaMap.get(item.meeting_id)!.push({
      ...item,
      votes_for_area: itemVotes.for.length,
      votes_against_area: itemVotes.against.length,
      votes_abstain_area: itemVotes.abstain.length,
    });
  }

  const participationMap = new Map<string, number>();
  for (const p of allParticipation.results as any[]) {
    participationMap.set(p.meeting_id, p.count);
  }

  // Get list of participated voters for each meeting
  const participatedVotersResult = await env.DB.prepare(
    `SELECT meeting_id, user_id FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`
  ).bind(...meetingIds).all();

  const participatedVotersMap = new Map<string, string[]>();
  for (const p of participatedVotersResult.results as any[]) {
    if (!participatedVotersMap.has(p.meeting_id)) {
      participatedVotersMap.set(p.meeting_id, []);
    }
    participatedVotersMap.get(p.meeting_id)!.push(p.user_id);
  }

  // Build final response
  const meetingsWithDetails = results.map((m: any) => ({
    ...m,
    materials: m.materials ? JSON.parse(m.materials) : [],
    scheduleOptions: optionsMap.get(m.id) || [],
    agendaItems: agendaMap.get(m.id) || [],
    participated_count: participationMap.get(m.id) || 0,
    participated_voters: participatedVotersMap.get(m.id) || []
  }));

  // Cache for 10 seconds
  setCache(cacheKey, meetingsWithDetails, 10000);

  return json({ meetings: meetingsWithDetails });
});

// Meetings: Get by ID with full details
route('GET', '/api/meetings/:id', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // ✅ OPTIMIZED: Get all related data in parallel (batch queries)
  const [scheduleOptions, agendaItems, eligibleVoters, participatedVoters, allScheduleVotes, allAgendaVotes, protocol] = await Promise.all([
    env.DB.prepare('SELECT * FROM meeting_schedule_options WHERE meeting_id = ?').bind(params.id).all(),
    env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order').bind(params.id).all(),
    env.DB.prepare('SELECT user_id, apartment_id, ownership_share FROM meeting_eligible_voters WHERE meeting_id = ?').bind(params.id).all(),
    env.DB.prepare('SELECT user_id, first_vote_at FROM meeting_participated_voters WHERE meeting_id = ?').bind(params.id).all(),

    // ✅ NEW: Single query for ALL schedule votes (include vote_weight)
    env.DB.prepare(`
      SELECT option_id, voter_id, voter_name, vote_weight
      FROM meeting_schedule_votes
      WHERE meeting_id = ?
    `).bind(params.id).all(),

    // ✅ NEW: Single query for ALL agenda votes (include vote_weight, exclude revotes)
    env.DB.prepare(`
      SELECT agenda_item_id, choice, voter_id, vote_weight
      FROM meeting_vote_records
      WHERE meeting_id = ? AND is_revote = 0
    `).bind(params.id).all(),

    meeting.protocol_id ? env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() : null
  ]);

  // ✅ OPTIMIZED: Group votes in memory (O(n) instead of N+1 queries)
  // Group schedule votes by option_id with weights
  const votesByOption = new Map<string, { voters: string[], totalWeight: number }>();
  for (const vote of allScheduleVotes.results as any[]) {
    if (!votesByOption.has(vote.option_id)) {
      votesByOption.set(vote.option_id, { voters: [], totalWeight: 0 });
    }
    const optVotes = votesByOption.get(vote.option_id)!;
    optVotes.voters.push(vote.voter_id);
    optVotes.totalWeight += (vote.vote_weight || 0);
  }

  // Group agenda votes by item and choice with weights
  const votesByAgenda = new Map<string, {
    for: { voters: string[], weight: number },
    against: { voters: string[], weight: number },
    abstain: { voters: string[], weight: number }
  }>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!votesByAgenda.has(vote.agenda_item_id)) {
      votesByAgenda.set(vote.agenda_item_id, {
        for: { voters: [], weight: 0 },
        against: { voters: [], weight: 0 },
        abstain: { voters: [], weight: 0 }
      });
    }
    const agendaVotes = votesByAgenda.get(vote.agenda_item_id)!;
    const choice = vote.choice as 'for' | 'against' | 'abstain';
    if (choice in agendaVotes) {
      agendaVotes[choice].voters.push(vote.voter_id);
      agendaVotes[choice].weight += (vote.vote_weight || 0);
    }
  }

  // Calculate total voted weight for participation
  const totalVotedWeight = Array.from(votesByAgenda.values()).reduce((max, v) => {
    const itemTotal = v.for.weight + v.against.weight + v.abstain.weight;
    return Math.max(max, itemTotal);
  }, 0);

  // Build final result
  const optionsWithVotes = scheduleOptions.results.map((opt: any) => {
    const votes = votesByOption.get(opt.id) || { voters: [], totalWeight: 0 };
    return {
      ...opt,
      votes: votes.voters,
      voteWeight: votes.totalWeight,
      voteCount: votes.voters.length
    };
  });

  const agendaWithVotes = agendaItems.results.map((item: any) => {
    const votes = votesByAgenda.get(item.id) || {
      for: { voters: [], weight: 0 },
      against: { voters: [], weight: 0 },
      abstain: { voters: [], weight: 0 }
    };
    const totalItemWeight = votes.for.weight + votes.against.weight + votes.abstain.weight;
    return {
      ...item,
      // Return numeric weights for proper calculations
      votesFor: votes.for.weight,
      votesAgainst: votes.against.weight,
      votesAbstain: votes.abstain.weight,
      // Also include counts for display
      votesForCount: votes.for.voters.length,
      votesAgainstCount: votes.against.voters.length,
      votesAbstainCount: votes.abstain.voters.length,
      // Total for this item
      totalVotedWeight: totalItemWeight,
      // Voters for debugging/admin view
      votersFor: votes.for.voters,
      votersAgainst: votes.against.voters,
      votersAbstain: votes.abstain.voters
    };
  });

  // Calculate participation metrics
  const participationPercent = meeting.total_area > 0
    ? (totalVotedWeight / meeting.total_area) * 100
    : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meeting: {
      ...meeting,
      materials: meeting.materials ? JSON.parse(meeting.materials) : [],
      scheduleOptions: optionsWithVotes,
      agendaItems: agendaWithVotes,
      eligibleVoters: eligibleVoters.results.map((v: any) => v.user_id),
      participatedVoters: participatedVoters.results.map((v: any) => v.user_id),
      // Real-time calculated stats
      votedArea: totalVotedWeight,
      participationPercent,
      quorumReached,
      protocol
    }
  });
});

// Meetings: Create
route('POST', '/api/meetings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Get building settings
  const buildingId = body.building_id || body.buildingId;
  const settings = await env.DB.prepare(
    'SELECT * FROM meeting_building_settings WHERE building_id = ?'
  ).bind(buildingId).first() as any;

  const votingUnit = settings?.voting_unit || 'apartment';
  const quorumPercent = settings?.default_quorum_percent || 50;
  const requireModeration = settings?.require_moderation !== 0;

  // Calculate total_area from all residents in this building (sum of apartment_area)
  // This is critical for quorum calculation per Uzbekistan law
  const areaResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(apartment_area), 0) as total_area, COUNT(*) as total_count
    FROM users
    WHERE building_id = ? AND role = 'resident' AND apartment_area > 0
  `).bind(buildingId).first() as any;

  const totalArea = areaResult?.total_area || 0;
  const totalEligibleCount = areaResult?.total_count || 0;

  // Get meeting number for this building
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM meetings WHERE building_id = ?'
  ).bind(buildingId).first() as any;
  const meetingNumber = (countResult?.count || 0) + 1;

  // Initial status:
  // - For UK (management): directly open schedule poll
  // - For residents with moderation: draft (needs approval)
  // - For residents without moderation: schedule_poll_open
  const organizerType = body.organizer_type || body.organizerType || 'uk';
  let initialStatus = 'schedule_poll_open'; // Default: open poll immediately
  if (organizerType === 'resident' && requireModeration) {
    initialStatus = 'pending_moderation'; // Residents need approval
  }

  // Calculate schedule poll end date
  const pollDays = settings?.schedule_poll_duration_days || 3;
  const pollEndDate = new Date();
  pollEndDate.setDate(pollEndDate.getDate() + pollDays);
  pollEndDate.setHours(23, 59, 59, 999);

  // Set schedule_poll_opened_at if status is schedule_poll_open
  const schedulePollOpenedAt = initialStatus === 'schedule_poll_open' ? new Date().toISOString() : null;

  await env.DB.prepare(`
    INSERT INTO meetings (
      id, number, building_id, building_address, description,
      organizer_type, organizer_id, organizer_name,
      format, status,
      schedule_poll_ends_at, schedule_poll_opened_at,
      location,
      voting_unit, quorum_percent, allow_revote, require_otp, show_intermediate_results,
      materials,
      total_area, total_eligible_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    meetingNumber,
    buildingId,
    body.building_address || body.buildingAddress || '',
    body.description || null,
    organizerType,
    authUser.id,
    authUser.name,
    body.format || 'offline',
    initialStatus,
    pollEndDate.toISOString(),
    schedulePollOpenedAt,
    body.location || null,
    votingUnit,
    quorumPercent,
    1, // allow_revote
    1, // require_otp
    0, // show_intermediate_results
    JSON.stringify(body.materials || []),
    totalArea, // Total building area in sq.m for quorum calculation
    totalEligibleCount // Total number of eligible voters (residents with apartment_area)
  ).run();

  // Create schedule options (3 options, starting 10 days from now)
  const defaultTime = settings?.default_meeting_time || '19:00';
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 10);

  for (let i = 0; i < 3; i++) {
    const optionDate = new Date(baseDate);
    optionDate.setDate(optionDate.getDate() + i);
    const [hours, minutes] = defaultTime.split(':').map(Number);
    optionDate.setHours(hours, minutes, 0, 0);

    const optId = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_schedule_options (id, meeting_id, date_time)
      VALUES (?, ?, ?)
    `).bind(optId, id, optionDate.toISOString()).run();
  }

  // Create agenda items
  const agendaItems = body.agenda_items || body.agendaItems || [];
  for (let i = 0; i < agendaItems.length; i++) {
    const item = agendaItems[i];
    const itemId = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_items (id, meeting_id, item_order, title, description, threshold)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      itemId,
      id,
      i + 1,
      item.title,
      item.description || null,
      item.threshold || 'simple_majority'
    ).run();
  }

  // Invalidate meetings cache
  invalidateCache('meetings:');

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first() as any;

  // Send push notifications AND in-app notifications to building residents - meeting announced
  if (body.building_id && body.status === 'schedule_poll_open') {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', body.building_id).all();

    for (const resident of residents as any[]) {
      // In-app notification (stored in DB for viewing in app)
      const notifId = generateId();
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
        VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
      `).bind(
        notifId,
        resident.id,
        '📢 Новое собрание объявлено',
        `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
        JSON.stringify({ meetingId: id, url: '/meetings' })
      ).run();

      // Push notification
      await sendPushNotification(env, resident.id, {
        title: '📢 Новое собрание объявлено',
        body: `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
        type: 'meeting',
        tag: `meeting-announced-${id}`,
        data: {
          meetingId: id,
          url: '/meetings'
        },
        requireInteraction: true
      }).catch(() => {});
    }

    console.log(`[Meeting] Created meeting ${id}, sent notifications to ${residents.length} residents`);
  }

  return json({ meeting: created }, 201);
});

// Meetings: Update
route('PATCH', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'status', db: 'status' },
    { api: 'location', db: 'location' },
    { api: 'format', db: 'format' },
    { api: 'confirmedDateTime', db: 'confirmed_date_time' },
    { api: 'confirmed_date_time', db: 'confirmed_date_time' },
    { api: 'quorumPercent', db: 'quorum_percent' },
    { api: 'quorum_percent', db: 'quorum_percent' },
    { api: 'totalEligibleCount', db: 'total_eligible_count' },
    { api: 'total_eligible_count', db: 'total_eligible_count' },
    { api: 'participationPercent', db: 'participation_percent' },
    { api: 'participation_percent', db: 'participation_percent' },
    { api: 'cancellationReason', db: 'cancellation_reason' },
    { api: 'cancellation_reason', db: 'cancellation_reason' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.materials) {
    updates.push('materials = ?');
    values.push(JSON.stringify(body.materials));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    await env.DB.prepare(`
      UPDATE meetings SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Submit for moderation
route('POST', '/api/meetings/:id/submit', async (request, env, params) => {
  await env.DB.prepare(`
    UPDATE meetings SET status = 'pending_moderation', updated_at = datetime('now')
    WHERE id = ? AND status = 'draft'
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Approve
route('POST', '/api/meetings/:id/approve', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // Get meeting info before update
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        moderated_at = datetime('now'),
        moderated_by = ?,
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation'
  `).bind(authUser.id, params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  // Send push notifications AND in-app notifications to building residents - meeting announced
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    for (const resident of residents as any[]) {
      // In-app notification (stored in DB for viewing in app)
      const notifId = generateId();
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
        VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
      `).bind(
        notifId,
        resident.id,
        '📢 Новое собрание объявлено',
        `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        JSON.stringify({ meetingId: params.id, url: '/meetings' })
      ).run();

      // Push notification
      await sendPushNotification(env, resident.id, {
        title: '📢 Новое собрание объявлено',
        body: `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        type: 'meeting',
        tag: `meeting-announced-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Reject
route('POST', '/api/meetings/:id/reject', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation'
  `).bind(body.reason || 'Rejected by moderator', params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Open schedule poll
route('POST', '/api/meetings/:id/open-schedule-poll', async (request, env, params) => {
  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status IN ('draft', 'pending_moderation')
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Confirm schedule
route('POST', '/api/meetings/:id/confirm-schedule', async (request, env, params) => {
  const body = await request.json() as any;
  const selectedOptionId = body.option_id || body.optionId;

  let confirmedDateTime: string;
  let selectedOption: any;

  if (selectedOptionId) {
    const option = await env.DB.prepare(
      'SELECT date_time FROM meeting_schedule_options WHERE id = ?'
    ).bind(selectedOptionId).first() as any;
    confirmedDateTime = option?.date_time;
    selectedOption = option;
  } else {
    // Auto-select based on votes weighted by area (1 кв.м = 1 голос)
    const { results } = await env.DB.prepare(`
      SELECT o.id, o.date_time,
             COUNT(v.id) as vote_count,
             COALESCE(SUM(v.vote_weight), 0) as vote_weight_total
      FROM meeting_schedule_options o
      LEFT JOIN meeting_schedule_votes v ON o.id = v.option_id
      WHERE o.meeting_id = ?
      GROUP BY o.id
      ORDER BY vote_weight_total DESC, vote_count DESC
      LIMIT 1
    `).bind(params.id).all();
    selectedOption = results[0] as any;
    confirmedDateTime = selectedOption?.date_time;
  }

  if (!confirmedDateTime) {
    return error('No schedule option found', 400);
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_confirmed',
        confirmed_date_time = ?,
        schedule_confirmed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_poll_open'
  `).bind(confirmedDateTime, params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Open voting
route('POST', '/api/meetings/:id/open-voting', async (request, env, params) => {
  // Get meeting info before update
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_open',
        voting_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_confirmed'
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id);

  // Send push notifications to building residents - voting opened
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    for (const resident of residents as any[]) {
      await sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование открыто!',
        body: `Голосование на собрании жильцов дома ${meeting.building_address || ''} началось. Примите участие!`,
        type: 'meeting',
        tag: `meeting-voting-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Close voting
route('POST', '/api/meetings/:id/close-voting', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Meeting not found or voting not open', 400);
  }

  // Calculate participation by AREA (кв.м) according to Uzbekistan law
  // Quorum = SUM of voted area / total building area >= quorum_percent
  const [votedAreaResult, participatedCount] = await Promise.all([
    env.DB.prepare('SELECT COALESCE(SUM(vote_weight), 0) as voted_area FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0').bind(params.id).first(),
    env.DB.prepare('SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).first()
  ]) as any[];

  const votedArea = votedAreaResult?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participated = participatedCount?.count || 0;

  // Quorum by AREA (as per Uzbekistan law: 1 sq.m = 1 vote)
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= meeting.quorum_percent;

  // Calculate results for each agenda item using AREA-based voting
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ?'
  ).bind(params.id).all();

  for (const item of agendaItems) {
    const i = item as any;
    // Get votes weighted by area (кв.м)
    const [votesFor, votesAgainst, votesAbstain] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain' AND is_revote = 0").bind(i.id).first()
    ]) as any[];

    const forWeight = votesFor?.weight || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotedWeight = forWeight + againstWeight + abstainWeight;

    let isApproved = 0;

    if (quorumReached && totalVotedWeight > 0) {
      if (i.threshold === 'qualified_majority' || i.threshold === 'two_thirds') {
        // Квалифицированное большинство: 2/3 от ОБЩЕЙ площади дома
        isApproved = forWeight >= (totalArea * 2 / 3) ? 1 : 0;
      } else if (i.threshold === 'three_quarters') {
        // 3/4 от общей площади
        isApproved = forWeight >= (totalArea * 3 / 4) ? 1 : 0;
      } else if (i.threshold === 'unanimous') {
        // Единогласно
        isApproved = (againstWeight === 0 && abstainWeight === 0 && forWeight > 0) ? 1 : 0;
      } else {
        // simple_majority: более 50% от проголосовавших
        isApproved = forWeight > (totalVotedWeight / 2) ? 1 : 0;
      }
    }

    // Update agenda item with vote totals (using _area columns per schema)
    await env.DB.prepare(`
      UPDATE meeting_agenda_items
      SET is_approved = ?,
          votes_for_area = ?,
          votes_against_area = ?,
          votes_abstain_area = ?
      WHERE id = ?
    `).bind(isApproved, forWeight, againstWeight, abstainWeight, i.id).run();
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_closed',
        voting_closed_at = datetime('now'),
        participated_count = ?,
        voted_area = ?,
        participation_percent = ?,
        quorum_reached = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(participated, votedArea, participationPercent, quorumReached ? 1 : 0, params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id);

  // Send push notifications to building residents - voting closed, results ready
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    const quorumStatus = quorumReached ? 'Кворум достигнут!' : 'Кворум не достигнут.';
    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование завершено',
        body: `Голосование по собранию жильцов завершено. ${quorumStatus} Участие: ${participationPercent.toFixed(1)}%`,
        type: 'meeting',
        tag: `meeting-closed-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Publish results
route('POST', '/api/meetings/:id/publish-results', async (request, env, params) => {
  // Get meeting info before update
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'results_published',
        results_published_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'voting_closed'
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id);

  // Send push notifications to building residents - results published
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '📊 Результаты голосования опубликованы',
        body: `Результаты собрания жильцов ${meeting.building_address || ''} доступны для просмотра.`,
        type: 'meeting',
        tag: `meeting-results-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Generate protocol
route('POST', '/api/meetings/:id/generate-protocol', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only admin, director, manager can generate protocol
  if (!['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocolId = generateId();
  const protocolNumber = `${meeting.number}/${new Date().getFullYear()}`;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.id).all();

  // Build protocol content
  let content = `# ПРОТОКОЛ №${meeting.number}\n`;
  content += `## Общего собрания собственников помещений\n`;
  content += `### ${meeting.building_address}\n\n`;
  content += `**Дата проведения:** ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU') : 'Не указана'}\n\n`;
  content += `**Формат:** ${meeting.format === 'online' ? 'Онлайн' : meeting.format === 'offline' ? 'Очное' : 'Смешанное'}\n\n`;
  content += `**Организатор:** ${meeting.organizer_name}\n\n`;
  content += `---\n\n## КВОРУМ\n\n`;
  content += `- Общая площадь дома: ${meeting.total_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Площадь проголосовавших: ${meeting.voted_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Количество проголосовавших: ${meeting.participated_count || 0} чел.\n`;
  content += `- Процент участия (по площади): ${meeting.participation_percent?.toFixed(1) || 0}%\n`;
  content += `- Кворум ${meeting.quorum_reached ? '**ДОСТИГНУТ**' : '**НЕ ДОСТИГНУТ**'}\n\n`;
  content += `---\n\n## ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ\n\n`;

  for (const item of agendaItems) {
    const i = item as any;
    // ✅ FIX: Add is_revote = 0 filter to exclude revoted records
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? AND include_in_protocol = 1 ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotes = forCount + againstCount + abstainCount;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // ✅ FIX: Calculate percentages by WEIGHT (sq.m), not by vote count
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    // Determine threshold label
    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (>60%)',
      two_thirds: '2/3 голосов (>66.67%)',
      three_quarters: '3/4 голосов (>75%)',
      unanimous: 'Единогласно (100%)'
    };

    content += `### ${i.item_order}. ${i.title}\n\n`;
    if (i.description) content += `${i.description}\n\n`;
    content += `**Порог принятия:** ${thresholdLabels[i.threshold] || 'Простое большинство'}\n\n`;
    content += `**Результаты голосования:**\n`;
    // ✅ FIX: Show correct percentages by area (weight), and show all percentages
    content += `- За: ${forCount} голосов (${forWeight.toFixed(2)} кв.м, ${percentForByWeight.toFixed(1)}%)\n`;
    content += `- Против: ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м, ${percentAgainstByWeight.toFixed(1)}%)\n`;
    content += `- Воздержались: ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м, ${percentAbstainByWeight.toFixed(1)}%)\n\n`;

    // Include comments if any
    if (comments.results && comments.results.length > 0) {
      content += `**Доводы и комментарии участников:**\n\n`;
      for (const c of comments.results) {
        const comment = c as any;
        content += `> "${comment.content}"\n`;
        content += `> — ${comment.resident_name}${comment.apartment_number ? `, кв. ${comment.apartment_number}` : ''}\n\n`;
      }
    }

    content += `**РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}**\n\n`;
  }

  // Add participants list (exclude revoted records)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT voter_id, voter_name, apartment_number, vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0
    GROUP BY voter_id ORDER BY voter_name
  `).bind(params.id).all();

  content += `---\n\n## ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ\n\n`;
  content += `| № | ФИО | Квартира | Площадь (кв.м) | Время голоса |\n`;
  content += `|---|-----|----------|----------------|---------------|\n`;
  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    content += `| ${idx + 1} | ${v.voter_name} | ${v.apartment_number || '-'} | ${v.vote_weight || '-'} | ${new Date(v.voted_at).toLocaleString('ru-RU')} |\n`;
  }

  content += `\n---\n\n## ПОДПИСИ\n\n`;
  content += `Протокол сформирован автоматически системой УК\n`;
  content += `Дата формирования: ${new Date().toLocaleString('ru-RU')}\n`;
  content += `\n_Председатель собрания: ____________________\n`;
  content += `\n_Секретарь: ____________________\n`;
  content += `\n_Члены счётной комиссии: ____________________\n`;

  const protocolHash = generateVoteHash({ meetingId: params.id, generatedAt: new Date().toISOString() });

  await env.DB.prepare(`
    INSERT INTO meeting_protocols (id, meeting_id, protocol_number, content, protocol_hash)
    VALUES (?, ?, ?, ?, ?)
  `).bind(protocolId, params.id, protocolNumber, content, protocolHash).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_generated',
        protocol_id = ?,
        protocol_generated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(protocolId, params.id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(protocolId).first();
  return json({ protocol }, 201);
});

// Meetings: Approve protocol
route('POST', '/api/meetings/:id/approve-protocol', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const meeting = await env.DB.prepare('SELECT protocol_id FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const signatureHash = generateVoteHash({ userId: authUser.id, signedAt: new Date().toISOString() });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET signed_by_uk_user_id = ?,
        signed_by_uk_name = ?,
        signed_by_uk_role = ?,
        signed_by_uk_at = datetime('now'),
        uk_signature_hash = ?
    WHERE id = ?
  `).bind(authUser.id, authUser.name, authUser.role, signatureHash, meeting.protocol_id).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_approved',
        protocol_approved_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Protocol: Sign as chairman (resident who leads the meeting)
route('POST', '/api/meetings/:id/protocol/sign-chairman', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const meeting = await env.DB.prepare('SELECT protocol_id, building_id FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  // Get user's apartment info
  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'chairman',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET chairman_user_id = ?,
        chairman_name = ?,
        chairman_apartment = ?,
        chairman_signed_at = datetime('now'),
        chairman_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Protocol: Sign as secretary
route('POST', '/api/meetings/:id/protocol/sign-secretary', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const meeting = await env.DB.prepare('SELECT protocol_id, building_id FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'secretary',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET secretary_user_id = ?,
        secretary_name = ?,
        secretary_apartment = ?,
        secretary_signed_at = datetime('now'),
        secretary_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Protocol: Set counting commission members
route('POST', '/api/meetings/:id/protocol/counting-commission', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const meeting = await env.DB.prepare('SELECT protocol_id FROM meetings WHERE id = ?')
    .bind(params.id).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  // body.members should be array of { userId, name, apartment }
  const members = body.members || [];

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET counting_commission = ?
    WHERE id = ?
  `).bind(JSON.stringify(members), meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Meetings: Cancel
route('POST', '/api/meetings/:id/cancel', async (request, env, params) => {
  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.reason || 'Cancelled', params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Delete
route('DELETE', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  await env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(params.id).run();
  invalidateCache('meetings:');
  return json({ success: true });
});

// Schedule voting
route('POST', '/api/meetings/:meetingId/schedule-votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const optionId = body.option_id || body.optionId;

  // Get meeting info and user's apartment area for weighted voting
  const meeting = await env.DB.prepare(
    'SELECT building_id FROM meetings WHERE id = ?'
  ).bind(params.meetingId).first() as any;

  if (!meeting) {
    return error('Собрание не найдено', 404);
  }

  // Get user's apartment area for vote weight (default to 50 if not set)
  const userInfo = await env.DB.prepare(
    'SELECT apartment_area FROM users WHERE id = ?'
  ).bind(authUser.id).first() as any;

  // Use 50 as default if apartment_area is not set
  const voteWeight = userInfo?.apartment_area || 50;

  // Remove existing vote and add new one (upsert)
  await env.DB.prepare(
    'DELETE FROM meeting_schedule_votes WHERE meeting_id = ? AND voter_id = ?'
  ).bind(params.meetingId, authUser.id).run();

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_schedule_votes (id, meeting_id, option_id, voter_id, voter_name, vote_weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, params.meetingId, optionId, authUser.id, authUser.name, voteWeight).run();

  // Update meeting's updated_at to trigger WebSocket broadcast
  await env.DB.prepare(`
    UPDATE meetings SET updated_at = datetime('now') WHERE id = ?
  `).bind(params.meetingId).run();

  invalidateCache('meetings:');

  return json({ success: true, voteWeight });
});

// Get schedule vote by user
route('GET', '/api/meetings/:meetingId/schedule-votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const vote = await env.DB.prepare(
    'SELECT option_id FROM meeting_schedule_votes WHERE meeting_id = ? AND voter_id = ?'
  ).bind(params.meetingId, authUser.id).first() as any;

  return json({ optionId: vote?.option_id || null });
});

// Agenda voting
route('POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Check if meeting is open for voting
  const meeting = await env.DB.prepare(
    'SELECT status, require_otp, building_id, allow_revote FROM meetings WHERE id = ?'
  ).bind(params.meetingId).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Voting is not open', 400);
  }

  // Check if user is eligible to vote (must be resident of this building)
  const eligibleVoter = await env.DB.prepare(`
    SELECT ev.*, u.apartment, u.apartment_area
    FROM meeting_eligible_voters ev
    JOIN users u ON u.id = ev.user_id
    WHERE ev.meeting_id = ? AND ev.user_id = ?
  `).bind(params.meetingId, authUser.id).first() as any;

  // If no explicit eligible voters list, check if user is resident of the building
  let apartmentArea = body.ownership_share || body.ownershipShare || null;
  let apartmentNumber = body.apartment_number || body.apartmentNumber || null;

  if (!eligibleVoter) {
    // Check if user is resident of the meeting's building
    const userBuilding = await env.DB.prepare(
      'SELECT apartment, apartment_area FROM users WHERE id = ? AND building_id = ? AND role = ?'
    ).bind(authUser.id, meeting.building_id, 'resident').first() as any;

    if (!userBuilding) {
      return error('You are not eligible to vote in this meeting', 403);
    }

    apartmentArea = apartmentArea || userBuilding.apartment_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || userBuilding.apartment;
  } else {
    // Use eligible voter data or user's apartment area
    apartmentArea = apartmentArea || eligibleVoter.apartment_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || eligibleVoter.apartment;
  }

  // Check for existing vote
  const existingVote = await env.DB.prepare(
    'SELECT id, choice FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ? AND voter_id = ? AND is_revote = 0'
  ).bind(params.meetingId, params.agendaItemId, authUser.id).first() as any;

  // Create vote hash for audit trail
  const voteHash = generateVoteHash({
    meetingId: params.meetingId,
    agendaItemId: params.agendaItemId,
    voterId: authUser.id,
    choice: body.choice,
    votedAt: new Date().toISOString()
  });

  if (existingVote) {
    // Check if revote is allowed
    if (!meeting.allow_revote) {
      return error('Revoting is not allowed for this meeting', 400);
    }

    // Mark old vote as revoted and create new vote
    await env.DB.prepare(`
      UPDATE meeting_vote_records
      SET is_revote = 1
      WHERE id = ?
    `).bind(existingVote.id).run();

    // Insert new vote with reference to previous
    const newId = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_vote_records (
        id, meeting_id, agenda_item_id,
        voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight,
        choice, verification_method, otp_verified, vote_hash, previous_vote_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      params.meetingId,
      params.agendaItemId,
      authUser.id,
      authUser.name,
      body.apartment_id || body.apartmentId || null,
      apartmentNumber,
      apartmentArea,
      apartmentArea, // vote_weight = apartment area in sq.m
      body.choice,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      voteHash,
      existingVote.id
    ).run();
  } else {
    // Insert new vote with vote_weight = apartment area
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_vote_records (
        id, meeting_id, agenda_item_id,
        voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight,
        choice, verification_method, otp_verified, vote_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      params.meetingId,
      params.agendaItemId,
      authUser.id,
      authUser.name,
      body.apartment_id || body.apartmentId || null,
      apartmentNumber,
      apartmentArea,
      apartmentArea, // vote_weight = apartment area in sq.m (1 кв.м = 1 голос)
      body.choice,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      voteHash
    ).run();

    // Track participated voter
    await env.DB.prepare(`
      INSERT OR IGNORE INTO meeting_participated_voters (meeting_id, user_id)
      VALUES (?, ?)
    `).bind(params.meetingId, authUser.id).run();
  }

  // Save comment/reasoning if provided
  const comment = body.comment?.trim();
  if (comment && comment.length > 0) {
    const commentId = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_comments (
        id, agenda_item_id, meeting_id, resident_id, resident_name,
        apartment_number, content, include_in_protocol
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      commentId,
      params.agendaItemId,
      params.meetingId,
      authUser.id,
      authUser.name,
      apartmentNumber,
      comment
    ).run();
  }

  return json({ success: true, voteHash, voteWeight: apartmentArea });
});

// Get user's votes for meeting
route('GET', '/api/meetings/:meetingId/votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ?'
  ).bind(params.meetingId, authUser.id).all();

  return json({ votes: results });
});

// Real-time voting stats (for polling during active voting)
route('GET', '/api/meetings/:meetingId/stats', async (request, env, params) => {
  const meeting = await env.DB.prepare(
    'SELECT id, status, total_area, quorum_percent, voted_area, participation_percent, quorum_reached FROM meetings WHERE id = ?'
  ).bind(params.meetingId).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get current voting stats by area
  const [votedAreaResult, participantCount, agendaStats] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(vote_weight), 0) as voted_area
      FROM meeting_vote_records
      WHERE meeting_id = ? AND is_revote = 0
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT COUNT(DISTINCT voter_id) as count
      FROM meeting_vote_records
      WHERE meeting_id = ?
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT
        ai.id,
        ai.title,
        ai.threshold,
        COALESCE(SUM(CASE WHEN vr.choice = 'for' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_for,
        COALESCE(SUM(CASE WHEN vr.choice = 'against' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_against,
        COALESCE(SUM(CASE WHEN vr.choice = 'abstain' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_abstain,
        COUNT(DISTINCT CASE WHEN vr.is_revote = 0 THEN vr.voter_id END) as voter_count
      FROM meeting_agenda_items ai
      LEFT JOIN meeting_vote_records vr ON vr.agenda_item_id = ai.id
      WHERE ai.meeting_id = ?
      GROUP BY ai.id
      ORDER BY ai.item_order
    `).bind(params.meetingId).all()
  ]) as any[];

  const votedArea = (votedAreaResult as any)?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meetingId: params.meetingId,
    status: meeting.status,
    totalArea,
    votedArea,
    participationPercent: Math.round(participationPercent * 100) / 100,
    quorumPercent: meeting.quorum_percent || 50,
    quorumReached,
    participantCount: (participantCount as any)?.count || 0,
    agendaItems: (agendaStats.results || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      threshold: item.threshold,
      votesFor: item.votes_for || 0,
      votesAgainst: item.votes_against || 0,
      votesAbstain: item.votes_abstain || 0,
      voterCount: item.voter_count || 0,
      totalVoted: (item.votes_for || 0) + (item.votes_against || 0) + (item.votes_abstain || 0)
    })),
    timestamp: new Date().toISOString()
  });
});

// OTP: Request
route('POST', '/api/meetings/otp/request', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const code = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_otp_records (
      id, user_id, phone, code, purpose, meeting_id, agenda_item_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    authUser.id,
    body.phone || authUser.phone,
    code,
    body.purpose || 'agenda_vote',
    body.meeting_id || body.meetingId || null,
    body.agenda_item_id || body.agendaItemId || null,
    expiresAt.toISOString()
  ).run();

  // In production, send SMS here
  console.log(`[OTP] Code ${code} sent to ${body.phone || authUser.phone} for user ${authUser.id}`);

  return json({ otpId: id, expiresAt: expiresAt.toISOString() });
});

// OTP: Verify
route('POST', '/api/meetings/otp/verify', async (request, env) => {
  const body = await request.json() as any;
  const otpId = body.otp_id || body.otpId;
  const code = body.code;

  const otp = await env.DB.prepare(
    'SELECT * FROM meeting_otp_records WHERE id = ?'
  ).bind(otpId).first() as any;

  if (!otp) {
    return json({ verified: false, error: 'OTP not found' });
  }

  if (otp.is_used) {
    return json({ verified: false, error: 'OTP already used' });
  }

  if (new Date(otp.expires_at) < new Date()) {
    return json({ verified: false, error: 'OTP expired' });
  }

  if (otp.attempts >= otp.max_attempts) {
    return json({ verified: false, error: 'Max attempts exceeded' });
  }

  if (otp.code === code) {
    await env.DB.prepare(`
      UPDATE meeting_otp_records
      SET is_used = 1, verified_at = datetime('now')
      WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: true });
  } else {
    await env.DB.prepare(`
      UPDATE meeting_otp_records SET attempts = attempts + 1 WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: false, error: 'Invalid code' });
  }
});

// Building settings: Get
route('GET', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const settings = await env.DB.prepare(
    'SELECT * FROM meeting_building_settings WHERE building_id = ?'
  ).bind(params.buildingId).first();

  if (!settings) {
    // Return defaults
    return json({
      settings: {
        building_id: params.buildingId,
        voting_unit: 'apartment',
        default_quorum_percent: 50,
        schedule_poll_duration_days: 3,
        voting_duration_hours: 48,
        allow_resident_initiative: 1,
        require_moderation: 1,
        default_meeting_time: '19:00',
        reminder_hours_before: [48, 2],
        notification_channels: ['in_app', 'push']
      }
    });
  }

  return json({
    settings: {
      ...settings,
      reminder_hours_before: settings.reminder_hours_before ? JSON.parse(settings.reminder_hours_before as string) : [48, 2],
      notification_channels: settings.notification_channels ? JSON.parse(settings.notification_channels as string) : ['in_app', 'push']
    }
  });
});

// Building settings: Update
route('PATCH', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;

  // Check if settings exist
  const existing = await env.DB.prepare(
    'SELECT building_id FROM meeting_building_settings WHERE building_id = ?'
  ).bind(params.buildingId).first();

  if (existing) {
    const updates: string[] = [];
    const values: any[] = [];

    const fields = [
      { api: 'votingUnit', db: 'voting_unit' },
      { api: 'voting_unit', db: 'voting_unit' },
      { api: 'defaultQuorumPercent', db: 'default_quorum_percent' },
      { api: 'default_quorum_percent', db: 'default_quorum_percent' },
      { api: 'schedulePollDurationDays', db: 'schedule_poll_duration_days' },
      { api: 'schedule_poll_duration_days', db: 'schedule_poll_duration_days' },
      { api: 'votingDurationHours', db: 'voting_duration_hours' },
      { api: 'voting_duration_hours', db: 'voting_duration_hours' },
      { api: 'defaultMeetingTime', db: 'default_meeting_time' },
      { api: 'default_meeting_time', db: 'default_meeting_time' },
    ];

    for (const field of fields) {
      if (body[field.api] !== undefined) {
        updates.push(`${field.db} = ?`);
        values.push(body[field.api]);
      }
    }

    if (body.allowResidentInitiative !== undefined || body.allow_resident_initiative !== undefined) {
      updates.push('allow_resident_initiative = ?');
      values.push((body.allowResidentInitiative || body.allow_resident_initiative) ? 1 : 0);
    }

    if (body.requireModeration !== undefined || body.require_moderation !== undefined) {
      updates.push('require_moderation = ?');
      values.push((body.requireModeration || body.require_moderation) ? 1 : 0);
    }

    if (body.reminderHoursBefore || body.reminder_hours_before) {
      updates.push('reminder_hours_before = ?');
      values.push(JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before));
    }

    if (body.notificationChannels || body.notification_channels) {
      updates.push('notification_channels = ?');
      values.push(JSON.stringify(body.notificationChannels || body.notification_channels));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(params.buildingId);

      await env.DB.prepare(`
        UPDATE meeting_building_settings SET ${updates.join(', ')} WHERE building_id = ?
      `).bind(...values).run();
    }
  } else {
    // Insert new
    await env.DB.prepare(`
      INSERT INTO meeting_building_settings (
        building_id, voting_unit, default_quorum_percent,
        schedule_poll_duration_days, voting_duration_hours,
        allow_resident_initiative, require_moderation,
        default_meeting_time, reminder_hours_before, notification_channels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      params.buildingId,
      body.votingUnit || body.voting_unit || 'apartment',
      body.defaultQuorumPercent || body.default_quorum_percent || 50,
      body.schedulePollDurationDays || body.schedule_poll_duration_days || 3,
      body.votingDurationHours || body.voting_duration_hours || 48,
      (body.allowResidentInitiative || body.allow_resident_initiative) !== false ? 1 : 0,
      (body.requireModeration || body.require_moderation) !== false ? 1 : 0,
      body.defaultMeetingTime || body.default_meeting_time || '19:00',
      JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before || [48, 2]),
      JSON.stringify(body.notificationChannels || body.notification_channels || ['in_app', 'push'])
    ).run();
  }

  const updated = await env.DB.prepare(
    'SELECT * FROM meeting_building_settings WHERE building_id = ?'
  ).bind(params.buildingId).first();

  return json({ settings: updated });
});

// Voting units: List by building
route('GET', '/api/meetings/voting-units', async (request, env) => {
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || url.searchParams.get('buildingId');

  if (!buildingId) {
    return error('building_id required', 400);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_voting_units WHERE building_id = ? ORDER BY apartment_number'
  ).bind(buildingId).all();

  return json({
    votingUnits: results.map((u: any) => ({
      ...u,
      coOwnerIds: u.co_owner_ids ? JSON.parse(u.co_owner_ids) : []
    }))
  });
});

// Voting units: Create
route('POST', '/api/meetings/voting-units', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meeting_voting_units (
      id, building_id, apartment_id, apartment_number,
      owner_id, owner_name, co_owner_ids,
      ownership_share, total_area
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.building_id || body.buildingId,
    body.apartment_id || body.apartmentId || null,
    body.apartment_number || body.apartmentNumber,
    body.owner_id || body.ownerId || null,
    body.owner_name || body.ownerName || null,
    JSON.stringify(body.co_owner_ids || body.coOwnerIds || []),
    body.ownership_share || body.ownershipShare || 100,
    body.total_area || body.totalArea || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(id).first();
  return json({ votingUnit: created }, 201);
});

// Voting units: Verify
route('POST', '/api/meetings/voting-units/:id/verify', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  await env.DB.prepare(`
    UPDATE meeting_voting_units
    SET is_verified = 1, verified_at = datetime('now'), verified_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(authUser.id, params.id).run();

  const updated = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(params.id).first();
  return json({ votingUnit: updated });
});

// Eligible voters: Set for meeting
route('POST', '/api/meetings/:meetingId/eligible-voters', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const voters = body.voters || [];

  // Clear existing
  await env.DB.prepare(
    'DELETE FROM meeting_eligible_voters WHERE meeting_id = ?'
  ).bind(params.meetingId).run();

  // Insert new
  for (const voter of voters) {
    await env.DB.prepare(`
      INSERT INTO meeting_eligible_voters (meeting_id, user_id, apartment_id, ownership_share)
      VALUES (?, ?, ?, ?)
    `).bind(
      params.meetingId,
      voter.user_id || voter.userId,
      voter.apartment_id || voter.apartmentId || null,
      voter.ownership_share || voter.ownershipShare || 100
    ).run();
  }

  // Update total count
  await env.DB.prepare(`
    UPDATE meetings SET total_eligible_count = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(voters.length, params.meetingId).run();

  return json({ success: true, count: voters.length });
});

// Get vote records for meeting (audit)
route('GET', '/api/meetings/:meetingId/vote-records', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voted_at'
  ).bind(params.meetingId).all();

  return json({ voteRecords: results });
});

// Get protocol
route('GET', '/api/meetings/:meetingId/protocol', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT protocol_id FROM meetings WHERE id = ?')
    .bind(params.meetingId).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?')
    .bind(meeting.protocol_id).first();

  return json({ protocol });
});

// Get protocol as HTML (for PDF generation on client side)
route('GET', '/api/meetings/:meetingId/protocol/html', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.meetingId).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get vote records
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT voter_id, voter_name, apartment_number, vote_weight, voted_at
    FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build HTML for PDF
  let html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Протокол собрания №${meeting.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; padding: 20mm; max-width: 210mm; }
    h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; }
    h2 { font-size: 14pt; margin: 20px 0 10px; border-bottom: 1px solid #333; padding-bottom: 5px; }
    h3 { font-size: 12pt; margin: 15px 0 8px; }
    p { margin: 5px 0; }
    .header { text-align: center; margin-bottom: 30px; }
    .header p { margin: 3px 0; }
    .section { margin: 15px 0; }
    .quorum { background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; }
    .quorum.reached { background: #e8f5e9; border-left: 4px solid #4caf50; }
    .quorum.not-reached { background: #ffebee; border-left: 4px solid #f44336; }
    .agenda-item { margin: 15px 0; padding: 10px; background: #fafafa; border-radius: 5px; }
    .votes { display: flex; gap: 20px; margin: 10px 0; }
    .vote-block { flex: 1; }
    .decision { font-weight: bold; font-size: 14pt; margin: 10px 0; padding: 8px; text-align: center; }
    .decision.approved { background: #e8f5e9; color: #2e7d32; }
    .decision.rejected { background: #ffebee; color: #c62828; }
    .comments { margin: 10px 0; padding: 10px; background: #fff8e1; border-left: 3px solid #ffc107; }
    .comment { margin: 8px 0; font-style: italic; }
    .comment-author { font-size: 10pt; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; }
    .signatures { margin-top: 40px; }
    .signature-line { margin: 20px 0; display: flex; justify-content: space-between; }
    .signature-line span { border-bottom: 1px solid #333; min-width: 200px; display: inline-block; }
    .footer { margin-top: 30px; font-size: 10pt; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
    @media print {
      body { padding: 15mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><strong>Общего собрания собственников помещений</strong></p>
    <p>многоквартирного дома по адресу:</p>
    <p><strong>${meeting.building_address || 'Адрес не указан'}</strong></p>
  </div>

  <div class="section">
    <p><strong>Дата проведения:</strong> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><strong>Форма проведения:</strong> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><strong>Инициатор собрания:</strong> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum ${meeting.quorum_reached ? 'reached' : 'not-reached'}">
    <p><strong>Общая площадь помещений дома:</strong> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><strong>Площадь проголосовавших:</strong> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><strong>Количество правомочных голосующих:</strong> ${meeting.total_eligible_count || 0}</p>
    <p><strong>Приняло участие:</strong> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><strong>Кворум:</strong> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for'").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against'").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain'").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? AND include_in_protocol = 1 ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotes = forCount + againstCount + abstainCount;
    const percentFor = totalVotes > 0 ? (forCount / totalVotes) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    html += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><em>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</em></p>

    <div class="votes">
      <div class="vote-block">
        <strong>ЗА:</strong> ${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentFor.toFixed(1)}%
      </div>
      <div class="vote-block">
        <strong>ПРОТИВ:</strong> ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м)
      </div>
      <div class="vote-block">
        <strong>ВОЗДЕРЖАЛИСЬ:</strong> ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м)
      </div>
    </div>
`;

    // Add comments
    if (comments.results && comments.results.length > 0) {
      html += `
    <div class="comments">
      <p><strong>Доводы участников:</strong></p>
`;
      for (const c of comments.results) {
        const comment = c as any;
        html += `
      <div class="comment">
        "${comment.content}"
        <div class="comment-author">— ${comment.resident_name}${comment.apartment_number ? `, кв. ${comment.apartment_number}` : ''}</div>
      </div>
`;
      }
      html += `    </div>`;
    }

    html += `
    <div class="decision ${i.is_approved ? 'approved' : 'rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  html += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>ФИО</th>
        <th>Квартира</th>
        <th>Площадь (кв.м)</th>
        <th>Время голосования</th>
      </tr>
    </thead>
    <tbody>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${v.voter_name}</td>
        <td>${v.apartment_number || '-'}</td>
        <td>${v.vote_weight || '-'}</td>
        <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
      </tr>
`;
  }

  html += `
    </tbody>
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <span>Председатель собрания:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Секретарь:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Члены счётной комиссии:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>

  <script class="no-print">
    // Auto-print when opened
    // window.onload = () => window.print();
  </script>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': currentCorsOrigin,
    }
  });
});

// Get protocol as DOC file (Word document)
route('GET', '/api/meetings/:meetingId/protocol/doc', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.meetingId).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get vote records
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT voter_id, voter_name, apartment_number, vote_weight, voted_at
    FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build Word-compatible HTML (MHTML format for better Word compatibility)
  let docContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
    }
    h1 {
      text-align: center;
      font-size: 16pt;
      margin-bottom: 10pt;
    }
    h2 {
      font-size: 14pt;
      margin-top: 20pt;
      margin-bottom: 10pt;
      border-bottom: 1pt solid #333;
      padding-bottom: 5pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 15pt;
      margin-bottom: 8pt;
    }
    p {
      margin: 5pt 0;
    }
    .header {
      text-align: center;
      margin-bottom: 30pt;
    }
    .section {
      margin: 15pt 0;
    }
    .quorum {
      background-color: #f5f5f5;
      padding: 10pt;
      margin: 10pt 0;
      border-left: 4pt solid #4caf50;
    }
    .agenda-item {
      margin: 15pt 0;
      padding: 10pt;
      background-color: #fafafa;
    }
    .decision {
      font-weight: bold;
      font-size: 14pt;
      margin: 10pt 0;
      padding: 8pt;
      text-align: center;
    }
    .decision-approved {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    .decision-rejected {
      background-color: #ffebee;
      color: #c62828;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 10pt;
    }
    th, td {
      border: 1pt solid #333;
      padding: 5pt 8pt;
      text-align: left;
    }
    th {
      background-color: #f0f0f0;
    }
    .signatures {
      margin-top: 40pt;
    }
    .signature-line {
      margin: 30pt 0;
    }
    .footer {
      margin-top: 30pt;
      font-size: 10pt;
      color: #666;
      text-align: center;
      border-top: 1pt solid #ccc;
      padding-top: 10pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><b>Общего собрания собственников помещений</b></p>
    <p>многоквартирного дома по адресу:</p>
    <p><b>${meeting.building_address || 'Адрес не указан'}</b></p>
  </div>

  <div class="section">
    <p><b>Дата проведения:</b> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><b>Форма проведения:</b> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><b>Инициатор собрания:</b> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum">
    <p><b>Общая площадь помещений дома:</b> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><b>Площадь проголосовавших:</b> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><b>Количество правомочных голосующих:</b> ${meeting.total_eligible_count || 0}</p>
    <p><b>Приняло участие:</b> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><b>Кворум:</b> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for'").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against'").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, SUM(vote_weight) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain'").bind(i.id).first(),
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotes = forCount + againstCount + abstainCount;
    const percentFor = totalVotes > 0 ? (forCount / totalVotes) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    docContent += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><i>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</i></p>

    <table>
      <tr>
        <th>ЗА</th>
        <th>ПРОТИВ</th>
        <th>ВОЗДЕРЖАЛИСЬ</th>
      </tr>
      <tr>
        <td>${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentFor.toFixed(1)}%</td>
        <td>${againstCount} голосов (${againstWeight.toFixed(2)} кв.м)</td>
        <td>${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м)</td>
      </tr>
    </table>

    <div class="decision ${i.is_approved ? 'decision-approved' : 'decision-rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  docContent += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <tr>
      <th>№</th>
      <th>ФИО</th>
      <th>Квартира</th>
      <th>Площадь (кв.м)</th>
      <th>Время голосования</th>
    </tr>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    docContent += `
    <tr>
      <td>${idx + 1}</td>
      <td>${v.voter_name}</td>
      <td>${v.apartment_number || '-'}</td>
      <td>${v.vote_weight || '-'}</td>
      <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
    </tr>
`;
  }

  docContent += `
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <p>Председатель собрания: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Секретарь: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Члены счётной комиссии: ______________________ / ______________________ /</p>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>
</body>
</html>
`;

  const filename = `protocol_${meeting.number}_${new Date().toISOString().split('T')[0]}.doc`;

  return new Response(docContent, {
    headers: {
      'Content-Type': 'application/msword',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': currentCorsOrigin,
    }
  });
});

// Get protocol data as JSON for frontend DOCX generation
route('GET', '/api/meetings/:meetingId/protocol/data', async (request, env, params) => {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?')
    .bind(params.meetingId).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique vote records (for participant list)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT voter_id, voter_name, apartment_number, vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ?
    GROUP BY voter_id
    ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Get votes by each agenda item (for detailed voting tables) with comments
  const votesByItem: Record<string, any[]> = {};
  for (const item of agendaItems) {
    const { results: itemVotes } = await env.DB.prepare(`
      SELECT
        v.voter_id, v.voter_name, v.apartment_number, v.vote_weight, v.choice, v.voted_at,
        c.content as comment
      FROM meeting_vote_records v
      LEFT JOIN meeting_agenda_comments c ON
        c.agenda_item_id = v.agenda_item_id AND
        c.resident_id = v.voter_id AND
        c.include_in_protocol = 1
      WHERE v.agenda_item_id = ?
      ORDER BY v.voter_name
    `).bind((item as any).id).all();
    votesByItem[(item as any).id] = itemVotes;
  }

  return json({
    meeting,
    agendaItems,
    voteRecords,
    votesByItem,
    protocolHash: protocol?.protocol_hash
  });
});

// ==================== AGENDA COMMENTS ROUTES ====================

// Get comments for agenda item
route('GET', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const { results } = await env.DB.prepare(`
    SELECT * FROM meeting_agenda_comments
    WHERE agenda_item_id = ?
    ORDER BY created_at DESC
  `).bind(params.agendaItemId).all();

  return json({ comments: results });
});

// Add comment to agenda item
route('POST', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Get the meeting_id from agenda item
  const agendaItem = await env.DB.prepare(
    'SELECT meeting_id FROM meeting_agenda_items WHERE id = ?'
  ).bind(params.agendaItemId).first() as any;

  if (!agendaItem) {
    return error('Agenda item not found', 404);
  }

  // Check if meeting is in voting state
  const meeting = await env.DB.prepare(
    'SELECT status FROM meetings WHERE id = ?'
  ).bind(agendaItem.meeting_id).first() as any;

  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
    return error('Comments are only allowed during voting', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_agenda_comments (
      id, agenda_item_id, meeting_id, resident_id, resident_name,
      apartment_number, content, include_in_protocol
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.agendaItemId,
    agendaItem.meeting_id,
    authUser.id,
    authUser.name,
    body.apartment_number || body.apartmentNumber || authUser.apartment || null,
    body.content,
    body.include_in_protocol !== false ? 1 : 0
  ).run();

  const created = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_comments WHERE id = ?'
  ).bind(id).first();

  return json({ comment: created }, 201);
});

// Delete own comment
route('DELETE', '/api/comments/:commentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Check ownership
  const comment = await env.DB.prepare(
    'SELECT resident_id, meeting_id FROM meeting_agenda_comments WHERE id = ?'
  ).bind(params.commentId).first() as any;

  if (!comment) {
    return error('Comment not found', 404);
  }

  // Only owner or admin can delete
  if (comment.resident_id !== authUser.id && authUser.role !== 'admin') {
    return error('Not authorized to delete this comment', 403);
  }

  // Check if meeting is still in voting state
  const meeting = await env.DB.prepare(
    'SELECT status FROM meetings WHERE id = ?'
  ).bind(comment.meeting_id).first() as any;

  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
    return error('Cannot delete comments after voting ends', 400);
  }

  await env.DB.prepare('DELETE FROM meeting_agenda_comments WHERE id = ?')
    .bind(params.commentId).run();

  return json({ success: true });
});

// ==================== STATS ROUTES ====================

// Stats helper function
async function getStats(env: Env) {
  const stats = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'new'"),
    env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status IN ('assigned', 'in_progress')"),
    env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'completed'"),
    env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'resident'"),
    env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'executor'"),
  ]);

  return {
    new_requests: (stats[0].results[0] as any).count,
    in_progress: (stats[1].results[0] as any).count,
    completed: (stats[2].results[0] as any).count,
    total_residents: (stats[3].results[0] as any).count,
    total_executors: (stats[4].results[0] as any).count,
  };
}

route('GET', '/api/stats', async (request, env) => {
  return json(await getStats(env));
});

// Alias for /api/stats/dashboard (frontend compatibility)
route('GET', '/api/stats/dashboard', async (request, env) => {
  return json(await getStats(env));
});

// ==================== SETTINGS ROUTES ====================

// Get all settings
route('GET', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all();

  // Convert to key-value object
  const settings: Record<string, any> = {};
  for (const row of results as any[]) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return json({ settings });
});

// Get single setting
route('GET', '/api/settings/:key', async (request, env, params) => {
  const setting = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(params.key).first();

  if (!setting) {
    return json({ value: null });
  }

  try {
    return json({ value: JSON.parse((setting as any).value) });
  } catch {
    return json({ value: (setting as any).value });
  }
});

// Set/update setting
route('PUT', '/api/settings/:key', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);

  await env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(params.key, value, value).run();

  return json({ success: true, key: params.key });
});

// Bulk update settings
route('POST', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as Record<string, any>;

  const statements = Object.entries(body).map(([key, val]) => {
    const value = typeof val === 'string' ? val : JSON.stringify(val);
    return env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).bind(key, value, value);
  });

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return json({ success: true });
});

// ==================== NOTIFICATIONS ROUTES ====================

// Get notifications for current user
route('GET', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  if (unreadOnly) {
    query += ' AND is_read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT ?';

  const { results } = await env.DB.prepare(query).bind(authUser.id, limit).all();

  // Parse data field
  const notifications = (results as any[]).map(n => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
    is_read: Boolean(n.is_read),
  }));

  return json({ notifications });
});

// Get unread count
route('GET', '/api/notifications/count', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).bind(authUser.id).first();

  return json({ count: (result as any)?.count || 0 });
});

// Create notification
route('POST', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.user_id,
    body.type,
    body.title,
    body.body || null,
    body.data ? JSON.stringify(body.data) : null
  ).run();

  return json({ id, success: true });
});

// Mark notification as read
route('PATCH', '/api/notifications/:id/read', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ).bind(params.id, authUser.id).run();

  return json({ success: true });
});

// Mark all notifications as read
route('POST', '/api/notifications/read-all', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
  ).bind(authUser.id).run();

  return json({ success: true });
});

// Delete notification
route('DELETE', '/api/notifications/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'DELETE FROM notifications WHERE id = ? AND user_id = ?'
  ).bind(params.id, authUser.id).run();

  return json({ success: true });
});

// ==================== FILE UPLOAD ROUTES ====================
// Simple file upload that converts files to base64 data URLs
// Max file size: 5MB, supports images and documents

route('POST', '/api/upload', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return error('No file provided', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return error('File type not allowed', 400);
      }

      // Convert to base64 data URL
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const dataUrl = `data:${file.type};base64,${base64}`;

      return json({
        success: true,
        file: {
          name: file.name,
          url: dataUrl,
          type: file.type,
          size: file.size
        }
      });
    } else if (contentType.includes('application/json')) {
      // Handle base64 JSON upload
      const body = await request.json() as any;

      if (!body.data || !body.name || !body.type) {
        return error('Missing required fields: data, name, type', 400);
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(body.type)) {
        return error('File type not allowed', 400);
      }

      // Calculate base64 size (approximate)
      const base64Size = Math.ceil(body.data.length * 0.75);
      if (base64Size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      // The data should already be base64, just add data URL prefix if needed
      const dataUrl = body.data.startsWith('data:')
        ? body.data
        : `data:${body.type};base64,${body.data}`;

      return json({
        success: true,
        file: {
          name: body.name,
          url: dataUrl,
          type: body.type,
          size: body.size || base64Size
        }
      });
    } else {
      return error('Unsupported content type. Use multipart/form-data or application/json', 400);
    }
  } catch (e) {
    console.error('[Upload] Error:', e);
    return error('Failed to process upload', 500);
  }
});

// ==================== WEB PUSH SUBSCRIPTION ROUTES ====================

// VAPID keys for Web Push (newly generated)
const VAPID_PUBLIC_KEY = 'BMTJw9s4vAY9Bzb05L8--r0XUDirigcJ0_yTTGuCLZL2uk8693U82ef7LLlWyLf9T-3PucveTAjYS_I36uv7RY4';
const VAPID_PRIVATE_KEY = 'Iryr3rbGuDTBPiBCH07-NCqEzwufF-EOcBIK--DJ9yk';

// Push: Subscribe
route('POST', '/api/push/subscribe', async (request, env) => {
  console.log('[Push] Subscribe request received');

  const authUser = await getUser(request, env);
  if (!authUser) {
    console.log('[Push] Subscribe failed: User not authenticated');
    return error('Unauthorized', 401);
  }

  console.log(`[Push] User ${authUser.id} (${authUser.name}) attempting to subscribe`);

  let body: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    body = await request.json() as { endpoint: string; keys: { p256dh: string; auth: string } };
  } catch (e) {
    console.error('[Push] Failed to parse request body:', e);
    return error('Invalid JSON body', 400);
  }

  console.log('[Push] Subscription data:', {
    hasEndpoint: !!body.endpoint,
    endpointStart: body.endpoint?.substring(0, 60),
    hasP256dh: !!body.keys?.p256dh,
    hasAuth: !!body.keys?.auth,
    p256dhLength: body.keys?.p256dh?.length,
    authLength: body.keys?.auth?.length
  });

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    console.log('[Push] Invalid subscription data - missing fields');
    return error('Invalid subscription data', 400);
  }

  const id = generateId();

  try {
    // Upsert subscription (update if endpoint exists)
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_used_at = datetime('now')
    `).bind(id, authUser.id, body.endpoint, body.keys.p256dh, body.keys.auth).run();

    console.log(`[Push] SUCCESS! User ${authUser.id} subscribed, endpoint: ${body.endpoint.substring(0, 60)}...`);

    // Verify subscription was saved
    const saved = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(authUser.id).first();
    console.log('[Push] Verified saved subscription:', saved ? 'EXISTS' : 'NOT FOUND');

    return json({ success: true, subscriptionId: id });
  } catch (dbError) {
    console.error('[Push] Database error saving subscription:', dbError);
    return error('Failed to save subscription', 500);
  }
});

// Push: Unsubscribe
route('POST', '/api/push/unsubscribe', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'DELETE FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).run();

  console.log(`[Push] User ${authUser.id} unsubscribed`);

  return json({ success: true });
});

// Push: Get subscription status
route('GET', '/api/push/status', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const subscription = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).first();

  return json({
    subscribed: !!subscription,
    subscription: subscription ? {
      endpoint: (subscription as any).endpoint,
      createdAt: (subscription as any).created_at,
      lastUsedAt: (subscription as any).last_used_at
    } : null
  });
});

// Push: Get VAPID public key
route('GET', '/api/push/vapid-key', async () => {
  return json({ publicKey: VAPID_PUBLIC_KEY });
});

// ==================== WEB PUSH IMPLEMENTATION ====================
// Using proper Web Push with VAPID authentication for Cloudflare Workers

// Helper: Base64 URL encode
function b64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: Base64 URL decode
function b64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper: Concatenate Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Create VAPID JWT token for authentication
async function createVapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  // JWT Header
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject
  };
  const payloadB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtPayload)));

  // Import private key for signing
  const privateKeyBytes = b64UrlDecode(privateKey);

  // Create JWK from raw private key
  const publicKeyBytes = b64UrlDecode(publicKey);
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64UrlEncode(x),
    y: b64UrlEncode(y),
    d: b64UrlEncode(privateKeyBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign JWT
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format (64 bytes)
  const signatureBytes = new Uint8Array(signature);
  const signatureB64 = b64UrlEncode(signatureBytes);

  const jwt = `${unsignedToken}.${signatureB64}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: publicKey
  };
}

// Encrypt payload using Web Push encryption (RFC 8291 - aes128gcm)
async function encryptPushPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  // Decode subscriber keys
  const subscriberPubKey = b64UrlDecode(p256dhKey);
  const auth = b64UrlDecode(authSecret);

  // Generate local ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;

  // Export local public key
  const localPubKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey) as ArrayBuffer;
  const localPubKey = new Uint8Array(localPubKeyRaw);

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPubKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey } as any,
    localKeyPair.privateKey,
    256
  );

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Create info for HKDF
  const keyInfoPrefix = new TextEncoder().encode('WebPush: info\0');
  const keyInfo = concatUint8Arrays(keyInfoPrefix, subscriberPubKey, localPubKey);

  // Import shared secret as HKDF key
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive IKM (Input Key Material)
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: keyInfo },
    sharedSecretKey,
    256
  );

  // Import IKM for further derivation
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive Content Encryption Key (CEK)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: cekInfo },
    ikmKey,
    128
  );

  // Derive Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: nonceInfo },
    ikmKey,
    96
  );

  // Import CEK for AES-GCM encryption
  const cekKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Pad payload (add delimiter byte 0x02)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Padding delimiter

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce) },
    cekKey,
    paddedPayload
  );

  // Build aes128gcm content
  // Format: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const recordSize = 4096;
  const header = new Uint8Array(86); // 16 + 4 + 1 + 65
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = 65; // Key ID length (uncompressed EC point)
  header.set(localPubKey, 21);

  const body = concatUint8Arrays(header, new Uint8Array(encrypted));

  return {
    body,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400'
    }
  };
}

// Send Web Push notification
async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payloadJson: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  console.log(`[Push] Sending to endpoint: ${endpoint.substring(0, 60)}...`);
  console.log(`[Push] p256dh length: ${p256dh.length}, auth length: ${auth.length}`);

  try {
    // Create VAPID authorization
    console.log('[Push] Creating VAPID auth header...');
    const vapid = await createVapidAuthHeader(
      endpoint,
      'mailto:admin@kamizo.uz',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    console.log('[Push] VAPID auth created successfully');

    // Encrypt payload
    console.log('[Push] Encrypting payload...');
    const { body, headers } = await encryptPushPayload(payloadJson, p256dh, auth);
    console.log(`[Push] Payload encrypted, body size: ${body.length} bytes`);

    // Send request
    console.log('[Push] Sending HTTP request to push service...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Authorization': vapid.authorization
      },
      body
    });

    console.log(`[Push] Response status: ${response.status}`);

    if (response.ok || response.status === 201) {
      console.log(`[Push] SUCCESS! Status: ${response.status}`);
      return { success: true, status: response.status };
    }

    const errorText = await response.text();
    console.error(`[Push] FAILED ${response.status}: ${errorText}`);
    return { success: false, status: response.status, error: errorText };
  } catch (err) {
    console.error('[Push] EXCEPTION:', err);
    return { success: false, error: String(err) };
  }
}

// Helper function to send push notification (for internal use)
async function sendPushNotification(
  env: Env,
  userId: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    type?: string;
    data?: Record<string, any>;
    requireInteraction?: boolean;
  }
): Promise<boolean> {
  // Get user's push subscriptions
  const { results } = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(userId).all();

  if (!results || results.length === 0) {
    console.log(`[Push] No subscriptions for user ${userId}`);
    return false;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: notification.tag || 'kamizo-' + Date.now(),
    type: notification.type,
    data: notification.data || {},
    requireInteraction: notification.requireInteraction ?? true,
    vibrate: [200, 100, 200]
  });

  let successCount = 0;

  for (const sub of results as any[]) {
    try {
      // Send real Web Push notification
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        payload
      );

      if (result.success) {
        // Update last_used_at on success
        await env.DB.prepare(
          'UPDATE push_subscriptions SET last_used_at = datetime(\'now\') WHERE id = ?'
        ).bind(sub.id).run();

        successCount++;
        console.log(`[Push] Successfully sent to user ${userId}`);
      } else {
        console.error(`[Push] Failed for user ${userId}: ${result.error}`);

        // Remove invalid subscriptions (410 Gone or 404 Not Found)
        if (result.status === 410 || result.status === 404) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          console.log(`[Push] Removed expired subscription for user ${userId}`);
        }
      }
    } catch (err) {
      console.error(`[Push] Error sending to ${sub.endpoint}:`, err);
    }
  }

  // Also store in notifications table for in-app display (only ONCE, not per subscription)
  // Use tag as unique constraint to prevent duplicates within 1 minute
  const notifId = generateId();
  try {
    // Check if notification with same tag already exists (avoid duplicates)
    const existingNotif = notification.tag
      ? await env.DB.prepare(
          `SELECT id FROM notifications WHERE user_id = ? AND data LIKE ? AND created_at > datetime('now', '-1 minute')`
        ).bind(userId, `%"tag":"${notification.tag}"%`).first()
      : null;

    if (!existingNotif) {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
      `).bind(
        notifId,
        userId,
        notification.type || 'push',
        notification.title,
        notification.body,
        JSON.stringify({ ...notification.data, tag: notification.tag })
      ).run();
    }
  } catch (e) {
    // Ignore if notifications table doesn't exist
    console.error('[Notification] Failed to store in-app notification:', e);
  }

  return successCount > 0;
}

// Push: Send test notification (for debugging)
route('POST', '/api/push/test', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const sent = await sendPushNotification(env, authUser.id, {
    title: '🔔 Тестовое уведомление',
    body: 'Push уведомления работают! Это тестовое сообщение от Kamizo.',
    type: 'test',
    tag: 'test-notification',
    data: { url: '/' }
  });

  return json({ success: sent, message: sent ? 'Notification sent' : 'No subscriptions found' });
});

// Push: Send notification to specific user (admin only)
route('POST', '/api/push/send', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userId: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.userId || !body.title || !body.body) {
    return error('userId, title, and body are required', 400);
  }

  const sent = await sendPushNotification(env, body.userId, {
    title: body.title,
    body: body.body,
    type: body.type,
    data: body.data,
    requireInteraction: true
  });

  return json({ success: sent });
});

// Push: Broadcast notification to multiple users (admin only)
route('POST', '/api/push/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userIds?: string[];
    role?: string;
    buildingId?: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.title || !body.body) {
    return error('title and body are required', 400);
  }

  let userIds: string[] = [];

  if (body.userIds) {
    userIds = body.userIds;
  } else if (body.role || body.buildingId) {
    // Get users by criteria
    let query = 'SELECT id FROM users WHERE 1=1';
    const params: string[] = [];

    if (body.role) {
      query += ' AND role = ?';
      params.push(body.role);
    }
    if (body.buildingId) {
      query += ' AND building_id = ?';
      params.push(body.buildingId);
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    userIds = (results as any[]).map(u => u.id);
  }

  let sentCount = 0;
  for (const userId of userIds) {
    const sent = await sendPushNotification(env, userId, {
      title: body.title,
      body: body.body,
      type: body.type || 'broadcast',
      data: body.data,
      requireInteraction: true
    });
    if (sent) sentCount++;
  }

  return json({ success: true, sentCount, totalUsers: userIds.length });
});

// Send notification to multiple users
route('POST', '/api/notifications/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const { user_ids, type, title, body: notifBody, data } = body;

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return error('user_ids array required', 400);
  }

  const statements = user_ids.map((userId: string) => {
    const id = generateId();
    return env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, type, title, notifBody || null, data ? JSON.stringify(data) : null);
  });

  await env.DB.batch(statements);

  return json({ success: true, count: user_ids.length });
});

// ==================== ADVERTISING PLATFORM (ПОЛЕЗНЫЕ КОНТАКТЫ) ====================
// Рекламная платформа с купонами
// - ukreklama (advertiser): создаёт объявления, видит статистику
// - ukchek (coupon_checker): проверяет и активирует купоны
// - residents: только просмотр и получение купонов

// Helper: Generate 6-character coupon code (letters + numbers)
function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get ad categories
route('GET', '/api/ads/categories', async (request, env) => {
  try {
    const authUser = await getUser(request, env);
    const now = new Date().toISOString();

    // Get user's branch for counting - try from user.branch first, then from building
    let userBranch = authUser ? (authUser as any).branch : null;
    if (!userBranch && authUser && (authUser as any).building_id) {
      const building = await env.DB.prepare(
        'SELECT branch_code FROM buildings WHERE id = ?'
      ).bind((authUser as any).building_id).first() as any;
      userBranch = building?.branch_code;
    }
    userBranch = userBranch || 'YS'; // Default fallback

    const { results } = await env.DB.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM ads WHERE category_id = c.id AND status = 'active'
         AND (starts_at IS NULL OR ? >= starts_at)
         AND (expires_at IS NULL OR ? <= expires_at)
         AND (target_type IS NULL OR target_type = '' OR target_type = 'all'
              OR (target_type = 'branches' AND (target_branches IS NULL OR target_branches = '[]' OR target_branches LIKE ?)))) as active_ads_count
       FROM ad_categories c ORDER BY sort_order`
    ).bind(now, now, `%${userBranch}%`).all();
    return json({ categories: results });
  } catch (err: any) {
    console.error('Error fetching categories:', err.message);
    return error(`Database error: ${err.message}`, 500);
  }
});

// ==================== ADVERTISER (ukreklama) ENDPOINTS ====================

// Helper: Check if user is advertiser (account_type or role)
function isAdvertiser(user: any): boolean {
  return user?.account_type === 'advertiser' || user?.role === 'advertiser';
}

// Helper: Check if user is coupon checker
function isCouponChecker(user: any): boolean {
  return user?.account_type === 'coupon_checker' || user?.role === 'coupon_checker';
}

// Get advertiser dashboard stats
route('GET', '/api/ads/dashboard', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'active') as active_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'expired') as expired_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'draft') as draft_ads,
      (SELECT SUM(views_count) FROM ads WHERE created_by = ?) as total_views,
      (SELECT SUM(coupons_issued) FROM ads WHERE created_by = ?) as total_coupons_issued,
      (SELECT SUM(coupons_activated) FROM ads WHERE created_by = ?) as total_coupons_activated
  `).bind(authUser.id, authUser.id, authUser.id, authUser.id, authUser.id, authUser.id).first();

  // Ads expiring soon (within 3 days)
  const { results: expiringSoon } = await env.DB.prepare(`
    SELECT id, title, expires_at
    FROM ads
    WHERE created_by = ? AND status = 'active'
      AND datetime(expires_at) BETWEEN datetime('now') AND datetime('now', '+3 days')
    ORDER BY expires_at ASC
    LIMIT 10
  `).bind(authUser.id).all();

  return json({ stats, expiringSoon });
});

// Get all ads for advertiser
route('GET', '/api/ads/my', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `
    SELECT a.*, c.name_ru as category_name, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.created_by = ?
  `;
  const params: any[] = [authUser.id];

  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY a.created_at DESC`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ ads: results });
});

// Create new ad
route('POST', '/api/ads', async (request, env) => {
  try {
    const authUser = await getUser(request, env);
    if (!authUser || !isAdvertiser(authUser)) {
      return error('Advertiser access required', 403);
    }

    const body = await request.json() as any;

    if (!body.category_id || !body.title || !body.phone) {
      return error('category_id, title, and phone are required', 400);
    }

    // Calculate dates based on duration_type
    const now = new Date();
    let startsAt = body.starts_at || now.toISOString();
    let expiresAt = body.expires_at;

    if (!expiresAt) {
      const expDate = new Date(startsAt);
      switch (body.duration_type) {
        case 'week':
          expDate.setDate(expDate.getDate() + 7);
          break;
        case '2weeks':
          expDate.setDate(expDate.getDate() + 14);
          break;
        case '3months':
          expDate.setMonth(expDate.getMonth() + 3);
          break;
        case '6months':
          expDate.setMonth(expDate.getMonth() + 6);
          break;
        case 'year':
          expDate.setFullYear(expDate.getFullYear() + 1);
          break;
        default: // month
          expDate.setMonth(expDate.getMonth() + 1);
      }
      expiresAt = expDate.toISOString();
    }

    const id = generateId();

    await env.DB.prepare(`
      INSERT INTO ads (
        id, category_id, title, description, phone, phone2, telegram, instagram, facebook, website,
        address, work_hours, work_days, logo_url, photos, discount_percent, badges,
        target_type, target_branches, starts_at, expires_at, duration_type, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.category_id,
      body.title,
      body.description || null,
      body.phone,
      body.phone2 || null,
      body.telegram || null,
      body.instagram || null,
      body.facebook || null,
      body.website || null,
      body.address || null,
      body.work_hours || null,
      body.work_days || null,
      body.logo_url || null,
      body.photos ? JSON.stringify(body.photos) : null,
      body.discount_percent || 0,
      body.badges ? JSON.stringify(body.badges) : null,
      body.target_type || 'all',
      body.target_branches ? JSON.stringify(body.target_branches) : '[]',
      startsAt,
      expiresAt,
      body.duration_type || 'month',
      body.status || 'active',
      authUser.id
    ).run();

    const created = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first();
    return json({ ad: created }, 201);
  } catch (err: any) {
    console.error('Error creating ad:', err.message);
    return error(`Failed to create ad: ${err.message}`, 500);
  }
});

// Update ad
route('PATCH', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'title', 'description', 'phone', 'phone2', 'telegram', 'instagram', 'facebook', 'website',
    'address', 'work_hours', 'work_days', 'logo_url', 'discount_percent', 'target_type',
    'starts_at', 'expires_at', 'duration_type', 'status'];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  // JSON fields
  if (body.photos !== undefined) {
    updates.push('photos = ?');
    values.push(JSON.stringify(body.photos));
  }
  if (body.badges !== undefined) {
    updates.push('badges = ?');
    values.push(JSON.stringify(body.badges));
  }
  if (body.target_branches !== undefined) {
    updates.push('target_branches = ?');
    values.push(JSON.stringify(body.target_branches));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(params.id).first();
  return json({ ad: updated });
});

// Delete ad
route('DELETE', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Archive instead of delete
  await env.DB.prepare("UPDATE ads SET status = 'archived' WHERE id = ?").bind(params.id).run();
  return json({ success: true });
});

// Get coupon history for an ad
route('GET', '/api/ads/:id/coupons', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone,
      checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC
    LIMIT 100
  `).bind(params.id).all();

  return json({ coupons: results });
});

// ==================== COUPON CHECKER (ukchek) ENDPOINTS ====================

// Check coupon (get info without activating)
route('GET', '/api/coupons/check/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isCouponChecker(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();

  const coupon = await env.DB.prepare(`
    SELECT c.*,
      a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      u.name as user_name, u.phone as user_phone
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.code = ?
  `).bind(code).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  // Check if expired
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return json({
      coupon,
      valid: false,
      reason: 'Срок действия купона истёк'
    });
  }

  if (coupon.status === 'activated') {
    return json({
      coupon,
      valid: false,
      reason: `Купон уже активирован ${new Date(coupon.activated_at).toLocaleString('ru-RU')}`
    });
  }

  if (coupon.status === 'cancelled') {
    return json({
      coupon,
      valid: false,
      reason: 'Купон отменён'
    });
  }

  return json({
    coupon,
    valid: true,
    discount_percent: coupon.discount_percent
  });
});

// Activate coupon
route('POST', '/api/coupons/activate/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isCouponChecker(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();
  const body = await request.json() as any;
  const amount = body.amount || 0;

  const coupon = await env.DB.prepare(`
    SELECT c.*, a.id as ad_id
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    WHERE c.code = ?
  `).bind(code).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  if (coupon.status !== 'issued') {
    return error('Купон уже использован или недействителен', 400);
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return error('Срок действия купона истёк', 400);
  }

  const discountAmount = amount * (coupon.discount_percent / 100);

  // Activate coupon
  await env.DB.prepare(`
    UPDATE ad_coupons SET
      status = 'activated',
      activated_at = datetime('now'),
      activated_by = ?,
      activation_amount = ?,
      discount_amount = ?
    WHERE code = ?
  `).bind(authUser.id, amount, discountAmount, code).run();

  // Update ad stats
  await env.DB.prepare(`
    UPDATE ads SET coupons_activated = coupons_activated + 1 WHERE id = ?
  `).bind(coupon.ad_id).run();

  const updated = await env.DB.prepare('SELECT * FROM ad_coupons WHERE code = ?').bind(code).first();

  return json({
    success: true,
    coupon: updated,
    discount_amount: discountAmount,
    final_amount: amount - discountAmount
  });
});

// Get activation history for checker
route('GET', '/api/coupons/history', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isCouponChecker(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, u.name as user_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.activated_by = ?
    ORDER BY c.activated_at DESC
    LIMIT 100
  `).bind(authUser.id).all();

  return json({ activations: results });
});

// ==================== RESIDENT (жители) ENDPOINTS ====================

// Get active ads for residents (public viewing)
route('GET', '/api/ads', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search')?.toLowerCase();

  // Get user's branch for targeting - try from user.branch first, then from building
  let userBranch = (authUser as any).branch;
  if (!userBranch && (authUser as any).building_id) {
    const building = await env.DB.prepare(
      'SELECT branch_code FROM buildings WHERE id = ?'
    ).bind((authUser as any).building_id).first() as any;
    userBranch = building?.branch_code;
  }
  userBranch = userBranch || 'YS'; // Default fallback
  const now = new Date().toISOString();

  let query = `
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon,
      (SELECT COUNT(*) FROM ad_coupons WHERE ad_id = a.id AND user_id = ?) as user_has_coupon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.status = 'active'
      AND (a.starts_at IS NULL OR ? >= a.starts_at)
      AND (a.expires_at IS NULL OR ? <= a.expires_at)
      AND (a.target_type IS NULL OR a.target_type = '' OR a.target_type = 'all'
           OR (a.target_type = 'branches' AND (a.target_branches IS NULL OR a.target_branches = '[]' OR a.target_branches LIKE ?)))
  `;
  const params: any[] = [authUser.id, now, now, `%${userBranch}%`];

  if (categoryId) {
    query += ` AND a.category_id = ?`;
    params.push(categoryId);
  }

  if (search) {
    query += ` AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  // Order: recommended first, then by views
  query += ` ORDER BY json_extract(a.badges, '$.recommended') DESC, a.views_count DESC, a.created_at DESC`;

  try {
    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Parse JSON fields
    const ads = results.map((ad: any) => ({
      ...ad,
      badges: ad.badges ? JSON.parse(ad.badges) : {},
      photos: ad.photos ? JSON.parse(ad.photos) : [],
      target_branches: ad.target_branches ? JSON.parse(ad.target_branches) : []
    }));

    return json({ ads });
  } catch (err: any) {
    console.error('Error fetching ads:', err.message, 'Query:', query, 'Params:', params);
    return error(`Database error: ${err.message}`, 500);
  }
});

// Get single ad details
route('GET', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const ad = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.id = ?
  `).bind(params.id).first() as any;

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Record view (once per user per day)
  const viewId = generateId();
  try {
    await env.DB.prepare(`
      INSERT INTO ad_views (id, ad_id, user_id) VALUES (?, ?, ?)
    `).bind(viewId, params.id, authUser.id).run();

    // Update view count
    await env.DB.prepare(`UPDATE ads SET views_count = views_count + 1 WHERE id = ?`).bind(params.id).run();
  } catch (e) {
    // Ignore duplicate view errors (UNIQUE constraint)
  }

  // Check if user already has a coupon
  const existingCoupon = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  // Parse JSON fields
  ad.badges = ad.badges ? JSON.parse(ad.badges) : {};
  ad.photos = ad.photos ? JSON.parse(ad.photos) : [];

  return json({
    ad,
    userCoupon: existingCoupon
  });
});

// Get coupon for an ad (resident only)
route('POST', '/api/ads/:id/get-coupon', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (authUser.role !== 'resident') {
    return error('Only residents can get coupons', 403);
  }

  const now = new Date().toISOString();
  const ad = await env.DB.prepare(`
    SELECT * FROM ads WHERE id = ? AND status = 'active'
    AND (starts_at IS NULL OR ? >= starts_at)
    AND (expires_at IS NULL OR ? <= expires_at)
  `).bind(params.id, now, now).first() as any;

  if (!ad) {
    return error('Ad not found or not active', 404);
  }

  if (!ad.discount_percent || ad.discount_percent <= 0) {
    return error('This ad has no discount', 400);
  }

  // Check if user already has a coupon for this ad
  const existing = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  if (existing) {
    return json({ coupon: existing, message: 'Вы уже получили купон на эту акцию' });
  }

  // Generate unique coupon code
  let code: string;
  let attempts = 0;
  do {
    code = generateCouponCode();
    const exists = await env.DB.prepare('SELECT id FROM ad_coupons WHERE code = ?').bind(code).first();
    if (!exists) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return error('Failed to generate unique code', 500);
  }

  const couponId = generateId();

  await env.DB.prepare(`
    INSERT INTO ad_coupons (id, ad_id, user_id, code, discount_percent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(couponId, params.id, authUser.id, code, ad.discount_percent, ad.expires_at).run();

  // Update ad stats
  await env.DB.prepare(`UPDATE ads SET coupons_issued = coupons_issued + 1 WHERE id = ?`).bind(params.id).run();

  const coupon = await env.DB.prepare('SELECT * FROM ad_coupons WHERE id = ?').bind(couponId).first();

  return json({
    coupon,
    message: `Ваш промокод: ${code}. Скидка ${ad.discount_percent}%`
  }, 201);
});

// Get user's coupons
route('GET', '/api/my-coupons', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      a.logo_url, cat.name_ru as category_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN ad_categories cat ON a.category_id = cat.id
    WHERE c.user_id = ?
    ORDER BY c.issued_at DESC
  `).bind(authUser.id).all();

  return json({ coupons: results });
});

// ==================== MAIN HANDLER ====================

// ==================== MONITORING & HEALTH ENDPOINTS ====================

// Health Check
route('GET', '/api/health', async (request, env) => {
  const health = await healthCheck(env);
  const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503;
  return json(health, status);
});

// Metrics Dashboard (Admin only)
route('GET', '/api/admin/metrics', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = metricsAggregator.getAggregatedStats();
  const cacheStats = getCacheStats();

  // Check thresholds and send alerts if needed
  AlertManager.checkThresholds(stats);

  return json({
    performance: stats,
    cache: cacheStats,
    health: await healthCheck(env),
  });
});

// Performance Metrics (detailed)
route('GET', '/api/admin/metrics/performance', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');

  const perfMetrics = endpoint
    ? metricsAggregator.getPerformanceMetrics(endpoint)
    : metricsAggregator.getPerformanceMetrics();

  return json({
    metrics: perfMetrics,
    aggregated: metricsAggregator.getAggregatedStats(),
  });
});

// Error Logs (Admin only)
route('GET', '/api/admin/metrics/errors', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const errors = metricsAggregator.getErrors();

  return json({
    total: errors.length,
    errors: errors.slice(-50), // Last 50 errors
  });
});

// Clear metrics (Admin only)
route('POST', '/api/admin/metrics/clear', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  metricsAggregator.clear();

  return json({ message: 'Metrics cleared successfully' });
});

// Reset/Clear all requests (Admin only)
route('POST', '/api/admin/requests/reset', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  try {
    // Delete request history first (FK constraint)
    await env.DB.prepare('DELETE FROM request_history').run();

    // Delete messages related to requests
    await env.DB.prepare('DELETE FROM messages').run();

    // Delete all requests
    await env.DB.prepare('DELETE FROM requests').run();

    // Reset request number sequence
    await env.DB.prepare(`
      UPDATE settings SET value = '0' WHERE key = 'last_request_number'
    `).run();

    // Invalidate caches
    await invalidateOnChange('requests', env.RATE_LIMITER);

    return json({ message: 'All requests have been deleted successfully' });
  } catch (err: any) {
    console.error('Error resetting requests:', err);
    return error('Failed to reset requests: ' + err.message, 500);
  }
});

// Frontend Error Reporting (Public - errors from React)
route('POST', '/api/admin/monitoring/frontend-error', async (request, env) => {
  try {
    const body = await request.json() as any;

    // Log frontend error
    console.error('🔴 Frontend Error:', {
      timestamp: body.timestamp,
      error: body.error?.message,
      url: body.url,
      userId: body.userId,
      userAgent: body.userAgent,
    });

    // Store in metrics aggregator
    metricsAggregator.logError({
      message: `[Frontend] ${body.error?.message || 'Unknown error'}`,
      endpoint: body.url || 'unknown',
      method: 'FRONTEND',
      timestamp: Date.now(),
      stack: body.error?.stack,
      userAgent: body.userAgent,
      userId: body.userId,
    });

    // Send to Cloudflare Analytics if available
    if (env.ENVIRONMENT === 'production') {
      logAnalyticsEvent(request, 'frontend_error', {
        error_name: body.error?.name || 'UnknownError',
        error_message: body.error?.message || 'Unknown error',
        url: body.url,
        userId: body.userId,
      });
    }

    return json({ message: 'Error logged successfully' });
  } catch (err) {
    console.error('Failed to log frontend error:', err);
    return error('Failed to log error', 500);
  }
});

// ==================== MARKETPLACE API ====================

// Marketplace: Get categories
route('GET', '/api/marketplace/categories', async (request, env) => {
  const { results } = await env.DB.prepare(`
    SELECT * FROM marketplace_categories WHERE is_active = 1 ORDER BY sort_order
  `).all();
  return json({ categories: results });
});

// Marketplace: Get products (with filtering)
route('GET', '/api/marketplace/products', async (request, env) => {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE p.is_active = 1';
  const params: any[] = [];

  if (categoryId) {
    whereClause += ' AND p.category_id = ?';
    params.push(categoryId);
  }
  if (search) {
    whereClause += ' AND (p.name_ru LIKE ? OR p.name_uz LIKE ? OR p.description_ru LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (featured === 'true') {
    whereClause += ' AND p.is_featured = 1';
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_products p ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY p.is_featured DESC, p.orders_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return json({
    products: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// Marketplace: Get single product
route('GET', '/api/marketplace/products/:id', async (request, env, params) => {
  const product = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(params.id).first();

  if (!product) return error('Product not found', 404);

  // Get reviews
  const { results: reviews } = await env.DB.prepare(`
    SELECT r.*, u.name as user_name
    FROM marketplace_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ? AND r.is_visible = 1
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(params.id).all();

  return json({ product, reviews });
});

// Marketplace: Cart - Get
route('GET', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT c.*, p.name_ru, p.name_uz, p.price, p.old_price, p.image_url, p.stock_quantity, p.unit,
           cat.name_ru as category_name_ru, cat.icon as category_icon
    FROM marketplace_cart c
    JOIN marketplace_products p ON c.product_id = p.id
    LEFT JOIN marketplace_categories cat ON p.category_id = cat.id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).bind(user.id).all();

  const total = (results as any[]).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemsCount = (results as any[]).reduce((sum, item) => sum + item.quantity, 0);

  return json({ cart: results, total, itemsCount });
});

// Marketplace: Cart - Add/Update item
route('POST', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { product_id, quantity = 1 } = body;

  if (!product_id || typeof quantity !== 'number' || quantity < 1) {
    return error('Invalid product or quantity');
  }

  // Check product exists and in stock
  const product = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? AND is_active = 1`).bind(product_id).first() as any;
  if (!product) return error('Product not found', 404);
  if (product.stock_quantity < quantity) return error('Not enough stock');

  // Upsert cart item
  await env.DB.prepare(`
    INSERT INTO marketplace_cart (id, user_id, product_id, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).bind(generateId(), user.id, product_id, quantity, quantity).run();

  return json({ success: true });
});

// Marketplace: Cart - Remove item
route('DELETE', '/api/marketplace/cart/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
  return json({ success: true });
});

// Marketplace: Cart - Clear
route('DELETE', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ?`).bind(user.id).run();
  return json({ success: true });
});

// Marketplace: Create order
route('POST', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  try {
    const body = await request.json() as any;
    const { delivery_date, delivery_time_slot, delivery_notes, payment_method } = body;

    console.log('[Marketplace Order] Creating order for user:', user.id, user.name);
    console.log('[Marketplace Order] Request body:', body);

    // Get cart items
    const { results: cartItems } = await env.DB.prepare(`
      SELECT c.*, p.name_ru, p.price, p.image_url, p.stock_quantity
      FROM marketplace_cart c
      JOIN marketplace_products p ON c.product_id = p.id
      WHERE c.user_id = ?
    `).bind(user.id).all() as { results: any[] };

    console.log('[Marketplace Order] Cart items found:', cartItems?.length || 0);

    if (!cartItems || cartItems.length === 0) {
      console.log('[Marketplace Order] ERROR: Cart is empty');
      return error('Cart is empty', 400);
    }

  // Calculate totals
  const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = totalAmount >= 100000 ? 0 : 15000; // Free delivery over 100k
  const finalAmount = totalAmount + deliveryFee;

  // Generate order number (MP-YYYYMMDD-XXXX)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderCount = await env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE order_number LIKE ?`).bind(`MP-${today}%`).first() as any;
  const orderNumber = `MP-${today}-${String((orderCount?.count || 0) + 1).padStart(4, '0')}`;

  const orderId = generateId();

  // Create order
  await env.DB.prepare(`
    INSERT INTO marketplace_orders (
      id, order_number, user_id, status, total_amount, delivery_fee, final_amount,
      delivery_address, delivery_apartment, delivery_entrance, delivery_floor, delivery_phone,
      delivery_date, delivery_time_slot, delivery_notes, payment_method
    ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId, orderNumber, user.id, totalAmount, deliveryFee, finalAmount,
    user.address || '', user.apartment || '', user.entrance || '', user.floor || '', user.phone || '',
    delivery_date || null, delivery_time_slot || null, delivery_notes || null, payment_method || 'cash'
  ).run();

  // Create order items
  for (const item of cartItems) {
    await env.DB.prepare(`
      INSERT INTO marketplace_order_items (id, order_id, product_id, product_name, product_image, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(generateId(), orderId, item.product_id, item.name_ru, item.image_url, item.quantity, item.price, item.price * item.quantity).run();

    // Update product orders count
    await env.DB.prepare(`UPDATE marketplace_products SET orders_count = orders_count + 1 WHERE id = ?`).bind(item.product_id).run();
  }

  // Add order history
  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by)
    VALUES (?, ?, 'new', 'Заказ создан', ?)
  `).bind(generateId(), orderId, user.id).run();

  // Clear cart
  await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ?`).bind(user.id).run();

    // Create notification for managers
    const managers = await env.DB.prepare(`SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'marketplace_manager')`).all() as { results: any[] };
    for (const manager of (managers.results || [])) {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, datetime('now'))
      `).bind(generateId(), manager.id, `Заказ ${orderNumber} на сумму ${finalAmount.toLocaleString()} сум`, JSON.stringify({ order_id: orderId })).run();
    }

    console.log('[Marketplace Order] Order created successfully:', orderNumber);
    return json({ order: { id: orderId, order_number: orderNumber, final_amount: finalAmount } }, 201);
  } catch (e: any) {
    console.error('[Marketplace Order] ERROR:', e.message, e.stack);
    return error(e.message || 'Failed to create order', 500);
  }
});

// Marketplace: Get user orders
route('GET', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let whereClause = 'WHERE o.user_id = ?';
  const params: any[] = [user.id];

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const { results } = await env.DB.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    ${whereClause}
    ORDER BY o.created_at DESC
  `).bind(...params).all();

  return json({ orders: results });
});

// Marketplace: Get single order with items
route('GET', '/api/marketplace/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND (user_id = ? OR ? IN ('admin', 'director', 'manager', 'marketplace_manager'))
  `).bind(params.id, user.id, user.role).first();

  if (!order) return error('Order not found', 404);

  const { results: items } = await env.DB.prepare(`
    SELECT * FROM marketplace_order_items WHERE order_id = ?
  `).bind(params.id).all();

  const { results: history } = await env.DB.prepare(`
    SELECT h.*, u.name as changed_by_name
    FROM marketplace_order_history h
    LEFT JOIN users u ON h.changed_by = u.id
    WHERE h.order_id = ?
    ORDER BY h.created_at DESC
  `).bind(params.id).all();

  return json({ order, items, history });
});

// Marketplace: Cancel order (by user)
route('POST', '/api/marketplace/orders/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ?`).bind(params.id, user.id).first() as any;

  if (!order) return error('Order not found', 404);
  if (!['new', 'confirmed'].includes(order.status)) {
    return error('Cannot cancel order in this status');
  }

  await env.DB.prepare(`
    UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?
    WHERE id = ?
  `).bind(body.reason || 'Отменено покупателем', params.id).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).bind(generateId(), params.id, body.reason || 'Отменено покупателем', user.id).run();

  return json({ success: true });
});

// Marketplace: Rate order
route('POST', '/api/marketplace/orders/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { rating, review } = body;

  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? AND status = 'delivered'`).bind(params.id, user.id).first();
  if (!order) return error('Order not found or not delivered', 404);

  await env.DB.prepare(`UPDATE marketplace_orders SET rating = ?, review = ? WHERE id = ?`).bind(rating, review || null, params.id).run();
  return json({ success: true });
});

// Marketplace: Favorites - Get
route('GET', '/api/marketplace/favorites', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_favorites f
    JOIN marketplace_products p ON f.product_id = p.id
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).bind(user.id).all();

  return json({ favorites: results });
});

// Marketplace: Favorites - Toggle
route('POST', '/api/marketplace/favorites/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const existing = await env.DB.prepare(`SELECT id FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
    return json({ favorited: false });
  } else {
    await env.DB.prepare(`INSERT INTO marketplace_favorites (id, user_id, product_id) VALUES (?, ?, ?)`).bind(generateId(), user.id, params.productId).run();
    return json({ favorited: true });
  }
});

// ==================== MARKETPLACE MANAGER API ====================

// Manager: Get all orders
route('GET', '/api/marketplace/admin/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_orders o ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      e.name as executor_name, e.phone as executor_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN users e ON o.executor_id = e.id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return json({ orders: results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Manager: Update order status or assign executor
route('PATCH', '/api/marketplace/admin/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const { status, comment, executor_id } = body;

  // If assigning executor
  if (executor_id !== undefined) {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET executor_id = ?, assigned_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(executor_id, params.id).run();

    // Notify executor about new order
    if (executor_id) {
      const order = await env.DB.prepare(`SELECT order_number FROM marketplace_orders WHERE id = ?`).bind(params.id).first() as any;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, datetime('now'))
      `).bind(generateId(), executor_id, `Вам назначен заказ ${order?.order_number || ''}`, params.id).run();
    }

    return json({ success: true });
  }

  // If updating status
  if (status) {
    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return error('Invalid status');
    }

    const statusField = status === 'cancelled' ? 'cancelled_at' :
                        status === 'confirmed' ? 'confirmed_at' :
                        status === 'preparing' ? 'preparing_at' :
                        status === 'ready' ? 'ready_at' :
                        status === 'delivering' ? 'delivering_at' :
                        status === 'delivered' ? 'delivered_at' : null;

    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(status, params.id).run();

    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(generateId(), params.id, status, comment || null, user.id).run();

    // Notify user
    const order = await env.DB.prepare(`SELECT user_id, order_number FROM marketplace_orders WHERE id = ?`).bind(params.id).first() as any;
    if (order) {
      const statusLabels: Record<string, string> = {
        confirmed: 'подтверждён',
        preparing: 'готовится',
        ready: 'готов к выдаче',
        delivering: 'доставляется',
        delivered: 'доставлен',
        cancelled: 'отменён'
      };
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at)
        VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, datetime('now'))
      `).bind(generateId(), order.user_id, `Заказ ${order.order_number} ${statusLabels[status]}`, params.id).run();
    }
  }

  return json({ success: true });
});

// Executor: Get my marketplace orders
route('GET', '/api/marketplace/executor/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Access denied', 403);
  }

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ORDER BY
      CASE o.status
        WHEN 'confirmed' THEN 1
        WHEN 'preparing' THEN 2
        WHEN 'ready' THEN 3
        WHEN 'delivering' THEN 4
        ELSE 5
      END,
      o.created_at DESC
  `).bind(user.id).all();

  return json({ orders: results });
});

// Executor: Update order status (accept, prepare, deliver)
route('PATCH', '/api/marketplace/executor/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'executor') {
    return error('Access denied', 403);
  }

  // Verify this order is assigned to this executor
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id = ?
  `).bind(params.id, user.id).first() as any;

  if (!order) {
    return error('Order not found or not assigned to you', 404);
  }

  const body = await request.json() as any;
  const { status, comment } = body;

  // Executor can only move to certain statuses
  const allowedTransitions: Record<string, string[]> = {
    'confirmed': ['preparing'],
    'preparing': ['ready'],
    'ready': ['delivering'],
    'delivering': ['delivered']
  };

  const allowed = allowedTransitions[order.status];
  if (!allowed || !allowed.includes(status)) {
    return error(`Cannot change status from ${order.status} to ${status}`);
  }

  const statusField = status === 'preparing' ? 'preparing_at' :
                      status === 'ready' ? 'ready_at' :
                      status === 'delivering' ? 'delivering_at' :
                      status === 'delivered' ? 'delivered_at' : null;

  await env.DB.prepare(`
    UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, params.id).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(generateId(), params.id, status, comment || null, user.id).run();

  // Notify customer
  const statusLabels: Record<string, string> = {
    preparing: 'готовится',
    ready: 'готов к выдаче',
    delivering: 'доставляется',
    delivered: 'доставлен'
  };
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, datetime('now'))
  `).bind(generateId(), order.user_id, `Заказ ${order.order_number} ${statusLabels[status]}`, params.id).run();

  return json({ success: true });
});

// Manager: Dashboard stats
route('GET', '/api/marketplace/admin/dashboard', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const today = new Date().toISOString().slice(0, 10);

  const [newOrders, preparingOrders, deliveringOrders, todayOrders, todayRevenue, totalProducts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'new'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status IN ('confirmed', 'preparing', 'ready')`).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'delivering'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE date(created_at) = ?`).bind(today).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(final_amount), 0) as total FROM marketplace_orders WHERE date(created_at) = ? AND status != 'cancelled'`).bind(today).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_products WHERE is_active = 1`).first()
  ]);

  return json({
    stats: {
      new_orders: (newOrders as any)?.count || 0,
      preparing_orders: (preparingOrders as any)?.count || 0,
      delivering_orders: (deliveringOrders as any)?.count || 0,
      today_orders: (todayOrders as any)?.count || 0,
      today_revenue: (todayRevenue as any)?.total || 0,
      total_products: (totalProducts as any)?.count || 0
    }
  });
});

// Manager: Products CRUD
route('GET', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    ORDER BY p.created_at DESC
  `).all();

  return json({ products: results });
});

route('POST', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO marketplace_products (
      id, category_id, name_ru, name_uz, description_ru, description_uz,
      price, old_price, unit, stock_quantity, min_order_quantity, max_order_quantity,
      weight, weight_unit, image_url, images, is_active, is_featured, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.category_id, body.name_ru, body.name_uz || body.name_ru,
    body.description_ru || null, body.description_uz || null,
    body.price, body.old_price || null, body.unit || 'шт',
    body.stock_quantity || 0, body.min_order_quantity || 1, body.max_order_quantity || null,
    body.weight || null, body.weight_unit || 'кг',
    body.image_url || null, body.images ? JSON.stringify(body.images) : null,
    body.is_active !== false ? 1 : 0, body.is_featured ? 1 : 0, user.id
  ).run();

  const created = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ?`).bind(id).first();
  return json({ product: created }, 201);
});

route('PATCH', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'name_ru', 'name_uz', 'description_ru', 'description_uz', 'price', 'old_price', 'unit', 'stock_quantity', 'min_order_quantity', 'max_order_quantity', 'weight', 'weight_unit', 'image_url', 'is_active', 'is_featured'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' || field === 'is_featured' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (body.images) {
    updates.push('images = ?');
    values.push(JSON.stringify(body.images));
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime("now")');
    values.push(params.id);
    await env.DB.prepare(`UPDATE marketplace_products SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ?`).bind(params.id).first();
  return json({ product: updated });
});

route('DELETE', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  await env.DB.prepare(`UPDATE marketplace_products SET is_active = 0 WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
});

// Manager: Categories CRUD
route('POST', '/api/marketplace/admin/categories', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO marketplace_categories (id, name_ru, name_uz, icon, parent_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, body.name_ru, body.name_uz || body.name_ru, body.icon || '📦', body.parent_id || null, body.sort_order || 99).run();

  const created = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ?`).bind(id).first();
  return json({ category: created }, 201);
});

route('PATCH', '/api/marketplace/admin/categories/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name_ru', 'name_uz', 'icon', 'parent_id', 'sort_order', 'is_active'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (updates.length > 0) {
    values.push(params.id);
    await env.DB.prepare(`UPDATE marketplace_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ?`).bind(params.id).first();
  return json({ category: updated });
});

// ==================== DB MIGRATIONS ====================
// Track which migrations have been run in this worker instance
const migrationsRun = new Set<string>();

async function runMigrations(env: Env) {
  // Only run migrations once per worker instance
  if (migrationsRun.has('pause_fields')) return;

  try {
    // Check if columns exist using PRAGMA
    const tableInfo = await env.DB.prepare(`PRAGMA table_info(requests)`).all();
    const columns = (tableInfo.results || []).map((col: any) => col.name);

    // Add is_paused column if not exists
    if (!columns.includes('is_paused')) {
      await env.DB.prepare(`ALTER TABLE requests ADD COLUMN is_paused INTEGER DEFAULT 0`).run();
      console.log('Migration: Added is_paused column to requests');
    }

    // Add paused_at column if not exists
    if (!columns.includes('paused_at')) {
      await env.DB.prepare(`ALTER TABLE requests ADD COLUMN paused_at TEXT`).run();
      console.log('Migration: Added paused_at column to requests');
    }

    // Add total_paused_time column if not exists
    if (!columns.includes('total_paused_time')) {
      await env.DB.prepare(`ALTER TABLE requests ADD COLUMN total_paused_time INTEGER DEFAULT 0`).run();
      console.log('Migration: Added total_paused_time column to requests');
    }

    migrationsRun.add('pause_fields');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// ==================== MAIN HANDLER ====================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Run DB migrations (only once per worker instance)
    await runMigrations(env);

    // Set CORS origin for this request
    setCorsOrigin(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': currentCorsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    const url = new URL(request.url);

    // Try to match API routes
    if (url.pathname.startsWith('/api')) {
      const matched = matchRoute(request.method, url.pathname);
      if (matched) {
        // Wrap in monitoring middleware
        return await withMonitoring(request, async () => {
          try {
            // Apply rate limiting to non-auth endpoints (auth handles it internally)
            if (!url.pathname.startsWith('/api/auth/login') && !url.pathname.startsWith('/api/health')) {
              const user = await getUser(request, env);
              const identifier = getClientIdentifier(request, user);
              const endpoint = `${request.method}:${url.pathname}`;
              const rateLimit = await checkRateLimit(env, identifier, endpoint);

              if (!rateLimit.allowed) {
                const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
                return new Response(JSON.stringify({
                  error: `Rate limit exceeded. Try again in ${resetIn} seconds.`
                }), {
                  status: 429,
                  headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': currentCorsOrigin,
                    'X-RateLimit-Limit': (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': rateLimit.resetAt.toString(),
                    'Retry-After': resetIn.toString()
                  }
                });
              }

              // Add rate limit headers to successful response
              const response = await matched.handler(request, env, matched.params);

              // WebSocket responses have immutable headers, so we can't modify them
              // For WebSocket upgrade responses, skip adding rate limit headers
              if (response.status === 101 || response.headers.get('Upgrade') === 'websocket') {
                return response;
              }

              // For regular responses, create a new Response with rate limit headers
              const newHeaders = new Headers(response.headers);
              newHeaders.set('X-RateLimit-Limit', (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString());
              newHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
              newHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

              return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
              });
            }

            return await matched.handler(request, env, matched.params);
          } catch (err: any) {
            console.error('API Error:', err);
            return error(err.message || 'Internal server error', 500);
          }
        });
      }
      return error('Not found', 404);
    }

    // For SPA: serve static assets or fallback to index.html
    // env.ASSETS is automatically provided by Cloudflare when using assets config
    try {
      // Try to serve the requested asset
      const assetResponse = await env.ASSETS.fetch(request);

      // If asset found, return it
      if (assetResponse.status !== 404) {
        return assetResponse;
      }

      // For 404 (file not found), serve index.html for SPA routing
      const indexRequest = new Request(new URL('/', request.url).toString(), request);
      return env.ASSETS.fetch(indexRequest);
    } catch (e) {
      // Fallback to index.html on any error
      try {
        const indexRequest = new Request(new URL('/', request.url).toString(), request);
        return env.ASSETS.fetch(indexRequest);
      } catch {
        return new Response('UK CRM - Service temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
  }
};

// Export Durable Object
export { ConnectionManager } from './ConnectionManager';
