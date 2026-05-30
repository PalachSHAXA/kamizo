import { Plus, FileText, Filter } from 'lucide-react';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../../../types';
import { PageSkeleton } from '../../../components/PageSkeleton';
import { RequestCardRedesign } from './RequestCardRedesign';
import type { RequestsTabProps, RequestsSubTab } from './types';

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
  openNewRequest,
}: RequestsTabProps) {
  const lang = (language === 'ru' ? 'ru' : 'uz') as 'ru' | 'uz';
  const handleCreateNew = () => {
    if (openNewRequest) openNewRequest();
    else switchTab('home');
  };
  const filtersActive = showFilters || filterCategory !== 'all' || filterPriority !== 'all';

  const subTabs: { id: RequestsSubTab; label: string; count: number }[] = [
    { id: 'active', label: language === 'ru' ? 'Активные' : 'Faol', count: activeRequests.length },
    { id: 'pending_tab', label: language === 'ru' ? 'На приёмке' : 'Qabulda', count: pendingApproval.length },
    { id: 'history_tab', label: language === 'ru' ? 'История' : 'Tarix', count: historyRequests.length },
  ];

  return (
    <div className="px-3 md:px-0">
      {/* Header — design §02: plain "Заявки" title + square filter toggle */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: 'var(--text-primary, #1C1917)' }}>
          {language === 'ru' ? 'Заявки' : 'Arizalar'}
        </h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-label={language === 'ru' ? 'Фильтры' : 'Filtrlar'}
          className="w-10 h-10 rounded-[12px] grid place-items-center transition-all touch-manipulation active:scale-[0.96]"
          style={
            filtersActive
              ? { background: 'var(--brand, #F97316)', color: '#fff', border: '1px solid var(--brand, #F97316)' }
              : { background: 'var(--surface, #fff)', color: 'var(--text-secondary, #6F6A62)', border: '1px solid var(--border-c, #E6DFD2)' }
          }
        >
          <Filter className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Segment control — 3 equal columns in a sunken track */}
      <div
        className="grid grid-cols-3 gap-1 mt-3.5 p-1 rounded-[14px]"
        style={{ background: 'var(--surface-sunken, #EDE7DB)' }}
      >
        {subTabs.map((t) => {
          const on = requestsSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setRequestsSubTab(t.id)}
              className="py-[9px] px-1.5 rounded-[10px] text-[13px] inline-flex items-center justify-center gap-1.5 transition-all touch-manipulation"
              style={
                on
                  ? { background: 'var(--surface, #fff)', color: 'var(--text-primary, #1C1917)', fontWeight: 750, boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))' }
                  : { background: 'transparent', color: 'var(--text-secondary, #6F6A62)', fontWeight: 600 }
              }
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className="min-w-[17px] h-[17px] px-[5px] rounded-full text-[10px] font-extrabold grid place-items-center"
                  style={on
                    ? { background: 'var(--brand, #F97316)', color: '#fff' }
                    : { background: 'var(--border-strong, #D8CFBE)', color: 'var(--text-secondary, #6F6A62)' }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter accordion */}
      {showFilters && (
        <div className="bg-white rounded-[16px] p-3 shadow-[0_2px_10px_rgba(0,0,0,0.04)] space-y-3 mt-3">
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

      {/* Loading */}
      {isLoadingRequests && requestsCount === 0 && (
        <div className="mt-4"><PageSkeleton variant="list" /></div>
      )}

      {/* Active */}
      {!isLoadingRequests && requestsSubTab === 'active' && (
        <div className="space-y-2.5 mt-4 stagger-children">
          {activeRequests.length === 0 ? (
            <EmptyState language={language} onNew={handleCreateNew} variant="active" />
          ) : (
            <>
              {activeRequests.map((request) => (
                <RequestCardRedesign
                  key={request.id}
                  request={request}
                  language={lang}
                  onOpen={() => setSelectedRequest(request)}
                />
              ))}
              <button
                onClick={handleCreateNew}
                className="w-full py-3.5 rounded-[16px] text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2 touch-manipulation active:scale-[0.99] transition-transform mt-1"
                style={{ background: 'var(--brand, #F97316)', boxShadow: 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))' }}
              >
                <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} />
                {language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Pending approval */}
      {!isLoadingRequests && requestsSubTab === 'pending_tab' && (
        <div className="space-y-2.5 mt-4 stagger-children">
          {pendingApproval.length === 0 ? (
            <EmptyState language={language} variant="pending" />
          ) : (
            pendingApproval.map((request) => (
              <RequestCardRedesign
                key={request.id}
                request={request}
                language={lang}
                onOpen={() => setSelectedRequest(request)}
                onApprove={() => handleApproveClick(request)}
              />
            ))
          )}
        </div>
      )}

      {/* History */}
      {!isLoadingRequests && requestsSubTab === 'history_tab' && (
        <div className="space-y-2.5 mt-4 stagger-children">
          {historyRequests.length === 0 ? (
            <EmptyState language={language} variant="history" />
          ) : (
            historyRequests.map((request) => (
              <RequestCardRedesign
                key={request.id}
                request={request}
                language={lang}
                onOpen={() => setSelectedRequest(request)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ language, onNew, variant }: { language: string; onNew?: () => void; variant: 'active' | 'pending' | 'history' }) {
  const title = variant === 'active'
    ? (language === 'ru' ? 'Заявок пока нет' : 'Arizalar yo\'q')
    : variant === 'pending'
      ? (language === 'ru' ? 'Всё подтверждено' : 'Hammasi tasdiqlangan')
      : (language === 'ru' ? 'История пуста' : 'Tarix bo\'sh');
  return (
    <div className="text-center py-12 px-6">
      <div
        className="w-[72px] h-[72px] rounded-full grid place-items-center mx-auto mb-4"
        style={{ background: 'var(--surface-sunken, #EDE7DB)', color: 'var(--text-muted, #A8A29E)' }}
      >
        <FileText className="w-8 h-8" />
      </div>
      <div className="text-[16px] font-bold tracking-tight" style={{ color: 'var(--text-primary, #1C1917)' }}>{title}</div>
      {variant === 'active' && (
        <>
          <div className="text-[13.5px] mt-1.5 leading-snug" style={{ color: 'var(--text-secondary, #6F6A62)' }}>
            {language === 'ru' ? 'Создайте заявку — сантехник, электрик, уборка и другое.' : 'Ariza yarating — santexnik, elektrik, tozalash va boshqa.'}
          </div>
          <button
            onClick={onNew}
            className="mt-4 px-[22px] py-3 rounded-[14px] text-white text-[14px] font-bold inline-flex items-center gap-1.5 touch-manipulation active:scale-[0.98] transition-transform"
            style={{ background: 'var(--brand, #F97316)', boxShadow: 'var(--sh-brand, 0 8px 22px rgba(249,115,22,0.26))' }}
          >
            <Plus className="w-4 h-4" />
            {language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}
          </button>
        </>
      )}
    </div>
  );
}
