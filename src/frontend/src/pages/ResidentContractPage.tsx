// Resident "Договор" — Claude Design §14-dogovor handoff
// (design/handoff/contract-handoff.md). Header (back + title), dark
// gradient hero card with status badge + Номер/Дата stats, accordion
// of contract conditions, two-column requisites, and an in-flow
// full-width "Скачать PDF" CTA at the bottom that scrolls with the
// page.
//
// Surface decisions that diverge from the bare handoff:
//   • The global BottomBar is hidden on this route via the existing
//     modalStore-presence registry (useModalPresence). Same mechanism
//     bottom sheets, the new-request flow, and the request-details
//     sheet use today — mount pushes the count, unmount pops it, and
//     BottomBar.tsx already returns null while count > 0 (see
//     BottomBar.tsx line 80). No change to BottomBar; no new route
//     allowlist; navigation reappears the moment the user leaves
//     /contract. The contract page is content-heavy and reads like a
//     document, so the floating tab pill adds nothing and visibly
//     competes with the requisites cards.
//   • Скачать PDF is an IN-FLOW button at the end of the scrollable
//     content, not a position:fixed sticky bar. With the BottomBar
//     hidden there's nothing else competing for the bottom of the
//     viewport, so the lifted-action-bar workaround (bottom:
//     env(safe-area) + 76 px; zIndex 1001) is no longer needed and
//     was removed. The button scrolls together with the requisites.
//   • The handoff (kamizo-contract.jsx line 74) specifies a second
//     orange "Подписать" pill when !signed. We continue to omit it:
//     there is no self-serve signing backend, and shipping a dead
//     CTA is worse UX. The restoration path is documented inline.
//
// Скачать PDF — generateContractPdf renders a REAL text PDF from the
// canonical contract content (utils/contractContent), embedding Roboto
// Cyrillic + jsPDF lazy-loaded. Selectable text, crisp at any zoom,
// page-break safe. The handoff at screens/14-dogovor.html →
// kamizo-contract.jsx line 73 specifies the literal label and Download
// icon.
//
// All wiring uses existing helpers/stores:
//   - useAuthStore().user
//   - generateContractPdf(user, language, fileName) from utils/contractGenerator
//   - useToastStore for the download-error notice
//   - useModalPresence from stores/modalStore — hides BottomBar

import { useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Download, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { useModalPresence } from '../stores/modalStore';
import { formatName } from '../utils/formatName';
import { generateContractPdf } from '../utils/contractGenerator';

// ── visual tokens — each reads through `var(--themed-…, <light-hex>)`
//    so light mode is byte-identical (fallback wins when the var is
//    undefined) and html.dark in index.css fills the vars with the
//    warm-dark equivalents. ─────────────────────────────────────────
const APP_BG = 'var(--themed-app-bg, #F4F0E8)';
const SURFACE = 'var(--themed-surface, #FFFFFF)';
const TEXT_PRIMARY = 'var(--themed-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--themed-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--themed-text-muted, #A8A29E)';
const TEXT_ON_DARK = '#F4F0E8';
const BORDER_C = 'var(--themed-border-c, rgba(28,25,23,0.08))';
const BORDER_STRONG = 'var(--themed-border-strong, #D6D3D1)';
const BRAND_DARK = '#EA580C';
const SHADOW_SM = 'var(--themed-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';
const RADIUS_XL = 22;
const RADIUS_LG = 16;
const RADIUS_MD = 12;

// UK company constants — kept aligned with contractGenerator.ts so the
// requisites card matches the generated DOCX (single source of truth).
const UK_COMPANY = {
  name: 'ООО «Камизо»',
  inn: '307928888',
  address: 'Ташкент, Махтумкули 93/3',
};

// Format DD.MM.YYYY (or DD.MM.YYYY HH:MM when withTime).
const formatRuDate = (iso: string | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

// Mask phone to "···{last 4}" — handoff privacy idiom.
const maskPhone = (phone: string | undefined): string => {
  if (!phone) return 'тел. —';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return `тел. ${phone}`;
  const last4 = digits.slice(-4);
  return `тел. ···${last4.slice(0, 2)} ${last4.slice(2)}`;
};

interface Section {
  id: string;
  titleRu: string; titleUz: string;
  bodyRu: string;  bodyUz: string;
}

// Condensed clauses pulled from the project's existing canonical
// contract text in ContractPreview.tsx — short enough for an in-page
// accordion. The full DOCX comes via "Скачать договор".
const SECTIONS: Section[] = [
  {
    id: 's1',
    titleRu: '1. Предмет договора',
    titleUz: '1. Shartnoma predmeti',
    bodyRu:
      'УК «Камизо» обязуется оказывать услуги по управлению, содержанию и текущему ремонту общего имущества многоквартирного дома по адресу собственника. Границы эксплуатационной ответственности: водоснабжение — отсекающая арматура (первый вентиль); канализация — плоскость раструба тройника; электрика — отходящий от аппарата защиты провод квартирной сети; строительные конструкции — внутренняя поверхность стен квартиры, окна и входная дверь.',
    bodyUz:
      '«Kamizo» BK ko\'p kvartirali uy umumiy mulkini boshqarish, saqlash va joriy ta\'mirlash xizmatlarini ko\'rsatadi. Mas\'uliyat chegaralari: suv ta\'minoti — birinchi ventil; kanalizatsiya — trolik tekisligi; elektr — kvartira tarmoqining himoya apparatidan chiquvchi sim; qurilish konstruksiyalari — kvartira devorlarining ichki yuzasi, derazalar va kirish eshigi.',
  },
  {
    id: 's2',
    titleRu: '2. Права и обязанности сторон',
    titleUz: '2. Tomonlarning huquq va majburiyatlari',
    bodyRu:
      'УК обеспечивает круглосуточное аварийно-диспетчерское обслуживание, ведёт техническую документацию, информирует собственников о работах и изменении тарифов, представляет ежеквартальный отчёт. УК вправе привлекать сторонние организации и взыскивать задолженность через суд. Собственник своевременно вносит плату, согласовывает перепланировки, не повреждает общее имущество, обеспечивает доступ для осмотра и не создаёт шум с 22:00 до 8:00.',
    bodyUz:
      'BK 24/7 favqulodda dispetcher xizmatini ta\'minlaydi, texnik hujjatlarni yuritadi, mulkdorlarni ish va tarif o\'zgarishi haqida xabardor qiladi, har chorakda hisobot beradi. BK uchinchi shaxslarni jalb qilish va sudga murojaat qilish huquqiga ega. Mulkdor o\'z vaqtida to\'lov qiladi, qayta rejalashtirishni kelishadi, umumiy mulkka zarar yetkazmaydi va 22:00–8:00 oralig\'ida shovqin qilmaydi.',
  },
  {
    id: 's3',
    titleRu: '3. Стоимость и порядок расчётов',
    titleUz: '3. Narx va to\'lov tartibi',
    bodyRu:
      'Размер платы устанавливается пропорционально занимаемой площади согласно ст. 132–134 ЖК РУз и складывается из услуг по управлению, содержанию общего имущества и текущему ремонту. Оплата вносится ежемесячно до 10 числа месяца, следующего за расчётным. При просрочке начисляется пеня 0,1% за каждый день, но не более 50% от общей суммы долга.',
    bodyUz:
      'To\'lov hajmi UZb Uy-joy kodeksi 132–134-moddalariga ko\'ra egallangan maydonga mutanosib belgilanadi va boshqaruv, umumiy mulkni saqlash va joriy ta\'mirlashni o\'z ichiga oladi. To\'lov hisobot oyidan keyingi oyning 10-sanasigacha amalga oshiriladi. Kechikkanda har kun uchun 0,1% peniya hisoblanadi, lekin umumiy qarzning 50% dan oshmaydi.',
  },
  {
    id: 's4',
    titleRu: '4. Срок действия',
    titleUz: '4. Amal qilish muddati',
    bodyRu:
      'Договор вступает в силу с момента заключения на основании протокола собрания собственников. Если ни одна из сторон не уведомит о расторжении за 30 дней до окончания срока, договор автоматически продлевается на следующий календарный год.',
    bodyUz:
      'Shartnoma mulkdorlar yig\'ilishi bayonnomasi asosida tuzilganidan keyin kuchga kiradi. Tomonlar muddat tugashidan 30 kun oldin bekor qilish to\'g\'risida xabar bermasa, shartnoma keyingi kalendar yilga avtomatik ravishda uzaytiriladi.',
  },
];

export function ResidentContractPage() {
  // Treat /contract as a modal-class surface so the existing
  // modalStore-presence registry hides the BottomBar for the lifetime
  // of this component. BottomBar.tsx reads useModalStore().count and
  // returns null while count > 0; useModalPresence push/pops the count
  // on mount/unmount (see stores/modalStore.ts). Reused as-is; no new
  // mechanism introduced.
  useModalPresence();

  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();
  // v118.153 — iOS-style left-edge swipe-back. This page's ← button uses
  // navigate(-1) (line ~182), so mirror that here for consistency.
  useEdgeSwipeBack(() => navigate(-1));

  const [openId, setOpenId] = useState<string | null>('s1');
  const [isDownloading, setIsDownloading] = useState(false);

  // generateContractPdf builds its own QR codes from the same contract
  // data internally, so the page no longer needs a separate resident QR
  // state — the visible hero card uses an icon, not a QR.

  const signed = !!user?.contractSignedAt;
  const contractNumber = useMemo(() => {
    if (user?.contractNumber) return user.contractNumber;
    if (!user) return '—';
    const year = new Date(user.contractSignedAt || user.contractStartDate || user.createdAt || Date.now()).getFullYear();
    return `ДОГ-${year}-${user.login}`;
  }, [user]);
  const contractDateLabel = formatRuDate(user?.contractSignedAt || user?.contractStartDate || user?.createdAt);

  if (!user) return null;

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/profile');
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      // Filename per task spec: Kamizo-dogovor-{apartment}.pdf, falling
      // back to login when no apartment is set.
      const slug = (user.apartment ? String(user.apartment) : user.login || 'resident')
        .replace(/[^A-Za-zА-Яа-я0-9_-]+/g, '-');
      const fileName = `Kamizo-dogovor-${slug}.pdf`;
      await generateContractPdf(user, lang, fileName);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : null)
        || (lang === 'ru'
          ? 'Не удалось скачать договор. Попробуйте ещё раз.'
          : 'Shartnomani yuklab bo\'lmadi. Yana urinib ko\'ring.');
      addToast('error', msg);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100%',
      background: APP_BG, color: TEXT_PRIMARY,
      // BottomBar is hidden on this route (useModalPresence above) and
      // the action button is in-flow, not fixed, so the previous 180 px
      // bottom reservation for a sticky bar + BottomBar pill is gone.
      // Keep a comfortable margin past the home indicator so the
      // "Скачать PDF" button isn't crowded against the screen edge
      // when scrolled to the end.
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
      letterSpacing: '-0.01em',
    }}>
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 8px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={goBack}
          aria-label={lang === 'ru' ? 'Назад' : 'Ortga'}
          style={{
            width: 40, height: 40, borderRadius: RADIUS_MD,
            background: SURFACE, border: `1px solid ${BORDER_C}`,
            display: 'grid', placeItems: 'center',
            color: TEXT_SECONDARY, cursor: 'pointer', flex: '0 0 auto',
            font: 'inherit',
          }}>
          <ArrowLeft size={19} />
        </button>
        <div style={{
          fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
          color: TEXT_PRIMARY,
        }}>
          {lang === 'ru' ? 'Договор' : 'Shartnoma'}
        </div>
      </div>

      <div style={{ padding: '8px 16px 0' }}>
        {/* Dark hero — intentionally dark in light mode. In dark mode
            the page bg is already dark, so this lifts to a slightly
            elevated warm-dark via --themed-accent-hero-bg so the
            silhouette stays distinct from the surrounding page. */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: RADIUS_XL, padding: 20,
          background: 'var(--themed-accent-hero-bg, linear-gradient(160deg, #4A3B30 0%, #2A2018 100%))',
          color: 'var(--themed-accent-hero-text, #F4F0E8)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.4,
            background: 'radial-gradient(90% 80% at 88% 0%, rgba(251,146,60,0.45), transparent 55%)',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 13,
                background: 'rgba(244,240,232,0.14)',
                display: 'grid', placeItems: 'center', flex: '0 0 auto',
              }}>
                <FileText size={24} />
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 700,
                padding: '4px 10px', borderRadius: 999,
                background: signed ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.20)',
                color: signed ? '#86EFAC' : '#FCD34D',
                whiteSpace: 'nowrap',
              }}>
                {signed && <Check size={11} strokeWidth={3} />}
                {signed
                  ? (lang === 'ru' ? 'Действует' : 'Amal qiladi')
                  : (lang === 'ru' ? 'На подписании' : 'Imzolanmoqda')}
              </span>
            </div>
            <div style={{
              fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 14,
            }}>
              {lang === 'ru' ? 'Договор управления' : 'Boshqaruv shartnomasi'}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div>
                <div style={{
                  fontSize: 10.5, color: 'rgba(244,240,232,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700,
                }}>
                  {lang === 'ru' ? 'Номер' : 'Raqam'}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2,
                  wordBreak: 'break-word',
                }}>
                  {contractNumber}
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: 10.5, color: 'rgba(244,240,232,0.55)',
                  textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700,
                }}>
                  {lang === 'ru' ? 'Дата' : 'Sana'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {contractDateLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Conditions accordion */}
        <div style={sectionTitleStyle}>
          {lang === 'ru' ? 'Условия' : 'Shartlar'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SECTIONS.map(s => {
            const isOpen = openId === s.id;
            return (
              <div key={s.id} style={{
                background: SURFACE, border: `1px solid ${BORDER_C}`,
                borderRadius: RADIUS_LG, boxShadow: SHADOW_SM, overflow: 'hidden',
              }}>
                <button
                  onClick={() => setOpenId(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: 15, background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    color: TEXT_PRIMARY, font: 'inherit',
                  }}>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {lang === 'ru' ? s.titleRu : s.titleUz}
                  </span>
                  <ChevronDown size={17} style={{
                    color: TEXT_MUTED,
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s', flex: '0 0 auto',
                  }} />
                </button>
                {isOpen && (
                  <div style={{
                    padding: '0 15px 15px',
                    fontSize: 13.5, color: TEXT_SECONDARY, lineHeight: 1.6,
                  }}>
                    {lang === 'ru' ? s.bodyRu : s.bodyUz}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Requisites */}
        <div style={sectionTitleStyle}>
          {lang === 'ru' ? 'Реквизиты сторон' : 'Tomonlar rekvizitlari'}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <RequisiteCard
            title={lang === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
            lines={[
              UK_COMPANY.name,
              lang === 'ru' ? `ИНН ${UK_COMPANY.inn}` : `STIR ${UK_COMPANY.inn}`,
              UK_COMPANY.address,
            ]}
          />
          <RequisiteCard
            title={lang === 'ru' ? 'Собственник' : 'Mulkdor'}
            lines={[
              formatName(user.name) || '—',
              [
                user.apartment ? (lang === 'ru' ? `Кв. ${user.apartment}` : `${user.apartment}-xon.`) : null,
                user.totalArea ? `${user.totalArea} м²` : null,
              ].filter(Boolean).join(' · ') || (lang === 'ru' ? 'Адрес не указан' : 'Manzil ko\'rsatilmagan'),
              maskPhone(user.phone),
            ]}
          />
        </div>

        {/* In-flow download action.
            Lives inside the page's scroll content, after the requisites,
            so it scrolls with the document rather than pinning to the
            viewport. The previous fixed/sticky-bar approach (bottom:
            calc(safe-area) + 76px, zIndex 1001) is gone — with the
            BottomBar hidden via useModalPresence at the top of this
            component, nothing else competes for the viewport bottom and
            the workaround for the BottomBar overlap is no longer needed.
            Handoff styling preserved: white surface, 1 px var(--border-
            strong), radius var(--radius-md), 14 × 18 padding, font 14.5
            / 700, Download icon + label. The handoff's optional second
            orange "Подписать" pill (kamizo-contract.jsx line 74) stays
            omitted until a self-serve signing backend lands. */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%',
            marginTop: 24,
            padding: '14px 18px',
            borderRadius: RADIUS_MD,
            background: SURFACE,
            border: `1px solid ${BORDER_STRONG}`,
            color: TEXT_PRIMARY,
            fontSize: 14.5, fontWeight: 700,
            cursor: isDownloading ? 'default' : 'pointer',
            opacity: isDownloading ? 0.7 : 1,
            font: 'inherit',
          }}>
          <Download size={17} />
          {isDownloading
            ? (lang === 'ru' ? 'Готовим...' : 'Tayyorlanmoqda...')
            : (lang === 'ru' ? 'Скачать PDF' : 'Yuklab olish PDF')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
  color: TEXT_SECONDARY, textTransform: 'uppercase',
  padding: '20px 2px 10px',
};

function RequisiteCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER_C}`,
      borderRadius: RADIUS_LG, boxShadow: SHADOW_SM, padding: 14,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
        color: BRAND_DARK, textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lines.map((x, j) => (
          <div key={j} style={{
            fontSize: 12.5,
            color: j === 0 ? TEXT_PRIMARY : TEXT_SECONDARY,
            fontWeight: j === 0 ? 700 : 500,
            wordBreak: 'break-word',
          }}>
            {x}
          </div>
        ))}
      </div>
    </div>
  );
}

