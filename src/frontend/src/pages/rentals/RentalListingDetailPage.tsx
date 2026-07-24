// RentalListingDetailPage — one listing full-view.
//
// Sticky footer: phone reveal (thin ghost) + chat (wide filled) — CTA
// hierarchy per design brief. Phone reveal opens a Sheet with the number,
// call, copy actions — not a direct tel: link, so the resident can still
// choose to write instead. Report sheet: 5 reasons, «Уже сдано» first.
//
// Owner view: if the current user IS the listing's publisher and the
// listing is `hidden`, the top of the info panel shows the red
// «Скрыто модерацией» banner with the reason. No CTA hierarchy change.
//
// Every modal uses the shared <Sheet> primitive per Sprint 88 rule.
// The report sheet has a textarea → useAndroidKbSpacer scoped to when
// it's open.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Heart, Phone, MessageCircle,
  Copy, Check, Home, DoorOpen, Wifi, Snowflake, Car, Sofa, ShieldAlert,
} from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { Sheet } from '../../components/common/Sheet';
import { useAndroidKbSpacer } from './useAndroidKbSpacer';
import { MOCK_USER_ID } from './__devMock';
import { neighbourKicker, type RentalReportReason, type RentalListingUI, type RentalListingPhotoAPI } from './types';
import { rentalsApi } from './api';

const FAV_KEY = 'kamizo_rental_favs';
function readFavs(): string[] {
  try { const raw = localStorage.getItem(FAV_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function fmtSum(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}
function t(language: string, ru: string, uz: string) { return language === 'ru' ? ru : uz; }

function timeAgo(iso: string, language: string): string {
  const now = Date.now();
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const days = Math.round((now - then) / (86400 * 1000));
  if (days <= 0) return t(language, 'сегодня', 'bugun');
  if (days === 1) return t(language, 'вчера', 'kecha');
  if (days < 7) return t(language, `${days} дн. назад`, `${days} kun oldin`);
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return t(language, 'неделю назад', 'hafta oldin');
  return t(language, `${weeks} нед. назад`, `${weeks} hafta oldin`);
}

export function RentalListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
  useModalPresence(true);

  const [listing, setListing] = useState<RentalListingUI | null>(null);
  const [photos, setPhotos] = useState<RentalListingPhotoAPI[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    rentalsApi.getListing(id).then(res => {
      if (cancelled) return;
      setListing(res?.listing ?? null);
      setPhotos(res?.photos ?? []);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setListing(null);
      setPhotos([]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  // Phone reveal — publisher_phone is null for non-owner viewers on real API
  // until /reveal-phone is called. Cache the revealed number so re-open is
  // instant and doesn't fire a second server call.
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [revealPending, setRevealPending] = useState(false);

  const [favorites, setFavorites] = useState<string[]>(() => readFavs());
  const isFav = !!(listing && favorites.includes(listing.id));
  const toggleFav = () => {
    if (!listing) return;
    setFavorites(prev => {
      const next = prev.includes(listing.id) ? prev.filter(x => x !== listing.id) : [...prev, listing.id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // reportOpen state + useAndroidKbSpacer(reportOpen) removed — report
  // sheet is unreachable pre-launch (see comment at report entry point).

  if (loading) {
    return (
      <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex items-center justify-center p-6">
        <div className="text-[13px] text-gray-500">{t(language, 'Загрузка…', 'Yuklanmoqda…')}</div>
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-[16px] font-bold text-gray-900 mb-2">
            {t(language, 'Объявление не найдено', "E'lon topilmadi")}
          </div>
          <button onClick={() => navigate('/apartment-rentals')} className="text-[13px] text-primary-600 font-semibold">
            {t(language, 'Вернуться к ленте', 'Lentaga qaytish')}
          </button>
        </div>
      </div>
    );
  }

  const isOwn = listing.publisher_user_id === (user?.id || MOCK_USER_ID);
  const roomsText =
    listing.rooms === 0 ? t(language, 'Студия', 'Studiya')
    : listing.rooms === 4 ? '4+ комн'
    : `${listing.rooms}-комн`;

  const kickerBody = listing.source_type === 'uk'
    ? t(language, 'УК · Верифицировано', 'BK · Tasdiqlangan')
    : neighbourKicker(listing, language === 'ru' ? 'ru' : 'uz');

  const durationText =
    listing.duration_type === 'long' ? t(language, 'Длительно', 'Uzoq muddat')
    : listing.duration_type === 'short' ? t(language, 'Короткий срок', 'Qisqa muddat')
    : t(language, 'Гибко', 'Moslashuvchan');

  return (
    <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex flex-col">
      {/* Photo hero — carousel with dot indicator */}
      <div className="relative aspect-[4/3] bg-gray-900 flex-shrink-0">
        {photos[carouselIndex]?.data_url ? (
          <img
            src={photos[carouselIndex].data_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(145deg, #FDBA74, #EA580C)' }} />
        )}

        {/* Top actions (over photo) */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-black/32 backdrop-blur-sm flex items-center justify-center text-white"
            aria-label={t(language, 'Назад', 'Orqaga')}
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.2} />
          </button>
          <div className="flex gap-2">
            <button
              onClick={toggleFav}
              className="w-10 h-10 rounded-full bg-black/32 backdrop-blur-sm flex items-center justify-center text-white"
              aria-label={t(language, 'В избранное', 'Sevimlilarga')}
            >
              <Heart className="w-5 h-5" fill={isFav ? '#F97316' : 'none'} color={isFav ? '#F97316' : '#FFFFFF'} strokeWidth={2.2} />
            </button>
            {/* Report entry point removed pre-launch (v1.1) — the report
                endpoint (POST /api/rentals/listings/:id/report) is not
                built yet, and the existing submit() was faking a success
                toast without any network call. Ship UI + endpoint together
                in v1.1. Sheet code preserved as reference; unreachable now. */}
          </div>
        </div>

        {/* Counter + dots.
            - Subtle bottom scrim so the white dots stay legible over
              light photos (previously invisible on a bright sky, etc.).
            - Visible pill is 8px (h-2), active one 20px wide (w-5) —
              standard pagination-dot spec.
            - Tap area is the whole 32×24 button (p-2 around the pill) so
              the dots are actually reachable on a phone; the pill itself
              stays small. */}
        {photos.length > 1 && (
          <>
            <div
              className="absolute inset-x-0 bottom-0 h-16 pointer-events-none z-[5]"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.35), transparent)' }}
              aria-hidden
            />
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselIndex(i)}
                  className="p-2 flex items-center justify-center"
                  aria-label={`Photo ${i + 1}`}
                >
                  <span
                    className={`block h-2 rounded-full transition-all ${
                      i === carouselIndex
                        ? 'bg-white w-5'
                        : 'bg-white/60 w-2'
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Hidden-by-УК banner (owner sees, others don't — post-mod hides */}
        {isOwn && listing.state === 'hidden' && (
          <div className="mx-5 mt-4 p-3.5 rounded-[14px] border border-red-400/40 bg-red-500/10">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-red-300 mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3" strokeWidth={2.4} />
              {t(language, 'Скрыто модерацией', 'Moderatsiya bilan yashirilgan')}
            </div>
            <div className="text-[13px] font-semibold text-gray-900">
              {listing.hidden_reason || t(language, 'Причина не указана', "Sabab ko'rsatilmagan")}
            </div>
            <div className="text-[11.5px] text-gray-600 mt-1.5">
              {t(language,
                'Внесите правки и напишите УК — вернём в ленту.',
                "O'zgartirishlar kiriting va BK ga yozing — lentaga qaytaramiz.")}
            </div>
          </div>
        )}

        <div className="px-5 pt-5 pb-4">
          {/* Kicker + title + price */}
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary-500 flex items-center gap-1.5">
            {isOwn && (
              <span className="text-primary-600" style={{ fontWeight: 800 }}>
                {t(language, 'Ваше · ', 'Sizniki · ')}
              </span>
            )}
            <span>{kickerBody}</span>
          </div>

          <h1 className="mt-2 text-[24px] font-extrabold text-gray-900 leading-tight" style={{ letterSpacing: '-0.025em' }}>
            {roomsText}, {listing.area_m2} м²
          </h1>

          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-[24px] font-extrabold text-primary-500" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtSum(listing.price_monthly)}
            </span>
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-500">
              {t(language, 'сум · месяц', "so'm · oy")}
            </span>
          </div>

          {/* Fact chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <FactChip icon={<Home className="w-3 h-3" strokeWidth={2.2} />} label={`${listing.floor}/${listing.floor_total}`} />
            {listing.apartment_number && <FactChip label={t(language, `Кв. ${listing.apartment_number}`, `${listing.apartment_number}-uy`)} />}
            {listing.entrance && <FactChip label={t(language, `Подъезд ${listing.entrance}`, `${listing.entrance}-podyezd`)} />}
            <FactChip label={durationText} />
          </div>
        </div>

        {/* Description */}
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
            {t(language, 'О квартире', 'Kvartira haqida')}
          </div>
          <p className="text-[13.5px] text-gray-900 leading-relaxed whitespace-pre-wrap">
            {listing.description}
          </p>
        </div>

        {/* Amenities */}
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-3">
            {t(language, 'Что в квартире', 'Kvartirada nima bor')}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2.5">
            <AmenityRow icon={<Sofa className="w-4 h-4" strokeWidth={1.8} />} label={t(language, 'Мебель', 'Mebel')} on={listing.furnished} />
            <AmenityRow icon={<Snowflake className="w-4 h-4" strokeWidth={1.8} />} label={t(language, 'Кондиционер', 'Konditsioner')} on={listing.air_conditioning} />
            <AmenityRow icon={<Wifi className="w-4 h-4" strokeWidth={1.8} />} label={t(language, 'Интернет', 'Internet')} on={listing.internet} />
            <AmenityRow icon={<Car className="w-4 h-4" strokeWidth={1.8} />} label={t(language, 'Парковка', 'Parking')} on={listing.parking} />
            <AmenityRow icon={<DoorOpen className="w-4 h-4" strokeWidth={1.8} />} label={t(language, 'Животные', 'Hayvonlar')} on={listing.animals_allowed} />
          </div>
        </div>

        {/* Publisher block */}
        <div className="mx-5 mt-3 mb-5 p-4 rounded-[18px] bg-white border border-gray-100">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary-500 mb-1.5">
            {kickerBody}
          </div>
          <div className="text-[13px] font-bold text-gray-900 mb-0.5">
            {listing.publisher_name}
          </div>
          <div className="text-[11.5px] text-gray-500">
            {t(language, `Размещено ${timeAgo(listing.created_at, language)}`, `${timeAgo(listing.created_at, language)} joylashtirilgan`)}
            {' · '}
            {t(language, `подтверждено ${timeAgo(listing.last_confirmed_at, language)}`, `${timeAgo(listing.last_confirmed_at, language)} tasdiqlangan`)}
          </div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t(language, 'Актуально', 'Dolzarb')}
          </div>
        </div>

        {/* Report link removed pre-launch (v1.1) — see reason at top-actions block. */}

        {/* Bottom padding so sticky footer doesn't cover last content */}
        <div style={{ height: 90 }} />
      </div>

      {/* Sticky footer — unequal CTA hierarchy */}
      {!isOwn && (
        <div
          className="fixed left-0 right-0 bg-white border-t border-gray-100 flex gap-2 z-30"
          style={{
            bottom: 0,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            onClick={async () => {
              if (revealedPhone || !listing) { setPhoneOpen(true); return; }
              setRevealPending(true);
              try {
                const r = await rentalsApi.revealPhone(listing.id);
                setRevealedPhone(r.phone || '');
                setPhoneOpen(true);
              } catch (e: any) {
                addToast('error', e?.message || t(language, 'Не удалось получить телефон', 'Telefonni olib bo’lmadi'));
              } finally {
                setRevealPending(false);
              }
            }}
            disabled={revealPending}
            className="flex-shrink-0 h-[46px] px-4 rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px] flex items-center gap-2 disabled:opacity-50"
            aria-label={t(language, 'Показать телефон', "Telefonni ko'rsatish")}
          >
            <Phone className="w-4 h-4" strokeWidth={2.2} />
            {t(language, 'Телефон', 'Telefon')}
          </button>
          <button
            onClick={() => addToast('info', t(language, 'Чат будет в следующем обновлении', "Chat keyingi yangilanishda bo'ladi"))}
            className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(150deg, #FB923C, #EA580C)',
              boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)',
            }}
          >
            <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
            {t(language, 'Написать', 'Yozish')}
          </button>
        </div>
      )}

      {/* Owner-view sticky footer: edit + manage */}
      {isOwn && (
        <div
          className="fixed left-0 right-0 bg-white border-t border-gray-100 flex gap-2 z-30"
          style={{
            bottom: 0,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            onClick={() => addToast('info', t(language, 'Редактирование скоро', "Tahrirlash yaqinda"))}
            className="flex-1 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px]"
          >
            {t(language, 'Редактировать', 'Tahrirlash')}
          </button>
          <button
            onClick={() => navigate('/apartment-rentals/mine')}
            className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14px] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(150deg, #FB923C, #EA580C)',
              boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)',
            }}
          >
            {t(language, 'В «Мои»', "«Meniki» ga")}
          </button>
        </div>
      )}

      {/* Phone reveal sheet */}
      <PhoneRevealSheet
        isOpen={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        phone={revealedPhone ?? listing.publisher_phone}
        name={listing.publisher_name}
        language={language}
      />

      {/* Report sheet render removed pre-launch (v1.1) — no entry point
          reaches it. ReportSheet component preserved below the file as
          v1.1 scaffold (see comment there). */}
    </div>
  );
}

// ── Amenity row ────────────────────────────────────────────────────
function AmenityRow({ icon, label, on }: { icon: React.ReactNode; label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1 min-w-0">
      <span className={`flex-shrink-0 ${on ? 'text-primary-500' : 'text-gray-300'}`}>{icon}</span>
      <span className={`text-[13px] min-w-0 break-words ${on ? 'text-gray-900 font-semibold' : 'text-gray-400 line-through'}`}>
        {label}
      </span>
    </div>
  );
}

// ── Fact chip ──────────────────────────────────────────────────────
function FactChip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-[11.5px] font-semibold text-gray-700">
      {icon && <span className="text-primary-500">{icon}</span>}
      {label}
    </span>
  );
}

// ── Phone reveal sheet ────────────────────────────────────────────
function PhoneRevealSheet(props: {
  isOpen: boolean; onClose: () => void;
  phone: string | null; name: string; language: string;
}) {
  const { isOpen, onClose, phone, name, language } = props;
  const addToast = useToastStore(s => s.addToast);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      addToast('success', t(language, 'Скопировано', 'Nusxalandi'));
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t(language, 'Позвонить владельцу', 'Egasiga qo\'ng\'iroq qilish')}
      subtitle={t(language, 'Номер виден только жителям вашего дома', "Raqam faqat uyingiz aholilariga ko'rinadi")}
      size="sm"
      footer={
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px] flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-4 h-4" strokeWidth={2.2} /> : <Copy className="w-4 h-4" strokeWidth={2.2} />}
            {copied ? t(language, 'Скопировано', 'Nusxalandi') : t(language, 'Копировать', 'Nusxalash')}
          </button>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(150deg, #FB923C, #EA580C)',
                boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)',
              }}
            >
              <Phone className="w-4 h-4" strokeWidth={2.2} />
              {t(language, 'Позвонить', "Qo'ng'iroq")}
            </a>
          )}
        </div>
      }
    >
      <div className="py-3 flex flex-col items-center gap-2">
        <div
          className="text-[26px] font-extrabold text-gray-900"
          style={{ letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
        >
          {phone || t(language, 'Номер скрыт владельцем', "Raqam egasi tomonidan yashirilgan")}
        </div>
        <div className="text-[12.5px] text-gray-500">{name}</div>
      </div>
    </Sheet>
  );
}

// ── Report sheet ──────────────────────────────────────────────────
const REPORT_REASONS: Array<{ value: RentalReportReason; ru: string; uz: string }> = [
  { value: 'already_rented', ru: 'Уже сдано — висит зря', uz: "Allaqachon ijaraga berilgan" },
  { value: 'misleading',      ru: 'Не соответствует описанию', uz: 'Tavsifga mos emas' },
  { value: 'wrong_photos',    ru: 'Фото не с этой квартиры', uz: 'Suratlar bu kvartiradan emas' },
  { value: 'fraud',           ru: 'Мошенничество / обман',   uz: "Firibgarlik" },
  { value: 'other',           ru: 'Другое',                   uz: 'Boshqa' },
];

function ReportSheet(props: {
  isOpen: boolean; onClose: () => void; listingId: string; language: string;
}) {
  const { isOpen, onClose, listingId, language } = props;
  const addToast = useToastStore(s => s.addToast);
  const [reason, setReason] = useState<RentalReportReason>('already_rented');
  const [comment, setComment] = useState('');

  useEffect(() => { if (!isOpen) { setReason('already_rented'); setComment(''); } }, [isOpen]);

  const submit = () => {
    // Mock — POST /api/rentals/listings/:id/report {reason, comment}
    void listingId;
    addToast('success', t(language, 'Жалоба отправлена. УК проверит в течение суток.',
                                   "Shikoyat yuborildi. BK bir kun ichida tekshiradi."));
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t(language, 'Пожаловаться', 'Shikoyat qilish')}
      subtitle={t(language, 'УК проверит объявление в течение суток. Ваше имя увидит только УК.',
                            "BK e'lonni bir kun ichida tekshiradi. Sizning ismingizni faqat BK ko'radi.")}
      size="md"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px]">
            {t(language, 'Отмена', 'Bekor')}
          </button>
          <button
            onClick={submit}
            className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14px] active:scale-[0.98]"
            style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
          >
            {t(language, 'Отправить', 'Yuborish')}
          </button>
        </div>
      }
    >
      <div className="space-y-2" style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}>
        {REPORT_REASONS.map(r => {
          const on = reason === r.value;
          return (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-[14px] border text-left ${
                on ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full border-2 grid place-items-center flex-shrink-0 ${on ? 'border-primary-500' : 'border-gray-400'}`}
              >
                {on && <span className="w-2 h-2 rounded-full bg-primary-500" />}
              </span>
              <span className="text-[13.5px] font-semibold text-gray-900">
                {t(language, r.ru, r.uz)}
              </span>
            </button>
          );
        })}

        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={t(language, 'Уточните (необязательно)', "Aniqlashtiring (ixtiyoriy)")}
          rows={3}
          className="w-full mt-3 p-3 rounded-[14px] bg-gray-50 border border-gray-200 text-[13.5px] resize-none focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
        />
      </div>
    </Sheet>
  );
}
