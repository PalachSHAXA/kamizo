import { useState, useEffect, useMemo } from 'react';
import {
  QrCode, Clock, ChevronRight, History, CheckCircle2, XCircle,
} from 'lucide-react';
import { EmptyState, StatusBadge, ConfirmDialog } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useGuestAccessStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import type { GuestAccessCode, VisitorType, AccessType } from '../types';
import { QRCodeDisplay } from './guest-access/QRCodeDisplay';
import { LatestPassHero } from './guest-access/LatestPassHero';
import { CreatePassForm } from './guest-access/CreatePassForm';
import { QuickCreateTiles } from './guest-access/QuickCreateTiles';
import { toneFor, safeVisitorLabel, safeAccessLabel, safeStatusLabel } from './guest-access/utils';

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
  const [filter] = useState<'all' | 'active' | 'used' | 'expired' | 'revoked' | 'archive'>('all');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<GuestAccessCode | null>(null);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Visit history — list of scans from guards/security on this resident's
  // own QR codes. The backend endpoint returns ALL tenant logs, we filter
  // client-side by code_id ∈ user's codes. Useful answer to "приходил ли
  // курьер?" without having to call the УК.
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);

  // Fetch codes on mount
  useEffect(() => {
    fetchGuestCodes();
  }, [fetchGuestCodes]);

  // Fetch the scan-history once codes are loaded so we know which IDs are ours.
  // Re-fetched whenever the codes list changes (new code created → maybe new
  // logs available too).
  useEffect(() => {
    if (!user?.id) return;
    apiRequest<{ logs: VisitLog[] }>('/api/guest-codes/scan-history')
      .then(res => setVisitLogs(res.logs || []))
      .catch(() => setVisitLogs([]))
      .finally(() => setLogsLoaded(true));
  }, [user?.id, guestAccessCodes.length]);

  // Filter logs to those tied to THIS resident's codes (last 30 entries).
  const myCodeIds = useMemo(() => new Set(guestAccessCodes.map(c => c.id)), [guestAccessCodes]);
  const myVisitLogs = useMemo(
    () => visitLogs.filter(log => myCodeIds.has(log.code_id)).slice(0, 30),
    [visitLogs, myCodeIds]
  );

  const allCodes = guestAccessCodes;

  // Update expired status
  const now = new Date();
  const codes = allCodes.map(c => {
    if (c.status === 'active' && now > new Date(c.validUntil)) {
      return { ...c, status: 'expired' as const };
    }
    return c;
  });

  // Archive cutoff: 30 days. Expired/used codes older than this go to "Архив" tab,
  // not cluttering "Все".
  const ARCHIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;
  const archiveCutoffDate = new Date(now.getTime() - ARCHIVE_CUTOFF_MS);

  function isArchived(c: typeof codes[number]): boolean {
    if (c.status === 'active') return false;
    const until = new Date(c.validUntil);
    return until < archiveCutoffDate;
  }

  const filteredCodes =
    filter === 'all'
      ? codes.filter(c => !isArchived(c))
      : filter === 'archive'
        ? codes.filter(isArchived)
        : codes.filter(c => c.status === filter && !isArchived(c));

  const activeCodes = codes.filter(c => c.status === 'active');

  // Pick the latest pass to feature at the top of the page.
  // Active passes win over historical ones — that's what the resident is most
  // likely to hand off right now. Within each group, sort by createdAt desc.
  const latestPass = useMemo(() => {
    const byCreated = (a: typeof codes[number], b: typeof codes[number]) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const activeSorted = [...activeCodes].sort(byCreated);
    if (activeSorted[0]) return activeSorted[0];
    const recentSorted = [...codes].filter(c => !isArchived(c)).sort(byCreated);
    return recentSorted[0] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isArchived depends on `now` which we don't want to track
  }, [codes, activeCodes]);

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
      language === 'ru' ? 'Отменено жителем' : 'Turar joy egasi tomonidan bekor qilindi'
    );
    setShowRevokeConfirm(null);
  };

  // Two views: "active" (recent, non-archived) shown on main screen,
  // "archive" opened via the "История →" link as a separate sheet/list.
  const recentCodes = codes.filter(c => !isArchived(c));
  const archivedCodes = codes.filter(isArchived);
  const visibleCodes = showHistorySheet ? archivedCodes : recentCodes;
  // Keep `filter` reachable so we don't break it; not surfaced in UI now.
  void filter; void filteredCodes;

  return (
    <div className="space-y-4 md:space-y-5 pb-24 md:pb-0">
      {/* Header — eyebrow + big title + history shortcut */}
      <div className="flex items-end justify-between gap-4 px-3 md:px-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {language === 'ru' ? 'QR-доступ' : 'QR-kirish'}
          </div>
          <h1 className="text-[22px] md:text-[26px] leading-tight font-extrabold text-gray-900 mt-0.5">
            {language === 'ru' ? 'Гости и доставка' : 'Mehmonlar va yetkazib berish'}
          </h1>
        </div>
        <button
          onClick={() => setShowHistorySheet(s => !s)}
          className="w-11 h-11 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center text-gray-600 active:scale-[0.95] transition-transform touch-manipulation shrink-0"
          aria-label={language === 'ru' ? 'История' : 'Tarix'}
          title={language === 'ru' ? 'История' : 'Tarix'}
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      {/* Latest pass hero — boarding-pass styled card so the resident can
          show/hand off the active QR without scrolling the list. */}
      {latestPass && !showHistorySheet && (
        <LatestPassHero
          code={latestPass}
          onOpen={() => setSelectedCode(latestPass)}
          onRevoke={() => setShowRevokeConfirm(latestPass)}
        />
      )}

      {/* Quick-create tiles: 2x2 grid of common scenarios */}
      {!showHistorySheet && (
        <QuickCreateTiles
          onPick={(p) => {
            setCreatePreset({ visitor: p.visitor, access: p.access });
            setShowCreateForm(true);
          }}
        />
      )}

      {/* Section header for the codes list */}
      <div className="flex items-center justify-between px-4 md:px-1 pt-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {showHistorySheet
            ? (language === 'ru' ? 'Архив' : 'Arxiv')
            : (language === 'ru' ? 'Все коды' : 'Barcha kodlar')}
        </div>
        {archivedCodes.length > 0 && (
          <button
            onClick={() => setShowHistorySheet(s => !s)}
            className="text-[12px] font-bold flex items-center gap-1 active:opacity-70 transition-opacity touch-manipulation"
            style={{ color: 'rgb(var(--brand-rgb))' }}
          >
            {showHistorySheet
              ? (language === 'ru' ? '← Назад' : '← Orqaga')
              : (language === 'ru' ? 'История →' : 'Tarix →')}
          </button>
        )}
      </div>

      {/* Codes list */}
      {isLoadingGuestCodes ? (
        <div className="bg-white rounded-[14px] p-8 text-center mx-3 md:mx-0">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center animate-pulse">
            <QrCode className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="font-medium text-gray-500">
            {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
          </h3>
        </div>
      ) : visibleCodes.length === 0 ? (
        <div className="px-3 md:px-0">
          <EmptyState
            icon={<QrCode className="w-12 h-12" />}
            title={showHistorySheet
              ? (language === 'ru' ? 'Архив пуст' : 'Arxiv bo\'sh')
              : (language === 'ru' ? 'Пропусков нет' : 'Ruxsatnomalar yo\'q')}
            description={showHistorySheet
              ? (language === 'ru' ? 'Старые пропуска появятся здесь через 30 дней' : 'Eski ruxsatnomalar 30 kundan keyin paydo bo\'ladi')
              : (language === 'ru' ? 'Создайте пропуск через карточки выше' : 'Yuqoridagi kartochkalar orqali ruxsatnoma yarating')}
          />
        </div>
      ) : (
        <div className="px-3 md:px-0 bg-white rounded-[14px] divide-y divide-gray-100 overflow-hidden mx-3 md:mx-0">
          {visibleCodes.map((code) => {
            const visitorLabel = safeVisitorLabel(code.visitorType);
            const accessLabel = safeAccessLabel(code.accessType);
            const isExpired = code.status === 'expired';
            const isRevoked = code.status === 'revoked';
            const isUsed = code.status === 'used';
            const headline = code.visitorName || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz);
            const until = new Date(code.validUntil);
            const isToday = until.toDateString() === new Date().toDateString();
            const untilStr = isToday
              ? (language === 'ru' ? `до ${until.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} сегодня` : `bugun ${until.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} gacha`)
              : (language === 'ru' ? `до ${until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : `${until.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })} gacha`);
            const usesPart = code.maxUses > 1 ? ` · ${code.currentUses}/${code.maxUses}` : '';
            const accessPart = ` · ${language === 'ru' ? accessLabel.label : accessLabel.labelUz}`;

            const pillBg =
              code.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
              isUsed ? 'bg-blue-50 text-blue-600' :
              isRevoked ? 'bg-red-50 text-red-600' :
              'bg-gray-100 text-gray-500';
            const pillText =
              code.status === 'active' ? (language === 'ru' ? 'Активен' : 'Faol') :
              isUsed ? (language === 'ru' ? 'Использован' : 'Ishlatilgan') :
              isRevoked ? (language === 'ru' ? 'Отозван' : 'Bekor') :
              (language === 'ru' ? 'Истёк' : 'Tugagan');
            const iconBg =
              code.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
              isUsed ? 'bg-blue-50 text-blue-600' :
              isRevoked ? 'bg-red-50 text-red-600' :
              'bg-gray-100 text-gray-500';

            return (
              <button
                key={code.id}
                onClick={() => setSelectedCode(code)}
                className={`w-full p-3 flex items-center gap-3 text-left active:bg-gray-50 transition-colors touch-manipulation ${
                  isExpired || isRevoked ? 'opacity-70' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                  <span className="text-base leading-none">{visitorLabel.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[14px] text-gray-900 truncate">
                    {headline}
                  </div>
                  <div className="text-[12px] text-gray-500 truncate">
                    {untilStr}{usesPart}{accessPart}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 ${pillBg}`}>
                  {pillText}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Visit history — answers 'кто и когда заходил по моему QR'.
          Hidden until the resident has at least one code in the system,
          otherwise the section is just an empty cup. */}
      {logsLoaded && guestAccessCodes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" />
              <span className="text-[13px] font-bold text-gray-700">
                {language === 'ru' ? 'История посещений' : 'Tashriflar tarixi'}
              </span>
              {myVisitLogs.length > 0 && (
                <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {myVisitLogs.length}
                </span>
              )}
            </div>
          </div>

          {myVisitLogs.length === 0 ? (
            <div className="bg-white rounded-[14px] p-4 text-center text-[12px] text-gray-400">
              {language === 'ru'
                ? 'Здесь появятся записи когда кто-то зайдёт по вашему QR'
                : 'Sizning QR orqali kim kirsa, bu yerda paydo bo\'ladi'}
            </div>
          ) : (
            <div className="bg-white rounded-[14px] divide-y divide-gray-100 overflow-hidden">
              {myVisitLogs.map(log => {
                const isAllowed = log.action === 'entry_allowed';
                const visitor = safeVisitorLabel(log.visitor_type);
                const ts = new Date(log.scanned_at);
                const timeStr = ts.toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                });
                return (
                  <div key={log.id} className="p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isAllowed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {isAllowed
                        ? <CheckCircle2 className="w-4 h-4" />
                        : <XCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-gray-900 truncate">
                        {visitor.icon} {language === 'ru' ? visitor.label : visitor.labelUz}
                        {' · '}
                        <span className={isAllowed ? 'text-green-600' : 'text-red-600'}>
                          {isAllowed
                            ? (language === 'ru' ? 'пропущен' : 'kirgan')
                            : (language === 'ru' ? 'отказ' : 'rad etilgan')}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {timeStr}
                        {log.scanned_by_name && (
                          <>{' · '}{language === 'ru' ? 'охрана' : 'qo\'riqchi'}: {log.scanned_by_name}</>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
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
          : 'Ruxsatnoma o\'chiriladi va ishlatib bo\'lmaydi'}
        confirmLabel={language === 'ru' ? 'Да, отменить' : 'Ha, bekor qilish'}
        cancelLabel={language === 'ru' ? 'Нет' : 'Yo\'q'}
        onClose={() => setShowRevokeConfirm(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
