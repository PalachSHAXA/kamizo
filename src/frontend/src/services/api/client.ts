// API Client - Core infrastructure for all API modules

export const API_URL = '';

// Flag to prevent multiple 401 reload loops (resets after 5s so subsequent 401s aren't permanently ignored)
let isHandling401 = false;

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
      if (response.status === 401 && endpoint !== '/api/auth/login' && !isHandling401) {
        isHandling401 = true;
        // Reset flag after 5s so future 401s aren't permanently ignored
        setTimeout(() => { isHandling401 = false; }, 5000);
        localStorage.removeItem('auth_token');
        // Clear zustand persisted auth state
        try {
          const authState = JSON.parse(localStorage.getItem('uk-auth-storage') || '{}');
          if (authState?.state) {
            authState.state.user = null;
            authState.state.token = null;
            localStorage.setItem('uk-auth-storage', JSON.stringify(authState));
          }
        } catch {}
        // Reload page to show login (delayed to allow state cleanup)
        setTimeout(() => window.location.reload(), 100);
        throw new Error('Session expired');
      }
      throw new Error(data.error || 'API Error');
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
  } catch (error: any) {
    return { success: false, error: error.message || 'API Error' };
  }
}

// Transform user object from snake_case (API) to camelCase (frontend)
export function transformUser(user: any): any {
  if (!user) return user;
  return {
    ...user,
    // Map snake_case to camelCase for onboarding fields
    passwordChangedAt: user.password_changed_at || user.passwordChangedAt,
    contractSignedAt: user.contract_signed_at || user.contractSignedAt,
    buildingId: user.building_id || user.buildingId,
    totalArea: user.total_area || user.totalArea,
    signatureKey: user.signature_key || user.signatureKey,
    // Keep original fields too for backward compatibility
  };
}
