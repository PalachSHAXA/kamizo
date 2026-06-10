// Resident "Договор" — Claude Design §14-dogovor handoff
// (design/handoff/contract-handoff.md). Header (back + title), dark
// gradient hero card with status badge + Номер/Дата stats, accordion
// of contract conditions, two-column requisites, sticky bottom action
// bar (Скачать договор → real generateContractDocx; Подписать → locked
// info toast since there's no self-serve signing endpoint yet).
//
// All wiring uses existing helpers/stores:
//   - useAuthStore().user
//   - generateContractDocx(user, qrCodeUrl, language) from utils/contractGenerator
//   - generateQRCode(text, opts) from components/LazyQRCode
//   - useToastStore for the locked-action notice

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Download, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { formatName } from '../utils/formatName';
import { generateContractDocx } from '../utils/contractGenerator';
import { generateQRCode } from '../components/LazyQRCode';

// ── visual tokens (literal so a global rename can't silently break
//    this surface) ────────────────────────────────────────────────────
const APP_BG = '#F4F0E8';
const SURFACE = '#FFFFFF';
const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#6F6A62';
const TEXT_MUTED = '#A8A29E';
const TEXT_ON_DARK = '#F4F0E8';
const BORDER_C = 'rgba(28,25,23,0.08)';
const BORDER_STRONG = '#D6D3D1';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const SHADOW_SM = '0 1px 2px rgba(28,25,23,0.04)';
const SHADOW_BRAND = '0 8px 22px rgba(249,115,22,0.32)';
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
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();

  const [openId, setOpenId] = useState<string | null>('s1');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Generate the resident QR lazily — used by the DOCX export so the
  // signature block carries the resident's personal QR.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const generate = async () => {
      const text = [
        `ФИО: ${user.name || 'Собственник'}`,
        `Л/С: ${user.login}`,
        user.address ? `Адрес: ${user.address}` : null,
        user.apartment ? `Кв: ${user.apartment}` : null,
        user.phone ? `Тел: ${user.phone}` : null,
      ].filter(Boolean).join('\n');
      try {
        const url = await generateQRCode(text, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setQrCodeUrl(url);
      } catch {
        // QR generation failure is non-fatal — DOCX still renders.
      }
    };
    generate();
    return () => { cancelled = true; };
  }, [user]);

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
      await generateContractDocx(user, qrCodeUrl, lang);
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

  // Locked: no self-serve signing endpoint yet. Until the legal flow
  // lands, signing runs through the УК offline — we surface that as an
  // info toast instead of breaking the flow.
  const handleSign = () => {
    addToast('info', lang === 'ru'
      ? 'Подписание договора пока проходит через УК. Свяжитесь с управляющей компанией.'
      : 'Shartnomani imzolash hozircha BK orqali amalga oshiriladi. Boshqaruv kompaniyasiga murojaat qiling.');
  };

  return (
    <div style={{
      minHeight: '100%',
      background: APP_BG, color: TEXT_PRIMARY,
      // Reserve room for BOTH the lifted sticky action bar (~76 px above
      // the BottomBar pill) AND the BottomBar pill itself (~60 px tall
      // sitting at safe-area-inset-bottom). 180 px clears both with a
      // small gap so the last requisite card isn't visually crowded.
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 180px)',
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
        {/* Dark hero */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: RADIUS_XL, padding: 20,
          background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)',
          color: TEXT_ON_DARK,
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
      </div>

      {/* Sticky bottom action bar.
          The global BottomBar is a position:fixed floating pill at bottom:0
          with zIndex 1000. The handoff specifies this action bar also at
          bottom:0, but that puts it directly under the BottomBar pill —
          which is exactly the regression: the Download/Sign buttons are in
          the DOM but invisible because BottomBar paints on top. Lift this
          bar above the pill: the pill's top edge sits at roughly
          env(safe-area-inset-bottom) + 60 px, so bottom of 76 px (+ safe
          area) leaves a small visual gap. zIndex 1001 keeps it above the
          BottomBar in any sub-pixel edge case. */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
        left: 0, right: 0, zIndex: 1001,
        padding: '12px 16px',
        background: 'rgba(244,240,232,0.95)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderTop: `1px solid ${BORDER_C}`,
        borderBottom: `1px solid ${BORDER_C}`,
        display: 'flex', gap: 10,
      }}>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          style={{
            flex: signed ? 1 : '0 0 auto',
            padding: '14px 18px', borderRadius: RADIUS_MD,
            background: SURFACE, border: `1px solid ${BORDER_STRONG}`,
            color: TEXT_PRIMARY, fontSize: 14.5, fontWeight: 700,
            cursor: isDownloading ? 'default' : 'pointer',
            opacity: isDownloading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            font: 'inherit',
          }}>
          <Download size={17} />
          {isDownloading
            ? (lang === 'ru' ? 'Готовим...' : 'Tayyorlanmoqda...')
            : (lang === 'ru' ? 'Скачать договор' : 'Shartnomani yuklab olish')}
        </button>
        {!signed && (
          <button
            onClick={handleSign}
            style={{
              flex: 1, padding: 14, borderRadius: RADIUS_MD,
              background: BRAND, border: 'none', color: '#fff',
              fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
              boxShadow: SHADOW_BRAND, font: 'inherit',
            }}>
            {lang === 'ru' ? 'Подписать' : 'Imzolash'}
          </button>
        )}
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

