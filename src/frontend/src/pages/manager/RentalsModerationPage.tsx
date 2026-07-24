// Manager-side moderation surface for the resident rentals marketplace.
//
// NOT to be confused with `manager/RentalsPage.tsx` (the УК contract log
// — passport data of short-stay guests, unrelated). This page moderates
// resident-published listings from Sprint 88 v1: hide the ones that
// break policy, restore ones hidden by mistake. Zero role affordances
// for creating/editing listings — moderation only.
//
// Reuses the resident detail page (`/apartment-rentals/:id`) as a
// read-only viewport when the manager taps into a listing — no
// duplication of the gallery/detail render. This is why "Открыть" is a
// navigation link, not a modal.
//
// Visual language mirrors the resident marketplace + rentals surface:
// `.marketplace-page` scope class (dark-theme overrides), min-w-0/flex
// patterns from the overflow pass, shared <Sheet> for both dialogs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, EyeOff, Undo2, ExternalLink, ShieldAlert, Home,
} from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { Sheet } from '../../components/common/Sheet';
import { useAndroidKbSpacer } from '../rentals/useAndroidKbSpacer';
import { rentalsApi } from '../rentals/api';
import {
  neighbourKicker,
  type RentalListingUI, type RentalListingPhotoAPI, type RentalState,
} from '../rentals/types';

function t(language: string, ru: string, uz: string) { return language === 'ru' ? ru : uz; }
function fmtSum(n: number): string { return new Intl.NumberFormat('ru-RU').format(n); }

const HIDE_REASON_MAX = 500;

const TABS: Array<{ key: RentalState; ru: string; uz: string }> = [
  { key: 'active',   ru: 'Активные', uz: 'Faol' },
  { key: 'hidden',   ru: 'Скрытые',  uz: 'Yashirilgan' },
  { key: 'rented',   ru: 'Сданные',  uz: 'Ijaraga berilgan' },
  { key: 'archived', ru: 'Архив',    uz: 'Arxiv' },
];

const STATE_BADGE_STYLE: Record<RentalState, { dot: string; ring: string; text: string }> = {
  active:   { dot: 'bg-emerald-500', ring: 'border-emerald-500/25 bg-emerald-500/10', text: 'text-emerald-600' },
  hidden:   { dot: 'bg-red-500',     ring: 'border-red-500/25 bg-red-500/10',         text: 'text-red-600' },
  rented:   { dot: 'bg-primary-500', ring: 'border-primary-500/25 bg-primary-500/10', text: 'text-primary-600' },
  archived: { dot: 'bg-gray-400',    ring: 'border-gray-400/25 bg-gray-400/10',       text: 'text-gray-600' },
};

function timeAgo(iso: string, language: string): string {
  const now = Date.now();
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const days = Math.round((now - then) / (86400 * 1000));
  if (days <= 0) return t(language, 'сегодня', 'bugun');
  if (days === 1) return t(language, 'вчера', 'kecha');
  if (days < 7) return t(language, `${days} дн. назад`, `${days} kun oldin`);
  const weeks = Math.floor(days / 7);
  return t(language, `${weeks} нед. назад`, `${weeks} hafta oldin`);
}

export function RentalsModerationPage() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
  useModalPresence(true);

  const [activeTab, setActiveTab] = useState<RentalState>('active');
  const [listings, setListings] = useState<RentalListingUI[]>([]);
  const [photosById, setPhotosById] = useState<Record<string, RentalListingPhotoAPI[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Cached per-tab counts so the chip badges reflect reality without
  // requiring the manager to tap through each tab first. Fetched once
  // per refresh, refetched after every state transition.
  const [counts, setCounts] = useState<Record<RentalState, number | null>>({
    active: null, hidden: null, rented: null, archived: null,
  });

  const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

  // Fetch the active tab's listings + photos.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    rentalsApi.listByState(activeTab).then(({ listings, photosByListing }) => {
      if (cancelled) return;
      setListings(listings);
      setPhotosById(photosByListing);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setListings([]);
      setPhotosById({});
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTab, refreshKey]);

  // Refresh all 4 counts in parallel — cheap because the count query is
  // a list-fetch, but only the ID + state come through the render path.
  useEffect(() => {
    let cancelled = false;
    Promise.all(TABS.map(t => rentalsApi.listByState(t.key).then(r => r.listings.length).catch(() => 0)))
      .then(nums => {
        if (cancelled) return;
        const next: Record<RentalState, number | null> = { active: null, hidden: null, rented: null, archived: null };
        TABS.forEach((tab, i) => { next[tab.key] = nums[i]; });
        setCounts(next);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Sheets — one for hide (reason required), one for restore (confirm).
  const [hideTarget, setHideTarget] = useState<RentalListingUI | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RentalListingUI | null>(null);
  const anyModalOpen = hideTarget !== null || restoreTarget !== null;

  return (
    <div className="marketplace-page pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA]">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', willChange: 'transform' }}
      >
        <div className="px-4 pt-2 pb-2 flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90"
            aria-label={t(language, 'Назад', 'Orqaga')}
          >
            <ArrowLeft className="w-[18px] h-[18px] text-gray-700" strokeWidth={2.2} />
          </button>
          <h1 className="flex-1 min-w-0 text-[16px] font-bold text-gray-900 truncate">
            {t(language, 'Модерация объявлений', "E'lonlarni moderatsiya")}
          </h1>
          <span
            className="text-[11px] font-extrabold text-gray-400 tracking-[0.1em] flex-shrink-0"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {counts[activeTab] ?? '—'}
          </span>
        </div>

        {/* Tab chips — horizontal scroller */}
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const on = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
                  on ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(language, tab.ru, tab.uz)}
                {count !== null && count > 0 && (
                  <span className={`ml-1.5 inline-block text-[10px] font-extrabold ${on ? 'text-white/85' : 'text-gray-400'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-4 pb-6">
        {loading ? (
          <div className="text-center py-16 text-[13px] text-gray-500">
            {t(language, 'Загрузка…', 'Yuklanmoqda…')}
          </div>
        ) : listings.length === 0 ? (
          <EmptyTab language={language} tab={activeTab} />
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map(l => (
              <ModerationCard
                key={l.id}
                listing={l}
                cover={photosById[l.id]?.[0]?.data_url}
                language={language}
                onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
                onHide={() => setHideTarget(l)}
                onRestore={() => setRestoreTarget(l)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hide sheet */}
      <HideSheet
        target={hideTarget}
        language={language}
        onClose={() => setHideTarget(null)}
        onDone={() => { setHideTarget(null); refetch(); addToast('success', t(language, 'Скрыто', 'Yashirildi')); }}
        onError={(e) => addToast('error', e)}
      />

      {/* Restore sheet */}
      <RestoreSheet
        target={restoreTarget}
        language={language}
        onClose={() => setRestoreTarget(null)}
        onDone={() => { setRestoreTarget(null); refetch(); addToast('success', t(language, 'Восстановлено', 'Tiklandi')); }}
        onError={(e) => addToast('error', e)}
      />

      {/* Prevent the shared BottomBar from covering our sheets — same
          pattern MarketplacePage uses (v11 modal fix). */}
      <BottomBarHider hidden={anyModalOpen} />

      {/* Cheap fingerprint so the manager knows which tenant + role
          they're moderating on — quick sanity for a super_admin who's
          impersonating across tenants. */}
      {user?.tenant_id && (
        <div className="px-4 pb-6 text-[10.5px] text-gray-400 flex items-center gap-1.5">
          <Home className="w-3 h-3" strokeWidth={2} />
          <span className="min-w-0 truncate">
            {t(language, `Роль: ${user.role} · арендатор: ${user.tenant_id.slice(0, 8)}`,
                        `Rol: ${user.role} · ijarachi: ${user.tenant_id.slice(0, 8)}`)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Empty state per tab ────────────────────────────────────────────
function EmptyTab({ language, tab }: { language: string; tab: RentalState }) {
  const copy: Record<RentalState, { ru: string; uz: string }> = {
    active:   { ru: 'Активных объявлений нет.',       uz: 'Faol eʼlonlar yoʻq.' },
    hidden:   { ru: 'Никого не скрывали.',            uz: 'Hech kim yashirilmagan.' },
    rented:   { ru: 'Сданных объявлений нет.',        uz: 'Ijaraga berilgan eʼlonlar yoʻq.' },
    archived: { ru: 'В архиве пусто.',                uz: 'Arxiv boʻsh.' },
  };
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-full bg-gray-100 grid place-items-center mx-auto mb-3">
        <ShieldAlert className="w-6 h-6 text-gray-400" strokeWidth={1.8} />
      </div>
      <div className="text-[13.5px] font-semibold text-gray-600">
        {t(language, copy[tab].ru, copy[tab].uz)}
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────
function ModerationCard(props: {
  listing: RentalListingUI;
  cover: string | undefined;
  language: string;
  onOpen: () => void;
  onHide: () => void;
  onRestore: () => void;
}) {
  const { listing: l, cover, language, onOpen, onHide, onRestore } = props;
  const badge = STATE_BADGE_STYLE[l.state];
  const roomsText =
    l.rooms === 0 ? t(language, 'Студия', 'Studiya')
    : l.rooms === 4 ? t(language, '4+ комн', '4+ xona')
    : t(language, `${l.rooms}-комн`, `${l.rooms}-xona`);
  const stateLabel = ({ active: t(language, 'Активно', 'Faol'),
                        hidden: t(language, 'Скрыто', 'Yashirilgan'),
                        rented: t(language, 'Сдано',  'Ijaraga berilgan'),
                        archived: t(language, 'Архив', 'Arxiv') } as Record<RentalState, string>)[l.state];

  return (
    <div className="p-3 rounded-[18px] bg-white border border-gray-100 min-w-0">
      <div className="flex gap-3 min-w-0">
        <button
          onClick={onOpen}
          className="flex-shrink-0 w-[92px] aspect-square rounded-[14px] overflow-hidden bg-gray-100 relative active:scale-[0.98]"
          aria-label={t(language, 'Открыть подробнее', 'Batafsil ochish')}
        >
          {cover
            ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0" style={{ background: 'linear-gradient(145deg, #FDBA74, #EA580C)' }} />
          }
        </button>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-extrabold ${badge.ring} ${badge.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {stateLabel}
            </span>
            <span className="text-[10.5px] text-gray-400 font-semibold min-w-0 truncate">
              {timeAgo(l.created_at, language)}
            </span>
          </div>

          <div className="mt-1 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-primary-500 min-w-0 truncate">
            {neighbourKicker(l, language === 'ru' ? 'ru' : 'uz')}
          </div>

          <div className="mt-0.5 text-[13px] font-bold text-gray-900 leading-tight min-w-0 break-words" style={{ letterSpacing: '-0.01em' }}>
            {roomsText}, {l.area_m2} м² · {fmtSum(l.price_monthly)} <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">{t(language, 'сум/мес', "soʻm/oy")}</span>
          </div>

          <div className="mt-1 text-[11.5px] text-gray-500 min-w-0 truncate">
            {l.publisher_name}
            {l.publisher_phone && (
              <span className="text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {' · '}{l.publisher_phone}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hidden-by-УК banner shows reason inline in the card too */}
      {l.state === 'hidden' && l.hidden_reason && (
        <div className="mt-3 p-2.5 rounded-[12px] border border-red-400/25 bg-red-500/10 text-[11.5px] text-red-700 min-w-0 break-words">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-red-500 mb-0.5">
            {t(language, 'Причина скрытия', 'Yashirish sababi')}
          </div>
          {l.hidden_reason}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2 min-w-0">
        <button
          onClick={onOpen}
          className="flex-1 min-w-0 h-[38px] rounded-[12px] border border-gray-200 text-gray-900 font-semibold text-[12.5px] flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
          <span className="min-w-0 truncate">{t(language, 'Открыть', 'Ochish')}</span>
        </button>
        {(l.state === 'active' || l.state === 'rented') && (
          <button
            onClick={onHide}
            className="flex-1 min-w-0 h-[38px] rounded-[12px] bg-red-500 text-white font-semibold text-[12.5px] flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <EyeOff className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.4} />
            <span className="min-w-0 truncate">{t(language, 'Скрыть', 'Yashirish')}</span>
          </button>
        )}
        {l.state === 'hidden' && (
          <button
            onClick={onRestore}
            className="flex-1 min-w-0 h-[38px] rounded-[12px] bg-primary-500 text-white font-semibold text-[12.5px] flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Undo2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.4} />
            <span className="min-w-0 truncate">{t(language, 'Восстановить', 'Tiklash')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Hide sheet — reason required ───────────────────────────────────
function HideSheet(props: {
  target: RentalListingUI | null;
  language: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const { target, language, onClose, onDone, onError } = props;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isOpen = target !== null;
  // Scoped kb spacer — Android keyboard bug from marketplace (v11).
  useAndroidKbSpacer(isOpen);

  useEffect(() => { if (!isOpen) { setReason(''); setBusy(false); } }, [isOpen]);

  const trimmed = reason.trim();
  const valid = trimmed.length > 0 && trimmed.length <= HIDE_REASON_MAX;

  const submit = async () => {
    if (!target || !valid || busy) return;
    setBusy(true);
    try {
      await rentalsApi.transitionState(target.id, 'hidden', trimmed);
      onDone();
    } catch (e: any) {
      onError(e?.message || t(language, 'Не удалось скрыть', "Yashirib bo'lmadi"));
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t(language, 'Скрыть объявление', "Eʼlonni yashirish")}
      subtitle={t(language,
        'Житель увидит эту причину в разделе «Мои объявления». Скрытое объявление можно вернуть.',
        "Aholi bu sababni «Mening eʼlonlarim» bo'limida ko'radi. Yashirilgan eʼlonni qaytarib berish mumkin.")}
      size="md"
      footer={
        <div className="flex gap-2 min-w-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-w-0 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px] disabled:opacity-50"
          >
            {t(language, 'Отмена', 'Bekor')}
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="flex-1 min-w-0 h-[46px] rounded-[15px] bg-red-500 text-white font-semibold text-[14px] active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? t(language, 'Скрываем…', "Yashirilmoqda…") : t(language, 'Скрыть', "Yashirish")}
          </button>
        </div>
      }
    >
      <div className="space-y-3" style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}>
        <label className="block">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
            {t(language, 'Причина', 'Sababi')}
            <span className="text-red-500 ml-1">*</span>
          </span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, HIDE_REASON_MAX))}
            placeholder={t(language,
              'Например: фото не с этой квартиры, объявление дублирует другое, оскорбления в описании…',
              "Masalan: rasm bu kvartiradan emas, eʼlon boshqasini takrorlaydi, tavsifda haqorat…")}
            rows={4}
            className="mt-1.5 w-full p-3 rounded-[14px] bg-white border border-gray-200 text-[13.5px] resize-none outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20 min-w-0"
          />
          <div className="mt-1 text-right text-[10.5px] text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {reason.length}/{HIDE_REASON_MAX}
          </div>
        </label>
      </div>
    </Sheet>
  );
}

// ── Restore sheet — confirm only ───────────────────────────────────
function RestoreSheet(props: {
  target: RentalListingUI | null;
  language: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const { target, language, onClose, onDone, onError } = props;
  const [busy, setBusy] = useState(false);
  const isOpen = target !== null;

  useEffect(() => { if (!isOpen) setBusy(false); }, [isOpen]);

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await rentalsApi.transitionState(target.id, 'active');
      onDone();
    } catch (e: any) {
      onError(e?.message || t(language, 'Не удалось восстановить', "Tiklab bo'lmadi"));
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t(language, 'Восстановить объявление?', "Eʼlonni tiklaysizmi?")}
      subtitle={t(language,
        'Объявление снова появится в ленте у жителей вашего ЖК.',
        "Eʼlon yana sizning JK aholingiz uchun lentada paydo bo'ladi.")}
      size="sm"
      footer={
        <div className="flex gap-2 min-w-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-w-0 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px] disabled:opacity-50"
          >
            {t(language, 'Отмена', 'Bekor')}
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 min-w-0 h-[46px] rounded-[15px] bg-primary-500 text-white font-semibold text-[14px] active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? t(language, 'Восстанавливаем…', "Tiklanmoqda…") : t(language, 'Восстановить', "Tiklash")}
          </button>
        </div>
      }
    >
      {target && (
        <div className="text-[13px] text-gray-700 min-w-0 break-words">
          {target.publisher_name} · {fmtSum(target.price_monthly)} <span className="text-gray-400">{t(language, 'сум/мес', "soʻm/oy")}</span>
        </div>
      )}
    </Sheet>
  );
}

// ── BottomBar hider — parity with marketplace's `hidden={anyModalOpen}`
//     pattern so shared portal doesn't leak through the sheet backdrop.
function BottomBarHider({ hidden }: { hidden: boolean }) {
  // useModalPresence(true) at page-mount already keeps the shared bar off
  // this route. The `hidden` prop is spot-hidden state consumed by other
  // pages via BottomBar — here it's a no-op receptor to satisfy the same
  // component-level contract (kept for future when nested modals stack).
  useMemo(() => hidden, [hidden]);
  return null;
}
