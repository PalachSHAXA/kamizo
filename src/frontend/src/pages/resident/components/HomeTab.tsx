import { useNavigate } from 'react-router-dom';
import {
  Wrench, QrCode, CreditCard, Car, Lock, Users, ChevronRight,
  Megaphone, Clock, Download,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { HomeHighlights } from './HomeHighlights';
import type { HomeTabProps } from './types';

// Resident home feed — Claude Design §01-glavnaya.
// The dark hero (greeting + address + active count) is rendered by the parent
// ResidentDashboard above this. Here we render, in design order:
//   highlights band · quick tiles · meeting widget · payment card · announcements.
// All bound to real data passed in props (no mock content).

const sec = 'px-4 md:px-0 mt-4';

function QuickTiles({ onNewRequest }: { onNewRequest: () => void }) {
  const navigate = useNavigate();
  const tiles = [
    { Icon: Wrench, label: 'Заявка', onClick: onNewRequest },
    { Icon: QrCode, label: 'Пропуск', onClick: () => navigate('/guest-access') },
    { Icon: CreditCard, label: 'Оплата', soon: true },
    { Icon: Car, label: 'Авто', onClick: () => navigate('/vehicles') },
  ];
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {tiles.map((t, i) => (
        <button
          key={i}
          onClick={t.onClick}
          // v129 P1 — "Оплата" tile had Lock icon + no onClick but still
          // rendered as an active button. Tap registered as a press
          // without action. Now disabled + aria-disabled when no onClick
          // so the tap doesn't register at all; opacity matches the
          // ResidentProfilePage disabled-tile convention from v127.
          disabled={!t.onClick}
          aria-disabled={!t.onClick}
          className="relative flex flex-col items-center gap-2 py-3.5 px-2 rounded-[20px] touch-manipulation active:scale-[0.97] transition-transform disabled:active:scale-100"
          style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-c, #E6DFD2)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))', opacity: t.onClick ? 1 : 0.7 }}
        >
          <div
            className="w-[46px] h-[46px] rounded-full grid place-items-center"
            style={{ background: 'var(--brand-tint, #FFF3EA)', color: 'var(--brand-dark, #EA580C)' }}
          >
            <t.Icon size={22} strokeWidth={1.9} />
          </div>
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary, #1C1917)' }}>{t.label}</span>
          {t.soon && (
            <span className="absolute top-3 right-3" style={{ color: 'var(--text-muted, #A8A29E)' }}><Lock size={12} /></span>
          )}
        </button>
      ))}
    </div>
  );
}

function MeetingWidget({ meeting, language, onOpen }: { meeting: Record<string, unknown>; language: string; onOpen: () => void }) {
  const title = (meeting.title as string) || (language === 'ru' ? 'Собрание жильцов' : 'Yig\'ilish');
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-[20px] p-4 touch-manipulation active:scale-[0.99] transition-transform"
      style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-c, #E6DFD2)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))' }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full"
          style={{ background: 'var(--status-active-bg, rgba(21,160,110,0.12))', color: 'var(--status-active, #15A06E)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--status-active, #15A06E)' }} />
          {language === 'ru' ? 'Голосование' : 'Ovoz berish'}
        </span>
        <Users size={18} className="ml-auto" style={{ color: 'var(--text-muted, #A8A29E)' }} />
      </div>
      <div className="text-[16px] font-bold tracking-tight leading-snug" style={{ color: 'var(--text-primary, #1C1917)' }}>
        {title}
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: 'var(--brand-dark, #EA580C)' }}>
        {language === 'ru' ? 'Перейти к голосованию' : 'Ovoz berishga o\'tish'} <ChevronRight size={16} />
      </div>
    </button>
  );
}

function PaymentCard({ language }: { language: string }) {
  const month = new Date().toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
  return (
    <div
      className="relative overflow-hidden rounded-[20px] p-[18px] text-white"
      style={{ background: 'var(--dark-surface, #211E1B)', boxShadow: 'var(--shadow-md, 0 4px 16px rgba(28,25,23,0.06))' }}
    >
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full" style={{ background: 'rgba(249,115,22,0.16)' }} />
      <div className="relative flex items-center justify-between">
        <div className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'rgba(244,240,232,0.6)' }}>
          {language === 'ru' ? `Оплата ЖКУ · ${month}` : `To'lov · ${month}`}
        </div>
        <span className="text-[10.5px] font-extrabold px-2.5 py-[3px] rounded-full uppercase tracking-wide" style={{ background: 'rgba(244,240,232,0.12)', color: 'rgba(244,240,232,0.8)' }}>
          {language === 'ru' ? 'Скоро' : 'Tez orada'}
        </span>
      </div>
      <div className="relative text-[14px] mt-2.5" style={{ color: 'rgba(244,240,232,0.7)' }}>
        {language === 'ru' ? 'Онлайн-оплата и показания счётчиков — в разработке' : 'Onlayn to\'lov va hisoblagichlar — ishlanmoqda'}
      </div>
      <button
        disabled
        className="relative w-full mt-3.5 py-3 rounded-[14px] text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
        style={{ background: 'var(--brand, #F97316)' }}
      >
        {language === 'ru' ? 'Оплатить онлайн' : 'Onlayn to\'lash'}
        <span className="text-[10.5px] font-bold px-[7px] py-[2px] rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }}>
          {language === 'ru' ? 'СКОРО' : 'TEZ'}
        </span>
      </button>
    </div>
  );
}

function AnnouncementsMini({ items, language, onOpen }: { items: Record<string, unknown>[]; language: string; onOpen: () => void }) {
  const two = items.slice(0, 2);
  const timeAgo = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
  };
  return (
    <div className="rounded-[20px] overflow-hidden" style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-c, #E6DFD2)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))' }}>
      {two.map((a, i) => {
        const urgent = a.priority === 'urgent';
        return (
          <button
            key={(a.id as string) || i}
            onClick={onOpen}
            className="w-full text-left flex items-center gap-3 px-3.5 py-3 touch-manipulation"
            style={{ borderBottom: i < two.length - 1 ? '1px solid var(--hairline, rgba(28,25,23,0.06))' : 'none' }}
          >
            <div
              className="w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0"
              style={urgent
                ? { background: 'var(--status-critical-bg, rgba(226,72,61,0.12))', color: 'var(--status-critical, #E2483D)' }
                : { background: 'var(--status-info-bg, rgba(47,119,194,0.12))', color: 'var(--status-info, #2F77C2)' }}
            >
              <Megaphone size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary, #1C1917)' }}>{(a.title as string) || ''}</div>
              <div className="text-[12px] mt-0.5 inline-flex items-center gap-1" style={{ color: 'var(--text-secondary, #6F6A62)' }}>
                <Clock size={11} /> {timeAgo(a.createdAt as string)}{urgent ? (language === 'ru' ? ' · срочно' : ' · shoshilinch') : ''}
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-muted, #A8A29E)' }} />
          </button>
        );
      })}
    </div>
  );
}

function PWABanner({ language }: { language: string }) {
  return (
    <div
      className="flex items-center gap-3 px-3.5 py-3 rounded-[20px]"
      style={{ background: 'var(--surface-2, #FBF8F2)', border: '1px dashed var(--border-strong, #D8CFBE)' }}
    >
      <div className="w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0" style={{ background: 'var(--brand-tint, #FFF3EA)', color: 'var(--brand-dark, #EA580C)' }}>
        <Download size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold tracking-tight" style={{ color: 'var(--text-primary, #1C1917)' }}>
          {language === 'ru' ? 'Установите приложение' : 'Ilovani o\'rnating'}
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-secondary, #6F6A62)' }}>
          {language === 'ru' ? 'Быстрый доступ как у приложения' : 'Ilovadek tez kirish'}
        </div>
      </div>
    </div>
  );
}

export function HomeTab({
  language,
  latestAnnouncements,
  activeMeetings,
  setShowAllServices,
  switchTab,
  setSelectedRequest,
  activeRequests,
}: HomeTabProps) {
  const navigate = useNavigate();
  void setSelectedRequest; void activeRequests; void switchTab; // kept for API compatibility
  const meeting = activeMeetings && activeMeetings.length > 0 ? activeMeetings[0] : null;

  return (
    <div>
      {/* Highlights — swipeable stories (voting / urgent / approvals / rating) */}
      <div className={sec}>
        <HomeHighlights activeRequests={activeRequests} />
      </div>

      {/* Quick tiles */}
      <div className={sec}>
        <QuickTiles onNewRequest={() => setShowAllServices(true)} />
      </div>

      {/* Meeting widget — only when there is an active meeting */}
      {meeting && (
        <div className={sec}>
          <MeetingWidget meeting={meeting} language={language} onOpen={() => navigate('/meetings')} />
        </div>
      )}

      {/* Payment (online payment is "coming soon" — shown honestly) */}
      <div className={sec}>
        <PaymentCard language={language} />
      </div>

      {/* Announcements — only when there are unread ones */}
      {latestAnnouncements && latestAnnouncements.length > 0 && (
        <div className={sec}>
          <div className="flex items-baseline justify-between px-1 mb-2.5">
            <span className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #6F6A62)' }}>
              {language === 'ru' ? 'Объявления' : 'E\'lonlar'}
            </span>
            <button onClick={() => navigate('/announcements')} className="text-[13px] font-bold" style={{ color: 'var(--brand-dark, #EA580C)' }}>
              {language === 'ru' ? 'Все →' : 'Barchasi →'}
            </button>
          </div>
          <AnnouncementsMini items={latestAnnouncements} language={language} onOpen={() => navigate('/announcements')} />
        </div>
      )}

      {/* PWA install — v118.3: hidden inside Capacitor native shell
          (the user is already past "install the app" by definition). */}
      {!Capacitor.isNativePlatform() && (
        <div className={sec}>
          <PWABanner language={language} />
        </div>
      )}
    </div>
  );
}
