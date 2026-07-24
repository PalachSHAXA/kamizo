// RentalMyListingsPage — resident's own listings, grouped by state.
//
// States shown: активно / сдано / снято / скрыто модерацией.
// Renewal nudge banner appears at top if any listing is due for
// confirmation (14-day rule; here: any listing where
// last_confirmed_at was 14+ days ago and prompt was recently sent).
// Empty state when the resident has zero listings — the typical
// starting state.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, MoreHorizontal, Heart, Edit3, Check, RefreshCw, Trash2,
  ShieldAlert, Key, Clock,
} from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { Sheet } from '../../components/common/Sheet';
import { RentalsBottomBar } from './RentalsBottomBar';
import { MOCK_USER_ID } from './__devMock';
import { neighbourKicker, type RentalListingUI, type RentalListingPhotoAPI, type RentalState } from './types';
import { rentalsApi } from './api';

const FAV_KEY = 'kamizo_rental_favs';
function readFavs(): string[] {
  try { const raw = localStorage.getItem(FAV_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function fmtSum(n: number): string { return new Intl.NumberFormat('ru-RU').format(n); }
function t(language: string, ru: string, uz: string) { return language === 'ru' ? ru : uz; }

function daysSince(iso: string): number {
  const now = Date.now();
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  return Math.floor((now - then) / (86400 * 1000));
}

export function RentalMyListingsPage() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
  useModalPresence(true);

  // GET /api/rentals/my-listings — mock or real via rentalsApi.
  const [mine, setMine] = useState<RentalListingUI[]>([]);
  const [photosById, setPhotosById] = useState<Record<string, RentalListingPhotoAPI[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    rentalsApi.listMine().then(({ listings, photosByListing }) => {
      if (cancelled) return;
      setMine(listings);
      setPhotosById(photosByListing);
    }).catch(() => {
      if (cancelled) return;
      setMine([]);
      setPhotosById({});
    });
    return () => { cancelled = true; };
  }, [refreshKey]);
  const refetch = () => setRefreshKey(k => k + 1);
  const favorites = readFavs();

  // Confirm sheet — owner clicked «Уже нет» / triple-dot → «Пометить сданной»
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'rented' | 'archived' | 'delete' | 'reactivate' | 'confirm-still'; listingId: string } | null
  >(null);

  // Renewal nudge — first listing that's ≥14 days since last confirm
  const dueListing = mine.find(l => l.state === 'active' && daysSince(l.last_confirmed_at) >= 14);

  const applyConfirm = async () => {
    if (!confirmAction) return;
    const { kind, listingId } = confirmAction;
    setConfirmAction(null);
    try {
      if (kind === 'rented')      { await rentalsApi.transitionState(listingId, 'rented');   addToast('success', t(language, 'Пометили как сданное', 'Ijaraga berilgan deb belgilandi')); }
      if (kind === 'archived')    { await rentalsApi.transitionState(listingId, 'archived'); addToast('success', t(language, 'Снято с публикации', 'Nashrdan olib tashlandi')); }
      if (kind === 'reactivate')  { await rentalsApi.transitionState(listingId, 'active');   await rentalsApi.confirmActive(listingId); addToast('success', t(language, 'Снова в ленте', 'Yana lentada')); }
      if (kind === 'confirm-still') { await rentalsApi.confirmActive(listingId);              addToast('success', t(language, 'Спасибо! Подтверждено', 'Rahmat! Tasdiqlandi')); }
      // 'delete' is not implemented server-side v1 — archive is the closest safe fallback
      if (kind === 'delete')      { await rentalsApi.transitionState(listingId, 'archived'); addToast('success', t(language, 'Снято с публикации', 'Nashrdan olib tashlandi')); }
      refetch();
    } catch (e: any) {
      addToast('error', e?.message || t(language, 'Не удалось выполнить', 'Bajarib bo’lmadi'));
    }
  };

  const anyModalOpen = confirmAction !== null;
  const active = mine.filter(l => l.state === 'active');
  const rented = mine.filter(l => l.state === 'rented');
  const archived = mine.filter(l => l.state === 'archived');
  const hidden = mine.filter(l => l.state === 'hidden');

  return (
    <div className="marketplace-page pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA]">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', willChange: 'transform' }}
      >
        <div className="px-4 pt-2 pb-2 flex items-center gap-2">
          <button
            onClick={() => navigate('/apartment-rentals')}
            className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90"
            aria-label={t(language, 'Назад', 'Orqaga')}
          >
            <ArrowLeft className="w-[18px] h-[18px] text-gray-700" strokeWidth={2.2} />
          </button>
          <h1 className="flex-1 text-[16px] font-bold text-gray-900 text-center">
            {t(language, 'Мои объявления', "Mening e'lonlarim")}
          </h1>
          <button
            onClick={() => navigate('/apartment-rentals/create')}
            className="tap-target w-[38px] h-[38px] rounded-full bg-primary-500 text-white flex items-center justify-center"
            aria-label={t(language, 'Разместить', 'Joylashtirish')}
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Empty state — the typical starting condition */}
      {mine.length === 0 && (
        <div className="pt-16 px-6 text-center max-w-[340px] mx-auto">
          <div className="w-16 h-16 rounded-full bg-primary-50 grid place-items-center mx-auto mb-5">
            <Key className="w-7 h-7 text-primary-500" strokeWidth={1.8} />
          </div>
          <h2 className="text-[19px] font-extrabold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
            {t(language, 'Ничего не сдаётся', "Hech narsa ijaraga berilmayapti")}
            <span className="text-primary-500">.</span>
          </h2>
          <p className="text-[13.5px] text-gray-500 mt-2.5 mb-6 leading-relaxed">
            {t(language,
              'Разместите квартиру — соседи увидят её сразу, без модерации.',
              "Kvartirani joylashtiring — qo'shnilar uni darrov ko'radi, moderatsiyasiz.")}
          </p>
          <button
            onClick={() => navigate('/apartment-rentals/create')}
            className="w-full py-3.5 rounded-[14px] text-white font-semibold text-[14px] active:scale-[0.98]"
            style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
          >
            {t(language, 'Разместить объявление', "E'lon joylashtirish")}
          </button>
        </div>
      )}

      {/* Content when has listings */}
      {mine.length > 0 && (
        <div className="pt-3">
          {/* Renewal nudge */}
          {dueListing && (
            <div className="mx-5 mb-3 p-3 rounded-[16px] bg-orange-500/10 border border-orange-500/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-primary-500 grid place-items-center flex-shrink-0">
                <Heart className="w-4 h-4 text-white" fill="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-extrabold text-gray-900" style={{ letterSpacing: '-0.01em' }}>
                  {t(language, 'Ещё сдаётся?', 'Hali ham ijaraga beriladimi?')}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {t(language, 'Подтвердите — иначе через 3 дня уйдёт из ленты.', "Tasdiqlang — aks holda 3 kundan keyin lentadan ketadi.")}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setConfirmAction({ kind: 'archived', listingId: dueListing.id })}
                  className="h-8 px-2.5 rounded-[10px] border border-gray-200 text-gray-700 text-[11px] font-bold"
                >
                  {t(language, 'Нет', "Yo'q")}
                </button>
                <button
                  onClick={() => confirmStill(dueListing.id)}
                  className="h-8 px-3 rounded-[10px] bg-primary-500 text-white text-[11px] font-bold"
                >
                  {t(language, 'Да', 'Ha')}
                </button>
              </div>
            </div>
          )}

          {/* Hidden by УК — dedicated banner ABOVE the active section */}
          {hidden.length > 0 && (
            <div className="mx-5 mb-3 p-3.5 rounded-[16px] bg-red-500/10 border border-red-500/30">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-red-300 mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3" strokeWidth={2.4} />
                {t(language, `Скрыто модерацией · ${hidden.length}`, `Moderatsiya bilan yashirilgan · ${hidden.length}`)}
              </div>
              <div className="text-[12.5px] text-gray-900 font-semibold mb-2.5">
                {t(language,
                  `${hidden.length === 1 ? 'Одно объявление скрыто' : `${hidden.length} объявления скрыто`}`,
                  `${hidden.length} ta e'lon yashirilgan`)}
              </div>
              {hidden.map(l => (
                <MineCard
                  key={l.id}
                  listing={l}
                  photos={photosById[l.id] || []}
                  language={language}
                  onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
                  onAction={(kind) => setConfirmAction({ kind, listingId: l.id })}
                  className="mt-2"
                />
              ))}
            </div>
          )}

          {/* Active */}
          {active.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
                  {t(language, 'Активно · В ленте', 'Faol · Lentada')}
                </span>
                <span className="text-[12px] font-bold text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {String(active.length).padStart(2, '0')}
                </span>
              </div>
              {active.map(l => (
                <MineCard
                  key={l.id}
                  listing={l}
                  photos={photosById[l.id] || []}
                  language={language}
                  onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
                  onAction={(kind) => setConfirmAction({ kind, listingId: l.id })}
                  className="mx-5 mb-3"
                />
              ))}
            </>
          )}

          {/* Rented */}
          {rented.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-400">
                  {t(language, 'Сдано · Не в ленте', 'Ijaraga berilgan · Lentada emas')}
                </span>
                <span className="text-[12px] font-bold text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {String(rented.length).padStart(2, '0')}
                </span>
              </div>
              {rented.map(l => (
                <MineCard
                  key={l.id}
                  listing={l}
                  photos={photosById[l.id] || []}
                  language={language}
                  onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
                  onAction={(kind) => setConfirmAction({ kind, listingId: l.id })}
                  muted
                  className="mx-5 mb-3"
                />
              ))}
            </>
          )}

          {/* Archived */}
          {archived.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-400">
                  {t(language, 'Снято', 'Olib tashlangan')}
                </span>
                <span className="text-[12px] font-bold text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {String(archived.length).padStart(2, '0')}
                </span>
              </div>
              {archived.map(l => (
                <MineCard
                  key={l.id}
                  listing={l}
                  photos={photosById[l.id] || []}
                  language={language}
                  onOpen={() => navigate(`/apartment-rentals/${l.id}`)}
                  onAction={(kind) => setConfirmAction({ kind, listingId: l.id })}
                  muted
                  className="mx-5 mb-3"
                />
              ))}
            </>
          )}

          {mine.length === 1 && (
            <div className="text-center pt-2 pb-6 text-[11.5px] text-gray-400 tracking-wide">
              {t(language, 'Больше нет — это норма.', "Boshqa yo'q — bu odatiy.")}
            </div>
          )}
        </div>
      )}

      {/* Confirm action sheet */}
      <Sheet
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={
          !confirmAction ? '' :
          confirmAction.kind === 'rented' ? t(language, 'Пометить как сданное?', 'Ijaraga berilgan deb belgilaymi?') :
          confirmAction.kind === 'archived' ? t(language, 'Снять с публикации?', 'Nashrdan olib tashlaymi?') :
          confirmAction.kind === 'reactivate' ? t(language, 'Вернуть в ленту?', 'Lentaga qaytaramizmi?') :
          confirmAction.kind === 'delete' ? t(language, 'Удалить объявление?', "E'lonni o'chiramizmi?") :
          t(language, 'Ещё сдаётся?', 'Hali ham ijaraga beriladimi?')
        }
        size="sm"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmAction(null)}
              className="flex-1 h-[46px] rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px]"
            >
              {t(language, 'Отмена', 'Bekor')}
            </button>
            <button
              onClick={applyConfirm}
              className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14px] active:scale-[0.98]"
              style={{
                background: confirmAction?.kind === 'delete'
                  ? 'linear-gradient(150deg, #F87171, #DC2626)'
                  : 'linear-gradient(150deg, #FB923C, #EA580C)',
                boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)',
              }}
            >
              {confirmAction?.kind === 'delete' ? t(language, 'Удалить', "O'chirish") : t(language, 'Да', 'Ha')}
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-gray-600 leading-relaxed py-2">
          {!confirmAction ? '' :
            confirmAction.kind === 'rented'
              ? t(language, 'Уйдёт из ленты, останется у вас в «Мои» как сданное. Можно будет разместить снова.',
                            'Lentadan ketadi, «Meniki» da ijaraga berilgan bo\'lib qoladi.')
            : confirmAction.kind === 'archived'
              ? t(language, 'Уйдёт из ленты. Можно будет восстановить в один тап.',
                            'Lentadan ketadi. Bir tapda qaytarish mumkin.')
            : confirmAction.kind === 'reactivate'
              ? t(language, 'Объявление снова появится в ленте у соседей.',
                            "E'lon qo'shnilarning lentasida yana paydo bo'ladi.")
            : confirmAction.kind === 'delete'
              ? t(language, 'Полностью удалим. Восстановить будет нельзя.',
                            "To'liq o'chirib tashlaymiz. Qaytarib bo'lmaydi.")
            : t(language, 'Подтвердим, что квартира ещё сдаётся, и обновим свежесть.',
                          "Kvartira hali ham ijaraga berilishini tasdiqlaymiz.")
          }
        </p>
      </Sheet>

      <RentalsBottomBar
        activeTab="mine"
        favoritesCount={favorites.length}
        language={language === 'ru' ? 'ru' : 'uz'}
        hidden={anyModalOpen}
        onFeed={() => navigate('/apartment-rentals')}
        onMine={() => { /* already here */ }}
        onFavorites={() => navigate('/apartment-rentals')}
        onBack={() => navigate('/')}
      />
    </div>
  );
}

function MineCard(props: {
  listing: RentalListingUI;
  photos: RentalListingPhotoAPI[];
  language: string;
  onOpen: () => void;
  onAction: (kind: 'rented' | 'archived' | 'delete' | 'reactivate') => void;
  muted?: boolean;
  className?: string;
}) {
  const { listing: l, photos, language, onOpen, onAction, muted, className } = props;
  const cover = photos[0]?.data_url;
  const roomsText =
    l.rooms === 0 ? t(language, 'Студия', 'Studiya')
    : l.rooms === 4 ? '4+ комн' : `${l.rooms}-комн`;

  return (
    <div
      className={`p-3 rounded-[20px] bg-white border border-gray-100 ${className || ''} ${muted ? 'opacity-70' : ''}`}
      style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
    >
      <button onClick={onOpen} className="w-full flex gap-3 text-left">
        <div className="flex-shrink-0 w-[92px] aspect-square rounded-[14px] overflow-hidden relative bg-gray-100">
          {cover && <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary-500 flex items-center gap-1.5">
            <span className="inline-grid place-items-center w-3.5 h-3.5 rounded-full border-[1.4px] border-primary-500 text-primary-500 text-[8.5px] font-extrabold">С</span>
            {neighbourKicker(l, language === 'ru' ? 'ru' : 'uz')}
          </div>
          <div className="mt-1 text-[14.5px] font-extrabold text-gray-900 leading-tight" style={{ letterSpacing: '-0.01em' }}>
            {roomsText}, {l.area_m2} м²
          </div>
          <div className="mt-1 text-[11.5px] text-gray-500">
            {l.state === 'active'
              ? t(language, `Подтверждено ${daysSince(l.last_confirmed_at)} дн. назад`, `${daysSince(l.last_confirmed_at)} kun oldin tasdiqlangan`)
              : l.state === 'rented'
                ? t(language, 'Сдано', 'Ijaraga berilgan')
                : l.state === 'hidden'
                  ? t(language, 'Скрыто УК', 'BK yashirgan')
                  : t(language, 'Снято', 'Olib tashlangan')}
          </div>
          <div className="mt-auto pt-2 flex items-center gap-2">
            <span className="text-[13.5px] font-extrabold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtSum(l.price_monthly)}
            </span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-gray-400">
              {t(language, 'сум · мес', "so'm · oy")}
            </span>
          </div>
        </div>
      </button>

      {/* Actions row */}
      <div className="pt-2.5 mt-2.5 border-t border-gray-100 flex gap-1">
        {l.state === 'active' && (
          <>
            <ActionButton icon={<Edit3 className="w-3 h-3" strokeWidth={2.2} />} label={t(language, 'Редактировать', 'Tahrirlash')} />
            <ActionButton
              icon={<Check className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Сдано', 'Ijaraga berildi')}
              onClick={() => onAction('rented')}
              brand
            />
          </>
        )}
        {l.state === 'rented' && (
          <>
            <ActionButton
              icon={<RefreshCw className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Разместить снова', 'Yana joylashtirish')}
              onClick={() => onAction('reactivate')}
              brand
            />
            <ActionButton
              icon={<Trash2 className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Удалить', "O'chirish")}
              onClick={() => onAction('delete')}
              dim
            />
          </>
        )}
        {l.state === 'archived' && (
          <>
            <ActionButton
              icon={<RefreshCw className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Восстановить', 'Tiklash')}
              onClick={() => onAction('reactivate')}
              brand
            />
            <ActionButton
              icon={<Trash2 className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Удалить', "O'chirish")}
              onClick={() => onAction('delete')}
              dim
            />
          </>
        )}
        {l.state === 'hidden' && (
          <>
            <ActionButton
              icon={<Edit3 className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Заменить фото', 'Suratni almashtirish')}
              brand
            />
            <ActionButton
              icon={<Trash2 className="w-3 h-3" strokeWidth={2.2} />}
              label={t(language, 'Удалить', "O'chirish")}
              onClick={() => onAction('delete')}
              dim
            />
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton(props: {
  icon: React.ReactNode; label: string; onClick?: () => void; brand?: boolean; dim?: boolean;
}) {
  const { icon, label, onClick, brand, dim } = props;
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-0 py-2 rounded-[10px] flex items-center justify-center gap-1.5 text-[12px] font-bold ${
        brand ? 'text-primary-600' : dim ? 'text-gray-400' : 'text-gray-900'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
