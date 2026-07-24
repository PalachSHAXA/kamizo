// DEV-ONLY resident-rentals mock. Trivially deletable, tree-shaken from
// prod builds.
//
// Two gates on the top-level side effect:
//   1. import.meta.env.DEV                    → Vite folds to `false` in
//      prod builds → Rollup drops this whole `if` body.
//   2. STATE resolves to 'off'|'empty'|'populated' → controlled by
//      URL query `?rentals=…` (wins) OR env `VITE_MOCK_RENTALS_STATE`
//      OR default 'populated' when a URL param is absent but the env
//      var is present.
//
// STATE MODES:
//   • 'off'       → tenant feature `rental_listings` is NOT added to
//                    features[] → hasFeature('rental_listings') = false
//                    → RentalsFeedPage renders the gate ("your building
//                    hasn't enabled this yet"). Perfect for reviewing
//                    the copy.
//   • 'empty'     → flag ON, MOCK_LISTINGS = [] → empty-state feed.
//   • 'populated' → flag ON, 5 listings seeded (see below).
//
// This mock COMPOSES with the marketplace mock — both may run at the
// same page load. Both call setState({...features}) with a MERGE so
// neither loses the other's feature entries.

import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import type { RentalListingAPI, RentalListingPhotoAPI, RentalListingReportAPI } from './types';

// ── Build-time gate — mirrors marketplace/__devMock.ts pattern ──────
// IS_MOCK is a PURE INLINE EXPRESSION Rollup constant-folds. In prod
// builds `import.meta.env.DEV` is folded to `false`, so IS_MOCK
// becomes `false && …` → `false` — a build-time literal. Every
// `if (IS_MOCK)` block in this module (and in api.ts) then becomes
// dead code and Rollup eliminates it, taking MOCK_LISTINGS_POPULATED,
// MOCK_PHOTOS_POPULATED, resolveMockRole, resolveMockState, and every
// unsplash literal with it. Verified via grep on dist/.
//
// Consequence: to activate the mock at all, VITE_MOCK_RENTALS_STATE
// must be set at BUILD time. URL param `?rentals=off|empty|populated`
// only VARIES the state within an already-mock-active dev run; it
// cannot turn the mock on if the env var was absent at build.
export const IS_MOCK =
  import.meta.env.DEV && !!import.meta.env.VITE_MOCK_RENTALS_STATE;

function resolveMockState(): 'off' | 'empty' | 'populated' {
  let url: string | null = null;
  try {
    if (typeof window !== 'undefined') {
      url = new URLSearchParams(window.location.search).get('rentals');
    }
  } catch { /* SSR / no window — ignore */ }
  const env = import.meta.env.VITE_MOCK_RENTALS_STATE as string | undefined;
  const candidate = url || env || 'populated';
  if (candidate === 'off' || candidate === 'empty' || candidate === 'populated') {
    return candidate;
  }
  return 'populated';
}

// Ternary IS_MOCK ? … : null — with IS_MOCK constant-folded to false in
// prod, the whole call to resolveMockState is dead code and gets dropped.
export const MOCK_STATE: 'off' | 'empty' | 'populated' | null =
  IS_MOCK ? resolveMockState() : null;

// Current mock user id — this is the "resident viewing the app" for
// mock purposes. Their own listing appears in the feed marked «ваше»
// per the design brief, and also under My Listings.
export const MOCK_USER_ID = 'dev-mock-user';
export const MOCK_TENANT_ID = 'dev-mock-tenant';
export const MOCK_UK_USER_ID = 'dev-mock-uk-user';

// ── Photo pool — real interior photos from Unsplash. External CDN is
//    fine in dev + on emulator; the marketplace mock already proved
//    this. Real API will carry base64 data-URLs here. Shape unchanged.
const P = {
  living_bright: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=900&fit=crop&auto=format',
  living_warm:   'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&h=900&fit=crop&auto=format',
  kitchen:       'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&h=900&fit=crop&auto=format',
  bedroom:       'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&h=900&fit=crop&auto=format',
  bathroom:      'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&h=900&fit=crop&auto=format',
  studio:        'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&h=900&fit=crop&auto=format',
  living_dark:   'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&h=900&fit=crop&auto=format',
  loft:          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=900&fit=crop&auto=format',
  balcony:       'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=900&fit=crop&auto=format',
};

// ── Mock catalog — 5 listings covering every card branch and every
//    lifecycle state for MyListings ─────────────────────────────────
// Feed shows: rl-01 (УК), rl-02 (neighbour), rl-03 (mock user's own,
//   marked «ваше»). rl-04 rented + rl-05 hidden — not in feed.
// My Listings shows: rl-03 active (with renewal due) + rl-04 rented
//   + rl-05 hidden.
const MOCK_LISTINGS_POPULATED: RentalListingAPI[] = [
  {
    id: 'rl-01',
    tenant_id: MOCK_TENANT_ID,
    publisher_user_id: MOCK_UK_USER_ID,
    source_type: 'uk',
    state: 'active',
    hidden_reason: null, hidden_by_user_id: null, hidden_at: null,
    rooms: 2, area_m2: 48, floor: 9, floor_total: 16,
    apartment_number: '91', entrance: '3', building_id: 'dev-mock-building-1',
    price_monthly: 3_500_000, price_currency: 'UZS', deposit_months: 1,
    furnished: 1, air_conditioning: 1, internet: 1, parking: 0, animals_allowed: 0,
    duration_type: 'long',
    description: 'Уютная светлая двушка на 9 этаже с видом во двор. Тёплые полы в санузле, новая техника, кондиционер. Заезд с 15 августа, длительно.',
    phone_visible: 1,
    last_confirmed_at: '2026-07-22 09:00:00',
    confirm_prompt_sent_at: null,
    created_at: '2026-07-16 10:00:00',
    updated_at: '2026-07-22 09:00:00',
    publisher_name: 'Управляющая компания «Choko»',
    publisher_phone: '+998 90 123 45 67',
    publisher_login: 'choko-uk',
  },
  {
    id: 'rl-02',
    tenant_id: MOCK_TENANT_ID,
    publisher_user_id: 'dev-mock-neighbour-1',
    source_type: 'resident',
    state: 'active',
    hidden_reason: null, hidden_by_user_id: null, hidden_at: null,
    rooms: 3, area_m2: 72, floor: 5, floor_total: 16,
    apartment_number: '45', entrance: '1', building_id: 'dev-mock-building-1',
    price_monthly: 5_200_000, price_currency: 'UZS', deposit_months: 1,
    furnished: 1, air_conditioning: 1, internet: 1, parking: 1, animals_allowed: 0,
    duration_type: 'long',
    description: 'Трёшка после свежего ремонта. Два раздельных санузла, гардеробная, гостевая парковка. Без животных, длительно от полугода.',
    phone_visible: 1,
    last_confirmed_at: '2026-07-23 14:00:00',
    confirm_prompt_sent_at: null,
    created_at: '2026-07-19 08:00:00',
    updated_at: '2026-07-23 14:00:00',
    publisher_name: 'Ольга М.',
    publisher_phone: '+998 91 987 65 43',
    publisher_login: 'olga.m',
  },
  {
    id: 'rl-03',
    tenant_id: MOCK_TENANT_ID,
    publisher_user_id: MOCK_USER_ID,        // owned by current mock user
    source_type: 'resident',
    state: 'active',
    hidden_reason: null, hidden_by_user_id: null, hidden_at: null,
    rooms: 1, area_m2: 38, floor: 3, floor_total: 16,
    apartment_number: '12', entrance: '2', building_id: 'dev-mock-building-1',
    price_monthly: 2_800_000, price_currency: 'UZS', deposit_months: 1,
    furnished: 1, air_conditioning: 0, internet: 1, parking: 0, animals_allowed: 1,
    duration_type: 'long',
    description: 'Уютная однушка с балконом. Тихий двор, рядом школа и продуктовый. Кошки — можно. Длительно.',
    phone_visible: 1,
    // 15 days ago → renewal-nudge banner appears in «Мои»
    last_confirmed_at: '2026-07-09 10:00:00',
    confirm_prompt_sent_at: '2026-07-23 09:00:00',
    created_at: '2026-06-20 15:00:00',
    updated_at: '2026-07-23 09:00:00',
    publisher_name: 'Dev Preview',
    publisher_phone: '+998 90 000 00 00',
    publisher_login: 'dev-mock',
  },
  {
    id: 'rl-04',
    tenant_id: MOCK_TENANT_ID,
    publisher_user_id: MOCK_USER_ID,
    source_type: 'resident',
    state: 'rented',                         // «Сдано» — not in feed, in «Мои»
    hidden_reason: null, hidden_by_user_id: null, hidden_at: null,
    rooms: 0, area_m2: 32, floor: 4, floor_total: 16,
    apartment_number: '48', entrance: '2', building_id: 'dev-mock-building-1',
    price_monthly: 1_950_000, price_currency: 'UZS', deposit_months: 1,
    furnished: 1, air_conditioning: 1, internet: 1, parking: 0, animals_allowed: 0,
    duration_type: 'long',
    description: 'Компактная студия с южной стороны. Идеально для одного или пары.',
    phone_visible: 0,
    last_confirmed_at: '2026-07-01 12:00:00',
    confirm_prompt_sent_at: null,
    created_at: '2026-05-10 10:00:00',
    updated_at: '2026-07-01 12:00:00',
    publisher_name: 'Dev Preview',
    publisher_phone: '+998 90 000 00 00',
    publisher_login: 'dev-mock',
  },
  {
    id: 'rl-05',
    tenant_id: MOCK_TENANT_ID,
    publisher_user_id: MOCK_USER_ID,
    source_type: 'resident',
    state: 'hidden',                         // «Скрыто модерацией» — red banner in «Мои»
    hidden_reason: 'Фото не с этой квартиры — замените и напишите УК.',
    hidden_by_user_id: MOCK_UK_USER_ID,
    hidden_at: '2026-07-22 11:30:00',
    rooms: 2, area_m2: 55, floor: 11, floor_total: 16,
    apartment_number: '178', entrance: '4', building_id: 'dev-mock-building-1',
    price_monthly: 4_100_000, price_currency: 'UZS', deposit_months: 1,
    furnished: 1, air_conditioning: 1, internet: 1, parking: 0, animals_allowed: 0,
    duration_type: 'long',
    description: 'Двушка с видом на парк, с мебелью, кондиционер, интернет-оптика. От 6 месяцев.',
    phone_visible: 1,
    last_confirmed_at: '2026-07-20 10:00:00',
    confirm_prompt_sent_at: null,
    created_at: '2026-07-18 14:00:00',
    updated_at: '2026-07-22 11:30:00',
    publisher_name: 'Dev Preview',
    publisher_phone: '+998 90 000 00 00',
    publisher_login: 'dev-mock',
  },
];

// ── Photos — 2-4 per listing ────────────────────────────────────────
const MOCK_PHOTOS_POPULATED: RentalListingPhotoAPI[] = [
  // rl-01 (УК-verified 2-комн)
  { id: 'rp-01-0', listing_id: 'rl-01', tenant_id: MOCK_TENANT_ID, sort_order: 0, data_url: P.living_bright, created_at: '2026-07-16 10:00:00' },
  { id: 'rp-01-1', listing_id: 'rl-01', tenant_id: MOCK_TENANT_ID, sort_order: 1, data_url: P.kitchen,       created_at: '2026-07-16 10:00:00' },
  { id: 'rp-01-2', listing_id: 'rl-01', tenant_id: MOCK_TENANT_ID, sort_order: 2, data_url: P.bedroom,       created_at: '2026-07-16 10:00:00' },
  { id: 'rp-01-3', listing_id: 'rl-01', tenant_id: MOCK_TENANT_ID, sort_order: 3, data_url: P.bathroom,      created_at: '2026-07-16 10:00:00' },

  // rl-02 (Ольга М.)
  { id: 'rp-02-0', listing_id: 'rl-02', tenant_id: MOCK_TENANT_ID, sort_order: 0, data_url: P.living_warm,   created_at: '2026-07-19 08:00:00' },
  { id: 'rp-02-1', listing_id: 'rl-02', tenant_id: MOCK_TENANT_ID, sort_order: 1, data_url: P.loft,          created_at: '2026-07-19 08:00:00' },
  { id: 'rp-02-2', listing_id: 'rl-02', tenant_id: MOCK_TENANT_ID, sort_order: 2, data_url: P.bedroom,       created_at: '2026-07-19 08:00:00' },

  // rl-03 (mock user's own — «ваше»)
  { id: 'rp-03-0', listing_id: 'rl-03', tenant_id: MOCK_TENANT_ID, sort_order: 0, data_url: P.balcony,       created_at: '2026-06-20 15:00:00' },
  { id: 'rp-03-1', listing_id: 'rl-03', tenant_id: MOCK_TENANT_ID, sort_order: 1, data_url: P.living_dark,   created_at: '2026-06-20 15:00:00' },
  { id: 'rp-03-2', listing_id: 'rl-03', tenant_id: MOCK_TENANT_ID, sort_order: 2, data_url: P.kitchen,       created_at: '2026-06-20 15:00:00' },

  // rl-04 (rented)
  { id: 'rp-04-0', listing_id: 'rl-04', tenant_id: MOCK_TENANT_ID, sort_order: 0, data_url: P.studio,        created_at: '2026-05-10 10:00:00' },
  { id: 'rp-04-1', listing_id: 'rl-04', tenant_id: MOCK_TENANT_ID, sort_order: 1, data_url: P.bathroom,      created_at: '2026-05-10 10:00:00' },

  // rl-05 (hidden by УК)
  { id: 'rp-05-0', listing_id: 'rl-05', tenant_id: MOCK_TENANT_ID, sort_order: 0, data_url: P.living_bright, created_at: '2026-07-18 14:00:00' },
  { id: 'rp-05-1', listing_id: 'rl-05', tenant_id: MOCK_TENANT_ID, sort_order: 1, data_url: P.bedroom,       created_at: '2026-07-18 14:00:00' },
];

const MOCK_REPORTS_POPULATED: RentalListingReportAPI[] = [];

// Exported catalog — empty when STATE='empty', populated for 'populated'.
// State 'off' short-circuits at the callsite (feature flag off → gate).
export const MOCK_LISTINGS: RentalListingAPI[] =
  MOCK_STATE === 'populated' ? MOCK_LISTINGS_POPULATED : [];
export const MOCK_PHOTOS: RentalListingPhotoAPI[] =
  MOCK_STATE === 'populated' ? MOCK_PHOTOS_POPULATED : [];
export const MOCK_REPORTS: RentalListingReportAPI[] =
  MOCK_STATE === 'populated' ? MOCK_REPORTS_POPULATED : [];

// Dev-only role override — `?role=manager` (or admin/director) primes
// the mock user with that role instead of `resident`. Used by the
// Playwright overflow spec to visit `/rentals-moderation`, which is
// role-gated.
//
// Belt-and-suspenders gate: the CALLER (below) is inside `if (IS_MOCK)`,
// which is a build-time-foldable false in prod → this function's call
// site is dead code and Rollup drops the function. The body ALSO
// short-circuits on !import.meta.env.DEV as a runtime backstop in case
// some other code path ever reaches it (nothing does today).
function resolveMockRole(): 'admin' | 'director' | 'manager' | 'resident' {
  if (!import.meta.env.DEV) return 'resident';
  if (typeof window === 'undefined') return 'resident';
  const r = new URLSearchParams(window.location.search).get('role');
  if (r === 'admin' || r === 'director' || r === 'manager') return r;
  return 'resident';
}

// ── Prime stores at module load ─────────────────────────────────────
if (IS_MOCK) {
  // Auth: seed a mock user IF none already primed (marketplace mock
  // may have already done this).
  if (!useAuthStore.getState().user) {
    useAuthStore.setState({
      user: {
        id: MOCK_USER_ID,
        login: 'dev-mock',
        name: 'Dev Preview',
        role: resolveMockRole(),
        phone: '+998 90 000 00 00',
        address: 'ул. Проспект, 1',
        apartment: '12',
        tenant_id: MOCK_TENANT_ID,
      } as any,
      token: 'dev-mock-token',
    } as any);
  }

  // Tenant: MERGE features so we compose with the marketplace mock
  // instead of overwriting it. Whichever ran first wins base config;
  // this call adds 'rental_listings' if STATE ≠ 'off'.
  const currentConfig = useTenantStore.getState().config;
  const currentFeatures = currentConfig?.features || [];
  const featureSet = new Set<string>(currentFeatures);
  if (MOCK_STATE === 'populated' || MOCK_STATE === 'empty') {
    featureSet.add('rental_listings');
  } else {
    // MOCK_STATE === 'off' → make sure it's NOT in the set even if
    // some other mock added it.
    featureSet.delete('rental_listings');
  }

  const MERGED_TENANT_CONFIG = {
    tenant: currentConfig?.tenant ?? {
      id: MOCK_TENANT_ID,
      name: 'Dev Preview',
      slug: 'dev',
      color: '#F97316',
      color_secondary: '#EA580C',
      plan: 'demo',
      logo: null,
      is_demo: true,
      admin_phone: '+998 71 000 00 00',
    },
    features: Array.from(featureSet),
    context: (currentConfig?.context ?? 'tenant') as const,
  };

  useTenantStore.setState({
    config: MERGED_TENANT_CONFIG,
    fetchedAt: Date.now(),
    isConfigFetched: true,
    isStale: false,
    error: null,
    // Neuter fetchConfig so App.tsx's mount effect doesn't overwrite
    // the primed config with an API failure. Same race guard the
    // marketplace mock uses.
    fetchConfig: async () => {
      useTenantStore.setState({
        config: MERGED_TENANT_CONFIG,
        fetchedAt: Date.now(),
        isConfigFetched: true,
        isStale: false,
        error: null,
        isLoading: false,
      } as any);
    },
  } as any);

  // eslint-disable-next-line no-console
  console.warn(
    `[rentals __devMock] state=${MOCK_STATE} · rental_listings feature is ${MOCK_STATE === 'off' ? 'OFF (gate page)' : 'ON'}. Switch via ?rentals=off|empty|populated or VITE_MOCK_RENTALS_STATE. Do NOT commit VITE_MOCK_RENTALS_STATE to .env.production.`
  );
}
