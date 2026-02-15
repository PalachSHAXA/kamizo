import { useState, useEffect } from 'react';
import {
  Home, Plus, FileText, Clock, CheckCircle, Star, X,
  User, Calendar, AlertTriangle, History, ChevronRight, MapPin, Ban, RefreshCw, Send
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ, RESCHEDULE_REASON_LABELS } from '../types';
import type { Request, ExecutorSpecialization, RequestPriority, RescheduleReason, RescheduleRequest } from '../types';
import { RequestStatusTracker, RequestStatusTrackerCompact } from '../components/RequestStatusTracker';
import { formatAddress } from '../utils/formatAddress';

export function ResidentDashboard() {
  const { user } = useAuthStore();
  const { requests, addRequest, approveRequest, rejectRequest, cancelRequest, notifications, createRescheduleRequest, respondToRescheduleRequest, getPendingRescheduleForUser, getActiveRescheduleForRequest, fetchRequests, fetchPendingReschedules } = useDataStore();

  // Fetch requests and reschedules from D1 database on mount
  useEffect(() => {
    fetchRequests();
    fetchPendingReschedules();
    // Poll for reschedules every 15 seconds for better responsiveness
    const interval = setInterval(() => {
      fetchPendingReschedules();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchPendingReschedules]);

  // Listen for openRatingModal event from popup notifications
  useEffect(() => {
    const handleOpenRatingModal = (event: CustomEvent<{ requestId: string }>) => {
      const { requestId } = event.detail;
      const request = requests.find(r => r.id === requestId);
      if (request && request.status === 'pending_approval') {
        setSelectedRequest(request);
        setShowApproveModal(true);
        sessionStorage.removeItem('open_rating_for_request');
      }
    };

    window.addEventListener('openRatingModal', handleOpenRatingModal as EventListener);
    return () => {
      window.removeEventListener('openRatingModal', handleOpenRatingModal as EventListener);
    };
  }, [requests]);

  // Check sessionStorage for pending rating modal (after navigation or page load)
  useEffect(() => {
    // Only check when requests are loaded
    if (requests.length === 0) return;

    const pendingRequestId = sessionStorage.getItem('open_rating_for_request');
    if (pendingRequestId) {
      const request = requests.find(r => r.id === pendingRequestId);
      if (request && request.status === 'pending_approval') {
        setSelectedRequest(request);
        setShowApproveModal(true);
        sessionStorage.removeItem('open_rating_for_request');
      } else {
        // Request not found or not pending approval - might not be loaded yet
        // Keep checking on next requests update
        console.log('[ResidentDashboard] Waiting for request', pendingRequestId, 'status:', request?.status);
      }
    }
  }, [requests]);
  const { language } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<'services' | 'my_requests' | 'pending' | 'history'>('services');
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExecutorSpecialization | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [requestToCancel, setRequestToCancel] = useState<Request | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [requestToReschedule, setRequestToReschedule] = useState<Request | null>(null);
  const [showRescheduleResponseModal, setShowRescheduleResponseModal] = useState(false);
  const [rescheduleToRespond, setRescheduleToRespond] = useState<RescheduleRequest | null>(null);

  // Filter requests for this resident
  const myRequests = requests.filter(r => r.residentId === user?.id);
  const pendingApproval = myRequests.filter(r => r.status === 'pending_approval');

  // Get pending reschedule requests for this user
  const pendingReschedules = user ? getPendingRescheduleForUser(user.id) : [];
  const activeRequests = myRequests.filter(r => ['new', 'assigned', 'accepted', 'in_progress'].includes(r.status));
  const completedRequests = myRequests.filter(r => r.status === 'completed');
  const cancelledRequests = myRequests.filter(r => r.status === 'cancelled');
  const historyRequests = [...completedRequests, ...cancelledRequests].sort(
    (a, b) => new Date(b.completedAt || b.cancelledAt || b.createdAt).getTime() -
              new Date(a.completedAt || a.cancelledAt || a.createdAt).getTime()
  );

  // Unread notifications for this user
  const myNotifications = notifications.filter(n => n.userId === user?.id && !n.read);

  const tabs = [
    { id: 'services' as const, label: language === 'ru' ? 'Услуги' : 'Xizmatlar', icon: Home },
    { id: 'my_requests' as const, label: language === 'ru' ? 'Мои заявки' : 'Arizalarim', icon: FileText, count: activeRequests.length },
    { id: 'pending' as const, label: language === 'ru' ? 'Подтвердить' : 'Tasdiqlash', icon: CheckCircle, count: pendingApproval.length },
    { id: 'history' as const, label: language === 'ru' ? 'История' : 'Tarix', icon: History, count: historyRequests.length },
  ];

  const handleCategorySelect = (category: ExecutorSpecialization) => {
    setSelectedCategory(category);
    setShowNewRequestModal(true);
  };

  const handleApproveClick = (request: Request) => {
    setSelectedRequest(request);
    setShowApproveModal(true);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header - Mobile optimized */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{language === 'ru' ? 'Личный кабинет' : 'Shaxsiy kabinet'}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm md:text-base text-gray-500">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{user?.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-400">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{formatAddress(user?.address, user?.apartment)}</span>
          </div>
        </div>
        {myNotifications.length > 0 && (
          <div className="relative flex-shrink-0">
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-medium">
              {myNotifications.length}
            </div>
            <button className="p-3 bg-white/50 rounded-xl active:bg-white/70 transition-colors touch-manipulation">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </button>
          </div>
        )}
      </div>

      {/* Pending Approval Alert - Mobile touch friendly */}
      {pendingApproval.length > 0 && (
        <button
          onClick={() => setActiveTab('pending')}
          className="glass-card p-4 border-2 border-purple-400 bg-purple-50/50 w-full text-left active:scale-[0.98] transition-transform touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 md:w-10 md:h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-purple-800">
                {language === 'ru'
                  ? `${pendingApproval.length} ${pendingApproval.length === 1 ? 'заявка ожидает' : 'заявки ожидают'} подтверждения`
                  : `${pendingApproval.length} ta ariza tasdiqlanishi kerak`}
              </div>
              <div className="text-sm text-purple-600">
                {language === 'ru' ? 'Нажмите, чтобы подтвердить' : 'Tasdiqlash uchun bosing'}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-purple-500 flex-shrink-0" />
          </div>
        </button>
      )}

      {/* Pending Reschedule Requests Alert */}
      {pendingReschedules.length > 0 && (
        <div className="glass-card p-4 border-2 border-amber-400 bg-amber-50/50 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-amber-800">
                {language === 'ru' ? 'Запрос на перенос времени' : 'Vaqtni o\'zgartirish so\'rovi'}
              </div>
              <div className="text-sm text-amber-600">
                {language === 'ru' ? 'Исполнитель предлагает перенести заявку' : 'Ijrochi arizani ko\'chirishni taklif qiladi'}
              </div>
            </div>
          </div>
          {pendingReschedules.map((reschedule) => (
            <button
              key={reschedule.id}
              onClick={() => {
                setRescheduleToRespond(reschedule);
                setShowRescheduleResponseModal(true);
              }}
              className="w-full p-3 bg-white/60 rounded-xl text-left flex items-center justify-between active:bg-white/80 transition-colors"
            >
              <div>
                <div className="font-medium text-gray-800">
                  {language === 'ru' ? 'Заявка' : 'Ariza'} #{reschedule.requestNumber}
                </div>
                <div className="text-sm text-gray-600">
                  {language === 'ru' ? 'Предложено:' : 'Taklif:'} {reschedule.proposedDate} {reschedule.proposedTime}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-500" />
            </button>
          ))}
        </div>
      )}

      {/* Активная заявка - показываем первую активную заявку после фиолетовой карточки */}
      {activeRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">
              {language === 'ru' ? 'Активная заявка' : 'Faol ariza'}
            </h2>
            {activeRequests.length > 1 && (
              <button
                onClick={() => setActiveTab('my_requests')}
                className="text-xs text-primary-600 font-medium flex items-center gap-1"
              >
                {language === 'ru' ? `Ещё ${activeRequests.length - 1}` : `Yana ${activeRequests.length - 1}`}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <RequestStatusTrackerCompact
            request={activeRequests[0]}
            executorName={activeRequests[0].executorName}
            language={language}
            onClick={() => setSelectedRequest(activeRequests[0])}
          />
        </div>
      )}

      {/* Stats - Mobile optimized with larger touch targets */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <button
          onClick={() => setActiveTab('my_requests')}
          className="glass-card p-3 md:p-4 text-center active:scale-95 transition-transform touch-manipulation"
        >
          <div className="text-2xl md:text-3xl font-bold text-blue-600">{activeRequests.length}</div>
          <div className="text-xs md:text-sm text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className="glass-card p-3 md:p-4 text-center active:scale-95 transition-transform touch-manipulation"
        >
          <div className="text-2xl md:text-3xl font-bold text-purple-600">{pendingApproval.length}</div>
          <div className="text-xs md:text-sm text-gray-500 leading-tight">{language === 'ru' ? 'Ожидают' : 'Kutmoqda'}</div>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className="glass-card p-3 md:p-4 text-center active:scale-95 transition-transform touch-manipulation"
        >
          <div className="text-2xl md:text-3xl font-bold text-green-600">{completedRequests.length}</div>
          <div className="text-xs md:text-sm text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarildi'}</div>
        </button>
      </div>

      {/* Tabs - Mobile optimized horizontal scroll */}
      <div className="glass-card p-1.5 md:p-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 md:inline-flex min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 md:py-2 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap touch-manipulation ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-gray-900 shadow-md'
                  : 'hover:bg-white/30 active:bg-white/50 text-gray-600'
              }`}
            >
              <tab.icon className="w-5 h-5 md:w-4 md:h-4" />
              <span className="text-sm md:text-base">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs text-white font-medium ${
                  tab.id === 'pending' ? 'bg-purple-500' : 'bg-blue-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content - Services Grid - Interactive Mobile-friendly UI */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          {/* Popular Services - Top 4 with colorful gradients */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3 px-1">
              {language === 'ru' ? '⭐ Популярные услуги' : '⭐ Mashhur xizmatlar'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_CATEGORIES.slice(0, 4).map((category, index) => {
                // Color schemes for each category
                const colorSchemes = [
                  { bg: 'from-blue-500 to-cyan-400', light: 'from-blue-50 to-cyan-50', text: 'text-blue-600' },
                  { bg: 'from-amber-500 to-yellow-400', light: 'from-amber-50 to-yellow-50', text: 'text-amber-600' },
                  { bg: 'from-emerald-500 to-teal-400', light: 'from-emerald-50 to-teal-50', text: 'text-emerald-600' },
                  { bg: 'from-violet-500 to-purple-400', light: 'from-violet-50 to-purple-50', text: 'text-violet-600' },
                ];
                const colors = colorSchemes[index % colorSchemes.length];

                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`relative overflow-hidden rounded-2xl p-4 text-left hover:shadow-xl active:scale-[0.97] transition-all group touch-manipulation bg-gradient-to-br ${colors.light} border border-white/50`}
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${index * 0.08}s both`
                    }}
                  >
                    {/* Animated background glow */}
                    <div className={`absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br ${colors.bg} rounded-full opacity-20 group-hover:opacity-40 group-hover:scale-125 transition-all duration-300`} />

                    <div className="relative">
                      <div className={`w-14 h-14 bg-gradient-to-br ${colors.bg} rounded-2xl flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                        <span className="text-2xl filter drop-shadow-sm">{category.icon}</span>
                      </div>
                      <h3 className={`font-bold text-gray-800 group-hover:${colors.text} transition-colors`}>
                        {language === 'ru' ? category.name : category.nameUz}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 group-hover:text-gray-600 transition-colors">{language === 'ru' ? category.description : category.descriptionUz}</p>
                    </div>

                    {/* Hover arrow indicator */}
                    <div className={`absolute bottom-3 right-3 w-8 h-8 bg-gradient-to-br ${colors.bg} rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 shadow-lg`}>
                      <ChevronRight className="w-5 h-5 text-white" />
                    </div>

                    {/* Touch ripple effect */}
                    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                      <div className="absolute inset-0 bg-white/30 opacity-0 active:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* All Services - Compact colorful grid */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3 px-1">
              {language === 'ru' ? '📋 Другие услуги' : '📋 Boshqa xizmatlar'}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {SERVICE_CATEGORIES.slice(4).map((category, index) => {
                const miniColors = [
                  'from-rose-400 to-pink-400',
                  'from-primary-400 to-primary-500',
                  'from-lime-400 to-green-400',
                  'from-cyan-400 to-blue-400',
                  'from-indigo-400 to-violet-400',
                  'from-gray-400 to-slate-400',
                ];
                const bgColor = miniColors[index % miniColors.length];

                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className="relative bg-white/70 backdrop-blur-sm border border-gray-100 rounded-xl p-3 text-center hover:bg-white hover:shadow-lg active:scale-[0.95] transition-all group touch-manipulation overflow-hidden"
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${(index + 4) * 0.06}s both`
                    }}
                  >
                    {/* Hover glow */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${bgColor} opacity-0 group-hover:opacity-10 transition-opacity`} />

                    <div className={`w-11 h-11 bg-gradient-to-br ${bgColor} rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 group-hover:shadow-md transition-all duration-200`}>
                      <span className="text-lg filter drop-shadow-sm">{category.icon}</span>
                    </div>
                    <h3 className="font-medium text-xs text-gray-700 group-hover:text-gray-900 transition-colors leading-tight">
                      {language === 'ru' ? category.name : category.nameUz}
                    </h3>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info Banner */}
          <div className="glass-card p-4 bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-800 font-medium">
                  {language === 'ru' ? 'Срочный вызов?' : 'Shoshilinch chaqiriqmi?'}
                </p>
                <p className="text-amber-600 mt-1">
                  {language === 'ru'
                    ? 'При создании заявки укажите высокий приоритет для быстрого реагирования'
                    : 'Tez javob olish uchun arizada yuqori muhimlikni belgilang'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'my_requests' && (
        <div className="space-y-3">
          {[...activeRequests, ...completedRequests].length === 0 ? (
            <div className="glass-card p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Нет заявок' : 'Arizalar yo\'q'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'Создайте заявку, выбрав услугу' : 'Xizmatni tanlab ariza yarating'}</p>
              <button
                onClick={() => setActiveTab('services')}
                className="btn-primary mt-4"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
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

      {activeTab === 'pending' && (
        <div className="space-y-3">
          {pendingApproval.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Все подтверждено' : 'Hammasi tasdiqlangan'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'Нет заявок, ожидающих подтверждения' : 'Tasdiqlanishi kerak bo\'lgan arizalar yo\'q'}</p>
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

      {activeTab === 'history' && (
        <div className="space-y-3">
          {historyRequests.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'История пуста' : 'Tarix bo\'sh'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'Здесь будут отображаться завершённые и отменённые заявки' : 'Bu yerda yakunlangan va bekor qilingan arizalar ko\'rsatiladi'}</p>
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


      {/* New Request Modal */}
      {showNewRequestModal && selectedCategory && (
        <NewRequestModal
          category={selectedCategory}
          user={user}
          onClose={() => {
            setShowNewRequestModal(false);
            setSelectedCategory(null);
          }}
          onSubmit={(data) => {
            addRequest({
              ...data,
              residentId: user?.id || 'resident1',
              residentName: user?.name || 'Житель',
              residentPhone: user?.phone || '+998 90 000 00 00',
              address: user?.address || 'Адрес не указан',
              apartment: user?.apartment || '0',
            });
            setShowNewRequestModal(false);
            setSelectedCategory(null);
            setActiveTab('my_requests');
          }}
        />
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedRequest && (
        <ApproveModal
          request={selectedRequest}
          onClose={() => {
            setShowApproveModal(false);
            setSelectedRequest(null);
          }}
          onApprove={(rating, feedback) => {
            approveRequest(selectedRequest.id, rating, feedback);
            setShowApproveModal(false);
            setSelectedRequest(null);
          }}
          onReject={(reason) => {
            rejectRequest(selectedRequest.id, reason);
            setShowApproveModal(false);
            setSelectedRequest(null);
          }}
        />
      )}

      {/* Request Details Modal */}
      {selectedRequest && !showApproveModal && !showCancelModal && !showRescheduleModal && (
        <RequestDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onApprove={() => {
            setShowApproveModal(true);
          }}
          onCancel={() => {
            setRequestToCancel(selectedRequest);
            setShowCancelModal(true);
          }}
          onReschedule={() => {
            setRequestToReschedule(selectedRequest);
            setShowRescheduleModal(true);
          }}
          hasActiveReschedule={!!getActiveRescheduleForRequest(selectedRequest.id)}
        />
      )}

      {/* Cancel Request Modal */}
      {showCancelModal && requestToCancel && (
        <CancelRequestModal
          request={requestToCancel}
          onClose={() => {
            setShowCancelModal(false);
            setRequestToCancel(null);
          }}
          onConfirm={(reason) => {
            cancelRequest(requestToCancel.id, 'resident', reason);
            setShowCancelModal(false);
            setRequestToCancel(null);
            setSelectedRequest(null);
          }}
        />
      )}

      {/* Reschedule Request Modal */}
      {showRescheduleModal && requestToReschedule && (
        <RescheduleModal
          request={requestToReschedule}
          onClose={() => {
            setShowRescheduleModal(false);
            setRequestToReschedule(null);
          }}
          onSubmit={(data) => {
            createRescheduleRequest({
              requestId: requestToReschedule.id,
              ...data
            });
            setShowRescheduleModal(false);
            setRequestToReschedule(null);
            setSelectedRequest(null);
          }}
          language={language}
        />
      )}

      {/* Reschedule Response Modal */}
      {showRescheduleResponseModal && rescheduleToRespond && (
        <RescheduleResponseModal
          reschedule={rescheduleToRespond}
          onClose={() => {
            setShowRescheduleResponseModal(false);
            setRescheduleToRespond(null);
          }}
          onAccept={() => {
            respondToRescheduleRequest(rescheduleToRespond.id, true);
            setShowRescheduleResponseModal(false);
            setRescheduleToRespond(null);
          }}
          onReject={(note) => {
            respondToRescheduleRequest(rescheduleToRespond.id, false, note);
            setShowRescheduleResponseModal(false);
            setRescheduleToRespond(null);
          }}
          language={language}
        />
      )}
    </div>
  );
}

// History Request Card Component
function HistoryRequestCard({
  request,
  onClick
}: {
  request: Request;
  onClick: () => void;
}) {
  const { language } = useLanguageStore();
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isCancelled = request.status === 'cancelled';

  const getCancelledByLabel = (cancelledBy?: string) => {
    if (language === 'ru') {
      switch (cancelledBy) {
        case 'resident': return 'Вами';
        case 'executor': return 'Исполнителем';
        case 'manager': return 'Менеджером';
        case 'admin': return 'Администратором';
        default: return '';
      }
    } else {
      switch (cancelledBy) {
        case 'resident': return 'Siz tomondan';
        case 'executor': return 'Ijrochi tomondan';
        case 'manager': return 'Menejer tomondan';
        case 'admin': return 'Administrator tomondan';
        default: return '';
      }
    }
  };

  return (
    <div
      className={`glass-card p-4 cursor-pointer hover:bg-white/40 transition-colors ${
        isCancelled ? 'border-l-4 border-red-400' : 'border-l-4 border-green-400'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">#{request.number}</span>
            <h3 className={`font-semibold ${isCancelled ? 'text-gray-500' : ''}`}>{request.title}</h3>
            {isCancelled ? (
              <span className="badge bg-red-100 text-red-700 flex items-center gap-1">
                <Ban className="w-3 h-3" />
                {language === 'ru' ? 'Отменена' : 'Bekor qilindi'}
              </span>
            ) : (
              <span className="badge badge-done">{language === 'ru' ? 'Выполнена' : 'Bajarildi'}</span>
            )}
          </div>
          <p className="text-gray-600 text-sm mt-1">{request.description}</p>

          {isCancelled ? (
            <div className="mt-3 p-3 bg-red-50 rounded-lg">
              <div className="text-sm text-red-700">
                <span className="font-medium">{language === 'ru' ? 'Отменена' : 'Bekor qilindi'} {getCancelledByLabel(request.cancelledBy)}</span>
                {request.cancellationReason && (
                  <p className="mt-1 text-red-600">{request.cancellationReason}</p>
                )}
              </div>
              <div className="text-xs text-red-500 mt-1">
                {request.cancelledAt && formatDate(request.cancelledAt)}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(request.approvedAt || request.completedAt || request.createdAt)}
                </span>
                {request.executorName && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {request.executorName}
                  </span>
                )}
              </div>
              {request.rating && (
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                    />
                  ))}
                  {request.feedback && (
                    <span className="text-sm text-gray-500 ml-2">"{request.feedback}"</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Pending Approval Card - Mobile optimized
function PendingApprovalCard({
  request,
  onApprove
}: {
  request: Request;
  onApprove: () => void;
}) {
  const { language } = useLanguageStore();
  const formatDuration = (seconds?: number) => {
    if (!seconds) return language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan';
    const mins = Math.floor(seconds / 60);
    return `${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
  };

  return (
    <div className="glass-card p-4 md:p-5 border-2 border-purple-300 bg-purple-50/30">
      {/* Header with icon */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">#{request.number}</span>
          </div>
          <h3 className="font-semibold text-base md:text-lg truncate">{request.title}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-600 text-sm line-clamp-2 mb-3">{request.description}</p>

      {/* Info cards - stacked on mobile */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</div>
          <div className="font-medium text-sm flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate">{request.executorName}</span>
          </div>
        </div>
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Время работы' : 'Ish vaqti'}</div>
          <div className="font-medium text-sm flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {formatDuration(request.workDuration)}
          </div>
        </div>
      </div>

      {/* Large touch-friendly button */}
      <button
        onClick={onApprove}
        className="w-full py-4 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation shadow-lg"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
      >
        <CheckCircle className="w-5 h-5" />
        {language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}
      </button>
    </div>
  );
}

// Time slots for scheduling
const TIME_SLOTS = [
  { value: '09:00-11:00', label: '09:00 - 11:00' },
  { value: '11:00-13:00', label: '11:00 - 13:00' },
  { value: '13:00-15:00', label: '13:00 - 15:00' },
  { value: '15:00-17:00', label: '15:00 - 17:00' },
  { value: '17:00-19:00', label: '17:00 - 19:00' },
];

// Trash removal types for selection
const TRASH_TYPES = [
  { value: 'construction', label: 'Строительный мусор', icon: '🧱', description: 'Кирпич, бетон, штукатурка' },
  { value: 'furniture', label: 'Старая мебель', icon: '🛋️', description: 'Диваны, шкафы, кровати' },
  { value: 'household', label: 'Бытовой мусор', icon: '🗑️', description: 'Обычные бытовые отходы' },
  { value: 'appliances', label: 'Бытовая техника', icon: '📺', description: 'Холодильники, стиральные машины' },
  { value: 'garden', label: 'Садовый мусор', icon: '🌿', description: 'Ветки, листья, трава' },
  { value: 'mixed', label: 'Смешанный', icon: '📦', description: 'Разные виды мусора' },
];

const TRASH_VOLUME = [
  { value: 'small', label: 'До 1 м³', description: '1-2 мешка, небольшие предметы', icon: '📦' },
  { value: 'medium', label: '1-3 м³', description: 'Несколько мешков, мелкая мебель', icon: '📦📦' },
  { value: 'large', label: '3-5 м³', description: 'Много мусора, крупная мебель', icon: '🚛' },
  { value: 'truck', label: 'Более 5 м³', description: 'Полная машина, капремонт', icon: '🚚' },
];

// New Request Modal - Mobile full-screen optimized
function NewRequestModal({
  category,
  user,
  onClose,
  onSubmit
}: {
  category: ExecutorSpecialization;
  user: any;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    category: ExecutorSpecialization;
    priority: RequestPriority;
    scheduledDate?: string;
    scheduledTime?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Trash removal-specific fields
  const [trashType, setTrashType] = useState('');
  const [trashVolume, setTrashVolume] = useState('');
  const [trashDetails, setTrashDetails] = useState('');
  const [trashDate, setTrashDate] = useState('');
  const [trashTime, setTrashTime] = useState('');
  const { language } = useLanguageStore();

  const categoryInfo = SERVICE_CATEGORIES.find(c => c.id === category);

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get maximum date (30 days from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // For trash removal category, build structured title and description
    if (category === 'trash') {
      const typeLabel = TRASH_TYPES.find(t => t.value === trashType)?.label || trashType;
      const volumeLabel = TRASH_VOLUME.find(v => v.value === trashVolume)?.label || trashVolume;

      if (!trashType || !trashVolume || !trashDate || !trashTime) return;

      let finalTitle = `Вывоз мусора: ${typeLabel}`;
      let finalDescription = `Тип мусора: ${typeLabel}\nОбъём: ${volumeLabel}`;
      if (trashDetails.trim()) {
        finalDescription += `\n\nДополнительно: ${trashDetails.trim()}`;
      }

      onSubmit({
        title: finalTitle,
        description: finalDescription,
        category,
        priority,
        scheduledDate: trashDate,
        scheduledTime: trashTime
      });
      return;
    }

    // For other categories, use regular title/description
    if (!title.trim() || !description.trim()) return;
    onSubmit({
      title,
      description,
      category,
      priority,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 md:flex md:items-center md:justify-center">
      {/* Full screen on mobile, centered modal on desktop */}
      <div className="h-full md:h-auto md:max-h-[90vh] w-full md:max-w-lg md:mx-4 bg-white md:rounded-2xl flex flex-col overflow-hidden">
        {/* Header - Fixed on mobile */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl">{categoryInfo?.icon}</span>
            <div>
              <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}</h2>
              <p className="text-sm text-gray-500">{language === 'ru' ? categoryInfo?.name : categoryInfo?.nameUz}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {category === 'trash' ? (
            <>
              {/* Trash Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Тип мусора' : 'Chiqindi turi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setTrashType(type.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all touch-manipulation ${
                        trashType === type.value
                          ? 'border-primary-500 bg-primary-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl">{type.icon}</span>
                      <div className="font-medium text-sm mt-1">{type.label}</div>
                      <div className="text-xs text-gray-500">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Volume Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Объём мусора' : 'Chiqindi hajmi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_VOLUME.map((vol) => (
                    <button
                      key={vol.value}
                      type="button"
                      onClick={() => setTrashVolume(vol.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all touch-manipulation ${
                        trashVolume === vol.value
                          ? 'border-primary-500 bg-primary-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg">{vol.icon}</span>
                      <div className="font-medium text-sm mt-1">{vol.label}</div>
                      <div className="text-xs text-gray-500">{vol.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Date and Time */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <label className="block text-sm font-medium text-blue-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === 'ru' ? 'Дата и время вывоза' : 'Olib ketish sanasi va vaqti'} *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'} <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={trashDate}
                      onChange={(e) => setTrashDate(e.target.value)}
                      min={getMinDate()}
                      max={getMaxDate()}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-base"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'} <span className="text-red-500">*</span></label>
                    <select
                      value={trashTime}
                      onChange={(e) => setTrashTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-base"
                      required
                    >
                      <option value="">{language === 'ru' ? 'Выберите время' : 'Vaqtni tanlang'}</option>
                      {TIME_SLOTS.map((slot) => (
                        <option key={slot.value} value={slot.value}>
                          {slot.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дополнительная информация' : 'Qo\'shimcha ma\'lumot'}
                </label>
                <textarea
                  value={trashDetails}
                  onChange={(e) => setTrashDetails(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[80px] text-base resize-none"
                  placeholder={language === 'ru' ? 'Укажите детали: этаж, место складирования, особые условия...' : 'Tafsilotlarni ko\'rsating: qavat, saqlash joyi...'}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Заголовок' : 'Sarlavha'} *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
                  placeholder={language === 'ru' ? 'Кратко опишите проблему' : 'Muammoni qisqacha tavsiflang'}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Описание' : 'Tavsif'} *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[120px] text-base resize-none"
                  placeholder={language === 'ru' ? 'Подробно опишите проблему' : 'Muammoni batafsil tavsiflang'}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Приоритет' : 'Muhimlik'}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all touch-manipulation ${
                    priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white shadow-md' :
                        p === 'high' ? 'bg-orange-500 text-white shadow-md' :
                        p === 'medium' ? 'bg-amber-500 text-white shadow-md' :
                        'bg-gray-500 text-white shadow-md'
                      : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {language === 'ru' ? PRIORITY_LABELS[p] : PRIORITY_LABELS_UZ[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled Date and Time - only for non-trash categories */}
          {category !== 'trash' && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <label className="block text-sm font-medium text-blue-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {language === 'ru' ? 'Желаемое время (необязательно)' : 'Istalgan vaqt (ixtiyoriy)'}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'}</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'}</label>
                  <select
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-base"
                    disabled={!scheduledDate}
                  >
                    <option value="">{language === 'ru' ? 'Любое' : 'Istalgan'}</option>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {scheduledDate && (
                <p className="text-xs text-blue-600 mt-2">
                  {language === 'ru' ? 'Мы постараемся выполнить заявку в указанное время' : 'Arizani belgilangan vaqtda bajarishga harakat qilamiz'}
                </p>
              )}
            </div>
          )}

          {/* Address info */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
              <div className="font-medium text-sm">{formatAddress(user?.address, user?.apartment)}</div>
            </div>
          </div>
        </form>

        {/* Fixed footer buttons */}
        <div className="p-4 border-t border-gray-100 bg-white safe-area-bottom">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim())}
              className={`flex-1 py-4 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all touch-manipulation ${
                (category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim()))
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'text-gray-900 active:scale-[0.98]'
              }`}
              style={(category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim()))
                ? undefined
                : { background: 'linear-gradient(135deg, #FFE500, #FFC700)' }
              }
            >
              <Plus className="w-5 h-5" />
              {language === 'ru' ? 'Создать' : 'Yaratish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Approve Modal - Mobile full-screen optimized
function ApproveModal({
  request,
  onClose,
  onApprove,
  onReject
}: {
  request: Request;
  onClose: () => void;
  onApprove: (rating: number, feedback?: string) => void;
  onReject: (reason: string) => void;
}) {
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { language } = useLanguageStore();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs} ${language === 'ru' ? 'ч' : 'soat'} ${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
    return `${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
  };

  if (showReject) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 md:flex md:items-center md:justify-center">
        <div className="h-full md:h-auto w-full md:max-w-md md:mx-4 bg-white md:rounded-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
            <h2 className="text-lg md:text-xl font-bold text-red-600">{language === 'ru' ? 'Отклонить работу' : 'Ishni rad etish'}</h2>
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-gray-600 mb-4 text-sm">
              {language === 'ru'
                ? 'Укажите причину, почему работа не выполнена качественно. Исполнитель получит уведомление.'
                : 'Ish sifatsiz bajarilganligining sababini ko\'rsating. Ijrochi xabar oladi.'}
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white min-h-[150px] text-base resize-none"
              placeholder={language === 'ru' ? 'Опишите, что не так...' : 'Nima noto\'g\'ri ekanligini yozing...'}
              required
            />
          </div>

          {/* Footer buttons */}
          <div className="p-4 border-t border-gray-100 bg-white safe-area-bottom">
            <div className="flex gap-3">
              <button
                onClick={() => setShowReject(false)}
                className="flex-1 py-4 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
              >
                {language === 'ru' ? 'Назад' : 'Orqaga'}
              </button>
              <button
                onClick={() => rejectReason.trim() && onReject(rejectReason)}
                className="flex-1 py-4 px-4 rounded-xl font-semibold text-white bg-red-500 active:bg-red-600 disabled:opacity-50 transition-colors touch-manipulation"
                disabled={!rejectReason.trim()}
              >
                {language === 'ru' ? 'Отклонить' : 'Rad etish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 md:flex md:items-center md:justify-center">
      <div className="h-full md:h-auto w-full md:max-w-md md:mx-4 bg-white md:rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}</h2>
          <button
            onClick={onClose}
            className="p-3 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Request Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{language === 'ru' ? 'Заявка' : 'Ariza'} #{request.number}</div>
            <div className="font-semibold text-base mb-2">{request.title}</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-gray-600 bg-white px-3 py-1.5 rounded-lg">
                <User className="w-4 h-4" />
                {request.executorName}
              </span>
              <span className="flex items-center gap-1.5 text-gray-600 bg-white px-3 py-1.5 rounded-lg">
                <Clock className="w-4 h-4" />
                {formatDuration(request.workDuration)}
              </span>
            </div>
          </div>

          {/* Rating - Large touch targets */}
          <div className="text-center">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              {language === 'ru' ? 'Оцените работу исполнителя' : 'Ijrochi ishini baholang'}
            </label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-2 active:scale-90 transition-transform touch-manipulation"
                >
                  <Star
                    className={`w-12 h-12 md:w-10 md:h-10 ${
                      star <= rating
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500 mt-2 font-medium">
              {rating === 5 && (language === 'ru' ? 'Отлично!' : 'A\'lo!')}
              {rating === 4 && (language === 'ru' ? 'Хорошо' : 'Yaxshi')}
              {rating === 3 && (language === 'ru' ? 'Нормально' : 'O\'rtacha')}
              {rating === 2 && (language === 'ru' ? 'Плохо' : 'Yomon')}
              {rating === 1 && (language === 'ru' ? 'Очень плохо' : 'Juda yomon')}
            </div>
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Отзыв (необязательно)' : 'Fikr-mulohaza (ixtiyoriy)'}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white min-h-[100px] text-base resize-none"
              placeholder={language === 'ru' ? 'Напишите отзыв о работе...' : 'Ish haqida fikringizni yozing...'}
            />
          </div>
        </div>

        {/* Fixed footer buttons */}
        <div className="p-4 border-t border-gray-100 bg-white safe-area-bottom">
          <div className="flex gap-3">
            <button
              onClick={() => setShowReject(true)}
              className="flex-1 py-4 px-4 rounded-xl font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors touch-manipulation flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              {language === 'ru' ? 'Отклонить' : 'Rad etish'}
            </button>
            <button
              onClick={() => onApprove(rating, feedback || undefined)}
              className="flex-1 py-4 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <CheckCircle className="w-5 h-5" />
              {language === 'ru' ? 'Подтвердить' : 'Tasdiqlash'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Request Details Modal with Status Tracker
function RequestDetailsModal({
  request,
  onClose,
  onApprove,
  onCancel,
  onReschedule,
  hasActiveReschedule
}: {
  request: Request;
  onClose: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  hasActiveReschedule: boolean;
}) {
  const { language } = useLanguageStore();
  // Reschedule is available for assigned/accepted/in_progress/pending_approval requests with an executor
  const canReschedule = ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(request.status) && request.executorId && !hasActiveReschedule;

  return (
    <div className="modal-backdrop">
      <div className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="p-2 bg-white/80 hover:bg-white rounded-full shadow-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Tracker */}
        <RequestStatusTracker
          request={request}
          executorName={request.executorName}
          language={language}
          onCancel={['new', 'assigned', 'accepted'].includes(request.status) ? onCancel : undefined}
          showActions={true}
        />

        {/* Additional Details */}
        <div className="mt-4 bg-white rounded-2xl shadow-lg p-4 space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              {language === 'ru' ? 'Описание' : 'Tavsif'}
            </h3>
            <p className="text-gray-900">{request.description}</p>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {language === 'ru' ? 'Приоритет:' : 'Muhimlik:'}
            </span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
              request.priority === 'urgent' ? 'bg-red-100 text-red-700' :
              request.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              request.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {language === 'ru' ? PRIORITY_LABELS[request.priority] : PRIORITY_LABELS_UZ[request.priority]}
            </span>
          </div>

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="p-4 bg-yellow-50 rounded-xl">
              <h3 className="font-medium mb-2">
                {language === 'ru' ? 'Ваша оценка' : 'Sizning bahoyingiz'}
              </h3>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    className={`w-6 h-6 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-2 text-lg font-semibold">{request.rating}/5</span>
              </div>
              {request.feedback && (
                <p className="mt-2 text-gray-600 italic">"{request.feedback}"</p>
              )}
            </div>
          )}

          {/* Approve button for pending_approval */}
          {request.status === 'pending_approval' && (
            <button
              onClick={onApprove}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle className="w-5 h-5" />
              {language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}
            </button>
          )}

          {/* Reschedule button for active requests */}
          {canReschedule && (
            <button
              onClick={onReschedule}
              className="w-full py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {language === 'ru' ? 'Перенести на другое время' : 'Boshqa vaqtga ko\'chirish'}
            </button>
          )}

          {/* Show if there's an active reschedule request */}
          {hasActiveReschedule && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700">
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm">
                {language === 'ru' ? 'Ожидается ответ на запрос о переносе' : 'Ko\'chirish so\'roviga javob kutilmoqda'}
              </span>
            </div>
          )}
        </div>

        {/* Close button at bottom */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 bg-white/80 hover:bg-white rounded-xl font-medium text-gray-600 transition-colors"
        >
          {language === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </div>
  );
}

// Cancel Request Modal
function CancelRequestModal({
  request,
  onClose,
  onConfirm
}: {
  request: Request;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const { language } = useLanguageStore();

  const predefinedReasons = language === 'ru' ? [
    'Передумал/Не актуально',
    'Нашёл другого исполнителя',
    'Проблема решилась сама',
    'Ошибся при создании заявки',
    'Слишком долгое ожидание',
  ] : [
    'Qaror o\'zgardi/Dolzarb emas',
    'Boshqa ijrochi topdim',
    'Muammo o\'z-o\'zidan hal bo\'ldi',
    'Ariza yaratishda xato qildim',
    'Juda uzoq kutish',
  ];

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-red-600 flex items-center gap-2">
            <Ban className="w-5 h-5" />
            {language === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            {language === 'ru'
              ? <>Вы уверены, что хотите отменить заявку <strong>#{request.number}</strong>? Это действие нельзя отменить.</>
              : <><strong>#{request.number}</strong> arizani bekor qilmoqchimisiz? Bu amalni ortga qaytarib bo&apos;lmaydi.</>}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина отмены' : 'Bekor qilish sababi'}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {predefinedReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    reason === r
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field min-h-[80px]"
              placeholder={language === 'ru' ? 'Или укажите свою причину...' : 'Yoki o\'z sababingizni yozing...'}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Не отменять' : 'Bekor qilmaslik'}
            </button>
            <button
              onClick={() => reason.trim() && onConfirm(reason)}
              className="flex-1 py-2 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!reason.trim()}
            >
              <Ban className="w-4 h-4 mr-2 inline" />
              {language === 'ru' ? 'Отменить заявку' : 'Arizani bekor qilish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reschedule Request Modal
function RescheduleModal({
  request,
  onClose,
  onSubmit,
  language
}: {
  request: Request;
  onClose: () => void;
  onSubmit: (data: { proposedDate: string; proposedTime: string; reason: RescheduleReason; reasonText?: string }) => void;
  language: 'ru' | 'uz';
}) {
  const [proposedDate, setProposedDate] = useState('');
  const [proposedTime, setProposedTime] = useState('');
  const [reason, setReason] = useState<RescheduleReason>('not_at_home');
  const [reasonText, setReasonText] = useState('');

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-amber-600 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            {language === 'ru' ? 'Перенести заявку' : 'Arizani ko\'chirish'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            {language === 'ru'
              ? `Предложите новое время для заявки #${request.number}. Исполнитель получит уведомление.`
              : `#${request.number} ariza uchun yangi vaqt taklif qiling.`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина переноса' : 'Ko\'chirish sababi'}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(RESCHEDULE_REASON_LABELS) as RescheduleReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-2.5 text-sm rounded-xl transition-colors text-left ${
                    reason === r
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {language === 'ru' ? RESCHEDULE_REASON_LABELS[r].label : RESCHEDULE_REASON_LABELS[r].labelUz}
                </button>
              ))}
            </div>
          </div>

          {reason === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Уточните причину' : 'Sababni aniqlashtiring'}
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={language === 'ru' ? 'Опишите причину...' : 'Sababni yozing...'}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Новая дата' : 'Yangi sana'}
              </label>
              <input
                type="date"
                min={today}
                value={proposedDate}
                onChange={(e) => setProposedDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Время' : 'Vaqt'}
              </label>
              <input
                type="time"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              onClick={() => proposedDate && proposedTime && onSubmit({ proposedDate, proposedTime, reason, reasonText: reason === 'other' ? reasonText : undefined })}
              className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={!proposedDate || !proposedTime || (reason === 'other' && !reasonText.trim())}
            >
              <Send className="w-4 h-4" />
              {language === 'ru' ? 'Отправить' : 'Yuborish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reschedule Response Modal
function RescheduleResponseModal({
  reschedule,
  onClose,
  onAccept,
  onReject,
  language
}: {
  reschedule: RescheduleRequest;
  onClose: () => void;
  onAccept: () => void;
  onReject: (note?: string) => void;
  language: 'ru' | 'uz';
}) {
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-amber-600 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            {language === 'ru' ? 'Запрос на перенос' : 'Ko\'chirish so\'rovi'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="text-sm text-gray-600 mb-1">
              {language === 'ru' ? 'Заявка' : 'Ariza'} #{reschedule.requestNumber}
            </div>
            <div className="font-medium text-gray-800">
              {reschedule.initiatorName} {language === 'ru' ? 'предлагает перенести на:' : 'taklif qiladi:'}
            </div>
            <div className="text-xl font-bold text-amber-600 mt-2">
              {reschedule.proposedDate} в {reschedule.proposedTime}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              <strong>{language === 'ru' ? 'Причина:' : 'Sabab:'}</strong>{' '}
              {language === 'ru'
                ? RESCHEDULE_REASON_LABELS[reschedule.reason].label
                : RESCHEDULE_REASON_LABELS[reschedule.reason].labelUz}
              {reschedule.reasonText && ` - ${reschedule.reasonText}`}
            </div>
          </div>

          {reschedule.currentDate && (
            <div className="text-sm text-gray-600 text-center">
              {language === 'ru' ? 'Текущее время:' : 'Hozirgi vaqt:'} {reschedule.currentDate} {reschedule.currentTime}
            </div>
          )}

          {showRejectForm ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                {language === 'ru' ? 'Причина отказа (необязательно)' : 'Rad etish sababi (ixtiyoriy)'}
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={language === 'ru' ? 'Укажите причину...' : 'Sababni yozing...'}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowRejectForm(false)} className="btn-secondary flex-1">
                  {language === 'ru' ? 'Назад' : 'Orqaga'}
                </button>
                <button
                  onClick={() => onReject(rejectNote || undefined)}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  {language === 'ru' ? 'Отклонить' : 'Rad etish'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectForm(true)}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
              >
                {language === 'ru' ? 'Отклонить' : 'Rad etish'}
              </button>
              <button
                onClick={onAccept}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {language === 'ru' ? 'Принять' : 'Qabul qilish'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
