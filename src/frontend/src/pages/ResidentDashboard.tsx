import { useState, useEffect, useMemo } from 'react';
import { InstallAppBanner } from '../components/InstallAppSection';
import {
  ChevronRight, MapPin, CheckCircle2, Clock as ClockIcon
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useTenantStore } from '../stores/tenantStore';
import { useFinanceStore } from '../stores/financeStore';
import type { Request, ExecutorSpecialization, RescheduleRequest } from '../types';
import { formatAddress } from '../utils/formatAddress';
import { formatName } from '../utils/formatName';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { requests, addRequest, approveRequest, rejectRequest, cancelRequest, createRescheduleRequest, respondToRescheduleRequest, getPendingRescheduleForUser, getActiveRescheduleForRequest, fetchRequests, fetchPendingReschedules, isLoadingRequests } = useDataStore();
  const { language } = useLanguageStore();
  const { meetings, fetchMeetings } = useMeetingStore();
  const { getAnnouncementsForResidents, fetchAnnouncements } = useDataStore();
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';
  const getApartmentBalance = useFinanceStore((s) => s.getApartmentBalance);
  const generateReconciliation = useFinanceStore((s) => s.generateReconciliation);

  // Read tab from URL params (e.g. /?tab=requests from bottom bar)
  const tabParam = searchParams.get('tab');

  // All state declarations (must come before any useEffect)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => tabParam === 'requests' ? 'requests' : 'home');
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCatFilter, setServiceCatFilter] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [financeBalance, setFinanceBalance] = useState<Record<string, unknown> | null>(null);
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
      }
    }
  }, [requests]);

  // Fetch announcements and meetings for home screen
  useEffect(() => {
    fetchAnnouncements();
    fetchMeetings();
  }, [fetchAnnouncements, fetchMeetings]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab is set inside; including it would cause re-trigger after the state change
  }, [tabParam]);

  // Listen for FAB 'open-services' event from BottomBar.
  // Also consume window.__pendingOpenServices in case the event fired before this lazy component mounted.
  useEffect(() => {
    const openServices = () => {
      setSelectedServiceId(null);
      setServiceSearch('');
      setServiceCatFilter('all');
      setShowAllServices(true);
      (window as unknown as Record<string, unknown>).__pendingOpenServices = false;
    };
    window.addEventListener('open-services', openServices);
    if ((window as unknown as Record<string, unknown>).__pendingOpenServices) {
      openServices();
    }
    return () => window.removeEventListener('open-services', openServices);
  }, []);

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

  // Get upcoming meetings (voting open or schedule confirmed)
  const activeMeetings = meetings.filter(m => ['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status));

  // When switching tabs, update URL
  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'requests') {
      setSearchParams({ tab: 'requests' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

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
      {/* Greeting - only on home tab. Time-of-day phrasing (Доброе утро /
          Добрый день / Добрый вечер / Доброй ночи) makes the welcome feel
          context-aware vs the generic "Welcome" we had before.
          Names are normalized through formatName() because legacy DB
          imports often store full caps (ABDURAXMANOV → Abduraxmanov). */}
      {activeTab === 'home' && (() => {
        const h = new Date().getHours();
        const greetingRu =
          h < 6  ? 'Доброй ночи'
          : h < 12 ? 'Доброе утро'
          : h < 18 ? 'Добрый день'
          : 'Добрый вечер';
        const greetingUz =
          h < 6  ? 'Hayrli tun'
          : h < 12 ? 'Hayrli tong'
          : h < 18 ? 'Hayrli kun'
          : 'Hayrli kech';
        const fullName = formatName(user?.name);
        const firstName = fullName.split(' ')[0] || fullName;
        return (
          <div className="px-5 pt-2 pb-1.5 md:px-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-gray-400 tracking-wide">
                  {language === 'ru' ? greetingRu : greetingUz} <span aria-hidden="true">👋</span>
                </div>
                {/* Greeting uses first name; profile page shows full name. This
                    matches standard mobile-app conventions — the greeting is
                    friendly, the profile is the authoritative view. */}
                <div className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
                  {firstName}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Address pill - only on home tab */}
      {activeTab === 'home' && (
        <div className="px-5 mb-3 md:px-0">
          <div className="inline-flex items-center gap-1.5 bg-white rounded-[11px] px-3 py-[7px] shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <MapPin className="w-3 h-3 text-primary-500" />
            <span className="text-[12px] font-semibold text-gray-500">{formatAddress(user?.address, user?.apartment)}</span>
          </div>
        </div>
      )}

      {/* Pending Approval Hero — rich card on home tab.
          Replaces the previous 12px purple pill with a real preview card:
          shows the topmost waiting request (#, title, executor, work time)
          and a brand-coloured CTA that jumps straight into the Approve modal.
          Stacked count shown only when there are multiple. */}
      {pendingApproval.length > 0 && activeTab === 'home' && (() => {
        const top = pendingApproval[0];
        const formatWorkDuration = (seconds?: number) => {
          if (!seconds) return null;
          const mins = Math.floor(seconds / 60);
          if (mins < 60) return `${mins} ${language === 'ru' ? 'мин' : 'daq'}`;
          const hrs = Math.floor(mins / 60);
          const rem = mins % 60;
          return rem === 0
            ? `${hrs} ${language === 'ru' ? 'ч' : 'soat'}`
            : `${hrs} ${language === 'ru' ? 'ч' : 'soat'} ${rem} ${language === 'ru' ? 'мин' : 'daq'}`;
        };
        const work = formatWorkDuration(top.workDuration);
        const more = pendingApproval.length - 1;

        return (
          <div className="px-3 mb-3 md:px-0">
            <div
              className="rounded-[20px] p-[14px_16px] border"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.08), rgba(var(--brand-rgb),0.16))',
                borderColor: 'rgba(var(--brand-rgb),0.25)',
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"
                  style={{ background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb),0.85))` }}
                >
                  <CheckCircle2 className="w-[22px] h-[22px] text-white" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgb(var(--brand-rgb))' }}>
                    {language === 'ru' ? 'Ждёт вашей оценки' : 'Sizning baholashingiz kutilyapti'}
                  </div>
                  <div className="text-[15px] font-extrabold text-gray-900 truncate mt-0.5">
                    {top.title}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-gray-600 mt-1">
                    <span className="font-mono font-semibold text-gray-400">#{top.number}</span>
                    {top.executorName && (
                      <span className="font-medium">· {formatName(top.executorName)}</span>
                    )}
                    {work && (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        · <ClockIcon className="w-3 h-3" /> {work}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleApproveClick(top)}
                  className="flex-1 py-2.5 rounded-[12px] font-bold text-[13px] text-white active:scale-[0.97] transition-transform touch-manipulation flex items-center justify-center gap-1.5"
                  style={{
                    background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb),0.85))`,
                    boxShadow: '0 4px 14px rgba(var(--brand-rgb),0.35)',
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {language === 'ru' ? 'Принять работу' : 'Ishni qabul qilish'}
                </button>
                <button
                  onClick={() => switchTab('requests')}
                  className="px-4 py-2.5 rounded-[12px] font-bold text-[13px] active:scale-[0.97] transition-transform touch-manipulation flex items-center gap-1"
                  style={{
                    background: 'white',
                    color: 'rgb(var(--brand-rgb))',
                    border: '1px solid rgba(var(--brand-rgb),0.25)',
                  }}
                >
                  {more > 0
                    ? (language === 'ru' ? `Ещё ${more}` : `Yana ${more}`)
                    : (language === 'ru' ? 'Подробнее' : 'Batafsil')}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  {reschedule.reasonText && (
                    <p className="text-xs text-gray-500 mt-0.5">{reschedule.reasonText}</p>
                  )}
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
          openNewRequest={() => setShowAllServices(true)}
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

      {/* Install App — compact banner, full guide lives on /profile.
          Render only on the home tab: on the requests tab it crowded the
          list and the audit flagged it as a PWA-duplicate regression. */}
      {activeTab === 'home' && (
        <div className="px-3 md:px-0 pb-2">
          <InstallAppBanner language={language} />
        </div>
      )}

      {/* Bottom bar is now rendered globally by Layout via BottomBar component */}
    </div>
  );
}
