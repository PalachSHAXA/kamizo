// RentalsFeedPage — Screen A of the resident rentals feature.
//
// Three states rendered here, resolved from the tenant feature flag:
//   (a) hasFeature('rental_listings') = false → GATE page: "your
//       building hasn't enabled this yet". Never "coming soon" — the
//       feature exists on paid tenants that turned it on.
//   (b) flag on, listings.length === 0 → EMPTY state.
//   (c) flag on, listings.length > 0 → FEED with editorial cards.
//
// The `marketplace-page` class is a shared dark-theme SCOPE, not a
// semantic promise — MarketplacePage's dark overrides at
// index.css:2928-2948 cover the classes used here (bg-white,
// border-gray-*, text-gray-*). Comment at
// ApartmentRentalsPage.tsx:20-27 already documents this reuse.

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Sliders, Heart, Key, Plus, ShieldAlert } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { Sheet } from '../../components/common/Sheet';
import { RentalsBottomBar } from './RentalsBottomBar';
import { useAndroidKbSpacer } from './useAndroidKbSpacer';
// MOCK_USER_ID / MOCK_TENANT_ID intentionally NOT imported here — see
// note on RentalListingDetailPage. Any top-level import forces the
// __devMock chunk into the prod bundle even though it's never invoked.
import { neighbourKicker, type RentalListingPhotoAPI, type RentalListingUI } from './types';
import { rentalsApi } from './api';

const FAV_KEY = 'kamizo_rental_favs';

function readFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function fmtSum(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

// Localised labels — bilingual pairs. UZ strings run longer (10-30%);
// every card sizes with min-content so wraps don't break.
function t(language: string, ru: string, uz: string) {
  return language === 'ru' ? ru : uz;
}

interface Filters {
  rooms: Set<number>;                     // 0..4
  price_min: number | null;
  price_max: number | null;
  furnished: boolean;
  floor_min: number | null;
  floor_max: number | null;
}
const emptyFilters = (): Filters => ({
  rooms: new Set(),
  price_min: null,
  price_max: null,
  furnished: false,
  floor_min: null,
  floor_max: null,
});
function filtersActiveCount(f: Filters): number {
  let n = 0;
  if (f.rooms.size > 0) n++;
  if (f.price_min !== null || f.price_max !== null) n++;
  if (f.furnished) n++;
  if (f.floor_min !== null || f.floor_max !== null) n++;
  return n;
}

// Data layer — routes to mock or real API via ./api.
function useListings(active: boolean) {
  const [listings, setListings] = useState<RentalListingUI[]>([]);
  const [photosByListing, setPhotosByListing] = useState<Record<string, RentalListingPhotoAPI[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    rentalsApi.listActive().then(({ listings, photosByListing }) => {
      if (cancelled) return;
      setListings(listings);
      setPhotosByListing(photosByListing);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setListings([]);
      setPhotosByListing({});
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active]);

  return { listings, photosByListing, loading };
}

export function RentalsFeedPage() {
  const { language } = useLanguageStore();
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.addToast);
  const { user } = useAuthStore();
  const hasRentals = useTenantStore(s => s.hasFeature('rental_listings'));
  const tenantName = useTenantStore(s => s.config?.tenant?.name) || 'УК';
  const tenantAdminPhone = useTenantStore(s => s.config?.tenant?.admin_phone) || null;

  // Blanket presence — same trick MarketplacePage:282 uses to keep the
  // shared BottomBar off this route.
  useModalPresence(true);

  const { listings, photosByListing } = useListings(hasRentals);

  const [favorites, setFavorites] = useState<string[]>(() => readFavs());
  const toggleFav = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const [search, setSearch] = useState('');
  const [selectedRooms, setSelectedRooms] = useState<number | null>(null); // top strip
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [showFavorites, setShowFavorites] = useState(false);

  // Filter side sheet has price/floor number inputs → keyboard pattern
  // must be scoped to it.
  useAndroidKbSpacer(filtersOpen);

  // Bar hide: any sheet open → hidden. `useModalPresence` handles the
  // shared bar; RentalsBottomBar needs an explicit signal because it
  // doesn't read modalStore (would always be > 0 due to the blanket
  // useModalPresence(true) above — same reasoning as
  // MarketplacePage's anyModalOpen).
  const anyModalOpen = filtersOpen;

  const filtered = useMemo(() => {
    let out = listings;
    if (showFavorites) out = out.filter(l => favorites.includes(l.id));
    if (selectedRooms !== null) out = out.filter(l => l.rooms === selectedRooms);
    if (filters.rooms.size > 0) out = out.filter(l => filters.rooms.has(l.rooms));
    if (filters.price_min !== null) out = out.filter(l => l.price_monthly >= filters.price_min!);
    if (filters.price_max !== null) out = out.filter(l => l.price_monthly <= filters.price_max!);
    if (filters.furnished) out = out.filter(l => l.furnished);
    if (filters.floor_min !== null) out = out.filter(l => l.floor >= filters.floor_min!);
    if (filters.floor_max !== null) out = out.filter(l => l.floor <= filters.floor_max!);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter(l =>
        l.description.toLowerCase().includes(s) ||
        (l.apartment_number || '').toLowerCase().includes(s) ||
        String(l.rooms).includes(s)
      );
    }
    return out;
  }, [listings, favorites, selectedRooms, filters, showFavorites, search]);

  // ── (a) GATE PAGE — feature flag OFF for this tenant ──────────────
  if (!hasRentals) {
    return (
      <div
        className="marketplace-page pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-white"
      >
        <div
          className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', willChange: 'transform' }}
        >
          <div className="px-4 pt-1.5 pb-2 flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
              aria-label={t(language, 'Назад', 'Orqaga')}
            >
              <ArrowLeft className="w-[18px] h-[18px] text-gray-700" />
            </button>
            <h1 className="text-[16px] font-bold text-gray-900">
              {t(language, 'Аренда квартир', 'Kvartira ijarasi')}
            </h1>
          </div>
        </div>

        <div className="px-4 pt-8 pb-6 max-w-[560px] mx-auto">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-5">
            <Key className="w-8 h-8 text-primary-500" />
          </div>

          {/* «Not enabled in your building» — never «coming soon» / «в разработке» */}
          <div className="text-center mb-3">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary-500 mb-2">
              {t(language, 'Не подключено в вашем ЖК', "Turar joyingizda ulanmagan")}
            </div>
            <h2 className="text-[19px] font-bold text-gray-900 leading-tight" style={{ letterSpacing: '-0.01em' }}>
              {t(language,
                'Аренда квартир — раздел для жителей',
                "Kvartira ijarasi — aholilar uchun bo'lim")}
            </h2>
          </div>

          <p className="text-[14px] text-gray-600 leading-relaxed text-center mb-6 max-w-[440px] mx-auto">
            {t(language,
              'Жители сдают и снимают квартиры прямо у соседей: с фото, ценой и связью в приложении. Ваша управляющая компания пока не подключила раздел.',
              "Aholilar qo'shnilardan to'g'ridan-to'g'ri kvartira ijaraga oladi va topshiradi: rasmlar, narx va ilova ichidagi aloqa bilan. Boshqaruv kompaniyangiz bu bo'limni hali ulamagan.")}
          </p>

          <div className="bg-gray-50 rounded-[18px] p-4 mb-6 max-w-[440px] mx-auto">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-3">
              {t(language, 'Когда подключат — вы сможете', "Ulangandan keyin siz")}
            </div>
            <ul className="text-[13.5px] text-gray-700 leading-relaxed space-y-2.5" style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-[8px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <span>{t(language,
                  'Смотреть свободные квартиры в своём доме',
                  "Uyingizdagi bo'sh kvartiralarni ko'rish")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-[8px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <span>{t(language,
                  'Разместить свою: фото, цена, условия',
                  "O'zingiznikini joylashtirish: rasm, narx, shartlar")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-[8px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <span>{t(language,
                  'Написать соседу в приложении или показать телефон',
                  "Qo'shni bilan ilova ichida bog'lanish yoki telefon ko'rsatish")}</span>
              </li>
            </ul>
          </div>

          <div className="max-w-[440px] mx-auto">
            <div className="text-[12px] text-gray-500 text-center mb-3 leading-relaxed">
              {t(language,
                `Попросите УК «${tenantName}» подключить раздел «Аренда квартир».`,
                `«${tenantName}» boshqaruv kompaniyasidan «Kvartira ijarasi» bo'limini ulashni so'rang.`)}
            </div>
            {tenantAdminPhone && (
              <a
                href={`tel:${tenantAdminPhone}`}
                className="block w-full py-3.5 text-center bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"
              >
                {t(language, 'Позвонить в УК', "BK ga qo'ng'iroq qilish")}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Feature ON path — feed + empty state ──────────────────────────
  return (
    <div className="marketplace-page pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA]">
      {/* Sticky mobile header — editorial title + search chip + filters chip */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', willChange: 'transform' }}
      >
        {/* Title row */}
        <div className="px-5 pt-3 pb-3 flex items-start gap-3">
          <h1 className="flex-1 min-w-0 text-[27px] font-extrabold text-gray-900 break-words" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
            {t(language, 'Аренда', 'Ijara')}
            <span className="text-primary-500">.</span>
          </h1>
          <button
            onClick={() => navigate('/apartment-rentals/create')}
            className="tap-target w-[40px] h-[40px] rounded-full bg-primary-500 text-white flex items-center justify-center active:scale-90 transition-transform"
            aria-label={t(language, 'Разместить объявление', "E'lon joylashtirish")}
          >
            <Plus className="w-5 h-5" strokeWidth={2.4} />
          </button>
        </div>

        {/* Search + Filters row */}
        <div className="px-5 pb-3 flex items-center gap-2.5">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 pointer-events-none" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder={t(language, 'Поиск по описанию…', 'Tavsif bo\'yicha qidirish…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-[14px] bg-white border border-gray-200 text-[13.5px] font-semibold text-gray-600 placeholder:text-gray-500 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
              style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
              aria-label={t(language, 'Поиск квартир', 'Kvartira qidirish')}
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className="flex-shrink-0 h-11 px-4 rounded-[14px] flex items-center gap-2 text-[13.5px] font-bold cursor-pointer transition-all text-gray-600 border border-gray-200 bg-white"
            style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
            aria-label={t(language, 'Фильтры', 'Filtrlar')}
          >
            <Sliders className="w-4 h-4" />
            <span>{t(language, 'Фильтры', 'Filtr')}</span>
            {filtersActiveCount(filters) > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-extrabold grid place-items-center text-white bg-primary-500">
                {filtersActiveCount(filters)}
              </span>
            )}
          </button>
        </div>

        {/* Rooms text tabs — sliding underline */}
        <div className="flex gap-6 overflow-x-auto scrollbar-hide px-5 border-b border-gray-100">
          {[
            { v: null, label: t(language, 'Все', 'Hammasi') },
            { v: 0,    label: t(language, 'Студия', 'Studiya') },
            { v: 1,    label: '1-комн' },
            { v: 2,    label: '2-комн' },
            { v: 3,    label: '3-комн' },
            { v: 4,    label: '4+' },
          ].map(t2 => {
            const on = selectedRooms === t2.v;
            return (
              <button
                key={String(t2.v)}
                onClick={() => setSelectedRooms(t2.v)}
                className="relative flex-shrink-0 bg-transparent border-none cursor-pointer pb-3 text-[16px] whitespace-nowrap"
                style={{
                  color: on ? 'var(--marketplace-text-primary)' : 'var(--marketplace-text-muted)',
                  fontWeight: on ? 800 : 650,
                  letterSpacing: '-0.01em',
                }}
              >
                {t2.label}
                {on && (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 -bottom-px h-[3px] rounded-[3px]"
                    style={{ background: 'var(--brand)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section eyebrow */}
      <div className="px-5 pt-5 pb-3 flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
          {showFavorites
            ? t(language, 'Избранное', 'Sevimli')
            : t(language, 'Свободно в вашем доме', "Uyingizda bo'sh")}
        </span>
        <span className="text-[12px] font-bold text-gray-400 font-variant-numeric-tabular">
          {String(filtered.length).padStart(2, '0')}
        </span>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          isFavorites={showFavorites}
          hasSearch={search.trim().length > 0 || filtersActiveCount(filters) > 0 || selectedRooms !== null}
          onReset={() => {
            setSearch('');
            setSelectedRooms(null);
            setFilters(emptyFilters());
          }}
          onCreate={() => navigate('/apartment-rentals/create')}
          language={language}
        />
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-6">
          {filtered.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              photos={photosByListing[l.id] || []}
              isOwn={l.publisher_user_id === (user?.id || '')}
              isFav={favorites.includes(l.id)}
              onToggleFav={() => toggleFav(l.id)}
              onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
              language={language}
            />
          ))}
        </div>
      )}

      {/* Filters sheet — use shared Sheet primitive per Sprint 88 rule.
          Inputs inside → useAndroidKbSpacer(filtersOpen) scoped above. */}
      <Sheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t(language, 'Фильтры', 'Filtrlar')}
        subtitle={t(language, 'Уточните, что ищете', 'Nimani qidirayotganingizni aniqlashtiring')}
        size="md"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setFilters(emptyFilters())}
              className="flex-1 py-3.5 rounded-[14px] border border-gray-200 text-gray-700 font-semibold text-[14px]"
            >
              {t(language, 'Сбросить', 'Tozalash')}
            </button>
            <button
              onClick={() => { setFiltersOpen(false); addToast('success', t(language, 'Фильтры применены', 'Filtrlar qo\'llanildi')); }}
              className="flex-1 py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[14px] active:scale-[0.98]"
            >
              {t(language, 'Показать', "Ko'rsatish")} ({filtered.length})
            </button>
          </div>
        }
      >
        <div className="space-y-5 pb-4" style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}>
          {/* Rooms */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
              {t(language, 'Комнат', 'Xonalar')}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { v: 0, label: t(language, 'Студия', 'Studiya') },
                { v: 1, label: '1' },
                { v: 2, label: '2' },
                { v: 3, label: '3' },
                { v: 4, label: '4+' },
              ].map(r => {
                const on = filters.rooms.has(r.v);
                return (
                  <button
                    key={r.v}
                    onClick={() => {
                      const next = new Set(filters.rooms);
                      if (on) next.delete(r.v); else next.add(r.v);
                      setFilters({ ...filters, rooms: next });
                    }}
                    className={`px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all ${
                      on ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price range */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
              {t(language, 'Цена, сум · мес', 'Narx, so\'m · oy')}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                inputMode="numeric"
                placeholder={t(language, 'От', 'Dan')}
                value={filters.price_min ?? ''}
                onChange={e => setFilters({ ...filters, price_min: e.target.value ? Number(e.target.value) : null })}
                className="flex-1 min-w-0 w-full p-3 rounded-[12px] bg-gray-50 border border-gray-200 text-[14px] focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder={t(language, 'До', 'Gacha')}
                value={filters.price_max ?? ''}
                onChange={e => setFilters({ ...filters, price_max: e.target.value ? Number(e.target.value) : null })}
                className="flex-1 min-w-0 w-full p-3 rounded-[12px] bg-gray-50 border border-gray-200 text-[14px] focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>

          {/* Floor range */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
              {t(language, 'Этаж', 'Qavat')}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                inputMode="numeric"
                placeholder={t(language, 'От', 'Dan')}
                value={filters.floor_min ?? ''}
                onChange={e => setFilters({ ...filters, floor_min: e.target.value ? Number(e.target.value) : null })}
                className="flex-1 min-w-0 w-full p-3 rounded-[12px] bg-gray-50 border border-gray-200 text-[14px] focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder={t(language, 'До', 'Gacha')}
                value={filters.floor_max ?? ''}
                onChange={e => setFilters({ ...filters, floor_max: e.target.value ? Number(e.target.value) : null })}
                className="flex-1 min-w-0 w-full p-3 rounded-[12px] bg-gray-50 border border-gray-200 text-[14px] focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>

          {/* Furnished toggle */}
          <button
            onClick={() => setFilters({ ...filters, furnished: !filters.furnished })}
            className="w-full flex items-center gap-3 p-3.5 bg-gray-50 rounded-[14px] border border-gray-200"
          >
            <span className="text-[14px] font-semibold text-gray-700 flex-1 text-left">
              {t(language, 'С мебелью', 'Mebel bilan')}
            </span>
            <span
              className={`relative w-11 h-6 rounded-full ${filters.furnished ? 'bg-primary-500' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${filters.furnished ? 'left-[22px]' : 'left-0.5'}`}
              />
            </span>
          </button>
        </div>
      </Sheet>

      <RentalsBottomBar
        activeTab={showFavorites ? 'favorites' : 'feed'}
        favoritesCount={favorites.length}
        language={language === 'ru' ? 'ru' : 'uz'}
        hidden={anyModalOpen}
        onFeed={() => { setShowFavorites(false); setSearch(''); setSelectedRooms(null); setFilters(emptyFilters()); }}
        onMine={() => navigate('/apartment-rentals/mine')}
        onFavorites={() => setShowFavorites(v => !v)}
        onBack={() => navigate('/')}
      />
    </div>
  );
}

// ── ListingCard ────────────────────────────────────────────────────
function ListingCard(props: {
  listing: RentalListingUI;
  photos: RentalListingPhotoAPI[];
  isOwn: boolean;
  isFav: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
  language: string;
}) {
  const { listing: l, photos, isOwn, isFav, onToggleFav, onOpen, language } = props;
  const cover = photos[0]?.data_url;

  // Kicker per source. Own listing gets a «Ваше» prefix — design rule
  // per the "don't filter own out of feed" correction.
  const kickerText = isOwn
    ? t(language, 'Ваше · ', 'Sizniki · ')
    : '';
  const kickerBody = l.source_type === 'uk'
    ? t(language, 'УК · Верифицировано', 'BK · Tasdiqlangan')
    : neighbourKicker(l, language === 'ru' ? 'ru' : 'uz');
  const roomsText =
    l.rooms === 0 ? t(language, 'Студия', 'Studiya')
    : l.rooms === 4 ? '4+ комн'
    : `${l.rooms}-комн`;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-[22px] bg-white border border-gray-100 overflow-hidden active:scale-[0.99] transition-transform"
      style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
    >
      <div className="flex min-h-[148px]">
        {/* Cover */}
        <div className="flex-shrink-0 w-[122px] relative bg-gray-100">
          {cover ? (
            <img
              src={cover}
              alt={l.description.slice(0, 60)}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(145deg, #FDBA74, #EA580C)' }}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-black/32 grid place-items-center"
            aria-label={t(language, 'В избранное', 'Sevimlilarga')}
          >
            <Heart
              className="w-3.5 h-3.5"
              fill={isFav ? '#F97316' : 'none'}
              color={isFav ? '#F97316' : '#FFFFFF'}
              strokeWidth={2.2}
            />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 p-3.5 flex flex-col">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary-500 flex items-center gap-1.5">
            {isOwn && (
              <span className="text-primary-600" style={{ fontWeight: 800 }}>
                {kickerText}
              </span>
            )}
            <span>{kickerBody}</span>
          </div>

          <div className="mt-1.5 text-[16px] font-extrabold text-gray-900" style={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {roomsText}, {l.area_m2} м²
          </div>
          <div className="text-[12.5px] text-gray-500 mt-1 line-clamp-2">
            {l.description}
          </div>

          <div className="mt-auto pt-2.5 flex items-end justify-between gap-2 min-w-0">
            <div className="flex flex-col leading-tight min-w-0 flex-shrink-0">
              <span className="text-[17px] font-extrabold text-gray-900 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                {fmtSum(l.price_monthly)}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-gray-400 mt-0.5 whitespace-nowrap">
                {t(language, 'сум · мес', "so'm · oy")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 justify-end min-w-0">
              {l.furnished && <FactChip label={t(language, 'мебель', 'mebel')} />}
              {l.air_conditioning && <FactChip label="AC" />}
              {l.parking && <FactChip label={t(language, 'парковка', 'parking')} />}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function FactChip({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
      {label}
    </span>
  );
}

// ── Empty state ────────────────────────────────────────────────────
function EmptyState(props: {
  isFavorites: boolean;
  hasSearch: boolean;
  onReset: () => void;
  onCreate: () => void;
  language: string;
}) {
  const { isFavorites, hasSearch, onReset, onCreate, language } = props;

  if (hasSearch) {
    return (
      <div className="text-center py-16 px-6">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Search className="w-6 h-6 text-gray-400" />
        </div>
        <div className="text-[15px] font-bold text-gray-900 mb-1.5">
          {t(language, 'Ничего не нашлось', 'Hech narsa topilmadi')}
        </div>
        <div className="text-[13px] text-gray-500 mb-5 max-w-[280px] mx-auto">
          {t(language, 'Попробуйте убрать часть фильтров', 'Filtrlarning bir qismini olib tashlab ko\'ring')}
        </div>
        <button
          onClick={onReset}
          className="text-[13px] font-semibold text-primary-600"
        >
          {t(language, 'Сбросить фильтры', 'Filtrlarni tozalash')}
        </button>
      </div>
    );
  }

  if (isFavorites) {
    return (
      <div className="text-center py-16 px-6">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Heart className="w-6 h-6 text-gray-400" />
        </div>
        <div className="text-[15px] font-bold text-gray-900 mb-1.5">
          {t(language, 'Пока пусто', "Hozircha bo'sh")}
        </div>
        <div className="text-[13px] text-gray-500 max-w-[280px] mx-auto">
          {t(language,
            'Отметьте квартиру сердечком — она появится здесь',
            "Kvartirani yurakcha bilan belgilang — u shu yerda paydo bo'ladi")}
        </div>
      </div>
    );
  }

  // Empty feed — no listings at all in the tenant
  return (
    <div className="text-center py-16 px-6">
      <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-5">
        <Key className="w-7 h-7 text-primary-500" />
      </div>
      <div className="text-[17px] font-bold text-gray-900 mb-2" style={{ letterSpacing: '-0.01em' }}>
        {t(language, 'Пока никто не сдаёт', 'Hozircha hech kim ijaraga bermayapti')}
      </div>
      <p className="text-[13.5px] text-gray-500 max-w-[300px] mx-auto mb-6 leading-relaxed">
        {t(language,
          'Станьте первым — соседи увидят ваше объявление сразу, без модерации.',
          "Birinchi bo'ling — qo'shnilar sizning e'loningizni darrov ko'radi, moderatsiyasiz.")}
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-5 py-3 bg-primary-500 text-white rounded-[14px] font-semibold text-[14px] active:scale-[0.98] shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"
      >
        <Plus className="w-4 h-4" strokeWidth={2.4} />
        {t(language, 'Разместить квартиру', 'Kvartirani joylashtirish')}
      </button>
    </div>
  );
}
