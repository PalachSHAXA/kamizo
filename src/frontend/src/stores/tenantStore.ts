import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_URL, getToken } from '../services/api/client';

export interface TenantConfig {
  tenant: {
    id: string;
    name: string;
    slug: string;
    color: string;
    color_secondary: string;
    plan: string;
    logo: string | null;
    is_demo: boolean;
    admin_phone?: string | null;
    contract?: {
      filename: string | null;
      uploaded_at: string | null;
      uploaded_by_name: string | null;
    } | null;
  } | null;
  features: string[];
  // Sprint 87 — backend-provided discriminator для случая tenant=null.
  // 'tenant'     — tenant существует (path 1/2/2.5)
  // 'apex'       — главный сайт kamizo.uz/app.kamizo.uz/www.kamizo.uz — все фичи
  // 'unresolved' — не смогли определить тенант (нативный клиент до логина,
  //                чужой домен, ошибка) — фичей нет
  context?: 'tenant' | 'apex' | 'unresolved';
}

interface TenantState {
  config: TenantConfig | null;
  fetchedAt: number;              // ms epoch последнего успешного fetch (для 24h TTL)
  isLoading: boolean;
  isConfigFetched: boolean;
  isStale: boolean;                // true → используем cached fallback (offline mode)
  error: string | null;
  fetchConfig: () => Promise<void>;
  hasFeature: (feature: string) => boolean;
  clear: () => void;
}

// Раскладываем tenantId из JWT без верификации подписи — только для
// key/rehydrate-match. Верификация происходит на бэке при каждом запросе.
function decodeJWTTenantId(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload?.tenantId as string) || null;
  } catch {
    return null;
  }
}

// Sprint 87 — surface network failure faster on splash. Was 3 attempts
// × 4 s + [1 s, 2 s] pauses = 15 s worst-case, which stranded users on
// splash for ~15 s on dead-but-connected WiFi (route lost mid-flight).
// Cut to 2 attempts × 3.5 s + one 1 s pause = 8 s retry budget;
// +400 ms fade in NativeSplashOverlay ⇒ 8.4 s to the error card on
// truly dead network. Single-packet blip resilience preserved via the
// second attempt. Healthy-network path is unchanged — attempt №1 wins
// in ~200 ms, well below both timeouts. The 20 s hard-cap backstop in
// NativeSplashOverlay stays > retry budget, so the store's own error
// branch still wins first.
const PER_ATTEMPT_TIMEOUT_MS = 3500;
const RETRY_PAUSES_MS = [1000];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      config: null,
      fetchedAt: 0,
      isLoading: false,
      isConfigFetched: false,
      isStale: false,
      error: null,

      fetchConfig: async () => {
        set({ isLoading: true, error: null });
        // 3 попытки: 4с timeout + пауза 1с + 4с + пауза 2с + 4с = ≤15с worst
        for (let i = 0; i <= RETRY_PAUSES_MS.length; i++) {
          try {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), PER_ATTEMPT_TIMEOUT_MS);
            const token = getToken();
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
            const response = await fetch(`${API_URL}/api/tenant/config`, { headers, signal: ctrl.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const config = (await response.json()) as TenantConfig;
            set({
              config,
              fetchedAt: Date.now(),
              isLoading: false,
              isConfigFetched: true,
              isStale: false,
              error: null,
            });
            return;
          } catch (e) {
            if (i < RETRY_PAUSES_MS.length) {
              await new Promise((r) => setTimeout(r, RETRY_PAUSES_MS[i]));
            }
          }
        }

        // Все попытки провалились. Кэш можно использовать только если
        // tenant_id из JWT совпадает с cached.tenant.id — иначе
        // получим утечку между тенантами на нативе (один origin).
        const cached = get().config;
        const currentJwtTenantId = decodeJWTTenantId(getToken() || '');
        if (cached?.tenant && cached.tenant.id === currentJwtTenantId) {
          set({
            isLoading: false,
            isConfigFetched: true,
            isStale: true,
            error: 'Работаем в оффлайн-режиме',
          });
        } else {
          set({
            isLoading: false,
            isConfigFetched: false,
            isStale: false,
            error: 'Не удалось загрузить конфигурацию',
            config: null,
          });
        }
      },

      hasFeature: (feature: string) => {
        const { config, isConfigFetched } = get();
        // Гейт до подгрузки — false (кроме apex, который резолвится ниже).
        if (!isConfigFetched) return false;
        if (!config?.tenant) {
          // Backend сказал, что мы на apex (главный сайт) — все фичи.
          // Всё остальное с null-tenant — false (native pre-login, чужой домен, ошибка).
          return config?.context === 'apex';
        }
        return config.features.includes(feature);
      },

      clear: () => {
        set({
          config: null,
          fetchedAt: 0,
          isLoading: false,
          isConfigFetched: false,
          isStale: false,
          error: null,
        });
      },
    }),
    {
      // Ключ по tenant_id из JWT — иначе на нативе один localStorage на
      // всех тенантов и сотрудник choko поднимет кэш myhelper.
      // При отсутствии токена (pre-login, apex-браузер) — 'anon' bucket.
      name: (() => {
        try {
          const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
          const tid = token ? decodeJWTTenantId(token) : null;
          return tid ? `tenant-config-${tid}` : 'tenant-config-anon';
        } catch {
          return 'tenant-config-anon';
        }
      })(),
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ config: state.config, fetchedAt: state.fetchedAt }),
      onRehydrateStorage: () => (state) => {
        // Сверяем cached.tenant.id с JWT.tenantId. Если не совпало —
        // сбрасываем кэш (защита от утечки между тенантами в нативе).
        if (!state) return;
        if (!state.config?.tenant) return;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const jwtTid = token ? decodeJWTTenantId(token) : null;
        if (state.config.tenant.id !== jwtTid) {
          state.config = null;
          state.fetchedAt = 0;
          state.isConfigFetched = false;
          return;
        }
        // TTL 24ч — свежий cache сразу поднимает isConfigFetched=true
        // (мгновенный старт без splash), fetchConfig() всё равно освежит.
        const fresh = state.fetchedAt && Date.now() - state.fetchedAt < CACHE_TTL_MS;
        if (fresh) state.isConfigFetched = true;
      },
    },
  ),
);
