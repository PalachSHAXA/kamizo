// DEV-ONLY marketplace mock. Trivially deletable.
//
// Two gates on the top-level side effect:
//   1. import.meta.env.DEV                → Vite folds to `false` in
//      prod builds → Rollup drops this whole `if` body → nothing here
//      ships to residents.
//   2. import.meta.env.VITE_MOCK_MARKETPLACE === '1' → runtime toggle
//      so `npm run dev` without the env var also runs a clean instance.
//
// When the flag is on: auth + tenant stores get primed with a fake
// resident user for a fake tenant with `features: ['marketplace', ...]`.
// MarketplacePage's fetchData sees IS_MOCK and short-circuits with the
// hardcoded catalog below instead of calling the real API. Cart /
// orders / favorites stay empty ([]) — they're user-scoped and the
// checkout flow POSTs to a backend that isn't there anyway. Add-to-cart
// will fail silently in dev; that's fine for a redesign preview.
//
// Field-shape choice for product flags (is_featured / is_on_demand /
// is_active): JS booleans. Real API emits 0/1 ints from SQLite;
// MarketplacePage.normalizeProduct() applies `!!` and accepts either
// identically. Booleans match the declared MarketplaceProductAPI TS
// interface without `as any`, and post-normalize both `p.is_featured &&`
// and `products.filter(p => p.is_featured)` see the same thing.
// Categories skip normalizeProduct but their `is_active` is never
// consulted in the render path (categories.map is unconditional at
// MarketplacePage.tsx:769) — booleans there too, matching the interface.

import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

export const IS_MOCK =
  import.meta.env.DEV && import.meta.env.VITE_MOCK_MARKETPLACE === '1';

// ── Mock catalog — matches the REAL API shape (MarketplacePage.tsx
//    L23-24). Every branch of the v7/v8 redesign is exercised:
//      • featured story hero (1 flagged, deterministic pick — mock-p1)
//      • image + no-image landscape cards (brand-gradient fallback)
//      • old_price >> price → discount badge + strikethrough
//      • price = 0 → «Бесплатно»
//      • is_on_demand → «Заказать»
//      • stock_quantity = 0 → «Нет» overlay
//      • 4 categories with distinct sort_order → strip ordering visible

const CAT_CLEAN = 'mock-cat-clean-0001';
const CAT_FOOD  = 'mock-cat-food-0002';
const CAT_HOME  = 'mock-cat-home-0003';
const CAT_SVC   = 'mock-cat-svc-0004';

export const MOCK_CATEGORIES = [
  { id: CAT_CLEAN, name_ru: 'Клининг',  name_uz: 'Tozalash',    icon: '🧹', sort_order: 10, is_active: true, created_at: '2026-07-21 12:00:00' },
  { id: CAT_FOOD,  name_ru: 'Продукты', name_uz: 'Mahsulotlar', icon: '🥛', sort_order: 20, is_active: true, created_at: '2026-07-21 12:00:00' },
  { id: CAT_HOME,  name_ru: 'Для дома', name_uz: 'Uy uchun',    icon: '🏠', sort_order: 30, is_active: true, created_at: '2026-07-21 12:00:00' },
  { id: CAT_SVC,   name_ru: 'Услуги',   name_uz: 'Xizmatlar',   icon: '🔧', sort_order: 40, is_active: true, created_at: '2026-07-21 12:00:00' },
];

export const MOCK_PRODUCTS = [
  {
    id: 'mock-p1', category_id: CAT_CLEAN,
    name_ru: 'Химчистка ковров с выездом на дом',
    name_uz: 'Uyga chiqib gilamlarni kimyoviy tozalash',
    description_ru: 'Профессиональная химчистка любых типов ковров. Работаем ежедневно, выезжаем в течение 24 часов.',
    description_uz: 'Har qanday turdagi gilamlarni professional kimyoviy tozalash. Har kuni ishlaymiz, 24 soat ichida chiqamiz.',
    price: 250000, unit: 'кв.м', stock_quantity: 50,
    image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop',
    is_active: true, is_featured: true, is_on_demand: false,
    created_at: '2026-07-21 12:00:01',
  },
  {
    id: 'mock-p2', category_id: CAT_CLEAN,
    name_ru: 'Средство для мытья полов Universal Pro 1 л',
    name_uz: 'Pol yuvish uchun Universal Pro vositasi 1 l',
    description_ru: 'Концентрат, безопасен для ламината и плитки. Не оставляет разводов.',
    description_uz: 'Konsentrat, laminat va plitka uchun xavfsiz. Iz qoldirmaydi.',
    price: 45000, unit: 'шт', stock_quantity: 120,
    // no image_url → brand-gradient fallback
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:02',
  },
  {
    id: 'mock-p3', category_id: CAT_FOOD,
    name_ru: 'Молоко ультрапастеризованное 3.2% 1 л',
    name_uz: 'Ultrapasterizatsiya qilingan sut 3.2% 1 l',
    description_ru: 'Свежая молочная продукция от местного производителя. Доставка на следующий день.',
    description_uz: 'Mahalliy ishlab chiqaruvchidan yangi sut mahsulotlari. Ertasi kuni yetkazib berish.',
    price: 15000, old_price: 22000, unit: 'л', stock_quantity: 80,
    image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=800&auto=format&fit=crop',
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:03',
  },
  {
    id: 'mock-p4', category_id: CAT_HOME,
    name_ru: 'Пробный набор эко-салфеток из микрофибры',
    name_uz: 'Mikrofiberdan tayyorlangan ekologik sochiqlar sinov to\'plami',
    description_ru: 'Бесплатный пробник от партнёра управляющей компании. По одному набору на квартиру.',
    description_uz: 'Boshqaruv kompaniyasining hamkori tomonidan bepul namunalar. Har bir kvartira uchun bittadan.',
    price: 0, unit: 'набор', stock_quantity: 25,
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:04',
  },
  {
    id: 'mock-p5', category_id: CAT_SVC,
    name_ru: 'Ежемесячная уборка подъезда и лестничных площадок',
    name_uz: 'Kirish va zinapoyalarni oylik tozalash',
    description_ru: 'Абонемент на регулярную уборку. Включает мытьё полов, окон и перил, вынос мусора.',
    description_uz: 'Muntazam tozalash uchun abonement. Pol, deraza va panjaralarni yuvish, axlatni chiqarishni o\'z ichiga oladi.',
    price: 180000, unit: 'месяц', stock_quantity: 10,
    image_url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop',
    // is_featured=false: only p1 is featured so the deterministic-pick
    // path renders a single hero card (no tie-break to visualise here).
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:05',
  },
  {
    id: 'mock-p6', category_id: CAT_SVC,
    name_ru: 'Ремонт стиральной машины на дому',
    name_uz: 'Uyda kir yuvish mashinasini ta\'mirlash',
    description_ru: 'Диагностика и ремонт стиральных машин любых марок. Мастер приедет в удобное время.',
    description_uz: 'Har qanday markadagi kir yuvish mashinalarini diagnostika qilish va ta\'mirlash. Usta qulay vaqtda keladi.',
    price: 300000, unit: 'вызов', stock_quantity: 0,
    is_active: true, is_featured: false, is_on_demand: true,
    created_at: '2026-07-21 12:00:06',
  },
  {
    id: 'mock-p7', category_id: CAT_HOME,
    name_ru: 'Набор мешков для мусора 60 л, 30 штук',
    name_uz: 'Axlat xaltalari to\'plami 60 l, 30 dona',
    description_ru: 'Прочные мешки с завязками. Временно закончились — ожидаем поставку.',
    description_uz: 'Bog\'ichli mustahkam xaltalar. Vaqtincha tugadi — yetkazib berilishini kutmoqdamiz.',
    price: 35000, unit: 'упак', stock_quantity: 0,
    // stock=0 non-on-demand → «Нет» overlay branch
    image_url: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800&auto=format&fit=crop',
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:07',
  },
  {
    id: 'mock-p8', category_id: CAT_SVC,
    name_ru: 'Установка и настройка Wi-Fi роутера с прокладкой кабеля',
    name_uz: 'Kabel o\'tkazish bilan Wi-Fi routerni o\'rnatish va sozlash',
    description_ru: 'Специалист приедет, установит роутер, настроит сеть и объяснит, как подключить все устройства.',
    description_uz: 'Mutaxassis kelib routerni o\'rnatadi, tarmoqni sozlaydi va barcha qurilmalarni ulash usulini tushuntiradi.',
    price: 150000, unit: 'вызов', stock_quantity: 8,
    image_url: 'https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=800&auto=format&fit=crop',
    is_active: true, is_featured: false, is_on_demand: false,
    created_at: '2026-07-21 12:00:08',
  },
];

// Top-level side effect — runs at module import (Vite tree-shakes in prod).
if (IS_MOCK) {
  useAuthStore.setState({
    // Minimal User shape — MarketplacePage only reads user.id, address,
    // apartment, phone in the checkout modal; role only unblocks
    // ProtectedRoute. Cast to `any` because the full User type isn't
    // exported and this one-file mock isn't worth pulling the full
    // type surface.
    user: {
      id: 'dev-mock-user',
      login: 'dev-mock',
      name: 'Dev Preview',
      role: 'resident',
      phone: '+998 90 000 00 00',
      address: 'ул. Проспект, 1',
      apartment: '10',
    } as any,
    token: 'dev-mock-token',
  } as any);

  // Frozen so both the initial prime and the neutered fetchConfig below
  // hand out the same shape — no drift between them.
  const MOCK_TENANT_CONFIG = {
    tenant: {
      id: 'dev-mock-tenant',
      name: 'Dev Preview',
      slug: 'dev',
      color: '#F97316',
      color_secondary: '#EA580C',
      plan: 'demo',
      logo: null,
      is_demo: true,
      admin_phone: '+998 71 000 00 00',
    },
    features: ['marketplace', 'chat', 'announcements', 'requests'],
    context: 'tenant' as const,
  };

  useTenantStore.setState({
    config: MOCK_TENANT_CONFIG,
    fetchedAt: Date.now(),
    isConfigFetched: true,
    isStale: false,
    error: null,
    // Neuter fetchConfig. Two known callers overwrite the primed state
    // with an API-failure result under mock (real API is down):
    //   • App.tsx:163  — useEffect on mount, unconditional.
    //   • authStore.ts:127 — post-login handler (dynamic import).
    // Both are outside this file's reach. Override the store's own
    // method so no caller can bypass the mock. Re-asserts the primed
    // state on every call so nothing downstream sees a half-hydrated
    // store (`isConfigFetched: false`), which would reflip Layout's
    // config-error guard.
    fetchConfig: async () => {
      useTenantStore.setState({
        config: MOCK_TENANT_CONFIG,
        fetchedAt: Date.now(),
        isConfigFetched: true,
        isStale: false,
        error: null,
        isLoading: false,
      } as any);
    },
  } as any);

  // Loud visible signal so no one mistakes this for the real thing.
  // eslint-disable-next-line no-console
  console.warn('[__devMock] Marketplace mock ACTIVE — no API calls, hardcoded catalog. Do NOT commit VITE_MOCK_MARKETPLACE=1 to .env.production.');
}
