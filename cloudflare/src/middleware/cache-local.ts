// Local in-memory cache (per worker isolate)
// For datacenter migration: replace with Redis or keep as local LRU cache

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 30000; // 30 seconds

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

export function setCache(key: string, data: any, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
  // Cleanup old entries periodically
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expires < now) cache.delete(k);
    }
  }
}

export function invalidateCache(pattern: string) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}
