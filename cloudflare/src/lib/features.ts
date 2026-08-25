// Единый источник истины по ключам фич тенанта (tenants.features).
//
// Зачем файл: ключи разъехались между слоями. tenants.features
// создавался с "votes", а гейты (requireFeature на бэке,
// hasFeature/ProtectedRoute на фронте) всегда спрашивали "meetings" —
// раздел «Собрания» у таких тенантов молча редиректил на главную.
// Аналогично "announcements" и "rental_listings" отсутствовали в
// дефолте, хотя пункты меню рендерились всем.
//
// Правило: писать в БД и проверять — только ключи из TENANT_FEATURES.
// Легаси-ключи из старых строк приводятся к каноническим в
// normalizeFeatures() на чтении, поэтому миграция данных не обязательна
// для работы гейтов (но она есть — 069_canonical_tenant_features.sql —
// чтобы БД не хранила мусор).

export const TENANT_FEATURES = [
  'requests',
  'rentals',
  'rental_listings',
  'qr',
  'marketplace',
  'meetings',
  'chat',
  'announcements',
  'trainings',
  'colleagues',
  'vehicles',
  'useful-contacts',
  'notepad',
  'communal',
  'advertiser',
  'reports',
] as const;

export type TenantFeature = (typeof TENANT_FEATURES)[number];

const TENANT_FEATURE_SET = new Set<string>(TENANT_FEATURES);

// Легаси-ключ → канонический. Только для чтения существующих строк.
const LEGACY_FEATURE_ALIASES: Record<string, TenantFeature> = {
  votes: 'meetings',
};

export function isTenantFeature(key: unknown): key is TenantFeature {
  return typeof key === 'string' && TENANT_FEATURE_SET.has(key);
}

// Дефолт для нового тенанта. Это ровно старый набор
// ["requests","votes","qr","rentals","notepad","reports"], переведённый в
// канонические ключи ("votes" → "meetings"): объём прав не меняется,
// чинится только несовпадение ключа с гейтом.
export const DEFAULT_TENANT_FEATURES: TenantFeature[] = [
  'requests',
  'meetings',
  'qr',
  'rentals',
  'notepad',
  'reports',
];

// Набор, который выдаётся, когда в строке тенанта features = NULL.
// Шире дефолта намеренно: строка без features — это легаси/ручная
// вставка, и запирать такому тенанту весь интерфейс хуже, чем открыть.
export const FALLBACK_TENANT_FEATURES: TenantFeature[] = [
  'requests',
  'qr',
  'rentals',
  'notepad',
  'reports',
  'chat',
  'announcements',
  'communal',
  'meetings',
];

/**
 * Приводит сырое значение tenants.features к каноническому списку:
 * принимает JSON-строку или массив, отбрасывает не-строки и неизвестные
 * ключи, разворачивает легаси-алиасы, убирает дубли.
 * Никогда не бросает — на мусоре возвращает [].
 */
export function normalizeFeatures(raw: unknown): TenantFeature[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: TenantFeature[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const canonical = LEGACY_FEATURE_ALIASES[item] ?? item;
    if (isTenantFeature(canonical) && !out.includes(canonical)) {
      out.push(canonical);
    }
  }
  return out;
}
