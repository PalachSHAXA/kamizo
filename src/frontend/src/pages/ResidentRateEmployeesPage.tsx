// Resident "Оценка сотрудников" — Claude Design §09-ocenka handoff
// (design/handoff/rating-handoff.md). Sticky header, horizontally-
// scrolling employee row, selected-employee card with 5-star input,
// quick tag chips, comment textarea, submit. UK rating is preserved
// as a secondary action that opens the existing flow in a Modal
// (common/Modal already registers with useModalPresence).
//
// Data wiring stays on the existing endpoints:
//   - useExecutorStore.fetchExecutors / .executors
//   - useRequestStore.fetchRequests / .requests
//   - GET  /api/ratings        → which executors this resident has rated
//   - POST /api/ratings        → submit a new rating
//   - ukRatingsApi.getMyRating / submitRating for the UK rating
//
// The handoff is single-axis (1 overall star). The backend stores three
// axes; we mirror the single rating to all three on submit so the
// schema is preserved without inventing endpoints. Selected tag labels
// are prepended to the comment as [Tag1][Tag2] so they survive too.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Star as StarIcon, Check, Building2, ArrowLeft } from 'lucide-react';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useAuthStore } from '../stores/authStore';
import { useRequestStore, useExecutorStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { ukRatingsApi } from '../services/api';
import { apiRequest } from '../services/api/client';
import type { Executor } from '../types';
import { SPECIALIZATION_LABELS } from '../types';
import { Modal } from '../components/common';
import { RoleAvatar } from '../components/RoleAvatar';
import { formatName } from '../utils/formatName';

// ── design tokens used inline (kept literal so they survive any
//    --token rename in the global stylesheet) ──────────────────────────
const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#6F6A62';
const TEXT_MUTED = '#A8A29E';
const SURFACE = '#FFFFFF';
const SURFACE_SUNKEN = '#EDE7DB';
const BORDER = '#E6DFD2';
const HAIRLINE = 'rgba(28,25,23,0.06)';
const SHADOW_SM = '0 1px 2px rgba(28,25,23,0.04)';
const SHADOW_MD = '0 4px 16px rgba(28,25,23,0.06)';
const AMBER_400 = '#FBBF24';
const AMBER_500 = '#F59E0B';
const AMBER_600 = '#D97706';
const AMBER_700 = '#B45309';
const AMBER_800 = '#92400E';
const AMBER_100 = '#FEF3C7';
const STONE_50 = '#FBF8F2';
const STONE_100 = '#F4F0E8';
const STONE_200 = '#E6DFD2';
const SUCCESS = '#15A06E';
const STAR_EMPTY = '#D6D3D1';
const STAR_GLOW = '0 8px 22px rgba(217,119,6,0.26)';

interface TagOption { id: string; ruLabel: string; uzLabel: string; }
const TAG_OPTIONS: TagOption[] = [
  { id: 'fast',     ruLabel: 'Быстро',           uzLabel: 'Tezkor' },
  { id: 'polite',   ruLabel: 'Вежливый',         uzLabel: 'Xushmuomala' },
  { id: 'pro',      ruLabel: 'Профессионально',  uzLabel: 'Professional' },
  { id: 'clean',    ruLabel: 'Чисто',            uzLabel: 'Toza' },
  { id: 'punctual', ruLabel: 'Пунктуально',      uzLabel: 'Vaqtida' },
  { id: 'extra',    ruLabel: 'Помог с лишним',   uzLabel: 'Qoʻshimcha yordam' },
];

// Word-rating per star count (handoff)
const RATING_WORDS_RU = ['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'] as const;
const RATING_WORDS_UZ = ['', 'Juda yomon', 'Yomon', 'Oʻrtacha', 'Yaxshi', "A'lo"] as const;

const tagsToCommentPrefix = (tagIds: string[], lang: 'ru' | 'uz'): string => {
  if (tagIds.length === 0) return '';
  return tagIds
    .map(id => TAG_OPTIONS.find(t => t.id === id))
    .filter(Boolean)
    .map(t => `[${lang === 'ru' ? t!.ruLabel : t!.uzLabel}]`)
    .join('') + ' ';
};

export function ResidentRateEmployeesPage() {
  const navigate = useNavigate();
  // v118.153 — iOS-style left-edge swipe-back. This page has no visible
  // ← button (users normally rely on BottomBar), so the gesture is
  // especially useful here. Goes back to Home to match the sibling
  // full-bleed pages (/announcements, /meetings, /useful-contacts).
  useEdgeSwipeBack(() => navigate('/'));

  const { user } = useAuthStore();
  const executors = useExecutorStore(s => s.executors);
  const requests = useRequestStore(s => s.requests);
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);
  const fetchRequests = useRequestStore(s => s.fetchRequests);
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  const [selectedExecutorId, setSelectedExecutorId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [ratedExecutorIds, setRatedExecutorIds] = useState<string[]>([]);

  // UK rating state — preserved from the previous implementation, now
  // gated behind a Modal opened from a secondary button below the page.
  const [showUkModal, setShowUkModal] = useState(false);
  const [ukRatingDone, setUkRatingDone] = useState(false);
  const [ukRatingLoading, setUkRatingLoading] = useState(true);
  const [ukOverall, setUkOverall] = useState(0);
  const [ukCleanliness, setUkCleanliness] = useState(0);
  const [ukResponsiveness, setUkResponsiveness] = useState(0);
  const [ukCommunication, setUkCommunication] = useState(0);
  const [ukComment, setUkComment] = useState('');
  const [ukSubmitting, setUkSubmitting] = useState(false);

  useEffect(() => {
    fetchExecutors();
    fetchRequests();
  }, [fetchExecutors, fetchRequests]);

  useEffect(() => {
    if (!user?.id) return;
    apiRequest<{executor_id: string}[]>('/api/ratings')
      .then(data => {
        if (Array.isArray(data)) {
          setRatedExecutorIds(data.map(r => r.executor_id));
        }
      })
      .catch(() => { /* keep empty */ });
  }, [user?.id]);

  useEffect(() => {
    ukRatingsApi.getMyRating()
      .then(res => {
        if (res.rating) {
          setUkRatingDone(true);
          const r = res.rating as Record<string, unknown>;
          setUkOverall(Number(r.overall) || 0);
          setUkCleanliness(Number(r.cleanliness) || 0);
          setUkResponsiveness(Number(r.responsiveness) || 0);
          setUkCommunication(Number(r.communication) || 0);
          setUkComment(String(r.comment || ''));
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => setUkRatingLoading(false));
  }, []);

  // Executors who have completed ≥1 request for THIS resident. Anything
  // else is noise on the rate screen.
  const workedForUser = useMemo(() => {
    const userCompleted = requests.filter(r =>
      r.residentId === user?.id && r.status === 'completed' && r.executorId,
    );
    const ids = new Set(userCompleted.map(r => r.executorId!));
    return executors.filter(e => ids.has(e.id));
  }, [executors, requests, user?.id]);

  // Order: not-yet-rated first, then rated ones (handoff: rated chips
  // show a green check badge; user can still re-tap to update).
  const orderedExecutors = useMemo(() => {
    return [...workedForUser].sort((a, b) => {
      const aRated = ratedExecutorIds.includes(a.id);
      const bRated = ratedExecutorIds.includes(b.id);
      if (aRated === bRated) return a.name.localeCompare(b.name);
      return aRated ? 1 : -1;
    });
  }, [workedForUser, ratedExecutorIds]);

  // Auto-select the first unrated executor on first render once the list
  // is non-empty, mirroring the handoff (one chip is always active).
  useEffect(() => {
    if (selectedExecutorId) return;
    if (orderedExecutors.length === 0) return;
    setSelectedExecutorId(orderedExecutors[0].id);
  }, [orderedExecutors, selectedExecutorId]);

  const selected = useMemo(() => {
    return orderedExecutors.find(e => e.id === selectedExecutorId) || null;
  }, [orderedExecutors, selectedExecutorId]);

  // Last completed job by this executor for this resident — feeds the
  // "Последняя работа" pill inside the selected-employee card.
  const selectedLastJob = useMemo(() => {
    if (!selected || !user?.id) return null;
    const candidates = requests
      .filter(r => r.residentId === user.id && r.executorId === selected.id && r.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
    return candidates[0] || null;
  }, [selected, requests, user?.id]);

  const selectExecutor = (id: string) => {
    setSelectedExecutorId(id);
    setRating(0);
    setTagIds([]);
    setComment('');
  };

  const toggleTag = (id: string) => {
    setTagIds(curr => curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id]);
  };

  const handleSubmit = async () => {
    if (!selected || !user || rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      const prefix = tagsToCommentPrefix(tagIds, language === 'ru' ? 'ru' : 'uz');
      const body = {
        executor_id: selected.id,
        // single-axis handoff → mirror to existing 3-axis schema
        quality: rating,
        speed: rating,
        politeness: rating,
        comment: (prefix + (comment || '').trim()).trim() || null,
      };
      await apiRequest('/api/ratings', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setRatedExecutorIds(prev => prev.includes(selected.id) ? prev : [...prev, selected.id]);
      addToast('success', language === 'ru' ? 'Отзыв отправлен. Спасибо!' : 'Fikr yuborildi. Rahmat!');
      // Reset the form, keep the selection so user sees the green tick on the chip.
      setRating(0);
      setTagIds([]);
      setComment('');
    } catch (e) {
      addToast('error', (e as Error).message || (language === 'ru' ? 'Не удалось сохранить оценку' : "Bahoni saqlab boʻlmadi"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUkSubmit = async () => {
    if (ukOverall === 0) return;
    setUkSubmitting(true);
    try {
      await ukRatingsApi.submitRating({
        overall: ukOverall,
        cleanliness: ukCleanliness || undefined,
        responsiveness: ukResponsiveness || undefined,
        communication: ukCommunication || undefined,
        comment: ukComment || undefined,
      });
      setUkRatingDone(true);
      addToast('success', language === 'ru' ? 'Оценка УК сохранена' : 'UK bahosi saqlandi');
      setShowUkModal(false);
    } catch (e) {
      addToast('error', (e as Error).message || (language === 'ru' ? 'Не удалось сохранить' : "Saqlab boʻlmadi"));
    } finally {
      setUkSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--app-bg)',
      color: TEXT_PRIMARY,
      paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
      letterSpacing: '-0.01em',
    }}>
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      {/* v118.170 — back button added (top-left, 40×40, same shape as
          ResidentUsefulContactsPage and ResidentVehiclesPage garage
          header). Previously the sticky header was title-only with no
          exit affordance: BottomBar reads Home-active on this route,
          useEdgeSwipeBack works but is invisible, so residents felt
          trapped on the page. Layout is now a flex row: back button
          40×40 on the left + a flex:1 text column carrying the
          eyebrow + title stack. Nothing else on the screen changes. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 20px 12px',
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border-c, rgba(28,25,23,0.06))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
            style={{
              width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
              background: 'var(--surface, #FFFFFF)',
              border: '1px solid var(--border-c, #E6DFD2)',
              color: 'var(--text-primary, #1C1917)',
              display: 'grid', placeItems: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <ArrowLeft size={19} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              color: 'var(--text-secondary, #A8A29E)', textTransform: 'uppercase',
            }}>
              {language === 'ru' ? 'Оценка сотрудников' : 'Xodimlarni baholash'}
            </div>
            <div style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 1,
              color: 'var(--text-primary, #1C1917)',
            }}>
              {language === 'ru' ? 'Спасибо, что делитесь' : 'Fikringiz uchun rahmat'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px' }}>
        {orderedExecutors.length === 0 ? (
          <EmptyState language={language} />
        ) : (
          <>
            {/* Horizontally-scrolling employee row */}
            <div style={{
              display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
              padding: '4px 4px 12px', margin: '-4px -4px 0',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}>
              {orderedExecutors.map(e => (
                <EmployeeChip
                  key={e.id}
                  executor={e}
                  isActive={selectedExecutorId === e.id}
                  isRated={ratedExecutorIds.includes(e.id)}
                  onClick={() => selectExecutor(e.id)}
                />
              ))}
            </div>

            {/* Selected employee card */}
            {selected && (
              <SelectedEmployeeCard
                executor={selected}
                lastJobSummary={selectedLastJob
                  ? `${selectedLastJob.title || (language === 'ru' ? 'Заявка' : 'Ariza')} · ${formatRelativeDate(selectedLastJob.completedAt || selectedLastJob.createdAt, language === 'ru' ? 'ru' : 'uz')}`
                  : null}
                rating={rating}
                onRatingChange={setRating}
                tagIds={tagIds}
                onToggleTag={toggleTag}
                comment={comment}
                onCommentChange={setComment}
                onSubmit={handleSubmit}
                submitting={submitting}
                language={language}
              />
            )}
          </>
        )}

        {/* Secondary action: rate the UK separately. Lives below the
            primary rating UX so the handoff card stays intact at the top. */}
        <div style={{
          marginTop: 22, padding: '14px 14px',
          background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18,
          boxShadow: SHADOW_SM,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(47,119,194,0.12)', color: '#2F77C2',
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
          }}>
            <Building2 size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
              color: TEXT_PRIMARY,
            }}>
              {language === 'ru' ? 'Оценить УК отдельно' : 'UK ni alohida baholash'}
            </div>
            <div style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 1 }}>
              {ukRatingLoading
                ? (language === 'ru' ? 'Проверяем…' : 'Tekshirilmoqda…')
                : ukRatingDone
                  ? (language === 'ru' ? 'Можно обновить вашу оценку' : 'Bahoyingizni yangilashingiz mumkin')
                  : (language === 'ru' ? 'Помогите улучшить обслуживание' : 'Xizmatni yaxshilashga yordam bering')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowUkModal(true)}
            disabled={ukRatingLoading}
            style={{
              padding: '8px 14px', borderRadius: 12,
              background: ukRatingDone ? STONE_100 : 'rgba(47,119,194,0.12)',
              color: ukRatingDone ? TEXT_SECONDARY : '#2F77C2',
              border: 'none', fontSize: 13, fontWeight: 700,
              cursor: ukRatingLoading ? 'default' : 'pointer',
              opacity: ukRatingLoading ? 0.5 : 1,
              flex: '0 0 auto',
            }}
          >
            {ukRatingDone
              ? (language === 'ru' ? 'Изменить' : "Oʻzgartirish")
              : (language === 'ru' ? 'Оценить' : 'Baholash')}
          </button>
        </div>
      </div>

      {/* UK rating Modal — common/Modal already calls useModalPresence,
          so the BottomBar hides while it's open. */}
      <Modal
        isOpen={showUkModal}
        onClose={() => setShowUkModal(false)}
        onBack={() => setShowUkModal(false)}
        title={language === 'ru' ? 'Оценка управляющей компании' : 'Boshqaruv kompaniyasini baholash'}
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <UkStarRow
            label={language === 'ru' ? 'Общая оценка' : 'Umumiy baho'}
            value={ukOverall}
            onChange={setUkOverall}
            required
          />
          <UkStarRow
            label={language === 'ru' ? 'Чистота и порядок' : 'Tozalik va tartib'}
            value={ukCleanliness}
            onChange={setUkCleanliness}
          />
          <UkStarRow
            label={language === 'ru' ? 'Скорость реагирования' : 'Javob berish tezligi'}
            value={ukResponsiveness}
            onChange={setUkResponsiveness}
          />
          <UkStarRow
            label={language === 'ru' ? 'Коммуникация' : 'Muloqot'}
            value={ukCommunication}
            onChange={setUkCommunication}
          />
          <textarea
            value={ukComment}
            onChange={(e) => setUkComment(e.target.value)}
            placeholder={language === 'ru' ? 'Что можно улучшить?' : 'Nimani yaxshilash mumkin?'}
            rows={3}
            // v118.136 — textarea uses theme-aware CSS vars (with the
            // original hex as fallback) so html.dark in index.css can
            // flip the surface + text to the dark palette. In light
            // mode the fallback wins → visually identical to before.
            style={{
              width: '100%', padding: '12px 14px',
              borderRadius: 12, border: '1px solid var(--border-c, #E6DFD2)',
              fontSize: 14,
              color: 'var(--text-primary, #1C1917)',
              background: 'var(--surface-sunken, #FBF8F2)',
              resize: 'none', outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleUkSubmit}
            disabled={ukOverall === 0 || ukSubmitting}
            // v118.136 — disabled state uses theme-aware surface/text
            // tokens so the button doesn't render as a light slab on
            // the dark drawer. Active state (amber brand) is the same
            // in both themes and stays unchanged.
            style={{
              marginTop: 4, padding: '14px',
              borderRadius: 14, border: 'none',
              background: ukOverall > 0 && !ukSubmitting
                ? AMBER_600
                : 'var(--surface-sunken, #E6DFD2)',
              color: ukOverall > 0 && !ukSubmitting
                ? '#fff'
                : 'var(--text-secondary, #A8A29E)',
              fontSize: 14.5, fontWeight: 650 as unknown as number,
              cursor: ukOverall > 0 && !ukSubmitting ? 'pointer' : 'not-allowed',
              boxShadow: ukOverall > 0 && !ukSubmitting ? STAR_GLOW : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Send size={16} />
            {ukSubmitting
              ? (language === 'ru' ? 'Отправка…' : 'Yuborilmoqda…')
              : ukRatingDone
                ? (language === 'ru' ? 'Обновить оценку' : 'Bahoni yangilash')
                : (language === 'ru' ? 'Отправить' : 'Yuborish')}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── inner components ─────────────────────────────────────────────────

function EmptyState({ language }: { language: 'ru' | 'uz' }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18,
      padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW_SM,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 999,
        background: SURFACE_SUNKEN, color: TEXT_MUTED,
        margin: '0 auto 12px',
        display: 'grid', placeItems: 'center',
      }}>
        <StarIcon size={28} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
        {language === 'ru' ? 'Пока некого оценивать' : 'Hozircha baholashga kim yoʻq'}
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
        {language === 'ru'
          ? 'Когда сотрудник завершит вашу заявку, его карточка появится здесь.'
          : 'Xodim arizangizni bajarganidan keyin uning kartochkasi bu yerda paydo boʻladi.'}
      </div>
    </div>
  );
}

function EmployeeChip({
  executor, isActive, isRated, onClick,
}: {
  executor: Executor;
  isActive: boolean;
  isRated: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '0 0 auto', width: 110,
        background: isActive ? SURFACE : 'transparent',
        border: '1.5px solid',
        borderColor: isActive ? AMBER_500 : BORDER,
        borderRadius: 14, padding: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: 'pointer',
        boxShadow: isActive ? SHADOW_MD : 'none',
        position: 'relative',
      }}
    >
      {/* v118.19 — Executor avatar in the horizontal chip picker.
          Always role='executor' (Key icon). Brand orange when this
          chip is the active one, stone grey when inactive — only the
          bg changes between states, the icon stays consistent. */}
      <RoleAvatar
        role="executor"
        name={executor.name}
        size={50}
        background={isActive
          ? 'linear-gradient(135deg, #FB923C, #EA580C)'
          : STONE_200}
        iconColor={isActive ? '#fff' : 'rgba(42,32,24,0.55)'}
        textColor={isActive ? '#fff' : 'rgba(42,32,24,0.55)'}
      />
      {isRated && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 16, height: 16, borderRadius: 999,
          background: SUCCESS, color: '#fff',
          display: 'grid', placeItems: 'center',
        }}>
          <Check size={10} strokeWidth={3.5} />
        </div>
      )}
      <div style={{
        fontSize: 12, fontWeight: 650 as unknown as number, letterSpacing: '-0.01em',
        textAlign: 'center', lineHeight: 1.2,
        color: TEXT_PRIMARY,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {formatName(executor.name)}
      </div>
      <div style={{
        fontSize: 10.5, color: TEXT_MUTED,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}>
        {SPECIALIZATION_LABELS[executor.specialization] || executor.specialization}
      </div>
    </button>
  );
}

function SelectedEmployeeCard({
  executor, lastJobSummary, rating, onRatingChange, tagIds, onToggleTag,
  comment, onCommentChange, onSubmit, submitting, language,
}: {
  executor: Executor;
  lastJobSummary: string | null;
  rating: number;
  onRatingChange: (n: number) => void;
  tagIds: string[];
  onToggleTag: (id: string) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  language: 'ru' | 'uz';
}) {
  const avg = (executor.rating || 0).toFixed(1);
  const completedCount = executor.completedCount || 0;
  const ratingWord = language === 'ru' ? RATING_WORDS_RU[rating] : RATING_WORDS_UZ[rating];

  return (
    <div style={{
      background: SURFACE, borderRadius: 18,
      border: `1px solid ${BORDER}`, boxShadow: SHADOW_MD,
      padding: 18, marginTop: 4,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {/* v118.19 — Selected-executor header (the rating card top).
            Always role='executor' → Key icon. */}
        <RoleAvatar role="executor" name={executor.name} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
            color: TEXT_PRIMARY,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {formatName(executor.name)}
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
            {SPECIALIZATION_LABELS[executor.specialization] || executor.specialization}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
            fontSize: 12, fontWeight: 600, color: AMBER_700,
          }}>
            <StarIcon size={13} fill={AMBER_500} stroke={AMBER_500} strokeWidth={0} />
            {avg}
            {completedCount > 0 && (
              <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>
                · {completedCount}{language === 'ru' ? ' выполнено' : ' bajarilgan'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Last-job pill */}
      {lastJobSummary && (
        <div style={{
          padding: '10px 12px', background: STONE_100, borderRadius: 10,
          fontSize: 12.5, color: TEXT_SECONDARY, marginBottom: 16,
        }}>
          <span style={{ color: TEXT_MUTED }}>
            {language === 'ru' ? 'Последняя работа: ' : 'Oxirgi ish: '}
          </span>
          {lastJobSummary}
        </div>
      )}

      {/* Stars */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{
          fontSize: 14, fontWeight: 650 as unknown as number,
          letterSpacing: '-0.01em', marginBottom: 10, color: TEXT_PRIMARY,
        }}>
          {language === 'ru' ? 'Как прошло?' : 'Qanday boʻldi?'}
        </div>
        <StarRow value={rating} onChange={onRatingChange} size={36} gap={10} />
        {rating > 0 && (
          <div style={{
            marginTop: 6, fontSize: 12.5, color: AMBER_700, fontWeight: 600,
          }}>
            {ratingWord}
          </div>
        )}
      </div>

      {/* When stars > 0: tags + comment + submit */}
      {rating > 0 && (
        <>
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 8,
            }}>
              {language === 'ru' ? 'Что особенно понравилось?' : 'Nimasi yoqdi?'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {TAG_OPTIONS.map(t => {
                const isOn = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleTag(t.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 999,
                      fontSize: 12.5, fontWeight: 600,
                      background: isOn ? AMBER_100 : SURFACE,
                      color: isOn ? AMBER_800 : TEXT_SECONDARY,
                      border: '1px solid',
                      borderColor: isOn ? AMBER_400 : BORDER,
                      cursor: 'pointer', letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {isOn && <Check size={11} strokeWidth={3} />}
                    {language === 'ru' ? t.ruLabel : t.uzLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder={language === 'ru' ? 'Комментарий (необязательно)' : 'Izoh (ixtiyoriy)'}
              style={{
                width: '100%', minHeight: 70,
                border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: '10px 12px', fontSize: 13.5,
                fontFamily: 'inherit', color: TEXT_PRIMARY,
                resize: 'none', outline: 'none', background: STONE_50,
                boxSizing: 'border-box',
              }}
              rows={3}
            />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            style={{
              width: '100%', marginTop: 12, padding: 14,
              background: AMBER_600, color: '#fff', border: 'none',
              borderRadius: 14, fontSize: 14.5, fontWeight: 650 as unknown as number,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: STAR_GLOW,
            }}
          >
            <Send size={15} />
            {submitting
              ? (language === 'ru' ? 'Отправка…' : 'Yuborilmoqda…')
              : (language === 'ru' ? 'Отправить отзыв' : 'Fikrni yuborish')}
          </button>
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: TEXT_MUTED }}>
            {language === 'ru'
              ? 'Анонимно для сотрудника. Только средний балл публичный.'
              : 'Xodim uchun anonim. Faqat oʻrtacha ball ochiq.'}
          </div>
        </>
      )}
    </div>
  );
}

function StarRow({
  value, onChange, size = 28, gap = 6,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'inline-flex', gap }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n}/5`}
            // v118.136 — empty-star outline uses the themed border
            // token so it's visible against both light and dark drawer
            // backgrounds. Filled state stays amber in both themes.
            style={{
              width: size + 4, height: size + 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: filled ? AMBER_500 : 'var(--border-c, #D6D3D1)',
              padding: 0, display: 'grid', placeItems: 'center',
            }}
          >
            <svg
              width={size} height={size} viewBox="0 0 24 24"
              fill={filled ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"
            >
              <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function UkStarRow({
  label, value, onChange, required,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
}) {
  return (
    // v118.136 — UkStarRow uses theme-aware tokens for the divider +
    // label so dark mode lights the rating labels (Общая оценка / …)
    // properly against the dark drawer surface. Light-mode appearance
    // preserved via the hex fallback in each var().
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid var(--border-c, rgba(28,25,23,0.06))',
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary, #1C1917)' }}>
        {label}
        {required && <span style={{ color: AMBER_600, marginLeft: 4 }}>*</span>}
      </span>
      <StarRow value={value} onChange={onChange} size={22} gap={4} />
    </div>
  );
}

// "вчера" / "сегодня" / "12 дек" — short relative date for the last-job pill.
function formatRelativeDate(iso: string | undefined, lang: 'ru' | 'uz'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameDay(d, now)) return lang === 'ru' ? 'сегодня' : 'bugun';
  if (sameDay(d, yesterday)) return lang === 'ru' ? 'вчера' : 'kecha';
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
}
