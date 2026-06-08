/* Resident home — ported 1:1 from Claude Design §01-glavnaya (kamizo-home.jsx).
   Verbatim structure/styles from the mockup; the dynamic parts (name, address,
   active count, swipe cards, approval, reschedule, meeting, announcements) are
   wired to real data via props. Includes the design's own floating TabBar — the
   global BottomBar is hidden for residents on this screen to avoid a double nav. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IBell, IPin, IWrench, IQR, ICard, ICar, ILock, ICheck, IClock, IChevronR,
  IUsers, IBolt, IUmbrella, IDownload, IStar, IPhone,
  SwipeCardStack,
} from './kamizoDesign';
import { useIsMobile } from '../../../hooks/useBreakpoint';

const ru = (language: string, r: string, u: string) => (language === 'ru' ? r : u);

// City skyline silhouette — flat dark rectangles with little window squares,
// painted behind the hero content so it reads as a city behind the greeting
// (LEFT mockup §01-glavnaya). Pure SVG, no extra assets to load.
function CityBackground() {
  const buildings: [number, number, number, number][] = [
    [0, 70, 38, 70], [40, 50, 44, 90], [86, 80, 30, 60],
    [118, 30, 48, 110], [168, 64, 32, 76], [202, 44, 46, 96],
    [250, 74, 30, 66], [282, 28, 48, 112], [332, 56, 36, 84],
    [370, 44, 30, 96],
  ];
  const windows: [number, number][] = [];
  buildings.forEach(([bx, by, bw, bh]) => {
    const cols = Math.max(2, Math.floor(bw / 10));
    const rows = Math.max(3, Math.floor(bh / 14));
    const cellW = 6, cellH = 6;
    const stepX = (bw - cols * cellW) / (cols + 1);
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r < rows; r++) {
        const wx = bx + stepX + c * (cellW + stepX);
        const wy = by + r * 13;
        if (wy + cellH < by + bh - 4) windows.push([wx, wy]);
      }
    }
  });
  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '62%', opacity: 0.42, pointerEvents: 'none' }}
    >
      <g fill="#000">{buildings.map(([x, y, w, h], i) => <rect key={`b${i}`} x={x} y={y} width={w} height={h} />)}</g>
      <g fill="rgba(255, 230, 200, 0.35)">{windows.map(([x, y], i) => <rect key={`w${i}`} x={x} y={y} width={5} height={5} rx={0.5} />)}</g>
    </svg>
  );
}

function HomeHero({ name, apt, activeCount, language, onMenu, onBell, bellOpen, unread, brand }: any) {
  // Time-of-day greeting (per Claude Design §01-glavnaya).
  const hour = new Date().getHours();
  const greetRu = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const greetUz = hour < 6 ? 'Hayrli tun' : hour < 12 ? 'Hayrli tong' : hour < 18 ? 'Hayrli kun' : 'Hayrli kech';
  return (
    <div
      style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #4A3B30 0%, #34291F 55%, #2A2018 100%)',
        // Floating rounded card: rounded on ALL corners with a light gap above
        // so the status-bar zone paints the light page bg (--app-bg), not the
        // brown gradient. margin-top = env(safe-area-inset-top) + 10px keeps
        // the brown strictly BELOW the iOS status bar / notch.
        borderRadius: 28,
        margin: 'calc(env(safe-area-inset-top, 0px) + 10px) 12px 0',
        padding: '20px 18px 22px',
        overflow: 'hidden',
        color: 'var(--text-on-dark)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: 0.55, background: 'radial-gradient(90% 70% at 88% -10%, rgba(251,146,60,0.5) 0%, transparent 55%), radial-gradient(70% 60% at 0% 110%, rgba(217,119,6,0.18) 0%, transparent 60%)' }} />
      <CityBackground />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onMenu} style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="Меню">
          <svg width="22" height="15" viewBox="0 0 22 15"><rect y="0" width="22" height="3" rx="1.5" fill="#FDBA74"/><rect y="6" width="15" height="3" rx="1.5" fill="#FDBA74"/><rect y="12" width="22" height="3" rx="1.5" fill="#FDBA74"/></svg>
        </button>
        {/* Centered Kamizo wordmark — bigger K tile (34) + bigger Kamizo (19) per LEFT mockup.
            Every text node below has an EXPLICIT color (hex literals, not vars) so
            inheritance from body{color:#1a1a1a} cannot turn the white text dark even if
            the CSS bundle is the old cached one. */}
        {/* `whiteSpace: 'nowrap'` on both wrapper and label so multi-word
             УК names ("Kamizo Demo", "Sky Park Tashkent") stay on a
             single line. The absolute-positioned wrapper still
             shrink-to-fits content, but text inside it can no longer
             break at the inter-word space and stack vertically. */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.4)', display: 'grid', placeItems: 'center', color: '#FDBA74', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', flex: '0 0 auto' }}>K</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#F4F0E8', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{brand || 'Kamizo'}</div>
        </div>
        <button onClick={onBell} style={{ position: 'relative', width: 44, height: 44, borderRadius: 14, background: bellOpen ? 'var(--brand, #F97316)' : 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: bellOpen ? '#fff' : '#F4F0E8' }} aria-label="Уведомления">
          <IBell size={20} />
          {unread > 0 && <span style={{ position: 'absolute', top: 8, right: 9, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #34291F' }}>{unread}</span>}
        </button>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(244,240,232,0.78)' }}>{ru(language, greetRu, greetUz)} 👋</div>
          {/* Name — EXPLICIT #F4F0E8 (warm white) instead of relying on inheritance
              from the hero's color var. This is the line the user reported as "black". */}
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 6, color: '#F4F0E8' }}>{name}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '9px 14px', background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', backdropFilter: 'blur(8px)', borderRadius: 14, fontSize: 13.5, fontWeight: 600, color: '#F4F0E8' }}>
            <IPin size={15} style={{ color: '#FB923C' }} />{apt}
          </div>
        </div>
        {/* Active-count chip — taller square card matching LEFT mockup: digit 34, ~88px wide. */}
        <div style={{ flex: '0 0 auto', padding: '16px 18px', borderRadius: 18, background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.4)', textAlign: 'center', minWidth: 88, backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#FDBA74', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(244,240,232,0.8)', marginTop: 6, lineHeight: 1.2 }}>{ru(language, 'активные', 'faol')}<br/>{ru(language, 'заявки', 'arizalar')}</div>
        </div>
      </div>
    </div>
  );
}

function QuickTiles({ onNewRequest, navigate, language, passCount = 0, vehicleCount = 0 }: any) {
  const tiles = [
    { Icon: IWrench, label: ru(language, 'Заявка', 'Ariza'), onClick: onNewRequest },
    { Icon: IQR, label: ru(language, 'Пропуск', 'Ruxsat'), onClick: () => navigate('/guest-access'), badge: passCount },
    { Icon: ICard, label: ru(language, 'Оплата', 'To\'lov'), soon: true },
    { Icon: ICar, label: ru(language, 'Авто', 'Avto'), onClick: () => navigate('/vehicles'), badge: vehicleCount },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {tiles.map((t, i) => (
        <button key={i} onClick={t.onClick} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center' }}>
            <t.Icon size={22} stroke={1.9} />
            {t.badge > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(249,115,22,0.4)', border: '2px solid var(--surface)' }}>{t.badge}</span>
            )}
            {t.soon && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(28,25,23,0.12)', border: '1px solid var(--border-c)' }}><ILock size={11} /></span>
            )}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ApprovalCard({ req, language, onApprove, onDetails }: any) {
  // LEFT mockup shows "{executor} · работа заняла {duration}". Compose only when both are known.
  const fmtDur = (sec?: number) => {
    if (!sec) return null;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} ${ru(language, 'мин', 'daq')}`;
    const h = Math.floor(m / 60); const r = m % 60;
    return r === 0 ? `${h} ${ru(language, 'ч', 'soat')}` : `${h} ${ru(language, 'ч', 'soat')} ${r} ${ru(language, 'мин', 'daq')}`;
  };
  const dur = fmtDur(req.workDuration);
  const subtitle = req.executorName
    ? (dur ? `${req.executorName} · ${ru(language, 'работа заняла', 'ish davom etdi')} ${dur}` : req.executorName)
    : null;
  return (
    <div style={{ background: 'linear-gradient(135deg, #FFF3EA 0%, #FFE6D2 100%)', border: '1px solid var(--brand-200)', borderRadius: 20, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 0 0 4px rgba(249,115,22,0.12)' }}><ICheck size={22} stroke={2.4} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--brand-dark)', textTransform: 'uppercase' }}>{ru(language, 'Ждёт вашей оценки', 'Bahoyingiz kutilmoqda')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{req.title} · #{req.number}</div>
          {subtitle && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onApprove} style={{ flex: 1, padding: 12, borderRadius: 14, background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: 'var(--sh-brand)' }}>{ru(language, 'Принять работу', 'Ishni qabul qilish')}</button>
        <button onClick={onDetails} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-c)', cursor: 'pointer', fontSize: 14, fontWeight: 650 }}>{ru(language, 'Подробнее', 'Batafsil')}</button>
      </div>
    </div>
  );
}

function MeetingWidget({ meeting, language, onOpen }: any) {
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, padding: 16, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 9px', borderRadius: 999, background: 'var(--status-active-bg)', color: 'var(--status-active)', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)' }} />{ru(language, 'Голосование', 'Ovoz berish')}
        </span>
        <IUsers size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{meeting.title || ru(language, 'Собрание жильцов', 'Yig\'ilish')}</div>
      <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' }}>{ru(language, 'Перейти к голосованию', 'Ovoz berishga')} <IChevronR size={16} /></div>
    </button>
  );
}

function BalanceCard({ language }: any) {
  const month = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
  return (
    <div style={{ background: 'var(--dark-surface)', borderRadius: 20, padding: 18, color: 'var(--text-on-dark)', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 999, background: 'rgba(249,115,22,0.16)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(244,240,232,0.6)', textTransform: 'uppercase' }}>{ru(language, `Оплата ЖКУ · ${month}`, `To'lov · ${month}`)}</div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'rgba(244,240,232,0.12)', color: 'rgba(244,240,232,0.8)', textTransform: 'uppercase' }}>{ru(language, 'Скоро', 'Tez')}</span>
      </div>
      <div style={{ position: 'relative', fontSize: 13.5, color: 'rgba(244,240,232,0.7)', marginTop: 12 }}>{ru(language, 'Онлайн-оплата и счётчики — в разработке', 'Onlayn to\'lov — ishlanmoqda')}</div>
      <button disabled style={{ position: 'relative', width: '100%', marginTop: 14, padding: 12, borderRadius: 14, border: 'none', cursor: 'not-allowed', background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.6 }}>
        {ru(language, 'Оплатить онлайн', 'Onlayn to\'lash')} <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.25)' }}>{ru(language, 'СКОРО', 'TEZ')}</span>
      </button>
    </div>
  );
}

function AnnMini({ items, language, onOpen }: any) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 20, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      {items.slice(0, 2).map((a: any, i: number) => {
        const urgent = a.priority === 'urgent';
        const time = a.createdAt ? new Date(a.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' }) : '';
        return (
          <button key={a.id || i} onClick={onOpen} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: i < Math.min(items.length, 2) - 1 ? '1px solid var(--hairline)' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: urgent ? 'var(--status-critical-bg)' : 'var(--status-info-bg)', color: urgent ? 'var(--status-critical)' : 'var(--status-info)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{urgent ? <IBolt size={18} /> : <IUmbrella size={18} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{time}{urgent ? ru(language, ' · срочно', ' · shoshilinch') : ''}</div>
            </div>
            <IChevronR size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        );
      })}
    </div>
  );
}

// Hook returns false once we know the app is running as an installed PWA
// (standalone display-mode, iOS navigator.standalone, or after 'appinstalled'
// has fired in this session). Returns true otherwise — i.e. installation is
// possible / hasn't happened yet — so the banner stays visible.
function useShouldShowInstallPrompt(): boolean {
  const detectInstalled = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
    if (window.matchMedia?.('(display-mode: minimal-ui)')?.matches) return true;
    if ((window.navigator as any).standalone === true) return true; // iOS Safari
    if (sessionStorage.getItem('kamizo_pwa_installed') === '1') return true;
    return false;
  };
  const [installed, setInstalled] = useState<boolean>(detectInstalled);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setInstalled(detectInstalled());
    mq.addEventListener?.('change', onChange);
    const onInstalled = () => {
      sessionStorage.setItem('kamizo_pwa_installed', '1');
      setInstalled(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      mq.removeEventListener?.('change', onChange);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return !installed;
}

function PWABanner({ language }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 20, background: 'var(--surface-2)', border: '1px dashed var(--border-strong)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IDownload size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{ru(language, 'Установите Kamizo на экран', 'Kamizo\'ni ekranga o\'rnating')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ru(language, 'Быстрый доступ как у приложения', 'Ilovadek tez kirish')}</div>
      </div>
    </div>
  );
}

// Renders the section wrapper + banner only if the app is NOT installed.
// When installed, returns null so the surrounding section margin collapses
// and there's no empty gap above the BottomBar.
function PWABannerSection({ language, sectionStyle }: any) {
  const show = useShouldShowInstallPrompt();
  if (!show) return null;
  return (
    <div style={sectionStyle}>
      <PWABanner language={language} />
    </div>
  );
}

// TabBar removed — the single shared `BottomBar` component in
// src/components/BottomBar.tsx now renders the same floating-pill design
// on every resident page (and every other role), portaled to document.body.
// The Layout already mounts <BottomBar /> globally, so Resident Home
// inherits it like every other route.

interface Props {
  language: string;
  name: string;
  apt: string;
  activeCount: number;
  pendingApproval: any[];
  pendingReschedules: any[];
  meeting: any | null;
  announcements: any[];
  unread?: number;
  brand?: string;
  passCount?: number;
  vehicleCount?: number;
  needsRegistration?: boolean;
  registrationMissing?: string;
  onNewRequest: () => void;
  onTab: (tab: 'home' | 'requests') => void;
  onMenu: () => void;
  onCompleteRegistration?: () => void;
  onApprove: (req: any) => void;
  onOpenRequest: (req: any) => void;
}

export function ResidentHomeDesign(props: Props) {
  const { language, name, apt, activeCount, pendingApproval, pendingReschedules, meeting, announcements, unread = 0, brand, passCount = 0, vehicleCount = 0, needsRegistration = false, registrationMissing, onNewRequest, onTab, onMenu, onCompleteRegistration, onApprove, onOpenRequest } = props;
  const navigate = useNavigate();
  const [bell, setBell] = useState(false);
  void bell;
  // Mobile uses width:100vw + negative auto margins to break out of any
  // ancestor padding. On desktop that breaks out PAST the sidebar too — the
  // hero ends up covering the global navigation. Drop the break-out for ≥md;
  // main-content's own width/margin already manages the column on desktop.
  const isMobile = useIsMobile();

  // No theme-color override on Home — the rule is now: light/beige status
  // bar on EVERY page (no exceptions). The global default in index.html
  // (#F4F0E8 warm beige, matching --app-bg) handles it. The hero stays
  // brown but starts BELOW env(safe-area-inset-top) via HomeHero's
  // margin-top, so the status-bar zone always paints the light page bg.

  // Card stack — LEFT mockup pins "Завершите регистрацию" first whenever the resident
  // still has their seed password. The rest follows the Claude Design order.
  const registrationCard = {
    id: 'registration',
    Icon: ICheck,
    silhouette: 'check',
    badge: ru(language, 'Важно', 'Muhim'),
    title: ru(language, 'Завершите регистрацию', "Ro'yxatdan o'tishni tugating"),
    sub: registrationMissing
      ? ru(language, `Не заполнено: ${registrationMissing}`, `To'ldirilmagan: ${registrationMissing}`)
      : ru(language, 'Не заполнено: пароль', "To'ldirilmagan: parol"),
    cta: ru(language, 'Заполнить →', "To'ldirish →"),
    gradient: 'linear-gradient(150deg, #2DD4BF 0%, #0E9488 100%)',
    shadow: 'rgba(14,148,136,0.5)',
    onClick: () => { if (onCompleteRegistration) onCompleteRegistration(); else navigate('/profile'); },
  };
  const baseCards = [
    { id: 'voting', Icon: IUsers, silhouette: 'people', badge: ru(language, 'Голосование', 'Ovoz'), title: ru(language, 'Идёт голосование', 'Ovoz berish'), sub: ru(language, 'Ваш голос важен', 'Ovozingiz muhim'), cta: ru(language, 'Проголосовать →', 'Ovoz berish →'), gradient: 'linear-gradient(150deg, #FB923C 0%, #EA580C 100%)', shadow: 'rgba(249,115,22,0.5)', onClick: () => navigate('/meetings') },
    { id: 'guest', Icon: IQR, silhouette: 'qr', badge: 'QR', title: ru(language, 'Гостевой пропуск', 'Mehmon ruxsati'), sub: ru(language, 'QR для гостя или доставки', 'Mehmon yoki yetkazib berish uchun'), cta: ru(language, 'Создать →', 'Yaratish →'), gradient: 'linear-gradient(150deg, #34D399 0%, #15A06E 100%)', shadow: 'rgba(21,160,110,0.5)', onClick: () => navigate('/guest-access') },
    { id: 'rate', Icon: IStar, silhouette: 'star', badge: ru(language, 'Оценка', 'Baho'), title: ru(language, 'Оцените УК', 'Boshqaruvni baholang'), sub: ru(language, 'Раз в месяц · 30 секунд', 'Oyiga bir marta'), cta: ru(language, 'Оценить →', 'Baholash →'), gradient: 'linear-gradient(150deg, #A78BFA 0%, #7C3AED 100%)', shadow: 'rgba(124,58,237,0.5)', onClick: () => navigate('/rate-employees') },
    { id: 'contacts', Icon: IPhone, silhouette: 'phone', badge: ru(language, 'Контакты', 'Kontaktlar'), title: ru(language, 'Полезные контакты', 'Foydali kontaktlar'), sub: ru(language, 'Экстренные службы и мастера', 'Favqulodda xizmatlar'), cta: ru(language, 'Открыть →', 'Ochish →'), gradient: 'linear-gradient(150deg, #60A5FA 0%, #2F77C2 100%)', shadow: 'rgba(47,119,194,0.5)', onClick: () => navigate('/useful-contacts') },
    { id: 'find-car', Icon: ICar, silhouette: 'car', badge: ru(language, 'Авто', 'Avto'), title: ru(language, 'Найти владельца авто', 'Avto egasini topish'), sub: ru(language, 'Поиск соседа по номеру', 'Raqam bo\'yicha qidirish'), cta: ru(language, 'Найти →', 'Topish →'), gradient: 'linear-gradient(150deg, #FBBF24 0%, #D97706 100%)', shadow: 'rgba(217,119,6,0.5)', onClick: () => navigate('/vehicles') },
  ];
  const cards = needsRegistration ? [registrationCard, ...baseCards] : baseCards;

  const section: React.CSSProperties = { padding: '0 16px', marginTop: 16 };
  const secLabel: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 };
  const secTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-secondary)', textTransform: 'uppercase' };
  const secMore: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' };
  const topApproval = pendingApproval && pendingApproval.length > 0 ? pendingApproval[0] : null;
  const reschedule = pendingReschedules && pendingReschedules.length > 0 ? pendingReschedules[0] : null;

  return (
    <div
      className="kz-screen"
      style={{
        minHeight: '100%',
        background: 'var(--app-bg)',
        // Pill (~68px) + safe-area-inset-bottom + breathing room. Without
        // this, the last card (BalanceCard / PWA banner) is hidden behind
        // the portal-mounted fixed TabBar.
        paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        // Mobile: break out of any horizontal padding on parent main so the
        // hero reaches the edges. Desktop: stay inside main-content's column
        // — otherwise the hero spans the whole viewport and slides under the
        // 272px Sidebar.
        width: isMobile ? '100vw' : '100%',
        marginLeft: isMobile ? 'calc(50% - 50vw)' : 0,
        marginRight: isMobile ? 'calc(50% - 50vw)' : 0,
      }}
    >
      <HomeHero name={name} apt={apt} activeCount={activeCount} language={language} unread={unread} brand={brand} onMenu={onMenu} onBell={() => { setBell((b) => !b); navigate('/announcements'); }} bellOpen={bell} />

      <div style={{ ...section, marginTop: 18 }}>
        <SwipeCardStack cards={cards as any} height={210} />
      </div>

      {/* Quick tiles sit close to the carousel dots — overrides the shared
          section's marginTop (16) with 6 so the gap matches the mockup. */}
      <div style={{ ...section, marginTop: 6 }}>
        <QuickTiles onNewRequest={onNewRequest} navigate={navigate} language={language} passCount={passCount} vehicleCount={vehicleCount} />
      </div>

      {topApproval && (
        <div style={section}>
          <ApprovalCard req={topApproval} language={language} onApprove={() => onApprove(topApproval)} onDetails={() => onOpenRequest(topApproval)} />
        </div>
      )}

      {reschedule && (
        <div style={section}>
          <button onClick={() => onTab('requests')} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 20, background: 'var(--status-pending-bg)', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.18)', color: '#B45309', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IClock size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#92400E' }}>{ru(language, 'Запрос на перенос визита', 'Tashrifni ko\'chirish')}</div>
              <div style={{ fontSize: 12.5, color: '#A16207', marginTop: 1 }}>{reschedule.proposedDate ? `${reschedule.proposedDate} ${reschedule.proposedTime || ''}` : ru(language, 'Нажмите, чтобы ответить', 'Javob berish uchun bosing')}</div>
            </div>
            <IChevronR size={18} style={{ color: '#B45309' }} />
          </button>
        </div>
      )}

      {meeting && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Собрание', 'Yig\'ilish')}</span><span style={secMore} onClick={() => navigate('/meetings')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <MeetingWidget meeting={meeting} language={language} onOpen={() => navigate('/meetings')} />
        </div>
      )}

      <div style={section}>
        <div style={secLabel}><span style={secTitle}>{ru(language, 'Оплата', 'To\'lov')}</span></div>
        <BalanceCard language={language} />
      </div>

      {announcements && announcements.length > 0 && (
        <div style={section}>
          <div style={secLabel}><span style={secTitle}>{ru(language, 'Объявления', 'E\'lonlar')}</span><span style={secMore} onClick={() => navigate('/announcements')}>{ru(language, 'Все →', 'Barchasi →')}</span></div>
          <AnnMini items={announcements} language={language} onOpen={() => navigate('/announcements')} />
        </div>
      )}

      {/* Wrapper renders only when the install banner is visible — otherwise
          the section's marginTop would leave an empty gap above the TabBar
          on already-installed PWAs. */}
      <PWABannerSection language={language} sectionStyle={section} />

      {/* No bottom navigation rendered here — the global BottomBar in
          src/components/BottomBar.tsx is mounted by Layout for every
          resident route and now owns the floating-pill design. */}
    </div>
  );
}
