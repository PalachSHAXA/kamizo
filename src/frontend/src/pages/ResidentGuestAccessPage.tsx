// Resident passes / guest-access page — Claude Design §06-propuska
// (design/handoff/passes-handoff.md). Sticky in-page header, ticket
// hero, 2x2 quick-create grid, "Недавние" list. All data + actions
// stay wired to the existing guest-access store and helper components
// (CreatePassForm sheet, QRCodeDisplay modal, ConfirmDialog for revoke
// — each registers with the modal-presence registry so the global
// BottomBar hides while open).

import { useState, useEffect, useMemo } from 'react';
import { History, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { EmptyState, ConfirmDialog } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useGuestAccessStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest } from '../services/api';
import type { GuestAccessCode, VisitorType, AccessType } from '../types';
import { QRCodeDisplay } from './guest-access/QRCodeDisplay';
import { LatestPassHero } from './guest-access/LatestPassHero';
import { CreatePassForm } from './guest-access/CreatePassForm';
import { QuickCreateTiles } from './guest-access/QuickCreateTiles';
import { safeVisitorLabel, safeAccessLabel, type VisitLog } from './guest-access/utils';

const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#6F6A62';
const TEXT_MUTED = '#A8A29E';
const SURFACE = '#FFFFFF';
const SURFACE_SUNKEN = '#EDE7DB';
const BORDER = '#E6DFD2';
const HAIRLINE = 'rgba(28,25,23,0.06)';
const SHADOW_SM = '0 1px 2px rgba(28,25,23,0.04)';

export function ResidentGuestAccessPage() {
  const { user } = useAuthStore();
  const guestAccessCodes = useGuestAccessStore(s => s.guestAccessCodes);
  const fetchGuestCodes = useGuestAccessStore(s => s.fetchGuestCodes);
  const revokeGuestAccessCode = useGuestAccessStore(s => s.revokeGuestAccessCode);
  const isLoadingGuestCodes = useGuestAccessStore(s => s.isLoadingGuestCodes);
  const { language } = useLanguageStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPreset, setCreatePreset] = useState<{ visitor: VisitorType; access: AccessType } | null>(null);
  const [selectedCode, setSelectedCode] = useState<GuestAccessCode | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<GuestAccessCode | null>(null);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Visit history — server scan log filtered to THIS resident's codes.
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);

  useEffect(() => {
    fetchGuestCodes();
  }, [fetchGuestCodes]);

  useEffect(() => {
    if (!user?.id) return;
    apiRequest<{ logs: VisitLog[] }>('/api/guest-codes/scan-history')
      .then(res => setVisitLogs(res.logs || []))
      .catch(() => setVisitLogs([]))
      .finally(() => setLogsLoaded(true));
  }, [user?.id, guestAccessCodes.length]);

  const myCodeIds = useMemo(() => new Set(guestAccessCodes.map(c => c.id)), [guestAccessCodes]);
  const myVisitLogs = useMemo(
    () => visitLogs.filter(log => myCodeIds.has(log.code_id)).slice(0, 30),
    [visitLogs, myCodeIds]
  );

  // Update expired status on the fly so the hero badge and the list pills
  // both reflect reality without waiting for a store refetch.
  const now = new Date();
  const codes = guestAccessCodes.map(c => {
    if (c.status === 'active' && now > new Date(c.validUntil)) {
      return { ...c, status: 'expired' as const };
    }
    return c;
  });

  // Archive cutoff: 30 days. Expired/used codes older than this go to
  // the "Архив" view, accessed via the header History button.
  const ARCHIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;
  const archiveCutoffDate = new Date(now.getTime() - ARCHIVE_CUTOFF_MS);
  const isArchived = (c: typeof codes[number]) => {
    if (c.status === 'active') return false;
    return new Date(c.validUntil) < archiveCutoffDate;
  };

  const activeCodes = codes.filter(c => c.status === 'active');
  const recentCodes = codes.filter(c => !isArchived(c));
  const archivedCodes = codes.filter(isArchived);
  const visibleCodes = showHistorySheet ? archivedCodes : recentCodes;

  // Featured ticket: most recent active wins; else most recent non-archived.
  const latestPass = useMemo(() => {
    const byCreated = (a: typeof codes[number], b: typeof codes[number]) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const sortedActive = [...activeCodes].sort(byCreated);
    if (sortedActive[0]) return sortedActive[0];
    const sortedRecent = [...recentCodes].sort(byCreated);
    return sortedRecent[0] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestAccessCodes]);

  const handleCreated = (code: GuestAccessCode) => {
    setShowCreateForm(false);
    setSelectedCode(code);
  };

  const handleRevoke = async () => {
    if (!showRevokeConfirm || !user) return;
    await revokeGuestAccessCode(
      showRevokeConfirm.id,
      user.id,
      user.name,
      user.role,
      language === 'ru' ? 'Отменено жителем' : 'Turar joy egasi tomonidan bekor qilindi',
    );
    setShowRevokeConfirm(null);
  };

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--app-bg)',
      color: TEXT_PRIMARY,
      paddingBottom: 'calc(124px + env(safe-area-inset-bottom, 0px))',
      letterSpacing: '-0.01em',
    }}>
      {/* ── Sticky header (eyebrow + title + history button) ─────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px',
        background: 'rgba(244,240,232,0.92)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
            color: TEXT_SECONDARY, textTransform: 'uppercase',
          }}>
            {language === 'ru' ? 'QR-доступ' : 'QR-kirish'}
          </div>
          <div style={{
            fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2,
            color: TEXT_PRIMARY,
          }}>
            {showHistorySheet
              ? (language === 'ru' ? 'Архив' : 'Arxiv')
              : (language === 'ru' ? 'Пропуска' : 'Ruxsatlar')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHistorySheet(s => !s)}
          aria-label={language === 'ru' ? 'История' : 'Tarix'}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            display: 'grid', placeItems: 'center',
            color: showHistorySheet ? '#EA580C' : TEXT_SECONDARY,
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <History size={18} />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px' }}>
        {/* Ticket hero (skipped in history view) */}
        {!showHistorySheet && latestPass && (
          <LatestPassHero
            code={latestPass}
            onOpen={() => setSelectedCode(latestPass)}
            onRevoke={() => setShowRevokeConfirm(latestPass)}
          />
        )}

        {/* "Создать пропуск" section (skipped in history view) */}
        {!showHistorySheet && (
          <>
            <SectionLabel>{language === 'ru' ? 'Создать пропуск' : 'Ruxsat yaratish'}</SectionLabel>
            <QuickCreateTiles
              onPick={(p) => {
                setCreatePreset({ visitor: p.visitor, access: p.access });
                setShowCreateForm(true);
              }}
            />
          </>
        )}

        {/* "Недавние" / "Архив" list */}
        <SectionLabel>
          {showHistorySheet
            ? (language === 'ru' ? 'Архив' : 'Arxiv')
            : (language === 'ru' ? 'Недавние' : "So'nggi")}
        </SectionLabel>

        {isLoadingGuestCodes ? (
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20,
            padding: '32px 16px', textAlign: 'center', boxShadow: SHADOW_SM,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 999,
              background: SURFACE_SUNKEN, color: TEXT_MUTED,
              display: 'grid', placeItems: 'center',
              margin: '0 auto 12px',
              animation: 'kzPulse 1.6s infinite',
            }}>
              <QrCode size={28} />
            </div>
            <div style={{ fontSize: 13.5, color: TEXT_SECONDARY }}>
              {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
            </div>
          </div>
        ) : visibleCodes.length === 0 ? (
          <EmptyState
            icon={<QrCode className="w-12 h-12" />}
            title={showHistorySheet
              ? (language === 'ru' ? 'Архив пуст' : "Arxiv bo'sh")
              : (language === 'ru' ? 'Пропусков нет' : "Ruxsatnomalar yo'q")}
            description={showHistorySheet
              ? (language === 'ru' ? 'Старые пропуска появятся здесь через 30 дней' : "Eski ruxsatnomalar 30 kundan keyin paydo bo'ladi")
              : (language === 'ru' ? 'Создайте пропуск через карточки выше' : 'Yuqoridagi kartochkalar orqali yarating')}
          />
        ) : (
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20,
            boxShadow: SHADOW_SM, overflow: 'hidden',
          }}>
            {visibleCodes.map((code, idx) => (
              <PastRow
                key={code.id}
                code={code}
                language={language}
                isLast={idx === visibleCodes.length - 1}
                onClick={() => setSelectedCode(code)}
              />
            ))}
          </div>
        )}

        {/* Visit history — answers "кто и когда заходил по моему QR" */}
        {logsLoaded && guestAccessCodes.length > 0 && !showHistorySheet && (
          <>
            <SectionLabel>
              {language === 'ru' ? 'История посещений' : 'Tashriflar tarixi'}
              {myVisitLogs.length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  color: TEXT_MUTED, background: SURFACE_SUNKEN,
                  padding: '2px 7px', borderRadius: 999,
                  letterSpacing: 0,
                }}>
                  {myVisitLogs.length}
                </span>
              )}
            </SectionLabel>
            {myVisitLogs.length === 0 ? (
              <div style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20,
                padding: '14px 16px', textAlign: 'center',
                fontSize: 12, color: TEXT_MUTED, boxShadow: SHADOW_SM,
              }}>
                {language === 'ru'
                  ? 'Здесь появятся записи когда кто-то зайдёт по вашему QR'
                  : "Sizning QR orqali kim kirsa, bu yerda paydo bo'ladi"}
              </div>
            ) : (
              <div style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20,
                boxShadow: SHADOW_SM, overflow: 'hidden',
              }}>
                {myVisitLogs.map((log, idx) => {
                  const isAllowed = log.action === 'entry_allowed';
                  const visitor = safeVisitorLabel(log.visitor_type);
                  const ts = new Date(log.scanned_at);
                  const timeStr = ts.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <div key={log.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 15px',
                      borderBottom: idx < myVisitLogs.length - 1 ? `1px solid ${HAIRLINE}` : 'none',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: isAllowed ? 'rgba(21,160,110,0.12)' : 'rgba(226,72,61,0.12)',
                        color: isAllowed ? '#15A06E' : '#E2483D',
                        display: 'grid', placeItems: 'center',
                        flex: '0 0 auto',
                      }}>
                        {isAllowed ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5, fontWeight: 650 as unknown as number,
                          color: TEXT_PRIMARY,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {visitor.icon} {language === 'ru' ? visitor.label : visitor.labelUz}
                          {' · '}
                          <span style={{ color: isAllowed ? '#15A06E' : '#E2483D' }}>
                            {isAllowed
                              ? (language === 'ru' ? 'пропущен' : 'kirgan')
                              : (language === 'ru' ? 'отказ' : 'rad etilgan')}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginTop: 1 }}>
                          {timeStr}
                          {log.scanned_by_name && (
                            <>{' · '}{language === 'ru' ? 'охрана' : "qo'riqchi"}: {log.scanned_by_name}</>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals — both register with useModalPresence so the BottomBar
          stays hidden while open (shared modal-presence registry). */}
      {showCreateForm && (
        <CreatePassForm
          onClose={() => { setShowCreateForm(false); setCreatePreset(null); }}
          onCreated={(c) => { handleCreated(c); setCreatePreset(null); }}
          initialVisitorType={createPreset?.visitor}
          initialAccessType={createPreset?.access}
        />
      )}

      {selectedCode && (
        <QRCodeDisplay
          codeId={selectedCode.id}
          onClose={() => setSelectedCode(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!showRevokeConfirm}
        tone="danger"
        title={language === 'ru' ? 'Отменить пропуск?' : 'Ruxsatnomani bekor qilasizmi?'}
        description={language === 'ru'
          ? 'Пропуск будет деактивирован и не сможет быть использован'
          : "Ruxsatnoma o'chiriladi va ishlatib bo'lmaydi"}
        confirmLabel={language === 'ru' ? 'Да, отменить' : 'Ha, bekor qilish'}
        cancelLabel={language === 'ru' ? 'Нет' : "Yo'q"}
        onClose={() => setShowRevokeConfirm(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}

// ─── inner helpers ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
      color: TEXT_SECONDARY, textTransform: 'uppercase',
      padding: '20px 2px 10px',
      display: 'flex', alignItems: 'center',
    }}>
      {children}
    </div>
  );
}

function PastRow({
  code, language, isLast, onClick,
}: {
  code: GuestAccessCode;
  language: 'ru' | 'uz';
  isLast: boolean;
  onClick: () => void;
}) {
  const visitorLabel = safeVisitorLabel(code.visitorType);
  const accessLabel = safeAccessLabel(code.accessType);
  const isExpired = code.status === 'expired';
  const isRevoked = code.status === 'revoked';
  const isUsed = code.status === 'used';
  const isActive = code.status === 'active';

  const headline = code.visitorName
    || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz);

  // "type · when"
  const when = new Date(code.validUntil);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const whenStr = sameDay(when, today)
    ? (language === 'ru' ? 'сегодня' : 'bugun')
    : sameDay(when, yesterday)
      ? (language === 'ru' ? 'вчера' : 'kecha')
      : when.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short' });
  const typeStr = language === 'ru' ? visitorLabel.label : visitorLabel.labelUz;
  // Append access label inline so the row carries its scope without a second line.
  const accessStr = ` · ${language === 'ru' ? accessLabel.label : accessLabel.labelUz}`;

  // Pill: blue (used), grey (expired), red (revoked), green (active).
  const pill = isActive
    ? { fg: '#15A06E', bg: 'rgba(21,160,110,0.12)', label: language === 'ru' ? 'Активен' : 'Faol' }
    : isUsed
      ? { fg: '#2F77C2', bg: 'rgba(47,119,194,0.12)', label: language === 'ru' ? 'Использован' : 'Ishlatilgan' }
      : isRevoked
        ? { fg: '#E2483D', bg: 'rgba(226,72,61,0.12)', label: language === 'ru' ? 'Отозван' : 'Bekor' }
        : { fg: '#8A857C', bg: 'rgba(138,133,124,0.12)', label: language === 'ru' ? 'Истёк' : 'Tugagan' };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 15px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left',
        borderBottom: isLast ? 'none' : `1px solid ${HAIRLINE}`,
        opacity: isExpired ? 0.55 : 1,
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: SURFACE_SUNKEN,
        color: TEXT_SECONDARY,
        display: 'grid', placeItems: 'center',
        flex: '0 0 auto',
        filter: isExpired ? 'grayscale(1)' : 'none',
      }}>
        <QrCode size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 650 as unknown as number, letterSpacing: '-0.01em',
          color: TEXT_PRIMARY,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {headline}
        </div>
        <div style={{
          fontSize: 11.5, color: TEXT_MUTED, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {typeStr}{accessStr} · {whenStr}
        </div>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        padding: '3px 9px', borderRadius: 999,
        background: pill.bg, color: pill.fg,
        flex: '0 0 auto',
        textTransform: 'none',
      }}>
        {pill.label}
      </span>
    </button>
  );
}
