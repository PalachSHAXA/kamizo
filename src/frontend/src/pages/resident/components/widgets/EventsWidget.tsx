import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Vote, AlertTriangle, ChevronRight } from 'lucide-react';
import { useMeetingStore } from '../../../../stores/meetingStore';
import { useAnnouncementStore } from '../../../../stores/announcementStore';
import { useAuthStore } from '../../../../stores/authStore';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * EventsWidget — mini-calendar of upcoming building events.
 * Combines two real sources of "things coming up":
 *
 *   1. Meetings with a `confirmedDateTime` within the next 14 days —
 *      собрание собственников, голосование с назначенной датой
 *   2. Urgent unread announcements — practically used by УК for outage
 *      notices, emergency repairs, schedule changes (resident can't
 *      reliably tell from content alone, but priority='urgent' is the
 *      strongest signal we have today).
 *
 * Sorted by date asc, capped at 3 items, hidden when nothing qualifies.
 *
 * Future improvement: when announcements get a structured `eventDate`
 * field (separate migration), pull "плановое отключение / ремонт лифта"
 * with proper dates — until then, urgent announcements stand in.
 */
export function EventsWidget() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const meetings = useMeetingStore(s => s.meetings);
  const announcements = useAnnouncementStore(s => s.announcements);

  type EventItem = {
    id: string;
    Icon: typeof Vote;
    iconColor: string;
    iconBg: string;
    title: string;
    whenLabel: string;
    relativeLabel: string;
    onClick: () => void;
  };

  const events = useMemo<EventItem[]>(() => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const items: EventItem[] = [];

    // 1. Upcoming meetings with a confirmed date
    for (const m of meetings || []) {
      if (m.status === 'cancelled') continue;
      if (!m.confirmedDateTime) continue;
      const dt = new Date(m.confirmedDateTime);
      if (dt < now || dt > horizon) continue;
      items.push({
        id: 'm-' + m.id,
        Icon: Vote,
        iconColor: '#7F77DD',
        iconBg: '#EEEDFE',
        title: m.agendaItems?.[0]?.title
          ?? (language === 'ru' ? `Собрание собственников #${m.number}` : `Yig'ilish #${m.number}`),
        whenLabel: dt.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }),
        relativeLabel: relativeDayLabel(dt, now, language),
        onClick: () => navigate('/meetings'),
      });
    }

    // 2. Urgent unread announcements (typically outage / emergency notices)
    for (const a of announcements || []) {
      if (a.priority !== 'urgent') continue;
      if (a.viewedBy?.includes(user?.id || '')) continue;
      const dt = new Date(a.createdAt);
      items.push({
        id: 'a-' + a.id,
        Icon: AlertTriangle,
        iconColor: '#E24B4A',
        iconBg: '#FCEBEB',
        title: a.title,
        whenLabel: dt.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
          day: '2-digit', month: 'short',
        }),
        relativeLabel: language === 'ru' ? 'срочно' : 'shoshilinch',
        onClick: () => navigate('/announcements'),
      });
    }

    // Earliest first
    items.sort((a, b) => a.whenLabel.localeCompare(b.whenLabel));
    return items.slice(0, 3);
  }, [meetings, announcements, user?.id, language, navigate]);

  if (events.length === 0) return null;

  return (
    <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-[13px] font-bold text-gray-900">
          {language === 'ru' ? 'События дома' : 'Uy tadbirlari'}
        </span>
      </div>

      <div className="space-y-2">
        {events.map(ev => {
          const Icon = ev.Icon;
          return (
            <button
              key={ev.id}
              onClick={ev.onClick}
              className="w-full flex items-center gap-3 text-left active:bg-gray-50 transition-colors p-2 -m-2 rounded-[12px]"
            >
              <div
                className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                style={{ background: ev.iconBg }}
              >
                <Icon className="w-[18px] h-[18px]" style={{ color: ev.iconColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-900 truncate">
                  {ev.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-gray-500">{ev.whenLabel}</span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-[1px] rounded-[5px]"
                    style={{ color: ev.iconColor, background: ev.iconBg }}
                  >
                    {ev.relativeLabel}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function relativeDayLabel(dt: Date, now: Date, lang: string): string {
  const diffMs = dt.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return lang === 'ru' ? 'сегодня' : 'bugun';
  if (diffDays === 1) return lang === 'ru' ? 'завтра' : 'ertaga';
  if (diffDays > 1 && diffDays <= 7) {
    return lang === 'ru' ? `через ${diffDays} дн` : `${diffDays} kundan keyin`;
  }
  return lang === 'ru' ? `через ${diffDays} дн` : `${diffDays} kun`;
}
