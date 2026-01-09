/**
 * Advanced Caching Layer for UK CRM
 *
 * Двухуровневое кэширование:
 * 1. Memory Cache (per-isolate) - быстрый, но локальный
 * 2. KV Cache (global) - медленнее, но глобальный
 *
 * Стратегия:
 * - Горячие данные (categories, buildings) → KV (TTL 24h)
 * - Часто запрашиваемые (users, executors) → Memory (TTL 5min) + KV (TTL 1h)
 * - Динамичные данные (requests) → НЕ кэшируются
 *
 * Инвалидация:
 * - Автоматическая по TTL
 * - Ручная при UPDATE/DELETE/INSERT
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
  version: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  memoryHits: number;
  kvHits: number;
  invalidations: number;
}

// In-memory cache (per Worker isolate)
const memoryCache = new Map<string, CacheEntry<any>>();
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  memoryHits: 0,
  kvHits: 0,
  invalidations: 0,
};

// Cache version for invalidation
let cacheVersion = 1;

// TTL константы (в миллисекундах)
export const CacheTTL = {
  // Статические данные (редко меняются)
  CATEGORIES: 24 * 60 * 60 * 1000,      // 24 часа
  BUILDINGS: 12 * 60 * 60 * 1000,       // 12 часов
  BUILDING_STATS: 5 * 60 * 1000,        // 5 минут

  // Справочные данные
  USERS_LIST: 10 * 60 * 1000,           // 10 минут
  USER_BY_ID: 30 * 60 * 1000,           // 30 минут
  EXECUTORS: 5 * 60 * 1000,             // 5 минут

  // Динамические данные (короткий TTL)
  REQUESTS_COUNT: 30 * 1000,            // 30 секунд
  ANNOUNCEMENTS: 2 * 60 * 1000,         // 2 минуты

  // Аутентификация
  AUTH_TOKEN: 60 * 60 * 1000,           // 1 час
} as const;

// Префиксы ключей для разных типов данных
export const CachePrefix = {
  CATEGORY: 'cat:',
  CATEGORIES_ALL: 'cats:all',
  BUILDING: 'bld:',
  BUILDINGS_ALL: 'blds:all',
  USER: 'usr:',
  USERS_ALL: 'usrs:all',
  EXECUTOR: 'exec:',
  EXECUTORS_ALL: 'execs:all',
  REQUESTS_COUNT: 'reqs:count:',
  AUTH_TOKEN: 'auth:',
} as const;

/**
 * Универсальная функция для получения из кэша
 * Сначала проверяет Memory, потом KV
 */
export async function getCached<T>(
  key: string,
  kvNamespace?: KVNamespace
): Promise<T | null> {
  // 1. Проверяем Memory Cache
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.expires > Date.now() && memEntry.version === cacheVersion) {
    cacheStats.hits++;
    cacheStats.memoryHits++;
    return memEntry.data as T;
  }

  // 2. Проверяем KV Cache (если доступен)
  if (kvNamespace) {
    try {
      const kvValue = await kvNamespace.get<CacheEntry<T>>(key, 'json');
      if (kvValue && kvValue.expires > Date.now() && kvValue.version === cacheVersion) {
        // Сохраняем в Memory для следующих запросов
        memoryCache.set(key, kvValue);
        cacheStats.hits++;
        cacheStats.kvHits++;
        return kvValue.data;
      }
    } catch (error) {
      console.error('[Cache] KV read error:', error);
    }
  }

  cacheStats.misses++;
  return null;
}

/**
 * Сохранить в оба уровня кэша
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttl: number,
  kvNamespace?: KVNamespace
): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    expires: Date.now() + ttl,
    version: cacheVersion,
  };

  // 1. Сохраняем в Memory
  memoryCache.set(key, entry);

  // 2. Сохраняем в KV (если доступен и TTL > 1 минуты)
  if (kvNamespace && ttl > 60000) {
    try {
      await kvNamespace.put(key, JSON.stringify(entry), {
        expirationTtl: Math.floor(ttl / 1000), // KV принимает секунды
      });
    } catch (error) {
      console.error('[Cache] KV write error:', error);
    }
  }

  // Периодическая очистка Memory Cache
  if (memoryCache.size > 1000) {
    cleanupMemoryCache();
  }
}

/**
 * Инвалидация конкретного ключа
 */
export async function invalidateCache(
  key: string,
  kvNamespace?: KVNamespace
): Promise<void> {
  cacheStats.invalidations++;

  // Удаляем из Memory
  memoryCache.delete(key);

  // Удаляем из KV
  if (kvNamespace) {
    try {
      await kvNamespace.delete(key);
    } catch (error) {
      console.error('[Cache] KV delete error:', error);
    }
  }
}

/**
 * Инвалидация по паттерну (префиксу)
 */
export async function invalidatePattern(
  pattern: string,
  kvNamespace?: KVNamespace
): Promise<void> {
  cacheStats.invalidations++;

  // Memory Cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pattern)) {
      memoryCache.delete(key);
    }
  }

  // KV Cache - полная инвалидация этого префикса
  // Note: KV не поддерживает bulk delete, поэтому инкрементируем версию
  if (pattern === 'all') {
    cacheVersion++;
    memoryCache.clear();
    console.log(`[Cache] Global invalidation, new version: ${cacheVersion}`);
  }
}

/**
 * Очистка устаревших записей из Memory
 */
function cleanupMemoryCache(): void {
  const now = Date.now();
  let deleted = 0;

  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expires < now || entry.version !== cacheVersion) {
      memoryCache.delete(key);
      deleted++;
    }
  }

  if (deleted > 0) {
    console.log(`[Cache] Cleaned up ${deleted} expired entries`);
  }
}

/**
 * Получить статистику кэша
 */
export function getCacheStats(): CacheStats & { memorySize: number; hitRate: string } {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(2) : '0.00';

  return {
    ...cacheStats,
    memorySize: memoryCache.size,
    hitRate: `${hitRate}%`,
  };
}

/**
 * Сбросить статистику
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.memoryHits = 0;
  cacheStats.kvHits = 0;
  cacheStats.invalidations = 0;
}

/**
 * Helper: Обертка для кэшированного запроса к БД
 *
 * @example
 * const categories = await cachedQuery(
 *   CachePrefix.CATEGORIES_ALL,
 *   CacheTTL.CATEGORIES,
 *   async () => {
 *     const { results } = await env.DB.prepare('SELECT * FROM categories WHERE is_active = 1').all();
 *     return results;
 *   },
 *   env.RATE_LIMITER
 * );
 */
export async function cachedQuery<T>(
  key: string,
  ttl: number,
  queryFn: () => Promise<T>,
  kvNamespace?: KVNamespace
): Promise<T> {
  // Проверяем кэш
  const cached = await getCached<T>(key, kvNamespace);
  if (cached !== null) {
    return cached;
  }

  // Выполняем запрос
  const data = await queryFn();

  // Сохраняем в кэш
  await setCached(key, data, ttl, kvNamespace);

  return data;
}

/**
 * Helper: Кэширование с автоматической сериализацией аргументов
 * Полезно для динамических запросов с параметрами
 *
 * @example
 * const user = await cachedQueryWithArgs(
 *   CachePrefix.USER,
 *   CacheTTL.USER_BY_ID,
 *   [userId],
 *   async (id) => {
 *     return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
 *   },
 *   env.RATE_LIMITER
 * );
 */
export async function cachedQueryWithArgs<T, Args extends any[]>(
  prefix: string,
  ttl: number,
  args: Args,
  queryFn: (...args: Args) => Promise<T>,
  kvNamespace?: KVNamespace
): Promise<T> {
  // Создаем уникальный ключ на основе аргументов
  const argsKey = args.map(arg => String(arg)).join(':');
  const key = `${prefix}${argsKey}`;

  return cachedQuery(key, ttl, () => queryFn(...args), kvNamespace);
}

/**
 * Middleware для автоматической инвалидации при изменении данных
 * Вызывать после INSERT/UPDATE/DELETE
 */
export async function invalidateOnChange(
  table: string,
  kvNamespace?: KVNamespace
): Promise<void> {
  const patterns: Record<string, string[]> = {
    categories: [CachePrefix.CATEGORIES_ALL, CachePrefix.CATEGORY],
    buildings: [CachePrefix.BUILDINGS_ALL, CachePrefix.BUILDING],
    users: [CachePrefix.USERS_ALL, CachePrefix.USER, CachePrefix.EXECUTORS_ALL, CachePrefix.EXECUTOR],
    requests: [CachePrefix.REQUESTS_COUNT],
    announcements: [], // Не кэшируем announcements глобально
  };

  const toInvalidate = patterns[table] || [];

  for (const pattern of toInvalidate) {
    await invalidatePattern(pattern, kvNamespace);
  }

  console.log(`[Cache] Invalidated cache for table: ${table}`);
}

/**
 * Health check для кэша
 */
export function isCacheHealthy(): boolean {
  const stats = getCacheStats();
  const hitRate = parseFloat(stats.hitRate);

  // Здоровый кэш: hit rate > 60%, размер < 5000 записей
  return hitRate > 60 && stats.memorySize < 5000;
}
