// Resident "Объявления" — Claude Design §06-obyavleniya handoff
// (design/handoff/announcements-handoff.md). Sticky in-page header
// (building eyebrow + title + Все/Непрочитанные chips), feed of
// announcement cards with optional cover, category pill, brand-orange
// unread dot, urgent red stripe + "Важно" badge, expandable preview,
// and attachment download chips.
//
// Data wiring stays on the existing endpoints:
//   - useAnnouncementStore.fetchAnnouncements
//   - useAnnouncementStore.getAnnouncementsForResidents(login, building, entrance, floor, branch, apartment)
//   - useAnnouncementStore.markAnnouncementAsViewed(announcementId, userId)
//
// The expansion is in-card (matches the handoff); there is no modal,
// so useModalPresence is not needed here.

import { useState, useEffect } from 'react';
import { Megaphone, AlertTriangle, ChevronDown, FileText, File, Download } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useAnnouncementStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { formatName } from '../utils/formatName';
import type { Announcement, AnnouncementPriority } from '../types';

// ── shared visual tokens (kept literal so the page renders correctly
//    even if a global token gets renamed) ─────────────────────────────
const APP_BG = 'var(--themed-app-bg, #F4F0E8)';
const TEXT_PRIMARY = 'var(--themed-text-primary, #1C1917)';
const TEXT_SECONDARY = 'var(--themed-text-secondary, #6F6A62)';
const TEXT_MUTED = 'var(--themed-text-muted, #A8A29E)';
const SURFACE = 'var(--themed-surface, #FFFFFF)';
const SURFACE_SUNKEN = 'var(--themed-surface-sunken, #EDE7DB)';
const BORDER = 'var(--themed-border-c, #E6DFD2)';
const HAIRLINE = 'var(--themed-hairline, rgba(28,25,23,0.06))';
const SHADOW_SM = 'var(--themed-shadow-sm, 0 1px 2px rgba(28,25,23,0.04))';
const INK = 'var(--themed-text-primary, #1C1917)';
const TEXT_ON_DARK = '#F4F0E8';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const BRAND_TINT = 'var(--themed-brand-tint, #FFF3EA)';
const BRAND_200 = 'var(--themed-brand-200, #FED7AA)';
const STATUS_CRITICAL = '#E2483D';
const STATUS_CRITICAL_BG = 'var(--themed-status-critical-bg, rgba(226,72,61,0.12))';
const STATUS_INFO = '#3B82F6';
const STATUS_INFO_BG = 'var(--themed-status-info-bg, rgba(59,130,246,0.10))';
const STATUS_ACTIVE = '#15A06E';
const STATUS_ACTIVE_BG = 'var(--themed-status-active-bg, rgba(21,160,110,0.12))';
const RADIUS_LG = 16;
const RADIUS_SM = 10;

interface PriorityVisuals {
  label: string;
  catFg: string;
  catBg: string;
}

const priorityVisuals = (priority: AnnouncementPriority, lang: 'ru' | 'uz'): PriorityVisuals => {
  switch (priority) {
    case 'urgent':
      return {
        label: lang === 'ru' ? 'Срочно' : 'Shoshilinch',
        catFg: STATUS_CRITICAL,
        catBg: STATUS_CRITICAL_BG,
      };
    case 'important':
      return {
        label: lang === 'ru' ? 'Важно' : 'Muhim',
        catFg: STATUS_INFO,
        catBg: STATUS_INFO_BG,
      };
    default:
      return {
        label: lang === 'ru' ? 'Информация' : "Ma'lumot",
        catFg: STATUS_ACTIVE,
        catBg: STATUS_ACTIVE_BG,
      };
  }
};

// Relative date — matches the handoff's "2 ч назад / вчера / 3 дня назад"
// idiom without dragging in a heavy i18n lib.
const formatRelativeDate = (dateStr: string, lang: 'ru' | 'uz'): string => {
  const safe = dateStr.endsWith?.('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const diff = Date.now() - new Date(safe).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ru' ? 'только что' : 'hozir';
  if (mins < 60) return lang === 'ru' ? `${mins} мин назад` : `${mins} min oldin`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ru' ? `${hrs} ч назад` : `${hrs} soat oldin`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return lang === 'ru' ? 'вчера' : 'kecha';
  if (days < 7) return lang === 'ru' ? `${days} дн назад` : `${days} kun oldin`;
  return new Date(safe).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
    day: 'numeric',
    month: 'short',
  });
};

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes < 1024) return `${bytes || 0} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

export function ResidentAnnouncementsPage() {
  const { user } = useAuthStore();
  // Audit P1: was useDataStore() — subscribed to all 9 sub-stores. Now
  // reads only from useAnnouncementStore since that's the only domain
  // this page touches.
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);
  const markAnnouncementAsViewed = useAnnouncementStore(s => s.markAnnouncementAsViewed);
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements);
  const { language } = useLanguageStore();
  const lang: 'ru' | 'uz' = language === 'ru' ? 'ru' : 'uz';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Start with 'all' so first-time users don't see an empty "Unread (0)" tab.
  // Switch to 'unread' automatically only if data loads with real unread items
  // and the user hasn't manually picked a tab yet.
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [userPickedFilter, setUserPickedFilter] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const userLogin = user?.login || '';
  const userBuilding = user?.buildingId || '';
  const userEntrance = user?.entrance || '';
  const userFloor = user?.floor || '';
  const userBranch = user?.branch || '';
  const userApartment = user?.apartment || '';

  const announcements = getAnnouncementsForResidents(
    userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment
  );

  const isUnread = (a: Announcement) => !a.viewedBy?.includes(user?.id || '');
  const filteredAnnouncements = filter === 'unread' ? announcements.filter(isUnread) : announcements;
  const unreadCount = announcements.filter(isUnread).length;

  // Auto-switch to 'unread' once when data first arrives with unread items.
  // Never override user's explicit choice.
  useEffect(() => {
    if (!userPickedFilter && unreadCount > 0 && filter === 'all') {
      setFilter('unread');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  const handleExpand = (a: Announcement) => {
    if (expandedId === a.id) {
      setExpandedId(null);
    } else {
      setExpandedId(a.id);
      if (user?.id && !a.viewedBy?.includes(user.id)) {
        markAnnouncementAsViewed(a.id, user.id);
      }
    }
  };

  const eyebrow = user?.building
    ? (lang === 'ru' ? `Дом ${user.building}` : `${user.building}-uy`)
    : (lang === 'ru' ? 'Объявления дома' : "Uy e'lonlari");

  return (
    <div style={{
      minHeight: '100%',
      background: APP_BG,
      color: TEXT_PRIMARY,
      paddingBottom: 'calc(124px + env(safe-area-inset-bottom, 0px))',
      letterSpacing: '-0.01em',
    }}>
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px',
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${HAIRLINE}`,
      }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
          color: TEXT_SECONDARY, textTransform: 'uppercase',
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em',
          marginTop: 2, color: TEXT_PRIMARY,
        }}>
          {lang === 'ru' ? 'Объявления' : "E'lonlar"}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {([
            { id: 'all', label: `${lang === 'ru' ? 'Все' : 'Hammasi'} · ${announcements.length}` },
            { id: 'unread', label: `${lang === 'ru' ? 'Непрочитанные' : "O'qilmagan"} · ${unreadCount}` },
          ] as const).map(f => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => { setFilter(f.id); setUserPickedFilter(true); }}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 650,
                  background: on ? INK : SURFACE,
                  color: on ? TEXT_ON_DARK : TEXT_SECONDARY,
                  border: `1px solid ${on ? INK : BORDER}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Feed ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredAnnouncements.length === 0 ? (
          <EmptyState lang={lang} filter={filter} />
        ) : (
          filteredAnnouncements.map(a => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              unread={isUnread(a)}
              expanded={expandedId === a.id}
              lang={lang}
              onToggle={() => handleExpand(a)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

interface CardProps {
  announcement: Announcement;
  unread: boolean;
  expanded: boolean;
  lang: 'ru' | 'uz';
  onToggle: () => void;
}

function AnnouncementCard({ announcement: a, unread, expanded, lang, onToggle }: CardProps) {
  const urgent = a.priority === 'urgent';
  const vis = priorityVisuals(a.priority, lang);
  const imageAttachments = (a.attachments || []).filter(x => x.type.startsWith('image/'));
  const fileAttachments = (a.attachments || []).filter(x => !x.type.startsWith('image/'));

  return (
    <div style={{
      position: 'relative',
      background: unread ? BRAND_TINT : SURFACE,
      borderRadius: RADIUS_LG,
      border: `1px solid ${urgent ? STATUS_CRITICAL_BG : (unread ? BRAND_200 : BORDER)}`,
      boxShadow: SHADOW_SM,
      overflow: 'hidden',
      opacity: unread ? 1 : 0.94,
    }}>
      {urgent && <div style={{ height: 4, background: STATUS_CRITICAL }} />}

      {/* Cover — rendered only for urgent items (the API has no cover field;
          this keeps the layout faithful while staying within the schema) */}
      {urgent && (
        <div style={{
          position: 'relative',
          height: 96,
          background: 'linear-gradient(135deg, #C2410C, #7C2D12)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}>
          <AlertTriangle size={42} style={{ color: 'rgba(255,255,255,0.55)' }} />
        </div>
      )}

      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 15,
          color: 'inherit',
          font: 'inherit',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {urgent && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: STATUS_CRITICAL,
              background: STATUS_CRITICAL_BG,
              padding: '2px 7px',
              borderRadius: 999,
              textTransform: 'uppercase',
            }}>
              {lang === 'ru' ? 'Важно' : 'Muhim'}
            </span>
          )}
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: vis.catFg,
            background: vis.catBg,
            padding: '3px 9px',
            borderRadius: 999,
          }}>
            {vis.label}
          </span>
          <span style={{
            fontSize: 11.5,
            color: TEXT_MUTED,
            marginLeft: 'auto',
          }}>
            {formatRelativeDate(a.createdAt, lang)}
          </span>
          {unread && (
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: BRAND,
              flex: '0 0 auto',
            }} />
          )}
        </div>

        {/* Title */}
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.015em',
          lineHeight: 1.3,
          marginTop: 9,
          color: TEXT_PRIMARY,
        }}>
          {a.title}
        </div>

        {/* Body / preview */}
        <div style={{
          fontSize: 13.5,
          color: TEXT_SECONDARY,
          marginTop: 5,
          lineHeight: 1.45,
          ...(expanded ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }),
        }}>
          {a.content}
        </div>

        {/* Attachments (expanded only) */}
        {expanded && imageAttachments.length > 0 && (
          <div style={{
            marginTop: 12,
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
            WebkitOverflowScrolling: 'touch',
          }}>
            {imageAttachments.map((att, i) => (
              <a
                key={`img-${i}`}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: '0 0 auto',
                  borderRadius: RADIUS_SM,
                  overflow: 'hidden',
                  border: `1px solid ${BORDER}`,
                  display: 'block',
                  background: SURFACE_SUNKEN,
                }}
              >
                <img
                  src={att.url}
                  alt={att.name}
                  loading="lazy"
                  decoding="async"
                  style={{ height: 128, width: 'auto', maxWidth: 220, objectFit: 'cover', display: 'block' }}
                />
              </a>
            ))}
          </div>
        )}

        {expanded && fileAttachments.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fileAttachments.map((att, i) => (
              <a
                key={`file-${i}`}
                href={att.url}
                download={att.name}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: RADIUS_SM,
                  background: SURFACE_SUNKEN,
                  border: `1px solid ${BORDER}`,
                  textDecoration: 'none',
                  color: TEXT_PRIMARY,
                }}
              >
                {att.type.includes('pdf')
                  ? <FileText size={16} style={{ color: STATUS_CRITICAL, flex: '0 0 auto' }} />
                  : <File size={16} style={{ color: BRAND_DARK, flex: '0 0 auto' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5,
                    fontWeight: 650,
                    color: TEXT_PRIMARY,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {att.name}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 1 }}>
                    {formatFileSize(att.size)}
                  </div>
                </div>
                <Download size={16} style={{ color: TEXT_SECONDARY, flex: '0 0 auto' }} />
              </a>
            ))}
          </div>
        )}

        {/* Footer row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 11,
          fontSize: 11.5,
          color: TEXT_MUTED,
        }}>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}>
            {formatName(a.authorName)}
          </span>
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 650,
            color: BRAND_DARK,
            flex: '0 0 auto',
          }}>
            {expanded
              ? (lang === 'ru' ? 'Свернуть' : "Yopish")
              : (lang === 'ru' ? 'Читать' : "O'qish")}
            <ChevronDown
              size={13}
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </span>
        </div>
      </button>
    </div>
  );
}

function EmptyState({ lang, filter }: { lang: 'ru' | 'uz'; filter: 'all' | 'unread' }) {
  const title = filter === 'unread'
    ? (lang === 'ru' ? 'Всё прочитано' : "Hammasi o'qilgan")
    : (lang === 'ru' ? 'Объявлений пока нет' : "E'lonlar yo'q");
  const sub = filter === 'unread'
    ? (lang === 'ru' ? 'Новых объявлений нет' : "Yangi e'lonlar yo'q")
    : (lang === 'ru' ? 'Новые объявления появятся здесь' : "Yangi e'lonlar bu yerda paydo bo'ladi");
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        width: 72,
        height: 72,
        borderRadius: 999,
        background: SURFACE_SUNKEN,
        color: TEXT_MUTED,
        display: 'grid',
        placeItems: 'center',
        margin: '0 auto 16px',
      }}>
        <Megaphone size={32} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>{title}</div>
      <div style={{ fontSize: 13.5, color: TEXT_SECONDARY, marginTop: 6 }}>{sub}</div>
    </div>
  );
}
