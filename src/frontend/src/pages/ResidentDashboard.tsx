import { useState, useEffect, useMemo } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import {
  User, ChevronRight, MapPin, Bell, Menu
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useTenantStore } from '../stores/tenantStore';
import { useFinanceStore } from '../stores/financeStore';
import type { Request, ExecutorSpecialization, RescheduleRequest } from '../types';
import { formatAddress } from '../utils/formatAddress';
import RescheduleModal from '../components/modals/RescheduleModal';
import RescheduleResponseModal from '../components/modals/RescheduleResponseModal';
import { CancelRequestModal } from '../components/modals/CancelRequestModal';

import {
  HomeTab,
  RequestsTab,
  ServiceBottomSheet,
  NewRequestModal,
  ApproveModal,
  RequestDetailsModal,
} from './resident/components';
import type { ActiveTab, RequestsSubTab } from './resident/components';

export function ResidentDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { requests, addRequest, approveRequest, rejectRequest, cancelRequest, createRescheduleRequest, respondToRescheduleRequest, getPendingRescheduleForUser, getActiveRescheduleForRequest, fetchRequests, fetchPendingReschedules, isLoadingRequests } = useDataStore();

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
      }
    }
  }, [requests]);
  const { language } = useLanguageStore();
  const { meetings, fetchMeetings } = useMeetingStore();
  const { getAnnouncementsForResidents, fetchAnnouncements } = useDataStore();
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';

  // Fetch announcements and meetings for home screen
  useEffect(() => {
    fetchAnnouncements();
    fetchMeetings();
  }, [fetchAnnouncements, fetchMeetings]);

  // Get latest announcements for this resident
  const userLogin = user?.login || '';
  const userBuilding = user?.buildingId || '';
  const userEntrance = user?.entrance || '';
  const userFloor = user?.floor || '';
  const userBranch = user?.branch || '';
  const userApartment = user?.apartment || '';
  const residentAnnouncements = getAnnouncementsForResidents(userLogin, userBuilding, userEntrance, userFloor, userBranch, userApartment);
  const unreadAnnouncements = residentAnnouncements.filter(a => !a.viewedBy?.includes(user?.id || ''));
  const latestAnnouncements = unreadAnnouncements.slice(0, 3);
  const unreadAnnouncementsCount = unreadAnnouncements.length;

  // Get upcoming meetings (voting open or schedule confirmed)
  const activeMeetings = meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status));

  // Read tab from URL params (e.g. /?tab=requests from bottom bar)
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => tabParam === 'requests' ? 'requests' : 'home');
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCatFilter, setServiceCatFilter] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const getApartmentBalance = useFinanceStore((s) => s.getApartmentBalance);
  const generateReconciliation = useFinanceStore((s) => s.generateReconciliation);
  const [financeBalance, setFinanceBalance] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (user?.id) {
      getApartmentBalance(user.id).then(res => {
        if (res) setFinanceBalance(res.balance as Record<string, unknown>);
      });
    }
  }, [user?.id, getApartmentBalance]);

  // Sync tab state with URL params
  useEffect(() => {
    if (tabParam === 'requests' && activeTab !== 'requests') {
      setActiveTab('requests');
    }
    if (!tabParam && activeTab === 'requests') {
      setActiveTab('home');
    }
  }, [tabParam]);

  // Listen for FAB 'open-services' event from BottomBar.
  // Also consume window.__pendingOpenServices in case the event fired before this lazy component mounted.
  useEffect(() => {
    const openServices = () => {
      setSelectedServiceId(null);
      setServiceSearch('');
      setServiceCatFilter('all');
      setShowAllServices(true);
      (window as any).__pendingOpenServices = false;
    };
    window.addEventListener('open-services', openServices);
    if ((window as any).__pendingOpenServices) {
      openServices();
    }
    return () => window.removeEventListener('open-services', openServices);
  }, []);

  // When switching tabs, update URL
  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'requests') {
      setSearchParams({ tab: 'requests' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };
  const [requestsSubTab, setRequestsSubTab] = useState<RequestsSubTab>('active');
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
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Filter requests for this resident
  const myRequests = useMemo(() => requests.filter(r => {
    if (r.residentId !== user?.id) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (filterPriority !== 'all' && r.priority !== filterPriority) return false;
    return true;
  }), [requests, user?.id, filterCategory, filterPriority]);
  const pendingApproval = useMemo(() => myRequests.filter(r => r.status === 'pending_approval'), [myRequests]);

  // Get pending reschedule requests for this user
  const pendingReschedules = user ? getPendingRescheduleForUser(user.id) : [];
  const activeRequests = useMemo(() => myRequests.filter(r => ['new', 'assigned', 'accepted', 'in_progress'].includes(r.status)), [myRequests]);
  const completedRequests = useMemo(() => myRequests.filter(r => r.status === 'completed'), [myRequests]);
  const cancelledRequests = useMemo(() => myRequests.filter(r => r.status === 'cancelled'), [myRequests]);
  const historyRequests = useMemo(() => [...completedRequests, ...cancelledRequests].sort(
    (a, b) => new Date(b.completedAt || b.cancelledAt || b.createdAt).getTime() -
              new Date(a.completedAt || a.cancelledAt || a.createdAt).getTime()
  ), [completedRequests, cancelledRequests]);

  const handleCategorySelect = (category: ExecutorSpecialization) => {
    setSelectedCategory(category);
    setShowNewRequestModal(true);
  };

  const handleApproveClick = (request: Request) => {
    setSelectedRequest(request);
    setShowApproveModal(true);
  };

  return (
    <div className="pb-24 md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0">
      {/* ===== HEADER (super-app style) ===== */}
      <div className="px-5 pt-2 pb-1.5 md:px-0">
        {/* Top row: hamburger + logo on left, bell + profile on right */}
        <div className="flex items-center justify-between mb-1.5 md:hidden">
          <button
            onClick={() => window.dispatchEvent(new Event('open-sidebar'))}
            className="w-[38px] h-[38px] bg-white rounded-[13px] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.88] transition-transform touch-manipulation"
          >
            <Menu className="w-[18px] h-[18px] text-gray-700" strokeWidth={2} />
          </button>
          <span className="text-[13px] font-bold text-gray-500">{tenantName}</span>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/announcements')}
              className="w-[38px] h-[38px] bg-white rounded-[13px] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] relative active:scale-[0.88] transition-transform touch-manipulation"
            >
              <Bell className="w-[18px] h-[18px] text-gray-700" strokeWidth={2} />
              {unreadAnnouncementsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full text-[9px] font-extrabold text-white flex items-center justify-center border-2 border-[#F2F2F7]">
                  {unreadAnnouncementsCount > 9 ? '9+' : unreadAnnouncementsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="w-[38px] h-[38px] rounded-[13px] bg-primary-50 flex items-center justify-center active:scale-[0.88] transition-transform touch-manipulation border border-primary-100"
            >
              <User className="w-[18px] h-[18px] text-primary-600" strokeWidth={2} />
            </button>
          </div>
        </div>
        {/* Greeting - only on home tab */}
        {activeTab === 'home' && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
                {language === 'ru' ? 'Добро пожаловать 👋' : 'Xush kelibsiz 👋'}
              </div>
              <div className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
                {user?.name?.split(' ')[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Address pill - only on home tab */}
      {activeTab === 'home' && (
        <div className="px-5 mb-3 md:px-0">
          <div className="inline-flex items-center gap-1.5 bg-white rounded-[11px] px-3 py-[7px] shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <MapPin className="w-3 h-3 text-primary-500" />
            <span className="text-[12px] font-semibold text-gray-500">{formatAddress(user?.address, user?.apartment)}</span>
          </div>
        </div>
      )}

      {/* Pending Approval Alert */}
      {pendingApproval.length > 0 && activeTab === 'home' && (
        <div className="px-3 mb-3 md:px-0">
          <button
            onClick={() => switchTab('requests')}
            className="w-full rounded-[18px] p-[11px_14px] flex items-center gap-[10px] border border-purple-200/60 active:scale-[0.98] transition-transform touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #F5EEFF, #EDE4FF)' }}
          >
            <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0 animate-pulse" />
            <div className="flex-1 text-[12px] font-semibold text-purple-700 leading-snug">
              {language === 'ru'
                ? `${pendingApproval.length} ${pendingApproval.length === 1 ? 'заявка ожидает' : 'заявки ожидают'} подтверждения`
                : `${pendingApproval.length} ta ariza tasdiqlanishi kerak`}
            </div>
            <ChevronRight className="w-3 h-3 text-purple-400" />
          </button>
        </div>
      )}

      {/* Pending Reschedule Requests Alert */}
      {pendingReschedules.length > 0 && activeTab === 'home' && (
        <div className="px-3 mb-3 md:px-0">
          <div className="rounded-[18px] p-[11px_14px] flex items-center gap-[10px] border border-amber-200/60" style={{ background: 'linear-gradient(135deg, #FFF9E6, #FEF3C7)' }}>
            <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <div className="flex-1 text-[12px] font-semibold text-amber-700 leading-snug">
              {language === 'ru' ? 'Запрос на перенос заявки' : 'Arizani ko\'chirish so\'rovi'}
            </div>
          </div>
          <div className="mt-2 space-y-1.5">
            {pendingReschedules.map((reschedule) => (
              <button
                key={reschedule.id}
                onClick={() => {
                  setRescheduleToRespond(reschedule);
                  setShowRescheduleResponseModal(true);
                }}
                className="w-full p-3 bg-white rounded-xl text-left flex items-center justify-between active:bg-gray-50 transition-colors touch-manipulation min-h-[44px] shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
              >
                <div>
                  <div className="font-medium text-gray-800 text-sm">
                    {language === 'ru' ? 'Заявка' : 'Ariza'} #{reschedule.requestNumber}
                  </div>
                  <div className="text-xs text-gray-500">
                    {language === 'ru' ? 'Предложено:' : 'Taklif:'} {reschedule.proposedDate} {reschedule.proposedTime}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== HOME TAB ===== */}
      {activeTab === 'home' && (
        <HomeTab
          language={language}
          user={user}
          activeRequests={activeRequests}
          latestAnnouncements={latestAnnouncements}
          activeMeetings={activeMeetings}
          financeBalance={financeBalance}
          tenantName={tenantName}
          switchTab={switchTab}
          setSelectedRequest={setSelectedRequest}
          setShowAllServices={setShowAllServices}
          generateReconciliation={generateReconciliation}
        />
      )}

      {/* All Services Bottom Sheet (FAB menu) */}
      {showAllServices && <ServiceBottomSheet
        language={language}
        serviceSearch={serviceSearch}
        setServiceSearch={setServiceSearch}
        serviceCatFilter={serviceCatFilter}
        setServiceCatFilter={setServiceCatFilter}
        selectedServiceId={selectedServiceId}
        setSelectedServiceId={setSelectedServiceId}
        onClose={() => { setShowAllServices(false); setSelectedServiceId(null); setServiceSearch(''); setServiceCatFilter('all'); }}
        onSubmit={(id) => {
          setShowAllServices(false);
          handleCategorySelect(id as ExecutorSpecialization);
          setSelectedServiceId(null);
          setServiceSearch('');
          setServiceCatFilter('all');
        }}
      />}

      {/* ===== REQUESTS TAB ===== */}
      {activeTab === 'requests' && (
        <RequestsTab
          language={language}
          activeRequests={activeRequests}
          pendingApproval={pendingApproval}
          historyRequests={historyRequests}
          requestsSubTab={requestsSubTab}
          setRequestsSubTab={setRequestsSubTab}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
          isLoadingRequests={isLoadingRequests}
          requestsCount={requests.length}
          switchTab={switchTab}
          setSelectedRequest={setSelectedRequest}
          handleApproveClick={handleApproveClick}
        />
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
            switchTab('requests');
            setRequestsSubTab('active');
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
      {requestToCancel && (
        <CancelRequestModal
          isOpen={showCancelModal}
          request={requestToCancel}
          onClose={() => {
            setShowCancelModal(false);
            setRequestToCancel(null);
          }}
          onCancel={(_requestId, reason) => {
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

      {/* Install App / Notifications */}
      <div className="px-3 md:px-0 pb-2">
        <InstallAppSection language={language} roleContext="resident" />
      </div>

      {/* Bottom bar is now rendered globally by Layout via BottomBar component */}
    </div>
  );
}
