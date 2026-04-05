import { Plus, FileText, CheckCircle, History, Filter } from 'lucide-react';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../../../types';
import { RequestStatusTrackerCompact } from '../../../components/RequestStatusTracker';
import { PageSkeleton } from '../../../components/PageSkeleton';
import { HistoryRequestCard } from './HistoryRequestCard';
import { PendingApprovalCard } from './PendingApprovalCard';
import type { RequestsTabProps } from './types';

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all touch-manipulation active:scale-[0.96] ${
    active
      ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.25)]'
      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
  }`;

export function RequestsTab({
  language,
  activeRequests,
  pendingApproval,
  historyRequests,
  requestsSubTab,
  setRequestsSubTab,
  showFilters,
  setShowFilters,
  filterCategory,
  setFilterCategory,
  filterPriority,
  setFilterPriority,
  isLoadingRequests,
  requestsCount,
  switchTab,
  setSelectedRequest,
  handleApproveClick,
}: RequestsTabProps) {
  return (
    <div className="space-y-4 px-3 md:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-extrabold text-gray-900 tracking-tight">{language === 'ru' ? 'Мои заявки' : 'Mening arizalarim'}</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-[12px] transition-all touch-manipulation active:scale-[0.96] ${
            showFilters || filterCategory !== 'all' || filterPriority !== 'all'
              ? 'bg-primary-500 text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
              : 'bg-white text-gray-500 shadow-[0_2px_8px_rgba(0,0,0,0.05)]'
          }`}
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-[16px] p-3 shadow-[0_2px_10px_rgba(0,0,0,0.04)] space-y-3">
          {/* Category filter */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
              {language === 'ru' ? 'Категория' : 'Kategoriya'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilterCategory('all')} className={chip('all' === filterCategory)}>
                {language === 'ru' ? 'Все' : 'Barchasi'}
              </button>
              {SERVICE_CATEGORIES.slice(0, 6).map(cat => (
                <button key={cat.id} onClick={() => setFilterCategory(cat.id)} className={chip(cat.id === filterCategory)}>
                  {cat.icon} {language === 'ru' ? cat.name : cat.nameUz}
                </button>
              ))}
            </div>
          </div>
          {/* Priority filter */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
              {language === 'ru' ? 'Приоритет' : 'Ustuvorlik'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilterPriority('all')} className={chip('all' === filterPriority)}>
                {language === 'ru' ? 'Все' : 'Barchasi'}
              </button>
              {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                <button key={p} onClick={() => setFilterPriority(p)} className={chip(p === filterPriority)}>
                  {language === 'ru' ? PRIORITY_LABELS[p] : PRIORITY_LABELS_UZ[p]}
                </button>
              ))}
            </div>
          </div>
          {/* Reset button */}
          {(filterCategory !== 'all' || filterPriority !== 'all') && (
            <button
              onClick={() => { setFilterCategory('all'); setFilterPriority('all'); }}
              className="text-[12px] text-primary-500 font-semibold"
            >
              {language === 'ru' ? 'Сбросить фильтры' : 'Filtrlarni tozalash'}
            </button>
          )}
        </div>
      )}

      {/* Sub-tabs inside requests */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {[
          { id: 'active', label: language === 'ru' ? 'Активные' : 'Faol', count: activeRequests.length },
          { id: 'pending_tab', label: language === 'ru' ? 'Подтвердить' : 'Tasdiqlash', count: pendingApproval.length },
          { id: 'history_tab', label: language === 'ru' ? 'История' : 'Tarix', count: historyRequests.length },
        ].map((sub) => (
          <button
            key={sub.id}
            onClick={() => setRequestsSubTab(sub.id as any)}
            className={`px-4 py-2 rounded-[12px] text-[13px] font-semibold whitespace-nowrap transition-all touch-manipulation active:scale-[0.96] ${
              requestsSubTab === sub.id
                ? 'bg-primary-500 text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
                : 'bg-white text-gray-500 shadow-[0_2px_8px_rgba(0,0,0,0.05)]'
            }`}
          >
            {sub.label}
            {sub.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                requestsSubTab === sub.id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {sub.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoadingRequests && requestsCount === 0 && (
        <PageSkeleton variant="list" />
      )}

      {/* Active requests */}
      {!isLoadingRequests && requestsSubTab === 'active' && (
        <div className="space-y-3">
          {activeRequests.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FileText className="w-8 h-8 text-primary-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">
                {language === 'ru' ? 'Нет заявок' : 'Arizalar yo\'q'}
              </h3>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'Нажмите + чтобы создать заявку' : 'Ariza yaratish uchun + bosing'}
              </p>
              <button
                onClick={() => switchTab('home')}
                className="mt-4 px-5 py-2.5 bg-primary-500 text-white rounded-[12px] text-[14px] font-semibold active:scale-[0.98] transition-transform touch-manipulation shadow-[0_4px_12px_rgba(var(--brand-rgb),0.25)] inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}
              </button>
            </div>
          ) : (
            activeRequests.map((request) => (
              <RequestStatusTrackerCompact
                key={request.id}
                request={request}
                executorName={request.executorName}
                language={language}
                onClick={() => setSelectedRequest(request)}
              />
            ))
          )}
        </div>
      )}

      {/* Pending approval */}
      {!isLoadingRequests && requestsSubTab === 'pending_tab' && (
        <div className="space-y-3">
          {pendingApproval.length === 0 ? (
            <div className="bg-white rounded-[18px] p-8 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-gray-500">{language === 'ru' ? 'Всё подтверждено' : 'Hammasi tasdiqlangan'}</h3>
            </div>
          ) : (
            pendingApproval.map((request) => (
              <PendingApprovalCard
                key={request.id}
                request={request}
                onApprove={() => handleApproveClick(request)}
              />
            ))
          )}
        </div>
      )}

      {/* History */}
      {!isLoadingRequests && requestsSubTab === 'history_tab' && (
        <div className="space-y-3">
          {historyRequests.length === 0 ? (
            <div className="bg-white rounded-[18px] p-8 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <History className="w-7 h-7 text-gray-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-gray-500">{language === 'ru' ? 'История пуста' : 'Tarix bo\'sh'}</h3>
            </div>
          ) : (
            historyRequests.map((request) => (
              <HistoryRequestCard
                key={request.id}
                request={request}
                onClick={() => setSelectedRequest(request)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
