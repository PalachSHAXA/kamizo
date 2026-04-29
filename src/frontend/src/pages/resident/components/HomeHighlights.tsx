import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, QrCode, MessageCircle, Megaphone, FileText, Car, Phone, Star,
  CheckCircle2, Vote,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useAnnouncementStore } from '../../../stores/announcementStore';
import { useMeetingStore } from '../../../stores/meetingStore';
import { useLanguageStore } from '../../../stores/languageStore';
import type { Request } from '../../../types';

/**
 * HomeHighlights — 3D card stack swipeable carousel at the top of the
 * resident home tab. Inspired by the user's reference design — same 3D
 * rotation/scale/translate effect, brand color via CSS variables instead
 * of hardcoded hex.
 *
 * Cards are dynamic: services + dynamic priority cards (active voting,
 * pending approval, urgent announcement, onboarding). Sticky cards always
 * present, dynamic cards inserted at the front when triggered.
 */

type CardStyle = {
  id: string;
  Icon: typeof Wrench;
  title: string;
  sub: string;
  badge?: string;
  cta: string;
  gradient: string;
  shadowColor: string;
  onClick: () => void;
};

export function HomeHighlights({ activeRequests }: { activeRequests: Request[] }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const meetings = useMeetingStore(s => s.meetings);
  const announcements = useAnnouncementStore(s => s.announcements);

  // Onboarding pending
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';
  const onboardingPending = useMemo(() => {
    if (!user) return 0;
    let n = 0;
    if (!(user.phone && user.phone.length >= 5)) n++;
    if (!user.passwordChangedAt) n++;
    if (!isRentalUser && !user.contractSignedAt) n++;
    return n;
  }, [user, isRentalUser]);

  const activeVoting = meetings.find(m => m.status === 'voting_open');
  const pendingApproval = activeRequests.find(r => r.status === 'pending_approval');
  const urgentUnread = announcements.find(a =>
    a.priority === 'urgent' && !a.viewedBy?.includes(user?.id || '')
  );

  // Build cards. Order: dynamic alerts FIRST (so they show on top), then static services.
  const cards: CardStyle[] = useMemo(() => {
    const list: CardStyle[] = [];

    // 1. Onboarding (if pending) — brand color
    if (onboardingPending > 0) {
      list.push({
        id: 'onboarding',
        Icon: CheckCircle2,
        title: language === 'ru' ? 'Завершите регистрацию' : 'Ro\'yxatdan o\'tishni yakunlang',
        sub: language === 'ru'
          ? `Осталось ${onboardingPending} ${onboardingPending === 1 ? 'шаг' : 'шагов'}`
          : `Qoldi ${onboardingPending} ta qadam`,
        badge: language === 'ru' ? 'важно' : 'muhim',
        cta: language === 'ru' ? 'Заполнить →' : 'To\'ldirish →',
        gradient: 'linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.78))',
        shadowColor: 'rgba(var(--brand-rgb), 0.35)',
        onClick: () => navigate('/profile'),
      });
    }

    // 2. Active voting — purple
    if (activeVoting) {
      const meetingTitle = activeVoting.agendaItems?.[0]?.title
        ?? (language === 'ru' ? `Собрание #${activeVoting.number}` : `Yig'ilish #${activeVoting.number}`);
      list.push({
        id: 'voting',
        Icon: Vote,
        title: meetingTitle,
        sub: language === 'ru'
          ? `Ваш голос${user?.totalArea ? ` · ${user.totalArea} м²` : ''}`
          : `Sizning ovozingiz${user?.totalArea ? ` · ${user.totalArea} m²` : ''}`,
        badge: language === 'ru' ? 'голосование' : 'ovoz berish',
        cta: language === 'ru' ? 'Проголосовать →' : 'Ovoz berish →',
        gradient: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
        shadowColor: 'rgba(139,92,246,0.35)',
        onClick: () => navigate('/meetings'),
      });
    }

    // 3. Pending approval — purple/violet
    if (pendingApproval) {
      list.push({
        id: 'approve',
        Icon: Star,
        title: language === 'ru' ? 'Подтвердите работу' : 'Ishni tasdiqlang',
        sub: language === 'ru'
          ? `Заявка #${pendingApproval.number} ждёт оценки`
          : `Ariza #${pendingApproval.number} baholashni kutmoqda`,
        badge: language === 'ru' ? '1 новое' : '1 yangi',
        cta: language === 'ru' ? 'Оценить →' : 'Baholash →',
        gradient: 'linear-gradient(135deg, #6366F1, #818CF8)',
        shadowColor: 'rgba(99,102,241,0.35)',
        onClick: () => navigate('/?tab=requests'),
      });
    }

    // 4. Urgent announcement — red
    if (urgentUnread) {
      list.push({
        id: 'urgent',
        Icon: Megaphone,
        title: urgentUnread.title,
        sub: (urgentUnread.content || '').slice(0, 60),
        badge: language === 'ru' ? 'срочно' : 'shoshilinch',
        cta: language === 'ru' ? 'Подробнее →' : 'Batafsil →',
        gradient: 'linear-gradient(135deg, #EF4444, #F87171)',
        shadowColor: 'rgba(239,68,68,0.35)',
        onClick: () => navigate('/announcements'),
      });
    }

    // 5–11. Static services — same icons/colors as in the reference design
    list.push(
      {
        id: 'svc-request',
        Icon: Wrench,
        title: language === 'ru' ? 'Создать заявку' : 'Ariza yaratish',
        sub: language === 'ru' ? 'Сантехник · Электрик · Уборка' : 'Santexnik · Elektrik · Tozalash',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, rgb(var(--brand-rgb)), #FB923C)',
        shadowColor: 'rgba(var(--brand-rgb), 0.35)',
        onClick: () => window.dispatchEvent(new Event('open-services')),
      },
      {
        id: 'svc-guest',
        Icon: QrCode,
        title: language === 'ru' ? 'Гостевой пропуск' : 'Mehmon ruxsatnomasi',
        sub: language === 'ru' ? 'QR-код для гостей и курьеров' : 'Mehmon va kuryer uchun QR',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, #10B981, #34D399)',
        shadowColor: 'rgba(16,185,129,0.35)',
        onClick: () => navigate('/guest-access'),
      },
      {
        id: 'svc-chat',
        Icon: MessageCircle,
        title: language === 'ru' ? 'Чат с УК' : 'UK bilan chat',
        sub: language === 'ru' ? 'Администрация на связи' : 'Ma\'muriyat aloqada',
        cta: language === 'ru' ? 'Написать →' : 'Yozish →',
        gradient: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
        shadowColor: 'rgba(59,130,246,0.35)',
        onClick: () => navigate('/chat'),
      },
      {
        id: 'svc-contract',
        Icon: FileText,
        title: language === 'ru' ? 'Договор с УК' : 'UK bilan shartnoma',
        sub: language === 'ru' ? 'Превью и QR-код' : 'Ko\'rish va QR-kod',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
        shadowColor: 'rgba(139,92,246,0.35)',
        onClick: () => navigate('/contract'),
      },
      {
        id: 'svc-car',
        Icon: Car,
        title: language === 'ru' ? 'Мои автомобили' : 'Mening avtomobillarim',
        sub: language === 'ru' ? 'Регистрация и поиск авто' : 'Ro\'yxat va qidirish',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, #14B8A6, #2DD4BF)',
        shadowColor: 'rgba(20,184,166,0.35)',
        onClick: () => navigate('/vehicles'),
      },
      {
        id: 'svc-contacts',
        Icon: Phone,
        title: language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar',
        sub: language === 'ru' ? 'Экстренные службы и партнёры' : 'Tez yordam va hamkorlar',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, #EC4899, #F472B6)',
        shadowColor: 'rgba(236,72,153,0.35)',
        onClick: () => navigate('/useful-contacts'),
      },
      {
        id: 'svc-rate',
        Icon: Star,
        title: language === 'ru' ? 'Оценить УК' : 'UKni baholash',
        sub: language === 'ru' ? 'Раз в месяц · 30 секунд' : 'Oyiga bir marta · 30 soniya',
        cta: language === 'ru' ? 'Открыть →' : 'Ochish →',
        gradient: 'linear-gradient(135deg, #6366F1, #818CF8)',
        shadowColor: 'rgba(99,102,241,0.35)',
        onClick: () => navigate('/rate-employees'),
      },
    );

    return list;
  }, [onboardingPending, activeVoting, pendingApproval, urgentUnread, language, navigate, user?.totalArea]);

  const [activeIdx, setActiveIdx] = useState(0);
  // Reset active index if cards array shrinks
  useEffect(() => {
    if (activeIdx >= cards.length) setActiveIdx(0);
  }, [cards.length, activeIdx]);

  // Drag handling — touch + mouse for desktop testing
  const startX = useRef(0);
  const cur = useRef(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    startX.current = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    setDragging(true);
  };
  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dragging) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    cur.current = x - startX.current;
    setDrag(cur.current);
  };
  const onEnd = () => {
    setDragging(false);
    if (Math.abs(cur.current) > 50) {
      if (cur.current < 0 && activeIdx < cards.length - 1) setActiveIdx(activeIdx + 1);
      else if (cur.current > 0 && activeIdx > 0) setActiveIdx(activeIdx - 1);
    }
    setDrag(0);
    cur.current = 0;
  };

  return (
    <div className="px-2.5 md:px-0">
      <div
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onMouseDown={onStart}
        onMouseMove={onMove}
        onMouseUp={onEnd}
        onMouseLeave={() => { if (dragging) onEnd(); }}
        className="relative cursor-grab select-none"
        style={{ height: 195, perspective: 800, marginBottom: 12 }}
      >
        {cards.map((card, i) => {
          const diff = i - activeIdx;
          const absD = Math.abs(diff);
          if (absD > 3) return null;
          const d = i === activeIdx ? drag * 0.8 : 0;
          const Icon = card.Icon;
          return (
            <button
              key={card.id}
              onClick={() => {
                if (i === activeIdx && Math.abs(cur.current) < 6) card.onClick();
              }}
              className="absolute text-left text-white"
              style={{
                left: 8,
                right: 8,
                height: 185,
                borderRadius: 24,
                background: card.gradient,
                padding: 22,
                transform: `translateX(${diff * 35 + d}px) translateZ(${-absD * 50}px) rotateY(${diff * -4 + (i === activeIdx ? drag * 0.04 : 0)}deg) scale(${1 - absD * 0.07})`,
                opacity: absD > 2 ? 0 : 1 - absD * 0.25,
                transition: dragging ? 'none' : 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                zIndex: 10 - absD,
                boxShadow: absD === 0 ? `0 15px 40px ${card.shadowColor}` : '0 8px 20px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                pointerEvents: absD === 0 ? 'auto' : 'none',
              }}
            >
              {card.badge && (
                <div
                  className="absolute font-bold uppercase tracking-wider"
                  style={{
                    top: 14,
                    right: 16,
                    background: 'rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(10px)',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 10,
                  }}
                >
                  {card.badge}
                </div>
              )}
              <div>
                <Icon className="w-9 h-9 mb-2" strokeWidth={2} />
                <div className="text-[19px] font-extrabold leading-tight">{card.title}</div>
                <div className="text-[12px] opacity-80 mt-1 line-clamp-2">{card.sub}</div>
              </div>
              <div
                className="inline-flex items-center gap-1.5 self-start font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '8px 16px',
                  borderRadius: 14,
                  fontSize: 13,
                  backdropFilter: 'blur(10px)',
                }}
              >
                {card.cta}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5 mb-2">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            aria-label={`card ${i + 1}`}
            style={{
              width: i === activeIdx ? 22 : 7,
              height: 7,
              borderRadius: 4,
              background: i === activeIdx ? 'rgb(var(--brand-rgb))' : '#ddd',
              transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              cursor: 'pointer',
              border: 0,
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
