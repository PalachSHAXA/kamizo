// API Client - Core infrastructure for all API modules

// Cross-origin API endpoint hosted in Tashkent (PDN compliance).
// Single source of truth for everything that needs to reach the backend.
// Importing API_URL here (instead of deriving from window.location) is
// what makes the unified mobile app work: Capacitor's WebView origin is
// https://localhost (Android) / capacitor://localhost (iOS), so any
// hostname-derived URL would 404 against the bundled-asset host. Always
// import this constant; never use window.location.origin / .host for
// API or WebSocket routing.
export const API_URL = 'https://api.kamizo.uz';

// WebSocket sibling — same authority, wss scheme. Used by
// useWebSocketSync for live updates. Same rationale as API_URL: native
// shells have no usable hostname, so we hardcode the prod authority and
// reach it directly. The token is appended at call sites.
export const WS_URL = 'wss://api.kamizo.uz';

// Pull the user-facing error string in the active language.
// Backend may return:
//   - { error_ru, error_uz, error } (new bilingualError helper)
//   - { error: '...' }              (legacy single-lang)
// We read languageStore from localStorage instead of importing the store to
// avoid a dependency cycle (api/client → store → api).
function pickErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'API Error';
  const d = data as Record<string, unknown>;
  let lang: 'ru' | 'uz' = 'ru';
  try {
    const raw = localStorage.getItem('language-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.language === 'uz') lang = 'uz';
    }
  } catch { /* ignore */ }
  const localized = lang === 'uz' ? d.error_uz : d.error_ru;
  if (typeof localized === 'string' && localized.length > 0) return localized;
  if (typeof d.error === 'string') return d.error;
  return 'API Error';
}

// Track 401 responses: require multiple 401s before forcing logout.
// A single 401 can happen from transient issues (race condition, stale cache).
// Only force logout after 3+ consecutive 401s within 15s, AND never within
// the first 10s after a successful login (grace period for initial data load —
// some roles fan out to many endpoints, a couple of them may briefly return
// 401 while the auth middleware warms up).
let isHandling401 = false;
let consecutive401Count = 0;
let first401Timestamp = 0;
const LOGOUT_THRESHOLD = 3;
const WINDOW_MS = 15_000;
let loginGraceUntil = 0;
export function markLoggedIn() {
  loginGraceUntil = Date.now() + 10_000;
  consecutive401Count = 0;
  first401Timestamp = 0;
}

// Get auth token from localStorage
export const getToken = () => localStorage.getItem('auth_token');

// Response wrapper type for consistent API handling
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// === REQUEST CACHE & DEDUPLICATION ===
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

// Cache TTL values (ms)
export const CACHE_TTL = {
  SHORT: 10 * 1000,     // 10 sec - for frequently changing data (requests list)
  MEDIUM: 60 * 1000,    // 1 min - for moderately changing data (executors)
  LONG: 2 * 60 * 1000,  // 2 min - for buildings (reduced from 5 min for better sync)
} as const;

// Get cached data if valid
function getCached<T>(key: string): T | null {
  const entry = requestCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > entry.ttl;
  if (isExpired) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

// Set cache with TTL (max 200 entries to prevent memory leak)
const MAX_CACHE_SIZE = 200;
function setCache<T>(key: string, data: T, ttl: number): void {
  if (requestCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = requestCache.keys().next().value;
    if (firstKey) requestCache.delete(firstKey);
  }
  requestCache.set(key, { data, timestamp: Date.now(), ttl });
}

// Clear specific cache entries
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    requestCache.clear();
    return;
  }
  for (const key of requestCache.keys()) {
    if (key.includes(pattern)) {
      requestCache.delete(key);
    }
  }
}

// Default timeout for API requests (30 seconds)
const API_TIMEOUT = 30000;

// Sprint 84 — security: ApiError carries the parsed HTTP status + body
// so callers can DISCRIMINATE a server-rejected request (non-2xx with
// a parseable JSON body) from a true network failure (offline, DNS
// fail, timeout, 5xx without JSON). Critical for the QR-pass scanner:
// before this class, every catch block could only see `error.message`
// and had to assume the server might be unreachable — which led the
// scanner's offline-fallback path to treat a definitive 403
// cross_tenant as "we don't know, try offline validation", and the
// offline path admitted any well-formed foreign-tenant GAPASS.
//
// The class extends Error so EVERY existing call site that just reads
// `error.message` keeps working unchanged; only call sites that need
// the discriminator (currently: GuardQRScannerPage.tsx) check
// `instanceof ApiError` and read `.status` / `.body`.
export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// Helper for API requests - returns raw data for backward compatibility
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = API_TIMEOUT
): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      // Auto-logout on 401 (stale token, tenant mismatch, etc.)
      // Require multiple consecutive 401s before forcing logout to avoid
      // kicking users out on transient errors (stale cache, race conditions).
      if (response.status === 401 && endpoint !== '/api/auth/login' && !isHandling401) {
        const now = Date.now();
        // During the post-login grace period, just throw without counting —
        // some endpoints legitimately 401 while the auth middleware's tenant
        // resolution catches up for this role.
        if (now < loginGraceUntil) {
          throw new ApiError(pickErrorMessage(data), response.status, data);
        }
        if (now - first401Timestamp > WINDOW_MS) {
          // Reset counter if too much time passed since first 401
          consecutive401Count = 0;
        }
        if (consecutive401Count === 0) {
          first401Timestamp = now;
        }
        consecutive401Count++;

        if (consecutive401Count >= LOGOUT_THRESHOLD) {
          isHandling401 = true;
          consecutive401Count = 0;
          // Reset flag after 10s so future 401s aren't permanently ignored
          setTimeout(() => { isHandling401 = false; }, 10_000);
          localStorage.removeItem('auth_token');
          // Clear zustand persisted auth state
          try {
            const authState = JSON.parse(localStorage.getItem('uk-auth-storage') || '{}');
            if (authState?.state) {
              authState.state.user = null;
              authState.state.token = null;
              localStorage.setItem('uk-auth-storage', JSON.stringify(authState));
            }
          } catch { /* storage cleanup may fail */ }
          // Reload page to show login (delayed to allow state cleanup)
          setTimeout(() => window.location.reload(), 100);
          throw new ApiError('Session expired', response.status, data);
        }
        // First 401: just throw, don't wipe session — might be transient
        throw new ApiError(pickErrorMessage(data), response.status, data);
      }
      throw new ApiError(pickErrorMessage(data), response.status, data);
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания запроса. Проверьте соединение.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Cached GET request with deduplication
export async function cachedGet<T>(
  endpoint: string,
  ttl: number = CACHE_TTL.SHORT
): Promise<T> {
  const cacheKey = endpoint;

  // Return cached data if available
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  // Deduplicate: if same request is in flight, wait for it
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;

  // Make the request
  const request = apiRequest<T>(endpoint).then(data => {
    setCache(cacheKey, data, ttl);
    pendingRequests.delete(cacheKey);
    return data;
  }).catch(err => {
    pendingRequests.delete(cacheKey);
    throw err;
  });

  pendingRequests.set(cacheKey, request);
  return request;
}

// Helper for API requests - returns wrapped response { success, data, error }
export async function apiRequestWrapped<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const data = await apiRequest<T>(endpoint, options);
    return { success: true, data };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'API Error' };
  }
}

// Transform user object from snake_case (API) to camelCase (frontend)
export function transformUser(user: Record<string, unknown>): Record<string, unknown> {
  if (!user) return user;
  return {
    ...user,
    // Map snake_case to camelCase for onboarding fields
    passwordChangedAt: user.password_changed_at || user.passwordChangedAt,
    contractSignedAt: user.contract_signed_at || user.contractSignedAt,
    buildingId: user.building_id || user.buildingId,
    totalArea: user.total_area || user.totalArea,
    personalAccount: user.personal_account || user.personalAccount,
    signatureKey: user.signature_key || user.signatureKey,
    // Keep original fields too for backward compatibility
  };
}
