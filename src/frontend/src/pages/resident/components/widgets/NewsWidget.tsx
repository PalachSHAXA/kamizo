import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Vote, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAnnouncementStore } from '../../../../stores/announcementStore';
import { useMeetingStore } from '../../../../stores/meetingStore';
import { useAuthStore } from '../../../../stores/authStore';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * NewsWidget — Telegram-style swipeable stories of building news.
 * Pulls top unread announcements + upcoming voting meetings, max 5 items.
 * Uses native touch+mouse drag with scroll-snap fallback.
 */
export function NewsWidget() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const announcements = useAnnouncementStore(s => s.announcements);
  const meetings = useMeetingStore(s => s.meetings);

  type NewsItem = {
    id: string;
    icon: typeof Megaphone;
    iconColor: string;
    iconBg: string;
    title: string;
    text: string;
    time: string;
    tag?: string;
    onClick: () => void;
  };

  const items = useMemo<NewsItem[]>(() => {
    const result: NewsItem[] = [];

    // Top 3 unread announcements
    const unread = (announcements || [])
      .filter(a => !a.viewedBy?.includes(user?.id || ''))
      .slice(0, 3);
    for (const a of unread) {
      const isUrgent = a.priority === 'urgent';
      result.push({
        id: `ann-${a.id}`,
        icon: isUrgent ? AlertTriangle : Megaphone,
        iconColor: isUrgent ? '#EF4444' : '#F59E0B',
        iconBg: isUrgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
        title: a.title,
        text: (a.content || '').slice(0, 90),
        time: timeAgo(a.createdAt, language),
        tag: isUrgent ? (language === 'ru' ? 'Срочно' : 'Shoshilinch') : undefined,
        onClick: () => navigate('/announcements'),
      });
    }

    // Active meetings (voting open or schedule confirmed)
    const activeMeetings = (meetings || [])
      .filter(m => ['voting_open', 'schedule_confirmed'].includes(m.status))
      .slice(0, 2);
    for (const m of activeMeetings) {
      const isVoting = m.status === 'voting_open';
      result.push({
        id: `meet-${m.id}`,
        icon: Vote,
        iconColor: '#8B5CF6',
        iconBg: 'rgba(139,92,246,0.12)',
        title: m.agendaItems?.[0]?.title
          ?? (language === 'ru' ? `Собрание #${m.number}` : `Yig'ilish #${m.number}`),
        text: isVoting
          ? (language === 'ru' ? 'Идёт голосование. Ваш голос важен!' : 'Ovoz berish davom etmoqda')
          : (language === 'ru' ? 'Собрание скоро начнётся' : 'Yig\'ilish boshlanadi'),
        time: m.confirmedDateTime
          ? new Date(m.confirmedDateTime).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : (language === 'ru' ? 'Дата уточняется' : 'Sana aniqlanmoqda'),
        tag: isVoting ? (language === 'ru' ? 'Голосование' : 'Ovoz berish') : undefined,
        onClick: () => navigate('/meetings'),
      });
    }

    return result.slice(0, 5);
  }, [announcements, meetings, user?.id, language, navigate]);

  const [idx, setIdx] = useState(0);
  const startX = useRef(0);
  const curX = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    startX.current = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    setSwiping(true);
  };
  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!swiping) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    curX.current = x - startX.current;
    setDragX(curX.current);
  };
  const onEnd = () => {
    setSwiping(false);
    if (Math.abs(curX.current) > 50) {
      if (curX.current < 0 && idx < items.length - 1) setIdx(idx + 1);
      else if (curX.current > 0 && idx > 0) setIdx(idx - 1);
    }
    setDragX(0);
    curX.current = 0;
  };

  if (items.length === 0) return null;

  const item = items[idx];
  const Icon = item.icon;

  return (
    <div className="bg-white rounded-[22px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04] overflow-hidden">
      {/* Progress bars — TG stories style */}
      <div className="flex gap-[3px] px-4 pt-3">
        {items.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-[2px] bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-[2px] transition-all duration-400 ease-out"
              style={{
                background: i <= idx ? 'rgb(var(--brand-rgb))' : 'transparent',
                width: i < idx ? '100%' : i === idx ? '100%' : '0%',
                opacity: i <= idx ? 1 : 0.3,
              }}
            />
          </div>
        ))}
      </div>

      <div
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onMouseDown={onStart}
        onMouseMove={onMove}
        onMouseUp={onEnd}
        onMouseLeave={() => { if (swiping) onEnd(); }}
        className="px-[18px] pt-[14px] pb-4 cursor-grab select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-gray-400" />
            <span className="text-[13px] font-bold text-gray-900">
              {language === 'ru' ? 'Новости дома' : 'Uy yangiliklari'}
            </span>
          </div>
          <span className="text-[11px] text-gray-400">
            {idx + 1}/{items.length}
          </span>
        </div>

        {/* Card content */}
        <button
          onClick={item.onClick}
          key={idx}
          className="w-full flex items-start gap-3 text-left animate-[fadeUp_0.3s_ease_both]"
          style={{
            transform: `translateX(${swiping ? dragX * 0.4 : 0}px)`,
            transition: swiping ? 'none' : 'transform 0.3s ease',
          }}
        >
          <div
            className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: item.iconBg }}
          >
            <Icon className="w-[18px] h-[18px]" style={{ color: item.iconColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-gray-900 line-clamp-2">{item.title}</div>
            <div className="text-[12px] text-gray-500 mt-1 leading-snug line-clamp-2">{item.text}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-gray-400">{item.time}</span>
              {item.tag && (
                <span
                  className="text-[9px] font-bold px-2 py-[2px] rounded-[5px]"
                  style={{ color: item.iconColor, background: item.iconBg }}
                >
                  {item.tag}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
        </button>
      </div>
    </div>
  );
}

function timeAgo(iso: string, lang: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return lang === 'ru' ? 'только что' : 'hozirgina';
  if (diffMin < 60) return lang === 'ru' ? `${diffMin} мин назад` : `${diffMin} daq oldin`;
  if (diffH < 24) return lang === 'ru' ? `${diffH} ч назад` : `${diffH} s oldin`;
  if (diffD < 7) return lang === 'ru' ? `${diffD} дн назад` : `${diffD} kun oldin`;
  return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'short' });
}
