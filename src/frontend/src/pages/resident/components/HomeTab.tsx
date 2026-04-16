import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wrench, MessageCircle, QrCode,
  ShoppingBag, Car, Users, Wallet, Vote, Star, ScrollText,
  Megaphone
} from 'lucide-react';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { generateReconciliationDoc } from '../../../utils/generateFinanceDocs';
import { useTenantStore } from '../../../stores/tenantStore';
import type { HomeTabProps } from './types';

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

  return (
    <div className="space-y-2 px-2.5 md:px-0">

      {/* Active Requests - using RequestStatusTrackerCompact */}
      {activeRequests.length > 0 && (
        <div className="space-y-2.5">
          {activeRequests.slice(0, 2).map((req) => (
            <RequestStatusTrackerCompact
              key={req.id}
              request={req}
              executorName={req.executorName}
              language={language}
              onClick={() => setSelectedRequest(req)}
            />
          ))}
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

      {/* Two primary JTBD buttons — the "Вызвать мастера" hero used to sit
          above a 2-col grid of Chat/Guests + a marketplace row + a second
          2-col grid, duplicating the + FAB and adding five tiles the user
          rarely needed on every visit. The two core resident jobs are:
          (1) create a request, (2) issue a guest pass — everything else
          moves into the horizontal "Мои сервисы" strip below. */}
      <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
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
            {language === 'ru' ? 'Сантехник · Электрик · Уборка' : 'Santexnik · Elektrik · Tozalash'}
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
            {language === 'ru' ? 'Гостевой пропуск' : 'Mehmon ruxsatnomasi'}
          </div>
          <div className="text-[11px] text-gray-500 font-medium mt-1">
            {language === 'ru' ? 'QR для гостей и курьеров' : 'Mehmon va kuryer uchun QR'}
          </div>
        </button>
      </div>

      {/* Horizontal services strip — everything beyond the two primary JTBDs
          collapses into a scrollable row so the dashboard stops growing
          vertically every time we add a tile. */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
          {language === 'ru' ? 'Мои сервисы' : 'Mening xizmatlarim'}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-2.5 px-2.5 md:mx-0 md:px-0">
          {[
            { onClick: () => navigate('/chat'), icon: MessageCircle, iconBg: 'bg-primary-50', iconColor: 'text-primary-500', label: language === 'ru' ? 'Чат с УК' : 'UK chat' },
            { onClick: () => navigate('/announcements'), icon: Megaphone, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', label: language === 'ru' ? 'Объявления' : 'E\'lonlar' },
            { onClick: () => navigate('/contract'), icon: ScrollText, iconBg: 'bg-gray-100', iconColor: 'text-gray-600', label: language === 'ru' ? 'Договор' : 'Shartnoma' },
            { onClick: () => navigate('/vehicles'), icon: Car, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', label: language === 'ru' ? 'Мои авто' : 'Avto' },
            { onClick: () => navigate('/useful-contacts'), icon: Users, iconBg: 'bg-primary-50', iconColor: 'text-primary-500', label: language === 'ru' ? 'Контакты' : 'Kontaktlar' },
            { onClick: () => navigate('/rate-employees'), icon: Star, iconBg: 'bg-yellow-50', iconColor: 'text-yellow-500', label: language === 'ru' ? 'Оценить' : 'Baholash' },
            ...(marketplaceEnabled ? [{ onClick: () => navigate('/marketplace'), icon: ShoppingBag, iconBg: 'bg-purple-50', iconColor: 'text-purple-500', label: language === 'ru' ? 'Магазин' : 'Do\'kon' }] : []),
          ].map((svc, i) => {
            const Icon = svc.icon;
            return (
              <button
                key={i}
                onClick={svc.onClick}
                className="flex-shrink-0 bg-white rounded-[14px] p-2.5 min-w-[92px] flex flex-col items-center gap-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] active:scale-[0.96] transition-transform touch-manipulation"
              >
                <div className={`w-10 h-10 rounded-[11px] ${svc.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-[18px] h-[18px] ${svc.iconColor}`} strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-semibold text-gray-900 text-center leading-tight line-clamp-2">{svc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* News - Announcements & Meetings */}
      {(latestAnnouncements.length > 0 || activeMeetings.length > 0) && (
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
            {language === 'ru' ? 'Новости дома' : 'Uy yangiliklari'}
          </div>

          {activeMeetings.slice(0, 1).map(meeting => {
            const isVoting = meeting.status === 'voting_open';
            const meetingTitle = meeting.agendaItems?.[0]?.title || (language === 'ru' ? `Собрание #${meeting.number}` : `Yig'ilish #${meeting.number}`);
            return (
              <button
                key={meeting.id}
                onClick={() => navigate('/meetings')}
                className="w-full bg-white rounded-[18px] p-[14px_16px] flex items-center gap-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform touch-manipulation"
              >
                <div className={`w-11 h-11 rounded-[13px] flex items-center justify-center shrink-0 ${isVoting ? 'bg-primary-50' : 'bg-green-50'}`}>
                  <Vote className={`w-5 h-5 ${isVoting ? 'text-primary-500' : 'text-green-500'}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-[3px] ${isVoting ? 'text-primary-500' : 'text-green-600'}`}>
                    {isVoting
                      ? (language === 'ru' ? '🗳 Голосование открыто' : '🗳 Ovoz berish ochiq')
                      : (language === 'ru' ? 'Собрание' : 'Yig\'ilish')}
                  </div>
                  <div className="text-[14px] font-bold text-gray-900 line-clamp-1">{meetingTitle}</div>
                </div>
                <ChevronRight className="w-[15px] h-[15px] text-gray-300 shrink-0" />
              </button>
            );
          })}

          {latestAnnouncements.slice(0, 2).map(ann => (
            <button
              key={ann.id}
              onClick={() => navigate('/announcements')}
              className="w-full bg-white rounded-[18px] p-[14px_16px] flex items-center gap-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform touch-manipulation"
            >
              <div className="w-11 h-11 rounded-[13px] bg-primary-50 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-primary-500" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[14px] font-bold text-gray-900 line-clamp-1">{ann.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 line-clamp-1 font-medium">{ann.content}</div>
              </div>
              {!ann.viewedBy?.includes(user?.id || '') && (
                <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Finance Widget */}
      {financeBalance && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px]">
              {language === 'ru' ? 'Финансы' : 'Moliya'}
            </span>
          </div>
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${(financeBalance.debt as number) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <Wallet className="w-5 h-5" style={{ color: (financeBalance.debt as number) > 0 ? '#EF4444' : '#22C55E' }} />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">{language === 'ru' ? 'Баланс' : 'Balans'}</p>
                  <p className={`text-[16px] font-bold ${(financeBalance.debt as number) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(financeBalance.debt as number) > 0
                      ? `${((financeBalance.debt as number) || 0).toLocaleString()} ${language === 'ru' ? 'сум долг' : "so'm qarz"}`
                      : `${((financeBalance.overpaid as number) || 0).toLocaleString()} ${language === 'ru' ? 'сум переплата' : "so'm ortiqcha"}`}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/finance/charges')}
                className="flex-1 py-2 rounded-xl text-[12px] font-bold text-primary-600 bg-primary-50 active:scale-[0.96] transition-transform"
              >
                {language === 'ru' ? 'Все платежи' : "Barcha to'lovlar"}
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
                className="flex-1 py-2 rounded-xl text-[12px] font-bold text-gray-600 bg-gray-100 active:scale-[0.96] transition-transform"
              >
                {language === 'ru' ? 'Акт сверки' : 'Solishtirma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Ещё" grid removed — those entries (Собрания, Оценить, Договор,
          Заявки) now live in the horizontal "Мои сервисы" strip above,
          or are already reachable via bottom-nav / drawer. Removing the
          4-col grid eliminates the duplicate tiles and cuts ~150px of
          vertical noise. */}
    </div>
  );
}
