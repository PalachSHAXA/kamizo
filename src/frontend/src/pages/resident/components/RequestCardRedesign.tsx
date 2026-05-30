import {
  Droplet, Zap, Flame, ArrowUpDown, Sparkles, Shield, Trash2, Wind,
  Sprout, Phone, MoreHorizontal,
} from 'lucide-react';
import type { Request, RequestStatus, RequestPriority } from '../../../types';

// Resident request card — Claude Design §02-zayavki.
// One card renders every status: coloured status stripe, category icon,
// title + "Срочно" badge, #number · executor, status pill + date, real photo
// strip, a 4-stage progress bar for in-flight requests, and an inline
// "Принять работу" CTA when the request is waiting for the resident.
// Bound to the real Request object (no mock data).

type Lang = 'ru' | 'uz';

const STATUS_META: Record<RequestStatus, { ru: string; uz: string; fg: string; bg: string }> = {
  new:              { ru: 'Новая',      uz: 'Yangi',        fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  assigned:         { ru: 'Назначена',  uz: 'Tayinlangan',  fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  accepted:         { ru: 'Принята',    uz: 'Qabul qilindi',fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  in_progress:      { ru: 'В работе',   uz: 'Ishlanmoqda',  fg: 'var(--brand-dark)',      bg: 'var(--brand-tint)' },
  pending_approval: { ru: 'На приёмке', uz: 'Qabulda',      fg: 'var(--status-pending)',  bg: 'var(--status-pending-bg)' },
  completed:        { ru: 'Завершена',  uz: 'Yakunlangan',  fg: 'var(--status-active)',   bg: 'var(--status-active-bg)' },
  cancelled:        { ru: 'Отменена',   uz: 'Bekor qilingan',fg: 'var(--status-expired)', bg: 'var(--status-expired-bg)' },
};

// Real category ids (ExecutorSpecialization / SERVICE_CATEGORIES) → icon.
const CAT_ICON: Record<string, typeof Droplet> = {
  plumber: Droplet, electrician: Zap, boiler: Flame, elevator: ArrowUpDown,
  cleaning: Sparkles, ac: Wind, security: Shield, trash: Trash2,
  gardener: Sprout, intercom: Phone, other: MoreHorizontal,
};

function stageOf(status: RequestStatus): number {
  if (status === 'new') return 0;
  if (status === 'assigned' || status === 'accepted') return 1;
  if (status === 'in_progress') return 2;
  return 3;
}

function StageBar({ stage, language }: { stage: number; language: Lang }) {
  const steps = language === 'ru'
    ? ['Создана', 'Назначена', 'Выполняется', 'Готово']
    : ['Yaratildi', 'Tayinlandi', 'Bajarilmoqda', 'Tayyor'];
  return (
    <div className="flex items-center gap-1.5 mt-3">
      {steps.map((s, i) => (
        <div key={i} className="contents">
          <div className="flex items-center gap-1">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: i <= stage ? 'var(--brand)' : 'var(--surface-sunken, #EDE7DB)' }}
            />
            <span
              className="text-[9.5px] whitespace-nowrap"
              style={{ fontWeight: i === stage ? 700 : 600, color: i <= stage ? 'var(--text-primary, #1C1917)' : 'var(--text-muted, #A8A29E)' }}
            >
              {s}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-[2px] rounded-full" style={{ background: i < stage ? 'var(--brand)' : 'var(--surface-sunken, #EDE7DB)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  request: Request;
  language: Lang;
  onOpen: () => void;
  onApprove?: () => void;
}

export function RequestCardRedesign({ request, language, onOpen, onApprove }: Props) {
  const st = STATUS_META[request.status] || STATUS_META.new;
  const Cat = CAT_ICON[request.category] || MoreHorizontal;
  const urgent = request.priority === ('urgent' as RequestPriority);
  const executor = request.executorName || (language === 'ru' ? 'Ожидает мастера' : 'Usta kutilmoqda');
  const photos = request.photos || [];
  const dateStr = request.createdAt
    ? new Date(request.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' })
    : '';
  const isActive = ['assigned', 'accepted', 'in_progress'].includes(request.status);

  return (
    <button
      onClick={onOpen}
      className="relative w-full text-left rounded-[20px] overflow-hidden cursor-pointer touch-manipulation active:scale-[0.99] transition-transform"
      style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-c, #E6DFD2)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))', padding: '14px 15px 14px 18px' }}
    >
      {/* status stripe */}
      <span
        className="absolute left-0 top-[14px] bottom-[14px] w-1 rounded-r-[3px]"
        style={{ background: urgent ? 'var(--status-critical, #E2483D)' : st.fg }}
      />

      <div className="flex items-start gap-3">
        <div
          className="w-[42px] h-[42px] rounded-[12px] grid place-items-center shrink-0"
          style={{ background: 'var(--brand-tint, #FFF3EA)', color: 'var(--brand-dark, #EA580C)' }}
        >
          <Cat size={20} strokeWidth={1.9} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15.5px] font-bold tracking-tight truncate" style={{ color: 'var(--text-primary, #1C1917)' }}>
              {request.title}
            </span>
            {urgent && (
              <span
                className="shrink-0 text-[9.5px] font-extrabold uppercase tracking-wide px-[7px] py-[2px] rounded-full"
                style={{ color: 'var(--status-critical, #E2483D)', background: 'var(--status-critical-bg, rgba(226,72,61,0.12))' }}
              >
                {language === 'ru' ? 'Срочно' : 'Shoshilinch'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--text-secondary, #6F6A62)' }}>
              #{request.number}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted, #A8A29E)' }}>·</span>
            <span className="text-[12px] truncate" style={{ color: 'var(--text-secondary, #6F6A62)' }}>{executor}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="text-[10.5px] font-bold px-[9px] py-1 rounded-full whitespace-nowrap"
            style={{ color: st.fg, background: st.bg }}
          >
            {language === 'ru' ? st.ru : st.uz}
          </span>
          {dateStr && <span className="text-[11px]" style={{ color: 'var(--text-muted, #A8A29E)' }}>{dateStr}</span>}
        </div>
      </div>

      {/* real photo strip */}
      {photos.length > 0 && (
        <div className="flex gap-1.5 mt-3 pl-[54px]">
          {photos.slice(0, 4).map((src, i) => (
            <div key={i} className="w-11 h-11 rounded-[10px] overflow-hidden bg-gray-100 border border-gray-200">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {photos.length > 4 && (
            <div className="w-11 h-11 rounded-[10px] grid place-items-center text-[12px] font-bold" style={{ background: 'var(--surface-sunken, #EDE7DB)', color: 'var(--text-secondary, #6F6A62)' }}>
              +{photos.length - 4}
            </div>
          )}
        </div>
      )}

      {/* active stage bar */}
      {isActive && <StageBar stage={stageOf(request.status)} language={language} />}

      {/* approve CTA */}
      {request.status === 'pending_approval' && (
        <div
          onClick={(e) => { e.stopPropagation(); onApprove?.(); }}
          className="mt-3 py-[11px] rounded-[14px] text-center text-[14px] font-bold tracking-tight text-white"
          style={{ background: 'var(--brand, #F97316)', boxShadow: 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))' }}
        >
          {language === 'ru' ? 'Принять работу' : 'Ishni qabul qilish'}
        </div>
      )}
    </button>
  );
}
