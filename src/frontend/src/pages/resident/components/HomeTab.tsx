import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Wrench, ArrowRight, MessageCircle, QrCode,
  ShoppingBag, Car, Users, Wallet, Vote, Star, ScrollText,
  FileText, Megaphone
} from 'lucide-react';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { generateReconciliationDoc } from '../../../utils/generateFinanceDocs';
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

  return (
    <div className="space-y-3 px-2.5 md:px-0">

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

      {/* Actions Section */}
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
        {language === 'ru' ? 'Действия' : 'Amallar'}
      </div>

      {/* Hero card */}
      <button
        onClick={() => setShowAllServices(true)}
        className="w-full bg-white rounded-[22px] p-[17px_18px] flex items-center gap-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-all touch-manipulation relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.05) 0%, transparent 55%)' }} />
        <div className="w-[52px] h-[52px] shrink-0 rounded-[16px] flex items-center justify-center bg-primary-50">
          <Wrench className="w-[26px] h-[26px] text-primary-500" strokeWidth={1.8} />
        </div>
        <div className="flex-1 text-left relative z-10">
          <div className="text-[17px] font-extrabold text-gray-900 tracking-tight">{language === 'ru' ? 'Вызвать мастера' : 'Usta chaqirish'}</div>
          <div className="text-[12px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Заявка на ремонт · Быстро' : 'Ta\'mirlash arizasi · Tez'}</div>
        </div>
        <div className="w-8 h-8 rounded-[10px] bg-primary-50 flex items-center justify-center shrink-0">
          <ArrowRight className="w-[15px] h-[15px] text-primary-500" />
        </div>
      </button>

      {/* 2-col: Chat + Guests */}
      <div className="grid grid-cols-2 gap-[10px]">
        <button
          onClick={() => navigate('/chat')}
          className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.94] transition-transform touch-manipulation"
        >
          <div className="w-[42px] h-[42px] rounded-[13px] bg-primary-50 flex items-center justify-center mb-[11px]">
            <MessageCircle className="w-[21px] h-[21px] text-primary-500" strokeWidth={1.8} />
          </div>
          <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Чат' : 'Chat'}</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Написать в УК' : 'UK ga yozish'}</div>
        </button>
        <button
          onClick={() => navigate('/guest-access')}
          className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.94] transition-transform touch-manipulation"
        >
          <div className="w-[42px] h-[42px] rounded-[13px] bg-green-50 flex items-center justify-center mb-[11px]">
            <QrCode className="w-[21px] h-[21px] text-green-500" strokeWidth={1.8} />
          </div>
          <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Гости' : 'Mehmonlar'}</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'QR-пропуск' : 'QR-ruxsatnoma'}</div>
        </button>
      </div>

      {/* Wide card: Marketplace */}
      <button
        onClick={() => navigate('/marketplace')}
        className="w-full bg-white rounded-[18px] p-[14px_16px] flex items-center gap-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform touch-manipulation"
      >
        <div className="w-[42px] h-[42px] rounded-[13px] bg-purple-50 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-[21px] h-[21px] text-purple-500" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Магазин' : 'Do\'kon'}</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Товары для дома · Быстрая доставка' : 'Uy uchun mahsulotlar'}</div>
        </div>
        <ChevronRight className="w-[15px] h-[15px] text-gray-300" />
      </button>

      {/* 2-col: Auto + Contacts */}
      <div className="grid grid-cols-2 gap-[10px]">
        <button
          onClick={() => navigate('/vehicles')}
          className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.94] transition-transform touch-manipulation"
        >
          <div className="w-[42px] h-[42px] rounded-[13px] bg-amber-50 flex items-center justify-center mb-[11px]">
            <Car className="w-[21px] h-[21px] text-amber-500" strokeWidth={1.8} />
          </div>
          <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Мои авто' : 'Avtomobillarim'}</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Реестр авто' : 'Avto ro\'yxati'}</div>
        </button>
        <button
          onClick={() => navigate('/useful-contacts')}
          className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.94] transition-transform touch-manipulation"
        >
          <div className="w-[42px] h-[42px] rounded-[13px] bg-primary-50 flex items-center justify-center mb-[11px]">
            <Users className="w-[21px] h-[21px] text-primary-500" strokeWidth={1.8} />
          </div>
          <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Контакты' : 'Kontaktlar'}</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Полезные' : 'Foydali'}</div>
        </button>
      </div>

      {/* Communal Payments Card */}
      <button
        className="w-full bg-white rounded-[22px] p-[17px_18px] flex items-center gap-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-all touch-manipulation relative overflow-hidden"
      >
        <div className="w-[52px] h-[52px] shrink-0 rounded-[16px] flex items-center justify-center bg-emerald-50">
          <Wallet className="w-[26px] h-[26px] text-emerald-500" strokeWidth={1.8} />
        </div>
        <div className="flex-1 text-left">
          <div className="text-[17px] font-extrabold text-gray-900 tracking-tight">{language === 'ru' ? 'Ком. услуги' : 'Kommunal xizmatlar'}</div>
          <div className="text-[12px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Оплата · Квитанции · Счета' : 'To\'lov · Kvitansiyalar · Hisoblar'}</div>
        </div>
        <span className="px-2.5 py-1 rounded-[8px] bg-emerald-50 text-[10px] font-bold text-emerald-600 uppercase tracking-wide shrink-0">
          {language === 'ru' ? 'Скоро' : 'Tez kunda'}
        </span>
      </button>

      {/* News - Announcements & Meetings */}
      {(latestAnnouncements.length > 0 || activeMeetings.length > 0) && (
        <div className="space-y-2.5">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
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
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-[3px] ${isVoting ? 'text-primary-500' : 'text-green-600'}`}>
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
                <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 font-medium">{ann.content}</div>
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
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.8px]">
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
                  <p className="text-[11px] text-gray-400 font-medium">{language === 'ru' ? 'Баланс' : 'Balans'}</p>
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

      {/* More Services - small grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.8px]">
            {language === 'ru' ? 'Ещё' : 'Yana'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-[10px]">
          {[
            { icon: Vote, label: language === 'ru' ? 'Собрания' : 'Yig\'ilish', color: '#F59E0B', bg: 'bg-amber-50', action: () => navigate('/meetings'), badge: activeMeetings.length > 0 ? activeMeetings.length : undefined },
            { icon: Star, label: language === 'ru' ? 'Оценить' : 'Baholash', color: '#EAB308', bg: 'bg-yellow-50', action: () => navigate('/rate-employees') },
            { icon: ScrollText, label: language === 'ru' ? 'Договор' : 'Shartnoma', color: '#6B7280', bg: 'bg-gray-100', action: () => navigate('/contract') },
            { icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', color: '#3B82F6', bg: 'bg-primary-50', action: () => switchTab('requests') },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={item.action}
                className="bg-white rounded-[18px] p-3.5 flex flex-col items-center gap-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] relative active:scale-[0.94] transition-transform touch-manipulation"
              >
                <div className={`w-[42px] h-[42px] rounded-[13px] ${item.bg} flex items-center justify-center`}>
                  <Icon className="w-[21px] h-[21px]" style={{ color: item.color }} strokeWidth={1.8} />
                </div>
                {item.badge && (
                  <span className="absolute top-2 right-2 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {item.badge}
                  </span>
                )}
                <span className="text-[11px] font-bold text-gray-900 text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
