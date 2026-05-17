import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { Search, MapPin, Plus, X, ChevronRight, User, Building2, GitBranch, Pause, Clock, ClipboardList } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/common';
import type { StatusTone } from '../../theme';
import { PageSkeleton } from '../../components/PageSkeleton';
import { useRequestStore, useExecutorStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { SPECIALIZATION_LABELS, PAUSE_REASON_LABELS } from '../../types';
import { branchesApi, buildingsApi, usersApi } from '../../services/api';
import { formatAddress } from '../../utils/formatAddress';
import { formatName } from '../../utils/formatName';
import { ManagementRequestModal } from './components/ManagementRequestModal';
import { CreateRequestModal } from './CreateRequestModal';
import type { ExecutorSpecialization, RequestPriority } from '../../types';

export function RequestsPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const requests = useRequestStore(s => s.requests);
  const executors = useExecutorStore(s => s.executors);
  const assignRequest = useRequestStore(s => s.assignRequest);
  const addRequest = useRequestStore(s => s.addRequest);
  const fetchRequests = useRequestStore(s => s.fetchRequests);
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);
  const isLoadingRequests = useRequestStore(s => s.isLoadingRequests);
  const cancelRequest = useRequestStore(s => s.cancelRequest);
  const [searchParams] = useSearchParams();

  const statusFilter = searchParams.get('status') || 'all';
  const [filter, setFilter] = useState(statusFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailsRequestId, setDetailsRequestId] = useState<string | null>(null);

  // Check if user can create requests (manager, admin, director)
  const canCreateRequest = ['manager', 'admin', 'director'].includes(user?.role || '');

  // Update filter when URL changes
  useEffect(() => {
    setFilter(statusFilter);
  }, [statusFilter]);

  // Check if user is department head - they can only see their department's requests
  const isDepartmentHead = user?.role === 'department_head';
  const userSpecialization = user?.specialization;

  // Filter requests by department if user is department head
  const departmentRequests = useMemo(() => {
    if (isDepartmentHead && userSpecialization) {
      return requests.filter(r => r.category === userSpecialization);
    }
    return requests;
  }, [requests, isDepartmentHead, userSpecialization]);

  // Filter executors by department if user is department head
  const departmentExecutors = useMemo(() => {
    if (isDepartmentHead && userSpecialization) {
      return executors.filter(e => e.specialization === userSpecialization);
    }
    return executors;
  }, [executors, isDepartmentHead, userSpecialization]);

  // Fetch requests and executors from D1 database on mount
  useEffect(() => {
    fetchRequests();
    fetchExecutors();
  }, [fetchRequests, fetchExecutors]);

  // Refetch executors when assignment modal opens to ensure fresh data
  useEffect(() => {
    if (showAssignModal) {
      fetchExecutors();
    }
  }, [showAssignModal, fetchExecutors]);

  // Resident-like roles (resident, tenant, commercial_owner) get the richer
  // ResidentDashboard "requests" tab with tappable cards and a detail modal.
  // Redirect them here so /requests deep-links still work for them.
  if (user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner') {
    return <Navigate to="/?tab=requests" replace />;
  }

  // Map request status to semantic StatusTone so all colors come from design tokens
  const requestStatusTone = (status: string): StatusTone => {
    switch (status) {
      case 'new': return 'info';
      case 'assigned':
      case 'accepted':
      case 'in_progress':
      case 'pending_approval':
        return 'pending';
      case 'completed': return 'active';
      case 'cancelled': return 'critical';
      default: return 'expired';
    }
  };

  const requestStatusLabel = (status: string): string => {
    const labels: Record<string, { ru: string; uz: string }> = {
      new: { ru: 'Новая', uz: 'Yangi' },
      assigned: { ru: 'Назначена', uz: 'Tayinlandi' },
      accepted: { ru: 'Принята', uz: 'Qabul qilindi' },
      in_progress: { ru: 'В работе', uz: 'Jarayonda' },
      pending_approval: { ru: 'Ожидает подтверждения', uz: 'Tasdiqlash kutilmoqda' },
      completed: { ru: 'Выполнена', uz: 'Bajarildi' },
      cancelled: { ru: 'Отменена', uz: 'Bekor qilindi' },
    };
    const l = labels[status];
    return l ? (language === 'ru' ? l.ru : l.uz) : status;
  };

  const getStatusBadge = (req: { status: string; isPaused?: boolean; pauseReason?: string }) => {
    if (req.isPaused) {
      const reasonLabel = req.pauseReason && PAUSE_REASON_LABELS[req.pauseReason]
        ? PAUSE_REASON_LABELS[req.pauseReason].label
        : req.pauseReason || (language === 'ru' ? 'На паузе' : 'Pauzada');
      return (
        <StatusBadge status="expired" size="sm" className="gap-1">
          <Pause className="w-3 h-3" />
          <span title={reasonLabel}>{language === 'ru' ? 'На паузе' : 'Pauzada'}</span>
        </StatusBadge>
      );
    }
    return (
      <StatusBadge status={requestStatusTone(req.status)} size="sm">
        {requestStatusLabel(req.status)}
      </StatusBadge>
    );
  };

  // Filter by status and search query
  const filteredRequests = departmentRequests.filter(r => {
    let matchesStatus = false;

    if (filter === 'all') {
      matchesStatus = true;
    } else if (filter === 'in_progress') {
      // "В работе" includes assigned, accepted, and in_progress statuses
      matchesStatus = ['assigned', 'accepted', 'in_progress'].includes(r.status);
    } else {
      matchesStatus = r.status === filter;
    }

    const matchesSearch = searchQuery === '' ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.residentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.number.toString().includes(searchQuery) ||
      r.address?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
              {isDepartmentHead
                ? (language === 'ru' ? 'Заявки отдела' : "Bo'lim arizalari")
                : (language === 'ru' ? 'Заявки' : 'Arizalar')}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {isDepartmentHead && userSpecialization
                ? `${language === 'ru' ? 'Отдел' : "Bo'lim"}: ${SPECIALIZATION_LABELS[userSpecialization as ExecutorSpecialization]}`
                : (language === 'ru' ? 'Управление заявками жителей' : 'Aholi arizalarini boshqarish')}
            </p>
          </div>
        </div>
        {canCreateRequest && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#E8621A] to-[#F59E0B] text-white font-medium shadow-sm active:scale-[0.97] transition-transform shrink-0 min-h-[44px]"
            aria-label={language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">{language === 'ru' ? 'Создать' : 'Yaratish'}</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск по номеру, названию, адресу...' : 'Raqam, nom, manzil bo\'yicha qidirish...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pl-10"
            aria-label={language === 'ru' ? 'Поиск заявок' : 'Arizalarni qidirish'}
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="glass-input w-full sm:w-48"
        >
          <option value="all">{language === 'ru' ? 'Все статусы' : 'Barcha holatlar'}</option>
          <option value="new">{language === 'ru' ? 'Новые' : 'Yangilar'}</option>
          <option value="assigned">{language === 'ru' ? 'Назначенные' : 'Tayinlanganlar'}</option>
          <option value="accepted">{language === 'ru' ? 'Принятые' : 'Qabul qilinganlar'}</option>
          <option value="in_progress">{language === 'ru' ? 'В работе' : 'Jarayonda'}</option>
          <option value="pending_approval">{language === 'ru' ? 'Ожидают подтверждения' : 'Tasdiqlash kutilmoqda'}</option>
          <option value="completed">{language === 'ru' ? 'Выполненные' : 'Bajarilganlar'}</option>
        </select>
      </div>

      {/* Requests List */}
      {isLoadingRequests && requests.length === 0 ? (
        <PageSkeleton variant="list" />
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет заявок' : 'Arizalar yo\'q'}
          description={language === 'ru' ? 'Заявки не найдены' : 'Arizalar topilmadi'}
        />
      ) : (
      <div className="space-y-3">
        {filteredRequests.map((req) => (
          <div
            key={req.id}
            onClick={() => setDetailsRequestId(req.id)}
            className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl cursor-pointer hover:shadow-md active:scale-[0.995] transition-all touch-manipulation"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDetailsRequestId(req.id);
              }
            }}
            aria-label={language === 'ru' ? `Открыть заявку ${req.number}` : `Ariza ochish ${req.number}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex gap-3 sm:gap-4 min-w-0">
                <div className={`w-3 h-3 mt-1.5 rounded-full flex-shrink-0 ${req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-orange-500' : req.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-400'}`}></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">#{req.number}</span>
                    <h3 className="font-semibold text-base sm:text-lg truncate max-w-[250px] sm:max-w-none">{req.title}</h3>
                    {getStatusBadge(req)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{SPECIALIZATION_LABELS[req.category]}</span> • {formatName(req.residentName)}
                  </div>
                  {/* Show trash type and volume badges */}
                  {req.category === 'trash' && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {req.title.includes(': ') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                          {TRASH_TYPES.find(t => req.title.endsWith(t.label))?.icon || '🗑️'} {req.title.split(': ').slice(1).join(': ')}
                        </span>
                      )}
                      {req.description?.includes('Объём: ') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          📦 {req.description.split('Объём: ')[1].split('\n')[0]}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {formatAddress(req.address, req.apartment)}
                    </span>
                    {req.createdAt && (() => {
                      const d = new Date(req.createdAt.endsWith('Z') ? req.createdAt : req.createdAt + 'Z');
                      const locale = language === 'ru' ? 'ru-RU' : 'uz-UZ';
                      return (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                          {d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      );
                    })()}
                  </div>
                  {req.executorName && (
                    <div className="mt-2 text-sm text-primary-600">
                      {language === 'ru' ? 'Исполнитель' : 'Ijrochi'}: {req.executorName}
                    </div>
                  )}
                  {/* Show pause reason if request is paused */}
                  {req.isPaused && req.pauseReason && (
                    <div className="mt-2 p-2 bg-gray-100 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Pause className="w-4 h-4" />
                        <span className="font-medium">{language === 'ru' ? 'Причина паузы:' : 'Pauza sababi:'}</span>
                        <span>
                          {PAUSE_REASON_LABELS[req.pauseReason]?.label || req.pauseReason}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {req.status === 'new' && (
                <div className="flex sm:flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAssignModal(req.id); }}
                    className="btn-primary text-sm py-2 px-4 min-h-[44px] touch-manipulation active:scale-95 w-full sm:w-auto"
                  >
                    {language === 'ru' ? 'Назначить' : 'Tayinlash'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-backdrop items-end sm:items-center">
          <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl">
            <h2 className="text-lg sm:text-xl font-bold mb-4">{language === 'ru' ? 'Назначить исполнителя' : 'Ijrochini tayinlash'}</h2>
            <div className="space-y-3">
              {departmentExecutors.length === 0 ? (
                <p className="text-gray-500 text-center py-4">{language === 'ru' ? 'Загрузка исполнителей...' : 'Ijrochilar yuklanmoqda...'}</p>
              ) : (
                departmentExecutors.map((executor) => (
                  <button
                    key={executor.id}
                    onClick={() => {
                      assignRequest(showAssignModal, executor.id);
                      setShowAssignModal(null);
                    }}
                    className="w-full p-4 min-h-[44px] touch-manipulation active:scale-[0.98] bg-white/30 hover:bg-white/50 rounded-lg sm:rounded-xl text-left transition-colors"
                  >
                    <div className="font-medium">{executor.name}</div>
                    <div className="text-sm text-gray-500">
                      {SPECIALIZATION_LABELS[executor.specialization]} • {executor.activeRequests} {language === 'ru' ? 'активных заявок' : 'faol arizalar'}
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowAssignModal(null)}
              className="btn-secondary w-full mt-4 min-h-[44px] touch-manipulation active:scale-95"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
          </div>
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateModal && (
        <CreateRequestModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (data) => {
            await addRequest(data);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Request Details Modal — click on any card opens this for management roles */}
      {detailsRequestId && (() => {
        const detailsRequest = filteredRequests.find(r => r.id === detailsRequestId);
        if (!detailsRequest) return null;
        return (
          <ManagementRequestModal
            request={detailsRequest}
            onClose={() => setDetailsRequestId(null)}
            onAssignClick={() => setShowAssignModal(detailsRequest.id)}
            onCancel={async (reason) => {
              await cancelRequest(detailsRequest.id, 'manager', reason);
            }}
          />
        );
      })()}
    </div>
  );
}

// Types for resident selection
