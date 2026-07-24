// RentalCreatePage — 4-step create flow.
//
// Steps: photos → fields → review → done. Sticky footer with next/back.
// Photo step demos all upload states in the mock (uploaded / uploading /
// failed / cover / empty). Fields step: inline validation that NUDGES
// (price too high red rim + hint), not blocks. Review: card preview
// exactly as it will appear in feed. Done: full-screen confirmation
// with the 14-day heads-up.
//
// The whole page has many inputs — useAndroidKbSpacer scoped to the
// page mount so keyboard adjusts on Android.

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, X, Plus, Star, RefreshCw, Check, Info, Clock, Sofa, Snowflake, Wifi, Car,
} from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useToastStore } from '../../stores/toastStore';
import { useModalPresence } from '../../stores/modalStore';
import { useAndroidKbSpacer } from './useAndroidKbSpacer';
import { rentalsApi } from './api';
import { compressImage } from '../../utils/compressImage';

// Server caps (listings.ts):
//   • decoded photo ≤ 1 MiB
//   • min 3 / max 8 photos per listing
//   • MIME jpeg | png | webp
//
// Client-side we DOWNSCALE + re-encode every picked file via compressImage
// (existing shared util used by requests). A raw 4032×3024 phone shot is
// 3–8 MB — well over the server cap; without compression this feature is
// unusable on real devices. Target ≤ ~1.1 MB base64-string per photo,
// leaving safety margin under the server's 1,048,576-decoded-bytes gate
// (base64 inflates ~4/3, so 1.1 MB string ≈ 825 KB decoded).
//
// PICK_MAX_BYTES is a sanity cap on the raw file BEFORE compression —
// generous (20 MB) so any modern phone photo passes to the compressor.
// Anything larger is almost certainly not a photo (bulk PDF, video frame
// dump, etc.) and worth surfacing to the user.
const PICK_MAX_BYTES = 20 * 1024 * 1024;
const COMPRESS_TARGET_BYTES = 1_100_000;
const PHOTO_MIN = 3;
const PHOTO_MAX = 8;
const PHOTO_MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);

function t(language: string, ru: string, uz: string) { return language === 'ru' ? ru : uz; }
function fmtSum(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}

// PhotoState reflects the read/validate step (client-only — the real
// backend takes photos inline with create, not as separate uploads).
//   'reading'  → FileReader in flight or file being validated
//   'uploaded' → data_url ready, will be sent with create
//   'failed'   → oversized, wrong MIME, or read error
type PhotoState = 'reading' | 'uploaded' | 'failed';
interface DraftPhoto {
  id: string;
  state: PhotoState;
  data_url: string;
  error?: string;         // human-readable when state='failed'
}

export function RentalCreatePage() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
  useModalPresence(true);
  useAndroidKbSpacer(true);

  // Dev-only URL hooks so overflow tests can jump straight into a step
  // with worst-case field values. import.meta.env.DEV is folded to false
  // in prod builds → Rollup drops all references; nothing here ships.
  //   ?step=2|3           — start at that step (bypasses photo gate)
  //   ?price=15000000     — starting price value (widest realistic sum)
  //   ?area=250           — starting area
  //   ?floor=100          — starting floor
  //   ?floorTotal=100     — starting floor_total
  const devParams = import.meta.env.DEV && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;
  const devStep = devParams?.get('step');

  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    devStep === '2' ? 2 : devStep === '3' ? 3 : devStep === '4' ? 4 : 1
  );
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 1 — Photos start empty. User taps the plus tile → OS picker →
  // FileReader → base64 data_url held in memory → submitted inline with
  // the atomic create POST.
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);

  // Step 2 — Fields
  const [rooms, setRooms] = useState<0 | 1 | 2 | 3 | 4>(2);
  const [priceStr, setPriceStr] = useState(devParams?.get('price') ?? '3 500 000');
  const [area, setArea] = useState(devParams?.get('area') ?? '48');
  const [floor, setFloor] = useState(devParams?.get('floor') ?? '9');
  const [floorTotal, setFloorTotal] = useState(devParams?.get('floorTotal') ?? '16');
  const [furnished, setFurnished] = useState(true);
  const [ac, setAc] = useState(true);
  const [internet, setInternet] = useState(true);
  const [parking, setParking] = useState(false);
  const [animalsOk, setAnimalsOk] = useState(false);
  const [duration, setDuration] = useState<'short' | 'long' | 'flexible'>('long');
  const [description, setDescription] = useState('');
  const [phoneVisible, setPhoneVisible] = useState(true);

  const priceNum = useMemo(() => Number(priceStr.replace(/\s/g, '')) || 0, [priceStr]);
  // Nudge only — market range for 2-комн in this ЖК. Not blocking.
  const priceLooksHigh = rooms === 2 && priceNum > 4_200_000;
  const priceLooksLow = rooms === 2 && priceNum > 0 && priceNum < 2_800_000;

  const uploadedCount = photos.filter(p => p.state === 'uploaded').length;
  const canGoStep2 = uploadedCount >= PHOTO_MIN;
  const canGoStep3 = priceNum > 0 && Number(area) > 0 && Number(floor) > 0 && Number(floorTotal) >= Number(floor);

  const doPublish = async () => {
    if (publishing) return;
    const dataUrls = photos.filter(p => p.state === 'uploaded').map(p => p.data_url);
    if (dataUrls.length < PHOTO_MIN) {
      addToast('warning', t(language, `Нужно минимум ${PHOTO_MIN} фото`, `Kamida ${PHOTO_MIN} surat kerak`));
      return;
    }
    setPublishing(true);
    try {
      await rentalsApi.createListing({
        rooms,
        area_m2: Number(area),
        floor: Number(floor),
        floor_total: Number(floorTotal),
        apartment_number: user?.apartment ?? null,
        entrance: null,
        building_id: (user as any)?.building_id ?? null,
        price_monthly: priceNum,
        price_currency: 'UZS' as any,           // server ignores; default UZS
        deposit_months: 1,
        furnished: furnished ? 1 : 0,
        air_conditioning: ac ? 1 : 0,
        internet: internet ? 1 : 0,
        parking: parking ? 1 : 0,
        animals_allowed: animalsOk ? 1 : 0,
        duration_type: duration,
        description,
        phone_visible: phoneVisible ? 1 : 0,
        photos: dataUrls,
      });
      setStep(4);
    } catch (e: any) {
      addToast('error', e?.message || t(language, 'Не удалось опубликовать', 'Nashr qilib bo\'lmadi'));
    } finally {
      setPublishing(false);
    }
  };

  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id));
  const retryPhoto = (id: string) => {
    // Retry = pop the failed tile and re-open the picker; the user re-selects.
    removePhoto(id);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };
  const setCover = (id: string) => {
    setPhotos(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.unshift(moved);
      return next;
    });
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = PHOTO_MAX - photos.length;
    if (remaining <= 0) {
      addToast('warning', t(language, `Максимум ${PHOTO_MAX} фото`, `Ko'pi bilan ${PHOTO_MAX} surat`));
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    // Add placeholders immediately so the grid reflects the pick even
    // while FileReader runs (large images can take 100-300ms).
    const drafts: DraftPhoto[] = picked.map((f, i) => ({
      id: `ph-${Date.now()}-${i}`,
      state: 'reading',
      data_url: '',
    }));
    setPhotos(prev => [...prev, ...drafts]);
    await Promise.all(picked.map(async (file, i) => {
      const draftId = drafts[i].id;
      try {
        if (!PHOTO_MIME_OK.has(file.type)) {
          setPhotos(prev => prev.map(p => p.id === draftId
            ? { ...p, state: 'failed', error: t(language, 'Только JPEG, PNG или WEBP', 'Faqat JPEG, PNG yoki WEBP') }
            : p));
          return;
        }
        if (file.size > PICK_MAX_BYTES) {
          setPhotos(prev => prev.map(p => p.id === draftId
            ? { ...p, state: 'failed', error: t(language, 'Файл слишком большой', 'Fayl juda katta') }
            : p));
          return;
        }
        // Compress before base64 — resize to 1280px longest edge, JPEG q0.8,
        // step down until under target. Returns a data:image/jpeg;base64,… URL.
        const dataUrl = await compressImage(file, { maxBytes: COMPRESS_TARGET_BYTES });
        setPhotos(prev => prev.map(p => p.id === draftId
          ? { ...p, state: 'uploaded', data_url: dataUrl }
          : p));
      } catch {
        setPhotos(prev => prev.map(p => p.id === draftId
          ? { ...p, state: 'failed', error: t(language, 'Не удалось обработать файл', 'Faylni qayta ishlab bo\'lmadi') }
          : p));
      }
    }));
  };
  const addPhoto = () => {
    if (photos.length >= PHOTO_MAX) return;
    fileInputRef.current?.click();
  };

  const roomsText =
    rooms === 0 ? t(language, 'Студия', 'Studiya')
    : rooms === 4 ? '4+ комн' : `${rooms}-комн`;
  const durationText =
    duration === 'long' ? t(language, 'Длительно', 'Uzoq muddat')
    : duration === 'short' ? t(language, 'Короткий срок', 'Qisqa muddat')
    : t(language, 'Гибко', 'Moslashuvchan');

  // ── Step 4: Done ──
  if (step === 4) {
    return (
      <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex items-center justify-center px-6">
        <div className="text-center max-w-[340px] mx-auto pb-16">
          <div className="w-24 h-24 rounded-full bg-primary-50 grid place-items-center mx-auto mb-5">
            <Check className="w-10 h-10 text-primary-500" strokeWidth={2.2} />
          </div>
          <h2 className="text-[24px] font-extrabold text-gray-900 leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {t(language, 'Опубликовано', 'Joylashtirildi')}
            <span className="text-primary-500">.</span>
          </h2>
          <p className="text-[13.5px] text-gray-600 leading-relaxed mt-3 mb-5">
            {t(language,
              'Соседи увидят объявление в ленте прямо сейчас — без ожидания.',
              "Qo'shnilar e'lonni lentada hoziroq ko'radi — kutmasdan.")}
          </p>
          <div className="p-3 rounded-[14px] bg-primary-50 border border-primary-200 flex gap-2 text-left mb-5">
            <Clock className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
            <div className="text-[11.5px] text-primary-700 font-semibold leading-relaxed">
              {t(language,
                'Раз в 14 дней мы напомним подтвердить актуальность — одним тапом.',
                "Har 14 kunda dolzarbligini tasdiqlashni eslataib turamiz — bitta tap bilan.")}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate('/apartment-rentals')}
              className="w-full py-3.5 rounded-[14px] text-white font-semibold text-[14px] active:scale-[0.98]"
              style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
            >
              {t(language, 'Открыть объявление', "E'lonni ochish")}
            </button>
            <button
              onClick={() => navigate('/apartment-rentals/mine')}
              className="w-full py-3.5 rounded-[14px] border border-gray-200 text-gray-900 font-semibold text-[14px]"
            >
              {t(language, 'К моим объявлениям', "Mening e'lonlarimga")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          onFilesPicked(e.target.files);
          e.currentTarget.value = '';                 // allow re-picking same file
        }}
      />
      {/* Sticky header: back + title + step counter */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', willChange: 'transform' }}
      >
        <div className="px-4 pt-2 pb-2 flex items-center gap-2">
          <button
            onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : navigate(-1)}
            className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90"
            aria-label={t(language, 'Назад', 'Orqaga')}
          >
            <ArrowLeft className="w-[18px] h-[18px] text-gray-700" strokeWidth={2.2} />
          </button>
          <h1 className="flex-1 text-[16px] font-bold text-gray-900 text-center">
            {step === 1 && t(language, 'Новое объявление', "Yangi e'lon")}
            {step === 2 && t(language, 'Детали', 'Tafsilotlar')}
            {step === 3 && t(language, 'Проверьте', 'Tekshiring')}
          </h1>
          <div className="text-[11.5px] font-extrabold text-gray-400 tracking-[0.12em] min-w-[38px] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span className="text-primary-500">{step}</span>/3
          </div>
        </div>
        <div className="px-4 pb-2 flex gap-1.5">
          {[1, 2, 3].map(n => (
            <div key={n} className={`flex-1 h-[3px] rounded-full ${n <= step ? 'bg-primary-500' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(96px+env(safe-area-inset-bottom,0px))]" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px) + var(--kz-kb-h, 0px))' }}>
        {step === 1 && (
          <div className="px-5 pt-5">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2">
              {t(language, 'Фотографии', 'Suratlar')}
            </div>
            <p className="text-[12.5px] text-gray-500 leading-relaxed mb-3">
              {t(language,
                'Первое фото — обложка в ленте. От 3 до 8 фото.',
                "Birinchi surat — lentada muqova. 3 dan 8 gacha surat.")}
            </p>

            <div className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 mb-3">
              <Check className="w-3 h-3 text-primary-500" strokeWidth={2.4} />
              <span>
                <span className="text-primary-500">{uploadedCount}</span>
                {t(language, ` из 3 обязательных`, ` / 3 majburiy`)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((p, i) => (
                <div
                  key={p.id}
                  className={`aspect-square rounded-[14px] relative overflow-hidden border ${
                    p.state === 'failed' ? 'border-red-300 bg-red-50' :
                    p.state === 'uploaded' ? 'border-transparent' :
                    'border-gray-200 bg-gray-100'
                  }`}
                >
                  {p.state === 'uploaded' && (
                    <>
                      <img src={p.data_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {i === 0 ? (
                        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-primary-500 text-white text-[9.5px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full">
                          <Star className="w-2.5 h-2.5" fill="currentColor" />
                          {t(language, 'Обложка', 'Muqova')}
                        </span>
                      ) : (
                        <button
                          onClick={() => setCover(p.id)}
                          className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/85 grid place-items-center"
                          aria-label={t(language, 'Сделать обложкой', 'Muqova qilish')}
                        >
                          <Star className="w-3 h-3 text-gray-500" strokeWidth={2.2} />
                        </button>
                      )}
                      <button
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 grid place-items-center text-white"
                        aria-label={t(language, 'Удалить', "O'chirish")}
                      >
                        <X className="w-3 h-3" strokeWidth={2.4} />
                      </button>
                    </>
                  )}

                  {p.state === 'reading' && (
                    <div className="absolute inset-0 grid place-items-center bg-gray-100">
                      <div className="w-10 h-10 rounded-full border-[3px] border-white/25 border-t-primary-500 animate-spin" />
                    </div>
                  )}

                  {p.state === 'failed' && (
                    <>
                      <div className="absolute inset-0 grid place-items-center px-2">
                        <div className="text-[10px] font-extrabold text-red-600 text-center leading-snug">
                          {p.error || t(language, 'Ошибка', 'Xatolik')}
                        </div>
                      </div>
                      <button
                        onClick={() => retryPhoto(p.id)}
                        className="absolute bottom-1 left-1 right-1 bg-white/85 text-gray-900 text-[10px] font-extrabold uppercase tracking-[0.06em] py-1 rounded-md flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="w-2.5 h-2.5" strokeWidth={2.4} />
                        {t(language, 'Повторить', "Qayta")}
                      </button>
                    </>
                  )}
                </div>
              ))}

              {photos.length < PHOTO_MAX && (
                <button
                  onClick={addPhoto}
                  className="aspect-square rounded-[14px] border-2 border-dashed border-gray-300 text-gray-400 text-[32px] font-light grid place-items-center bg-white"
                  aria-label={t(language, 'Добавить фото', 'Surat qo\'shish')}
                >
                  <Plus className="w-8 h-8" strokeWidth={1.2} />
                </button>
              )}
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed mb-6">
              {t(language,
                'Удерживайте фото, чтобы поменять порядок. Плохое качество — жалобы соседей.',
                "Tartibni o'zgartirish uchun suratni ushlab turing. Sifat past bo'lsa — qo'shnilardan shikoyat bo'ladi.")}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="px-5 pt-5 space-y-6">
            {/* Rooms */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Тип', 'Turi')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: 0, label: t(language, 'Студия', 'Studiya') },
                  { v: 1, label: '1-комн' },
                  { v: 2, label: '2-комн' },
                  { v: 3, label: '3-комн' },
                  { v: 4, label: '4+' },
                ].map(r => (
                  <button
                    key={r.v}
                    onClick={() => setRooms(r.v as 0 | 1 | 2 | 3 | 4)}
                    className={`px-3.5 py-2 rounded-[12px] text-[12.5px] font-bold transition-all ${
                      rooms === r.v ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Цена', 'Narx')}
              </div>
              <div className={`flex items-center gap-2 p-3 rounded-[14px] bg-white border min-w-0 ${(priceLooksHigh || priceLooksLow) ? 'border-red-400' : 'border-gray-200'}`}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={priceStr}
                  onChange={e => setPriceStr(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[14px] text-gray-900 font-semibold min-w-0 w-full"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-gray-400 flex-shrink-0">
                  {t(language, 'Сум · мес', "So'm · oy")}
                </span>
              </div>
              {(priceLooksHigh || priceLooksLow) && (
                <div className="text-[11px] text-red-400 mt-1.5">
                  {priceLooksHigh
                    ? t(language, 'Дороговато — в вашем ЖК двушки обычно 2.8–4.2 млн.', "Qimmatroq — sizning JK'da ikki xonalilar odatda 2.8–4.2 mln.")
                    : t(language, 'Ниже рыночного — проверьте.', 'Bozor narxidan past — tekshiring.')}
                </div>
              )}
            </div>

            {/* Area + floor —
                Grid tracks use minmax(0,…) so the columns can shrink below
                intrinsic content width (default `min-width: auto` is what
                caused the reported 360px overflow — inputs had min-w-0 but
                the tracks themselves didn't). The right cell holds 2 number
                inputs + a "/" separator so it gets 1.5× the width. */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Площадь и этаж', "Maydon va qavat")}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
                <div className="flex items-center gap-2 p-3 rounded-[14px] bg-white border border-gray-200 min-w-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={area}
                    onChange={e => setArea(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-[14px] font-semibold text-gray-900 min-w-0 w-full"
                  />
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-gray-400 flex-shrink-0">м²</span>
                </div>
                <div className="flex items-center gap-1 p-3 rounded-[14px] bg-white border border-gray-200 min-w-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={floor}
                    onChange={e => setFloor(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-[14px] font-semibold text-gray-900 min-w-0 w-full text-right"
                  />
                  <span className="text-gray-400 text-[13px] flex-shrink-0">/</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={floorTotal}
                    onChange={e => setFloorTotal(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-[14px] font-semibold text-gray-900 min-w-0 w-full"
                  />
                </div>
              </div>
            </div>

            {/* Amenities */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Что в квартире', 'Kvartirada nima bor')}
              </div>
              <div className="space-y-2">
                <ToggleRow icon={<Sofa className="w-4 h-4" strokeWidth={2} />} label={t(language, 'С мебелью', 'Mebel bilan')} on={furnished} onToggle={() => setFurnished(!furnished)} />
                <ToggleRow icon={<Snowflake className="w-4 h-4" strokeWidth={2} />} label={t(language, 'Кондиционер', 'Konditsioner')} on={ac} onToggle={() => setAc(!ac)} />
                <ToggleRow icon={<Wifi className="w-4 h-4" strokeWidth={2} />} label={t(language, 'Интернет', 'Internet')} on={internet} onToggle={() => setInternet(!internet)} />
                <ToggleRow icon={<Car className="w-4 h-4" strokeWidth={2} />} label={t(language, 'Парковка', 'Parking')} on={parking} onToggle={() => setParking(!parking)} />
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Срок аренды', 'Ijara muddati')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: 'long' as const, ru: 'Долгосрок', uz: 'Uzoq muddat' },
                  { v: 'short' as const, ru: 'Короткий', uz: 'Qisqa' },
                  { v: 'flexible' as const, ru: 'Гибко', uz: 'Moslashuvchan' },
                ].map(d => (
                  <button
                    key={d.v}
                    onClick={() => setDuration(d.v)}
                    className={`px-4 py-2 rounded-[12px] text-[12.5px] font-bold transition-all ${
                      duration === d.v ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
                    }`}
                  >
                    {t(language, d.ru, d.uz)}
                  </button>
                ))}
              </div>
            </div>

            {/* Animals */}
            <div>
              <ToggleRow icon={<span className="text-[14px]">🐾</span>} label={t(language, 'С животными можно', 'Hayvonlar bilan mumkin')} on={animalsOk} onToggle={() => setAnimalsOk(!animalsOk)} />
            </div>

            {/* Description */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Описание', 'Tavsif')}
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t(language, 'Расскажите о квартире и почему тут хорошо', "Kvartira haqida aytib bering")}
                rows={4}
                className="w-full p-3 rounded-[14px] bg-white border border-gray-200 text-[13.5px] resize-none outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Contact */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Контакт', 'Kontakt')}
              </div>
              <div className="p-3 rounded-[14px] bg-gray-100 border border-gray-200">
                <div className="text-[13px] font-semibold text-gray-900">{user?.name || 'Dev Preview'}</div>
                <div className="text-[12px] text-gray-500 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {user?.phone || '+998 90 000 00 00'}
                </div>
                <div className="text-[10.5px] text-gray-400 mt-1">
                  {t(language, 'Изменить в профиле', 'Profilda o\'zgartirish')}
                </div>
              </div>
              <ToggleRow className="mt-2" label={t(language, 'Показывать телефон в объявлении', "E'londa telefonni ko'rsatish")} on={phoneVisible} onToggle={() => setPhoneVisible(!phoneVisible)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="px-5 pt-5 space-y-5">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2.5">
                {t(language, 'Так соседи увидят в ленте', "Qo'shnilar lentada shunday ko'radi")}
              </div>
              <div className="rounded-[22px] bg-white border border-gray-100 overflow-hidden">
                <div className="aspect-[16/10] relative">
                  {photos.find(p => p.state === 'uploaded') && (
                    <img
                      src={photos.find(p => p.state === 'uploaded')!.data_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3.5">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-primary-500">
                    {t(language,
                      `Сосед · Кв. ${user?.apartment || '—'} · ${floor} этаж`,
                      `Qo'shni · ${user?.apartment || '—'}-uy · ${floor}-qavat`)}
                  </div>
                  <div className="mt-1.5 text-[16px] font-extrabold text-gray-900" style={{ letterSpacing: '-0.02em' }}>
                    {roomsText}, {area} м²
                  </div>
                  <div className="mt-2 text-[15px] font-extrabold text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtSum(priceNum)}
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-400 ml-1.5">
                      {t(language, 'сум · мес', "so'm · oy")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[18px] bg-white border border-gray-100 overflow-hidden">
              <div className="p-4">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-3">
                  {t(language, 'Ваши поля', 'Sizning ma\'lumotlaringiz')}
                </div>
                <ReviewRow k={t(language, 'Тип', 'Turi')} v={roomsText} onEdit={() => setStep(2)} language={language} />
                <ReviewRow k={t(language, 'Площадь', 'Maydon')} v={`${area} м²`} onEdit={() => setStep(2)} language={language} />
                <ReviewRow k={t(language, 'Этаж', 'Qavat')} v={`${floor} / ${floorTotal}`} onEdit={() => setStep(2)} language={language} />
                <ReviewRow k={t(language, 'Цена', 'Narx')} v={fmtSum(priceNum)} onEdit={() => setStep(2)} language={language} />
                <ReviewRow k={t(language, 'Что есть', 'Nima bor')}
                  v={[furnished && 'мебель', ac && 'AC', internet && 'wifi', parking && 'парковка'].filter(Boolean).join(' · ') || '—'}
                  onEdit={() => setStep(2)} language={language} />
                <ReviewRow k={t(language, 'Срок', 'Muddat')} v={durationText} onEdit={() => setStep(2)} language={language} last />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed left-0 right-0 bg-white border-t border-gray-100 flex gap-2 z-30"
        style={{
          bottom: 0,
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {step === 1 && (
          <button
            onClick={() => canGoStep2 && setStep(2)}
            disabled={!canGoStep2}
            className="w-full h-[46px] rounded-[15px] text-white font-semibold text-[14.5px] active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
          >
            {canGoStep2 ? t(language, 'Далее', 'Keyingi') : t(language, `Добавьте ещё ${3 - uploadedCount} фото`, `Yana ${3 - uploadedCount} surat qo'shing`)}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={() => canGoStep3 && setStep(3)}
            disabled={!canGoStep3}
            className="w-full h-[46px] rounded-[15px] text-white font-semibold text-[14.5px] active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
          >
            {t(language, 'Далее', 'Keyingi')}
          </button>
        )}
        {step === 3 && (
          <>
            <button
              onClick={() => setStep(2)}
              className="flex-shrink-0 h-[46px] px-4 rounded-[15px] border border-gray-200 text-gray-900 font-semibold text-[14px]"
            >
              {t(language, 'Назад', 'Orqaga')}
            </button>
            <button
              onClick={doPublish}
              disabled={publishing}
              className="flex-1 h-[46px] rounded-[15px] text-white font-semibold text-[14.5px] active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
            >
              {publishing
                ? t(language, 'Публикуем…', 'Nashr qilinmoqda…')
                : t(language, 'Опубликовать', 'Joylashtirish')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ToggleRow(props: {
  icon?: React.ReactNode; label: string; on: boolean; onToggle: () => void; className?: string;
}) {
  const { icon, label, on, onToggle, className } = props;
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-[14px] bg-white border border-gray-200 text-left ${className || ''}`}
    >
      {icon && <span className={on ? 'text-primary-500' : 'text-gray-400'}>{icon}</span>}
      <span className="text-[13.5px] font-semibold text-gray-900 flex-1">{label}</span>
      <span className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-primary-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function ReviewRow(props: { k: string; v: string; onEdit: () => void; language: string; last?: boolean }) {
  const { k, v, onEdit, language, last } = props;
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto] gap-3 items-baseline py-2.5 ${last ? '' : 'border-b border-gray-100'}`}>
      <span className="text-[12px] text-gray-500 tracking-wide min-w-0 break-words">{k}</span>
      <span className="text-[12.5px] text-gray-900 font-bold text-right min-w-0 break-words">{v}</span>
      <button onClick={onEdit} className="text-[10.5px] font-bold text-primary-500 uppercase tracking-[0.06em] flex-shrink-0 whitespace-nowrap">
        {t(language, 'Изм.', "O'zg.")}
      </button>
    </div>
  );
}
