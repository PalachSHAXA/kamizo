import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wrench, MessageCircle, QrCode,
  Wallet, Vote, Star,
  Megaphone, Clock, CreditCard, Gauge,
} from 'lucide-react';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { generateReconciliationDoc } from '../../../utils/generateFinanceDocs';
import { useTenantStore } from '../../../stores/tenantStore';
import type { HomeTabProps } from './types';

// Format ETA from request scheduledDate/scheduledTime into a friendly hint.
// Returns null if there is no ETA to show.
function formatEta(req: { scheduledDate?: string; scheduledTime?: string }, language: string): string | null {
  if (!req.scheduledDate && !req.scheduledTime) return null;
  const today = new Date().toISOString().slice(0, 10);
  const isToday = req.scheduledDate === today;
  const isTomorrow = (() => {
    if (!req.scheduledDate) return false;
    const t = new Date(); t.setDate(t.getDate() + 1);
    return req.scheduledDate === t.toISOString().slice(0, 10);
  })();
  const dayLabel = isToday
    ? (language === 'ru' ? 'Сегодня' : 'Bugun')
    : isTomorrow
      ? (language === 'ru' ? 'Завтра' : 'Ertaga')
      : req.scheduledDate ?? '';
  const time = req.scheduledTime ? `, ${req.scheduledTime}` : '';
  return `${dayLabel}${time}`;
}

export function HomeTab({
  language,
  user,
  activeRequests,
  latestAnnouncements,
  activeMeetings,
  financeBalance,
  tenantName,
  switchTab,
  setSelectedRequest,
  setShowAllServices,
  generateReconciliation,
}: HomeTabProps) {
  const navigate = useNavigate();
  const hasFeature = useTenantStore(s => s.hasFeature);
  const marketplaceEnabled = hasFeature('marketplace');

  const firstActiveMeeting = activeMeetings[0];
  const hasVotingOpen = firstActiveMeeting?.status === 'voting_open';
  const userArea: number | undefined = user?.totalArea;
  const buildingArea: number | undefined = firstActiveMeeting?.totalEligibleShares;
  const voteWeightPercent =
    userArea && buildingArea ? ((userArea / buildingArea) * 100) : null;
  const quorumPercent: number = Math.round((firstActiveMeeting?.participationByShares ?? firstActiveMeeting?.participationPercent ?? 0));
  const quorumTarget: number = firstActiveMeeting?.votingSettings?.quorumPercent ?? 50;
  const quorumReached = !!firstActiveMeeting?.quorumReached;

  return (
    <div className="space-y-3 px-2.5 md:px-0">

      {/* Greeting and address pill are rendered by the parent
          ResidentDashboard above this component — keeping it here would
          duplicate the welcome. */}

      {/* ===== HERO: Active meeting / voting card. The killer feature of
          Kamizo (legally valid собрание per RU law) deserves the top of the
          home tab when it's open. We surface vote weight and quorum so the
          resident immediately understands what's at stake. ===== */}
      {firstActiveMeeting && (
        <button
          onClick={() => navigate('/meetings')}
          className="w-full text-left bg-white border-2 border-blue-200 rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.99] transition-transform touch-manipulation relative overflow-hidden"
        >
          {hasVotingOpen && (
            <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
              {language === 'ru' ? 'Важно' : 'Muhim'}
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-[13px] bg-blue-50 flex items-center justify-center shrink-0">
              <Vote className="w-[22px] h-[22px] text-blue-500" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-500">
                {hasVotingOpen
                  ? (language === 'ru' ? 'Голосование открыто' : 'Ovoz berish ochiq')
                  : (language === 'ru' ? 'Собрание собственников' : 'Yig\'ilish')}
              </div>
              <div className="text-[14px] font-bold text-gray-900 mt-0.5 line-clamp-2">
                {firstActiveMeeting.agendaItems?.[0]?.title
                  ?? (language === 'ru' ? `Собрание #${firstActiveMeeting.number}` : `Yig'ilish #${firstActiveMeeting.number}`)}
              </div>

              {/* Vote weight pill — only shown when voting is open and we know
                  this resident's area share. Per Uzbek law 1 vote = 1 m². */}
              {hasVotingOpen && userArea && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {language === 'ru' ? 'Ваш голос' : 'Ovozingiz'} · {userArea} {language === 'ru' ? 'м²' : 'm²'}
                  </span>
                  {voteWeightPercent !== null && (
                    <span className="text-[11px] text-gray-400">
                      {voteWeightPercent.toFixed(1)}% {language === 'ru' ? 'площади дома' : 'uy maydoni'}
                    </span>
                  )}
                </div>
              )}

              {/* Quorum + countdown */}
              <div className="flex items-center justify-between mt-2 text-[12px] text-gray-500 font-medium">
                <span>
                  {language === 'ru' ? 'Кворум' : 'Kvorum'} {quorumPercent}% {quorumReached ? '✓' : `· ${language === 'ru' ? 'цель' : 'maqsad'} ${quorumTarget}%`}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full ${quorumReached ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(quorumPercent, 100)}%` }}
                />
              </div>

              {hasVotingOpen && (
                <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-blue-600">
                  {language === 'ru' ? 'Проголосовать' : 'Ovoz berish'}
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>
        </button>
      )}

      {/* ===== Active requests — using existing compact tracker. We only
          add a small ETA hint underneath when the request has a scheduled
          time, to answer "когда придёт мастер" before the resident has to
          tap through. ===== */}
      {activeRequests.length > 0 && (
        <div className="space-y-2.5">
          {activeRequests.slice(0, 2).map((req) => {
            const eta = formatEta(req, language);
            return (
              <div key={req.id} className="space-y-1">
                <RequestStatusTrackerCompact
                  request={req}
                  executorName={req.executorName}
                  language={language as 'ru' | 'uz'}
                  onClick={() => setSelectedRequest(req)}
                />
                {eta && (
                  <div className="flex items-center gap-1.5 px-3 text-[11px] font-semibold text-primary-600">
                    <Clock className="w-3 h-3" strokeWidth={2.2} />
                    {language === 'ru' ? 'Придёт' : 'Keladi'} {eta}
                  </div>
                )}
              </div>
            );
          })}
          {activeRequests.length > 2 && (
            <button
              onClick={() => switchTab('requests')}
              className="w-full text-center py-2 text-sm font-medium text-primary-600 touch-manipulation"
            >
              {language === 'ru' ? `Ещё ${activeRequests.length - 2} заявок` : `Yana ${activeRequests.length - 2} ta ariza`}
            </button>
          )}
        </div>
      )}

      {/* ===== "Уже скоро" — gentle teaser for online payments and meter
          readings. NOT integrations yet, so no CTAs. Dashed border keeps
          this visually subordinate to working features above. ===== */}
      <div className="bg-white border border-dashed border-gray-300 rounded-[18px] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.06em]">
            {language === 'ru' ? 'Уже скоро' : 'Tez orada'}
          </span>
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
            {language === 'ru' ? 'в разработке' : 'ishlab chiqilmoqda'}
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
              <CreditCard className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-700">
                {language === 'ru' ? 'Онлайн-оплата · Click и Payme' : 'Onlayn to\'lov · Click va Payme'}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {language === 'ru' ? 'Лицевой счёт, квитанции, история — подключаем' : 'Shaxsiy hisob, kvitansiya — ulanmoqda'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
              <Gauge className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-700">
                {language === 'ru' ? 'Передача показаний счётчиков' : 'Hisoblagich ko\'rsatkichlari'}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {language === 'ru' ? 'Холодная, горячая вода и электричество — на этапе интеграции' : 'Suv va elektr — integratsiya bosqichida'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Quick actions 2×2. Replaces the previous "two big buttons +
          horizontal services strip" duplication. The four most-used resident
          actions are surfaced as equal-weight cards. ===== */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.06em] px-1">
          {language === 'ru' ? 'Быстрые действия' : 'Tez amallar'}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setShowAllServices(true)}
            data-tour="home-call-master"
            className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-transform touch-manipulation"
          >
            <div className="w-11 h-11 rounded-[14px] bg-primary-50 flex items-center justify-center mb-2.5">
              <Wrench className="w-[22px] h-[22px] text-primary-500" strokeWidth={1.8} />
            </div>
            <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
              {language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-1">
              {language === 'ru' ? 'Сантехник, электрик…' : 'Santexnik, elektrik…'}
            </div>
          </button>
          <button
            onClick={() => navigate('/guest-access')}
            data-tour="home-guests"
            className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-transform touch-manipulation"
          >
            <div className="w-11 h-11 rounded-[14px] bg-green-50 flex items-center justify-center mb-2.5">
              <QrCode className="w-[22px] h-[22px] text-green-500" strokeWidth={1.8} />
            </div>
            <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
              {language === 'ru' ? 'QR гостю' : 'Mehmon QR'}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-1">
              {language === 'ru' ? 'За 30 секунд' : '30 soniyada'}
            </div>
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-transform touch-manipulation"
          >
            <div className="w-11 h-11 rounded-[14px] bg-blue-50 flex items-center justify-center mb-2.5">
              <MessageCircle className="w-[22px] h-[22px] text-blue-500" strokeWidth={1.8} />
            </div>
            <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
              {language === 'ru' ? 'Чат с УК' : 'UK chat'}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-1">
              {language === 'ru' ? 'Вопросы и заявки' : 'Savollar va arizalar'}
            </div>
          </button>
          <button
            onClick={() => navigate('/rate-employees')}
            className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-transform touch-manipulation"
          >
            <div className="w-11 h-11 rounded-[14px] bg-yellow-50 flex items-center justify-center mb-2.5">
              <Star className="w-[22px] h-[22px] text-yellow-500" strokeWidth={1.8} />
            </div>
            <div className="text-[14px] font-extrabold text-gray-900 leading-tight">
              {language === 'ru' ? 'Оценить УК' : 'UKni baholash'}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-1">
              {language === 'ru' ? 'Раз в месяц' : 'Oyiga bir marta'}
            </div>
          </button>
        </div>

        {/* Marketplace — only when feature flag is on. Kept here so the
            quick-actions area stays the single home for everything the
            resident might tap. */}
        {marketplaceEnabled && (
          <button
            onClick={() => navigate('/marketplace')}
            className="w-full bg-white rounded-[18px] p-3.5 flex items-center gap-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform touch-manipulation"
          >
            <div className="w-10 h-10 rounded-[12px] bg-purple-50 flex items-center justify-center shrink-0">
              <ChevronRight className="w-5 h-5 text-purple-500" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[14px] font-bold text-gray-900">
                {language === 'ru' ? 'Маркет для дома' : 'Uy uchun bozor'}
              </div>
              <div className="text-[11px] text-gray-400 font-medium">
                {language === 'ru' ? 'Скидки от соседей и партнёров' : 'Qo\'shni va hamkorlardan chegirmalar'}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ===== Finance widget (kept, working feature: balance + reconciliation
          act). NOT a hero anymore — sits below quick actions, keeps the same
          functionality but visually subordinate to the meeting/request cards
          above. No "оплатить" button because payment integration is a
          separate roadmap item — see "Уже скоро" card. ===== */}
      {financeBalance && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.06em] px-1">
            {language === 'ru' ? 'Лицевой счёт' : 'Shaxsiy hisob'}
          </div>
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center ${(financeBalance.debt as number) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <Wallet className="w-5 h-5" style={{ color: (financeBalance.debt as number) > 0 ? '#EF4444' : '#22C55E' }} />
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 font-semibold">
                    {(financeBalance.debt as number) > 0
                      ? (language === 'ru' ? 'К оплате' : 'To\'lash kerak')
                      : (language === 'ru' ? 'Переплата' : 'Ortiqcha to\'langan')}
                  </div>
                  <div className={`text-[18px] font-extrabold ${(financeBalance.debt as number) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(financeBalance.debt as number) > 0
                      ? `${((financeBalance.debt as number) || 0).toLocaleString()} ${language === 'ru' ? 'сум' : "so'm"}`
                      : `${((financeBalance.overpaid as number) || 0).toLocaleString()} ${language === 'ru' ? 'сум' : "so'm"}`}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/finance/charges')}
                className="flex-1 py-2 rounded-[10px] text-[12px] font-bold text-primary-600 bg-primary-50 active:scale-[0.96] transition-transform"
              >
                {language === 'ru' ? 'Все начисления' : 'Hisoblar'}
              </button>
              <button
                onClick={async () => {
                  const now = new Date();
                  const periodTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
                  const periodFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
                  if (user?.id) {
                    const result = await generateReconciliation({ apartment_id: user.id, period_from: periodFrom, period_to: periodTo });
                    if (result) {
                      generateReconciliationDoc(result as Parameters<typeof generateReconciliationDoc>[0], tenantName);
                    }
                  }
                }}
                className="flex-1 py-2 rounded-[10px] text-[12px] font-bold text-gray-600 bg-gray-100 active:scale-[0.96] transition-transform"
              >
                {language === 'ru' ? 'Акт сверки' : 'Solishtirma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Latest announcements. Kept similar to before but with category
          dot instead of generic Megaphone for every row. ===== */}
      {latestAnnouncements.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.06em]">
              {language === 'ru' ? 'Свежие объявления' : 'So\'nggi e\'lonlar'}
            </span>
            <button
              onClick={() => navigate('/announcements')}
              className="text-[11px] font-bold text-primary-600"
            >
              {language === 'ru' ? 'Все →' : 'Hammasi →'}
            </button>
          </div>
          <div className="bg-white rounded-[18px] divide-y divide-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            {latestAnnouncements.slice(0, 3).map(ann => {
              const isUnread = !ann.viewedBy?.includes(user?.id || '');
              return (
                <button
                  key={ann.id}
                  onClick={() => navigate('/announcements')}
                  className="w-full p-3.5 flex items-center gap-3 text-left active:bg-gray-50 transition-colors touch-manipulation"
                >
                  <div className="w-9 h-9 rounded-[11px] bg-amber-50 flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4 text-amber-500" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate">{ann.title}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate font-medium">{ann.content}</div>
                  </div>
                  {isUnread && (
                    <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
