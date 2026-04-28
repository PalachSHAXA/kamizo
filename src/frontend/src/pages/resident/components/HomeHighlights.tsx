import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Vote, AlertTriangle, CheckCircle2, ChevronRight, Sparkles, Megaphone, Star,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useDataStore } from '../../../stores/dataStore';
import { useMeetingStore } from '../../../stores/meetingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { ukRatingsApi } from '../../../services/api';
import type { Request } from '../../../types';

/**
 * HomeHighlights — horizontal scroll-snap carousel rendered at the top of the
 * resident home tab. Each card is a full-width "story" card answering ONE
 * question: "what needs my attention right now?".
 *
 * Cards are added in priority order, hidden when there's nothing to show, and
 * the whole carousel is hidden if no card qualifies. Order:
 *
 *   1. Onboarding (phone/password/contract incomplete)  — brand color
 *   2. Active voting (status='voting_open')             — blue
 *   3. Urgent announcement (priority='urgent', unread)  — red
 *   4. Pending approval (request waiting for resident)  — purple
 *   5. Monthly UK rating not yet given                  — yellow
 *
 * Swipe gestures use native `scroll-snap`. Dot indicator below tracks the
 * current snap-point. No external dependencies.
 */
export function HomeHighlights({ activeRequests }: { activeRequests: Request[] }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const { meetings } = useMeetingStore();
  const announcements = useDataStore(s => s.announcements);

  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ===== Data sources =====
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';

  // 1. Onboarding pending count
  const onboardingPending = useMemo(() => {
    if (!user) return 0;
    let count = 0;
    if (!(user.phone && user.phone.length >= 5)) count++;
    if (!user.passwordChangedAt) count++;
    if (!isRentalUser && !user.contractSignedAt) count++;
    return count;
  }, [user, isRentalUser]);

  // 2. Active voting
  const activeVoting = meetings.find(m => m.status === 'voting_open');

  // 3. Urgent unread announcement
  const urgentAnnouncement = announcements.find(a =>
    a.priority === 'urgent' && !a.viewedBy?.includes(user?.id || '')
  );

  // 4. Pending approval
  const pendingApprovalRequest = activeRequests.find(r => r.status === 'pending_approval');

  // 5. Monthly UK rating not yet given (small async fetch)
  const [hasMonthlyUkRating, setHasMonthlyUkRating] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    ukRatingsApi.getMyRating()
      .then(res => setHasMonthlyUkRating(!!res.rating))
      .catch(() => setHasMonthlyUkRating(true)); // hide card on error
  }, [user?.id]);

  // ===== Build cards array =====
  type Card = {
    id: string;
    color: string; // tailwind border / accent classes
    bgGradient: string; // CSS gradient for card bg
    icon: typeof Vote;
    eyebrow: string;
    title: string;
    sub: string;
    cta: string;
    onClick: () => void;
  };

  const cards: Card[] = [];

  if (onboardingPending > 0) {
    cards.push({
      id: 'onboarding',
      color: 'border-primary-200',
      bgGradient: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.10) 0%, rgba(var(--brand-rgb), 0.04) 100%)',
      icon: CheckCircle2,
      eyebrow: language === 'ru' ? 'РЕГИСТРАЦИЯ' : 'RO\'YXATDAN O\'TISH',
      title: language === 'ru' ? 'Завершите профиль' : 'Profilingizni yakunlang',
      sub: language === 'ru'
        ? `Осталось ${onboardingPending} ${onboardingPending === 1 ? 'шаг' : 'шагов'}`
        : `Qoldi ${onboardingPending} ta qadam`,
      cta: language === 'ru' ? 'Заполнить' : 'To\'ldirish',
      onClick: () => navigate('/profile'),
    });
  }

  if (activeVoting) {
    const meetingTitle =
      activeVoting.agendaItems?.[0]?.title
      ?? (language === 'ru' ? `Собрание #${activeVoting.number}` : `Yig'ilish #${activeVoting.number}`);
    const userArea = user?.totalArea;
    const subText = userArea
      ? (language === 'ru' ? `Ваш голос · ${userArea} м²` : `Ovozingiz · ${userArea} m²`)
      : (language === 'ru' ? 'Голосование открыто' : 'Ovoz berish ochiq');
    cards.push({
      id: 'voting',
      color: 'border-blue-200',
      bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      icon: Vote,
      eyebrow: language === 'ru' ? 'ГОЛОСОВАНИЕ' : 'OVOZ BERISH',
      title: meetingTitle,
      sub: subText,
      cta: language === 'ru' ? 'Проголосовать' : 'Ovoz berish',
      onClick: () => navigate('/meetings'),
    });
  }

  if (urgentAnnouncement) {
    cards.push({
      id: 'urgent',
      color: 'border-red-200',
      bgGradient: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      icon: AlertTriangle,
      eyebrow: language === 'ru' ? 'СРОЧНО' : 'SHOSHILINCH',
      title: urgentAnnouncement.title,
      sub: urgentAnnouncement.content?.slice(0, 60) || '',
      cta: language === 'ru' ? 'Подробнее' : 'Batafsil',
      onClick: () => navigate('/announcements'),
    });
  }

  if (pendingApprovalRequest) {
    cards.push({
      id: 'approve',
      color: 'border-purple-200',
      bgGradient: 'linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%)',
      icon: Megaphone,
      eyebrow: language === 'ru' ? 'ПОДТВЕРДИТЕ' : 'TASDIQLANG',
      title: language === 'ru' ? 'Работа по заявке завершена' : 'Ariza bo\'yicha ish tugatildi',
      sub: language === 'ru'
        ? `Заявка #${pendingApprovalRequest.number} ждёт оценки`
        : `Ariza #${pendingApprovalRequest.number} baholashni kutmoqda`,
      cta: language === 'ru' ? 'Оценить' : 'Baholash',
      onClick: () => navigate('/?tab=requests'),
    });
  }

  if (hasMonthlyUkRating === false) {
    const monthLabel = new Date().toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { month: 'long' });
    cards.push({
      id: 'rating',
      color: 'border-yellow-200',
      bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
      icon: Star,
      eyebrow: language === 'ru' ? 'ОЦЕНКА УК' : 'UK BAHOSI',
      title: language === 'ru' ? `Оцените УК за ${monthLabel}` : `UKni baholang (${monthLabel})`,
      sub: language === 'ru' ? 'Раз в месяц · 30 секунд' : 'Oyiga bir marta · 30 soniya',
      cta: language === 'ru' ? 'Оценить' : 'Baholash',
      onClick: () => navigate('/rate-employees'),
    });
  }

  // Track active dot via scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const cardWidth = el.clientWidth;
      const idx = Math.round(el.scrollLeft / cardWidth);
      setActiveIdx(idx);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [cards.length]);

  if (cards.length === 0) {
    // Friendly all-clear state. Shown on the home tab so the area never
    // becomes a blank gap when nothing is pending — gives the resident a
    // small "everything's good" reward.
    return (
      <div className="px-2.5 md:px-0">
        <div
          className="rounded-[18px] p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' }}
        >
          <div className="w-10 h-10 rounded-[12px] bg-white/70 flex items-center justify-center text-emerald-600 shrink-0">
            <Sparkles className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-emerald-900">
              {language === 'ru' ? 'Всё спокойно' : 'Hammasi tinch'}
            </div>
            <div className="text-[12px] text-emerald-700 mt-0.5">
              {language === 'ru' ? 'Срочных задач нет — отдохните' : 'Shoshilinch ishlar yo\'q — dam oling'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2.5 md:px-0">
      {/* Carousel — horizontal scroll-snap, one card per viewport.
          Hidden scrollbar so it feels native. */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-2.5 px-2.5 md:mx-0 md:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={card.onClick}
              className={`snap-start shrink-0 w-[calc(100%-20px)] md:w-full text-left rounded-[18px] p-4 border-2 ${card.color} active:scale-[0.99] transition-transform touch-manipulation shadow-[0_2px_10px_rgba(0,0,0,0.04)]`}
              style={{ background: card.bgGradient }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-white/80 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-gray-700" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {card.eyebrow}
                  </div>
                  <div className="text-[14px] font-extrabold text-gray-900 mt-0.5 leading-tight line-clamp-2">
                    {card.title}
                  </div>
                  <div className="text-[12px] text-gray-600 mt-1 line-clamp-1">
                    {card.sub}
                  </div>
                  <div className="inline-flex items-center gap-1 text-[12px] font-bold text-primary-600 mt-2">
                    {card.cta}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dot indicator — only when more than one card */}
      {cards.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {cards.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeIdx ? 'bg-primary-500 w-5' : 'bg-gray-300 w-1.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
