// Resident request-details bottom sheet — Claude Design §02d handoff
// (design/handoff/request-details-handoff.md). Slides up over the
// Requests/Home tab, dim backdrop + 2-px blur, warm beige surface,
// orange-gradient status card with 4-step icon progress, separate
// details card with description / priority / photos / rating / executor
// row, optional reschedule banner + button, bottom Закрыть link.
//
// Wiring is preserved: useModalPresence keeps the global BottomBar
// hidden while open; onApprove / onCancel / onReschedule emit to the
// parent which opens the existing ApproveModal / CancelRequestModal /
// RescheduleModal.

import { useState } from 'react';
import {
  Check, Clock, Droplets, Zap, Flame, Snowflake, Sparkles, Truck,
  Leaf, Shield, Trash2, ArrowUpDown, KeyRound, Phone,
  RefreshCw, Star, User as UserIcon, Wrench,
} from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { useModalPresence } from '../../../stores/modalStore';
import type { ExecutorSpecialization, RequestPriority, RequestStatus } from '../../../types';
import type { RequestDetailsModalProps } from './types';

// ── design tokens — each reads through `var(--themed-…, <light-hex>)`.
//    Light mode is byte-identical (fallback wins when the var is
//    undefined); html.dark in index.css fills the vars with warm-dark
//    equivalents so the whole sheet flips. Brand orange + status hues
//    stay verbatim across themes. ─────────────────────────────────
const APP_BG = 'var(--themed-app-bg, #F4F0E8)';
const SURFACE = 'var(--themed-surface, #FFFFFF)';
const SURFACE_SUNKEN = 'var(--themed-surface-sunken, #EDE7DB)';
const TEXT_PRIMARY = 'var(--themed-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--themed-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--themed-text-muted, #A8A29E)';
const BORDER_C = 'var(--themed-border-c, rgba(28,25,23,0.08))';
const BORDER_STRONG = 'var(--themed-border-strong, #D6D3D1)';
const HAIRLINE = 'var(--themed-hairline, rgba(28,25,23,0.06))';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const BRAND_TINT = 'var(--themed-brand-tint, #FFF3EA)';
const STATUS_ACTIVE = '#15A06E';
const STATUS_CRITICAL = '#E2483D';
const STATUS_CRITICAL_BG = 'var(--themed-status-critical-bg, rgba(226,72,61,0.12))';
const STATUS_EXPIRED = '#6B7280';
const STATUS_EXPIRED_BG = 'var(--themed-status-expired-bg, rgba(107,114,128,0.12))';
const STATUS_PENDING = '#B45309';
const STATUS_PENDING_BG = 'var(--themed-status-pending-bg, rgba(180,83,9,0.12))';
const AMBER_50 = 'var(--themed-amber-50, #FEF3C7)';
const AMBER_100 = 'var(--themed-amber-100, #FDE68A)';
const AMBER_700 = 'var(--themed-amber-700, #92400E)';
const AMBER_STAR = '#FBBF24';
const SHADOW_SM = 'var(--themed-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';
const SHADOW_MD = 'var(--themed-shadow-md, 0 14px 36px -10px rgba(28,25,23,0.18))';
const SHADOW_BRAND = '0 8px 22px rgba(249,115,22,0.32)';
const RADIUS_XL = 22;
const RADIUS_LG = 16;
const RADIUS_MD = 12;
const RADIUS_SM = 10;

// ── category labels + icons keyed by ExecutorSpecialization ─────────
type CatVisuals = { Icon: typeof Droplets; ru: string; uz: string };
const CATEGORY: Record<ExecutorSpecialization, CatVisuals> = {
  plumber:     { Icon: Droplets,     ru: 'Сантехника',   uz: 'Santexnika' },
  electrician: { Icon: Zap,          ru: 'Электрика',    uz: 'Elektrika' },
  elevator:    { Icon: ArrowUpDown,  ru: 'Лифт',         uz: 'Lift' },
  intercom:    { Icon: KeyRound,     ru: 'Домофон',      uz: 'Domofon' },
  cleaning:    { Icon: Sparkles,     ru: 'Уборка',       uz: 'Tozalash' },
  security:    { Icon: Shield,       ru: 'Охрана',       uz: 'Xavfsizlik' },
  trash:       { Icon: Trash2,       ru: 'Мусор',        uz: 'Chiqindi' },
  boiler:      { Icon: Flame,        ru: 'Котельная',    uz: 'Qozonxona' },
  ac:          { Icon: Snowflake,    ru: 'Кондиционер',  uz: 'Konditsioner' },
  courier:     { Icon: Truck,        ru: 'Курьер',       uz: 'Kuryer' },
  gardener:    { Icon: Leaf,         ru: 'Озеленение',   uz: 'Ko\'kalamzorlashtirish' },
  other:       { Icon: Wrench,       ru: 'Заявка',       uz: 'Ariza' },
};

const PRIORITY_VISUALS: Record<RequestPriority, { ru: string; uz: string; fg: string; bg: string }> = {
  low:    { ru: 'Низкий',  uz: 'Past',    fg: STATUS_EXPIRED, bg: STATUS_EXPIRED_BG },
  medium: { ru: 'Средний', uz: 'O\'rta', fg: STATUS_PENDING, bg: STATUS_PENDING_BG },
  high:   { ru: 'Высокий', uz: 'Yuqori', fg: BRAND_DARK,     bg: BRAND_TINT },
  urgent: { ru: 'Срочный', uz: 'Shoshilinch', fg: STATUS_CRITICAL, bg: STATUS_CRITICAL_BG },
};

// Status → 4-step progress index (0..3)
const stageFromStatus = (s: RequestStatus): number => {
  if (s === 'new') return 0;
  if (s === 'assigned' || s === 'accepted') return 1;
  if (s === 'in_progress') return 2;
  return 3; // pending_approval, completed, cancelled
};

const formatSubmitted = (iso: string | undefined, lang: 'ru' | 'uz'): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  if (lang === 'ru') {
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase();
};

export function RequestDetailsModal({
  request,
  onClose,
  onApprove,
  onCancel,
  onReschedule,
  hasActiveReschedule,
}: RequestDetailsModalProps) {
  // Keep the global BottomBar hidden while this sheet is mounted.
  useModalPresence();

  const { language } = useLanguageStore();
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const [descExpanded, setDescExpanded] = useState(false);
  const isLongDesc = (request.description?.length || 0) > 120;

  const cat = CATEGORY[request.category] ?? CATEGORY.other;
  const CategoryIcon = cat.Icon;
  const stage = stageFromStatus(request.status);
  const priority = PRIORITY_VISUALS[request.priority] ?? PRIORITY_VISUALS.medium;

  const showCancel = ['new', 'assigned', 'accepted'].includes(request.status);
  const showApprove = request.status === 'pending_approval';
  const canReschedule =
    ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(request.status)
    && !!request.executorId && !hasActiveReschedule;

  const titleSub = (() => {
    switch (request.status) {
      case 'new':
        return {
          title: lang === 'ru' ? 'Заявка создана' : 'Ariza yaratildi',
          sub: lang === 'ru' ? 'Ожидаем назначения исполнителя' : 'Ijrochi tayinlanishini kutmoqdamiz',
        };
      case 'assigned':
      case 'accepted':
        return {
          title: lang === 'ru' ? 'Исполнитель назначен' : 'Ijrochi tayinlandi',
          sub: lang === 'ru'
            ? `Назначен: ${request.executorName || '—'}`
            : `Tayinlandi: ${request.executorName || '—'}`,
        };
      case 'in_progress':
        return {
          title: lang === 'ru' ? 'Мастер выполняет работу' : 'Usta ishni bajarmoqda',
          sub: request.executorName
            ? (lang === 'ru' ? `${request.executorName} в работе` : `${request.executorName} ish jarayonida`)
            : (lang === 'ru' ? 'Работа выполняется' : 'Ish bajarilmoqda'),
        };
      case 'pending_approval':
        return {
          title: lang === 'ru' ? 'Ждёт вашей приёмки' : 'Sizning qabulingizni kutmoqda',
          sub: lang === 'ru' ? 'Подтвердите и оцените работу' : 'Tasdiqlang va ishni baholang',
        };
      case 'completed':
        return {
          title: lang === 'ru' ? 'Работа выполнена' : 'Ish bajarildi',
          sub: lang === 'ru' ? 'Заявка закрыта' : 'Ariza yopildi',
        };
      case 'cancelled':
        return {
          title: lang === 'ru' ? 'Заявка отменена' : 'Ariza bekor qilindi',
          sub: request.cancellationReason
            ? request.cancellationReason
            : (lang === 'ru' ? 'Подробности скрыты' : 'Tafsilotlar yashirin'),
        };
      default:
        return { title: '', sub: '' };
    }
  })();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(28,25,23,0.50)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'kzFadeIn 180ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '92dvh', overflowY: 'auto',
          background: APP_BG, color: TEXT_PRIMARY,
          borderTopLeftRadius: RADIUS_XL, borderTopRightRadius: RADIUS_XL,
          boxShadow: '0 -10px 40px rgba(28,25,23,0.25)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          letterSpacing: '-0.01em',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 38, height: 5, borderRadius: 999, background: BORDER_STRONG }} />
        </div>

        {/* Status card */}
        <div style={{
          margin: '6px 16px 0', background: SURFACE,
          borderRadius: RADIUS_XL, boxShadow: SHADOW_MD, overflow: 'hidden',
        }}>
          {/* Orange gradient header */}
          <div style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #FB923C, #EA580C)',
            padding: '18px 18px 20px', color: '#fff', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', right: -30, top: -30,
              width: 130, height: 130, borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
            }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 999,
                background: 'rgba(255,255,255,0.22)',
                display: 'grid', placeItems: 'center', flex: '0 0 auto',
              }}>
                <CategoryIcon size={27} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {lang === 'ru' ? cat.ru : cat.uz}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 600, opacity: 0.85,
                  fontVariantNumeric: 'tabular-nums', marginTop: 2,
                }}>
                  #UK-S-{request.number}
                </div>
              </div>
            </div>
          </div>

          {/* Status title */}
          <div style={{ textAlign: 'center', padding: '20px 18px 16px' }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{titleSub.title}</div>
            <div style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 1.4 }}>{titleSub.sub}</div>
          </div>

          <div style={{ height: 1, background: BORDER_C }} />

          {/* 4-step progress + submitted time */}
          <div style={{ padding: '18px 14px 14px' }}>
            <Progress stage={stage} lang={lang} />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 16, color: TEXT_SECONDARY,
            }}>
              <Clock size={16} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                {lang === 'ru' ? 'Подана:' : 'Yuborildi:'} {formatSubmitted(request.createdAt, lang)}
              </span>
            </div>
          </div>

          {/* Action button */}
          {(showApprove || showCancel) && (
            <>
              <div style={{ height: 1, background: BORDER_C }} />
              <div style={{ padding: 16 }}>
                {showApprove ? (
                  <button onClick={onApprove} style={{
                    width: '100%', padding: 14, borderRadius: RADIUS_MD, border: 'none',
                    background: BRAND, color: '#fff',
                    fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', font: 'inherit',
                    boxShadow: SHADOW_BRAND,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Check size={18} strokeWidth={2.6} />
                    {lang === 'ru' ? 'Принять работу' : 'Ishni qabul qilish'}
                  </button>
                ) : (
                  <button onClick={onCancel} style={{
                    width: '100%', padding: 14, borderRadius: RADIUS_MD,
                    background: SURFACE, color: STATUS_CRITICAL,
                    border: `1px solid ${BORDER_C}`,
                    fontSize: 15, fontWeight: 650, cursor: 'pointer', font: 'inherit',
                  }}>
                    {lang === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Details card */}
        <div style={{
          margin: '12px 16px 0', background: SURFACE,
          borderRadius: RADIUS_LG, boxShadow: SHADOW_SM, padding: 16,
        }}>
          {/* Description */}
          <div style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            color: TEXT_SECONDARY, textTransform: 'uppercase',
          }}>
            {lang === 'ru' ? 'Описание' : 'Tavsif'}
          </div>
          <div style={{ fontSize: 14.5, color: TEXT_PRIMARY, marginTop: 6, lineHeight: 1.45 }}>
            {isLongDesc && !descExpanded
              ? request.description.slice(0, 120) + '…'
              : request.description}
            {isLongDesc && (
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                style={{
                  marginLeft: 6, padding: 0,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: BRAND_DARK, fontSize: 13.5, fontWeight: 650,
                  font: 'inherit',
                }}>
                {descExpanded
                  ? (lang === 'ru' ? 'Свернуть' : 'Yopish')
                  : (lang === 'ru' ? 'Ещё' : 'Ko\'proq')}
              </button>
            )}
          </div>

          {/* Priority */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_SECONDARY }}>
              {lang === 'ru' ? 'Приоритет:' : 'Muhimlik:'}
            </span>
            <span style={{
              fontSize: 12.5, fontWeight: 700,
              color: priority.fg, background: priority.bg,
              padding: '4px 11px', borderRadius: 999,
            }}>
              {lang === 'ru' ? priority.ru : priority.uz}
            </span>
          </div>

          {/* Photos */}
          {request.photos && request.photos.length > 0 && (
            <>
              <div style={{
                fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
                color: TEXT_SECONDARY, textTransform: 'uppercase', marginTop: 18,
              }}>
                {lang === 'ru' ? `Фото (${request.photos.length})` : `Rasmlar (${request.photos.length})`}
              </div>
              <div style={{
                display: 'flex', gap: 8, marginTop: 8, paddingBottom: 2,
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              }}>
                {request.photos.map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: '0 0 auto', width: 72, height: 72,
                      borderRadius: 12, overflow: 'hidden',
                      border: `1px solid ${BORDER_C}`, background: SURFACE_SUNKEN,
                      display: 'block',
                    }}>
                    <img src={src} alt="" loading="lazy" decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </a>
                ))}
              </div>
            </>
          )}

          {/* Rating (completed) */}
          {request.status === 'completed' && request.rating !== undefined && request.rating > 0 && (
            <>
              <div style={{
                fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
                color: TEXT_SECONDARY, textTransform: 'uppercase', marginTop: 18,
              }}>
                {lang === 'ru' ? 'Ваша оценка' : 'Sizning bahoyingiz'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    size={24}
                    style={{
                      color: n <= (request.rating || 0) ? AMBER_STAR : SURFACE_SUNKEN,
                      fill: n <= (request.rating || 0) ? AMBER_STAR : 'transparent',
                    }}
                  />
                ))}
                <span style={{ marginLeft: 6, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {request.rating}/5
                </span>
              </div>
              {request.feedback && (
                <div style={{
                  marginTop: 8, fontSize: 13.5, color: TEXT_SECONDARY,
                  fontStyle: 'italic', lineHeight: 1.45,
                }}>
                  «{request.feedback}»
                </div>
              )}
            </>
          )}

          {/* Executor row */}
          {request.executorName && request.status !== 'new' && (
            <>
              <div style={{ height: 1, background: HAIRLINE, margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 999,
                  background: BRAND_TINT, color: BRAND_DARK,
                  display: 'grid', placeItems: 'center',
                  fontSize: 14, fontWeight: 800, flex: '0 0 auto',
                }}>
                  {getInitials(request.executorName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
                    color: TEXT_PRIMARY,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {request.executorName}
                  </div>
                  <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 1 }}>
                    {lang === 'ru' ? 'Мастер' : 'Usta'} · {lang === 'ru' ? cat.ru : cat.uz}
                  </div>
                </div>
                {request.executorPhone && (
                  <a
                    href={`tel:${request.executorPhone}`}
                    aria-label={lang === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq qilish'}
                    style={{
                      width: 42, height: 42, borderRadius: 999,
                      background: STATUS_ACTIVE, color: '#fff',
                      display: 'grid', placeItems: 'center',
                      textDecoration: 'none', flex: '0 0 auto',
                    }}>
                    <Phone size={18} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Active-reschedule banner */}
        {hasActiveReschedule && (
          <div style={{
            margin: '12px 16px 0', padding: 12, borderRadius: RADIUS_MD,
            background: 'var(--themed-brand-tint, #FFF7ED)',
            border: '1px solid var(--themed-brand-200, #FED7AA)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <RefreshCw size={16} style={{ color: 'var(--themed-amber-700, #9A3412)', flex: '0 0 auto' }} />
            <div style={{ fontSize: 13, color: 'var(--themed-amber-700, #9A3412)', lineHeight: 1.4 }}>
              {lang === 'ru'
                ? 'Ожидается ответ на запрос о переносе'
                : 'Ko\'chirish so\'roviga javob kutilmoqda'}
            </div>
          </div>
        )}

        {/* Reschedule button */}
        {canReschedule && (
          <button
            onClick={onReschedule}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              margin: '12px 16px 0', width: 'calc(100% - 32px)',
              padding: 13, borderRadius: RADIUS_MD,
              background: AMBER_50, color: AMBER_700,
              border: `1px solid ${AMBER_100}`,
              fontSize: 14.5, fontWeight: 650, cursor: 'pointer', font: 'inherit',
            }}>
            <RefreshCw size={16} />
            {lang === 'ru' ? 'Перенести на другое время' : 'Boshqa vaqtga ko\'chirish'}
          </button>
        )}

        {/* Close */}
        <button onClick={onClose} style={{
          margin: '14px 16px 0', width: 'calc(100% - 32px)',
          padding: 13, borderRadius: RADIUS_MD,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 650, color: TEXT_SECONDARY, font: 'inherit',
        }}>
          {lang === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4-step progress
// ─────────────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'created',  ru: 'Создана',     uz: 'Yaratildi',   Icon: Check },
  { key: 'assigned', ru: 'Назначена',   uz: 'Tayinlandi',  Icon: UserIcon },
  { key: 'progress', ru: 'Выполняется', uz: 'Bajarilmoqda', Icon: Wrench },
  { key: 'done',     ru: 'Выполнено',   uz: 'Bajarildi',   Icon: Star },
] as const;

function Progress({ stage, lang }: { stage: number; lang: 'ru' | 'uz' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '4px 0' }}>
      {STAGES.map((s, i) => {
        const done = i < stage;
        const active = i === stage;
        const reached = i <= stage;
        const Icon = s.Icon;
        return (
          <Step
            key={s.key}
            label={lang === 'ru' ? s.ru : s.uz}
            Icon={Icon}
            done={done}
            active={active}
            reached={reached}
            hasConnector={i < STAGES.length - 1}
            connectorActive={i < stage}
          />
        );
      })}
    </div>
  );
}

function Step({
  label, Icon, done, active, reached, hasConnector, connectorActive,
}: {
  label: string; Icon: typeof Check;
  done: boolean; active: boolean; reached: boolean;
  hasConnector: boolean; connectorActive: boolean;
}) {
  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flex: '0 0 auto', width: 64,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 999,
          background: active ? BRAND : done ? BRAND_TINT : SURFACE_SUNKEN,
          color: active ? '#fff' : done ? BRAND_DARK : TEXT_MUTED,
          display: 'grid', placeItems: 'center',
          boxShadow: active ? '0 0 0 5px rgba(249,115,22,0.16)' : 'none',
        }}>
          <Icon size={21} strokeWidth={2.1} />
        </div>
        <span style={{
          fontSize: 11, fontWeight: active ? 750 : 600,
          color: reached ? TEXT_PRIMARY : TEXT_MUTED,
          marginTop: 7, textAlign: 'center', lineHeight: 1.15,
        }}>
          {label}
        </span>
      </div>
      {hasConnector && (
        <div style={{
          flex: 1, height: 3, borderRadius: 999, marginTop: 21,
          background: connectorActive ? BRAND : SURFACE_SUNKEN,
        }} />
      )}
    </>
  );
}

