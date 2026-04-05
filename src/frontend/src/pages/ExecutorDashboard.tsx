import { useState, useEffect, useCallback, useMemo } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import {
  FileText, Clock, CheckCircle,
  Play, ShoppingBag,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useRequestStore } from '../stores/requestStore';
import { useExecutorStore } from '../stores/executorStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { executorsApi } from '../services/api';
import type { Request, RescheduleRequest } from '../types';
import { DeclineRequestModal } from '../components/modals/DeclineRequestModal';
import RescheduleModal from '../components/modals/RescheduleModal';
import RescheduleResponseModal from '../components/modals/RescheduleResponseModal';

import {
  RequestDetailsModal,
  MarketplaceOrderDetailsModal,
  StatsCards,
  ActiveWorkTimer,
  RescheduleAlert,
  TabContent,
  ExecutorHeader,
  useMarketplaceOrders,
} from './executor/components';
import type { ExecutorStats } from './executor/components';

export function ExecutorDashboard() {
  const { user } = useAuthStore();
  const requests = useRequestStore(s => s.requests);
  const executors = useExecutorStore(s => s.executors);
  const acceptRequest = useRequestStore(s => s.acceptRequest);
  const startWork = useRequestStore(s => s.startWork);
  const pauseWork = useRequestStore(s => s.pauseWork);
  const resumeWork = useRequestStore(s => s.resumeWork);
  const completeWork = useRequestStore(s => s.completeWork);
  const assignRequest = useRequestStore(s => s.assignRequest);
  const declineRequest = useRequestStore(s => s.declineRequest);
  const createRescheduleRequest = useRequestStore(s => s.createRescheduleRequest);
  const respondToRescheduleRequest = useRequestStore(s => s.respondToRescheduleRequest);
  const getPendingRescheduleForUser = useRequestStore(s => s.getPendingRescheduleForUser);
  const fetchRequests = useRequestStore(s => s.fetchRequests);
  const fetchPendingReschedules = useRequestStore(s => s.fetchPendingReschedules);
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  // For couriers, default tab is 'marketplace', for others - 'available'
  const [activeTab, setActiveTab] = useState<'available' | 'assigned' | 'in_progress' | 'completed' | 'marketplace' | 'delivered'>('available');

  // Set default tab for couriers on mount
  useEffect(() => {
    if (user?.specialization === 'courier') {
      setActiveTab('marketplace');
    }
  }, [user?.specialization]);

  // Live stats from API
  const [liveStats, setLiveStats] = useState<ExecutorStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Marketplace orders hook
  const {
    marketplaceOrders,
    availableMarketplaceOrders,
    assignedMarketplaceOrders,
    activeMarketplaceOrders,
    completedMarketplaceOrders,
    isLoadingOrders,
    selectedMarketplaceOrder,
    setSelectedMarketplaceOrder,
    fetchMarketplaceOrders,
    fetchAvailableMarketplaceOrders,
    fetchDeliveredMarketplaceOrders,
    takeMarketplaceOrder,
    updateMarketplaceOrderStatus,
  } = useMarketplaceOrders();

  // Fetch requests and pending reschedules from D1 database on mount and poll every 30 seconds
  useEffect(() => {
    const isCourier = user?.specialization === 'courier';
    Promise.all([
      fetchRequests(),
      fetchPendingReschedules(),
      // Only fetch marketplace orders for couriers
      ...(isCourier ? [fetchMarketplaceOrders(), fetchAvailableMarketplaceOrders(), fetchDeliveredMarketplaceOrders()] : []),
    ]);
    const interval = setInterval(() => {
      Promise.all([
        fetchPendingReschedules(),
        ...(isCourier ? [fetchMarketplaceOrders(), fetchAvailableMarketplaceOrders(), fetchDeliveredMarketplaceOrders()] : []),
      ]);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingReschedules, fetchMarketplaceOrders, fetchAvailableMarketplaceOrders, fetchDeliveredMarketplaceOrders, user?.specialization]);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
  const [deliveryTimers, setDeliveryTimers] = useState<Record<string, number>>({});
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [requestToDecline, setRequestToDecline] = useState<Request | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [requestToReschedule, setRequestToReschedule] = useState<Request | null>(null);
  const [showRescheduleResponseModal, setShowRescheduleResponseModal] = useState(false);
  const [rescheduleToRespond, setRescheduleToRespond] = useState<RescheduleRequest | null>(null);

  // Find current executor
  const currentExecutor = executors.find(e => e.login === user?.login);

  // Fetch live stats from API
  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.id) return;
      setIsLoadingStats(true);
      try {
        const response = await executorsApi.getStats(user.id);
        setLiveStats(response.stats);
      } catch (error) {
        console.error('Failed to fetch executor stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Get executor's specialization
  const mySpecialization = currentExecutor?.specialization || user?.specialization;

  // Filter requests for this executor - use user.id for consistency with handleTakeRequest
  const myRequests = useMemo(() => requests.filter(r => r.executorId === user?.id), [requests, user?.id]);

  // Available requests - new requests matching executor's specialization (not yet assigned)
  const availableRequests = useMemo(() => requests.filter(r =>
    r.status === 'new' && r.category === mySpecialization
  ), [requests, mySpecialization]);

  const assignedRequests = useMemo(() => myRequests.filter(r => r.status === 'assigned' || r.status === 'accepted'), [myRequests]);
  const inProgressRequests = useMemo(() => myRequests.filter(r => r.status === 'in_progress'), [myRequests]);
  const completedRequests = useMemo(() => myRequests.filter(r => r.status === 'completed' || r.status === 'pending_approval'), [myRequests]);

  // Get pending reschedule requests for this executor - use user.id for consistency
  const pendingReschedules = user?.id ? getPendingRescheduleForUser(user.id) : [];

  // Helper to parse UTC datetime from backend
  const parseUTCDateTime = useCallback((dateStr: string): number => {
    // Backend returns datetime in format "YYYY-MM-DD HH:MM:SS" (UTC)
    // If no timezone info, treat as UTC
    if (!dateStr) return 0;
    // Append 'Z' to indicate UTC if not already present
    const utcStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    return new Date(utcStr).getTime();
  }, []);

  // Timer effect for in_progress requests (accounting for pauses)
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: Record<string, number> = {};
      inProgressRequests.forEach(req => {
        if (req.startedAt) {
          const startTime = parseUTCDateTime(req.startedAt);
          const totalPausedTime = req.totalPausedTime || 0;

          if (req.isPaused && req.pausedAt) {
            // If currently paused, don't count time since pause
            const pausedAt = parseUTCDateTime(req.pausedAt);
            const elapsed = Math.floor((pausedAt - startTime) / 1000) - totalPausedTime;
            newTimers[req.id] = Math.max(0, elapsed);
          } else {
            // Active work - count all time minus paused time
            const elapsed = Math.floor((Date.now() - startTime) / 1000) - totalPausedTime;
            newTimers[req.id] = Math.max(0, elapsed);
          }
        }
      });
      setActiveTimers(newTimers);
    }, 1000);

    return () => clearInterval(interval);
  }, [inProgressRequests, parseUTCDateTime]);

  // Timer effect for marketplace delivery orders (orders in 'delivering' status)
  useEffect(() => {
    // Get orders that are currently being delivered
    const deliveringOrders = marketplaceOrders.filter(o => o.status === 'delivering');

    if (deliveringOrders.length === 0) {
      setDeliveryTimers({});
      return;
    }

    // Calculate elapsed time for an order
    const calculateElapsed = (order: MarketplaceOrder): number => {
      if (order.delivering_at) {
        const startTime = parseUTCDateTime(order.delivering_at);
        return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      }
      return 0;
    };

    // Initial calculation
    const initialTimers: Record<string, number> = {};
    deliveringOrders.forEach(order => {
      initialTimers[order.id] = calculateElapsed(order);
    });
    setDeliveryTimers(initialTimers);

    // Update every second
    const interval = setInterval(() => {
      setDeliveryTimers(prev => {
        const newTimers: Record<string, number> = {};
        deliveringOrders.forEach(order => {
          // Increment by 1 second if we have a previous value, otherwise calculate
          if (prev[order.id] !== undefined) {
            newTimers[order.id] = prev[order.id] + 1;
          } else {
            newTimers[order.id] = calculateElapsed(order);
          }
        });
        return newTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [marketplaceOrders, parseUTCDateTime]);

  // For couriers, include available marketplace orders in "available" count
  const availableCount = user?.specialization === 'courier'
    ? availableRequests.length + availableMarketplaceOrders.length
    : availableRequests.length;

  const baseTabs = [
    { id: 'available' as const, label: language === 'ru' ? '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435' : 'Mavjud', count: availableCount, color: 'bg-purple-500', icon: FileText },
    { id: 'assigned' as const, label: language === 'ru' ? '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044b\u0435' : 'Tayinlangan', count: assignedRequests.length, color: 'bg-blue-500', icon: Clock },
    { id: 'in_progress' as const, label: language === 'ru' ? '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435' : 'Ishda', count: inProgressRequests.length, color: 'bg-amber-500', icon: Play },
    { id: 'completed' as const, label: language === 'ru' ? '\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u044b\u0435' : 'Bajarilgan', count: completedRequests.length, color: 'bg-green-500', icon: CheckCircle },
  ];

  // For couriers: include assigned marketplace orders in "Назначенные" count
  const assignedCount = user?.specialization === 'courier'
    ? assignedRequests.length + assignedMarketplaceOrders.length
    : assignedRequests.length;

  // For couriers: "Мои доставки" first, then "Доступные", "Назначенные", "Доставленные" (no "В работе")
  const tabs = user?.specialization === 'courier'
    ? [
        { id: 'marketplace' as const, label: language === 'ru' ? '\u041c\u043e\u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438' : 'Mening yetkazishlarim', count: activeMarketplaceOrders.length, color: 'bg-primary-500', icon: ShoppingBag },
        { id: 'available' as const, label: language === 'ru' ? '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435' : 'Mavjud', count: availableCount, color: 'bg-purple-500', icon: FileText },
        { id: 'assigned' as const, label: language === 'ru' ? '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044b\u0435' : 'Tayinlangan', count: assignedCount, color: 'bg-blue-500', icon: Clock },
        { id: 'delivered' as const, label: language === 'ru' ? '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0435' : 'Yetkazilganlar', count: completedMarketplaceOrders.length, color: 'bg-emerald-500', icon: CheckCircle },
      ]
    : baseTabs;

  const currentRequests = (activeTab === 'marketplace' || activeTab === 'delivered') ? [] : ({
    available: availableRequests,
    assigned: assignedRequests,
    in_progress: inProgressRequests,
    completed: completedRequests,
  } as Record<string, Request[]>)[activeTab] || [];

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTakeRequest = (requestId: string) => {
    // Use user.id directly instead of currentExecutor.id
    // This fixes the issue when executors list is not loaded yet
    if (user?.id) {
      assignRequest(requestId, user.id);
      // Auto-switch to assigned tab
      setActiveTab('assigned');
    }
  };

  const handleAccept = (requestId: string) => {
    acceptRequest(requestId);
  };

  const handleStartWork = (requestId: string) => {
    // Check if there's already work in progress
    if (inProgressRequests.length > 0) {
      addToast('warning', language === 'ru' ? '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0440\u0430\u0431\u043e\u0442\u0443' : 'Avval joriy ishni yakunlang');
      return;
    }
    startWork(requestId);
  };

  const handlePauseWork = (requestId: string) => {
    pauseWork(requestId);
  };

  const handleResumeWork = (requestId: string) => {
    resumeWork(requestId);
  };

  const handleComplete = (requestId: string) => {
    const elapsed = activeTimers[requestId] || 0;
    completeWork(requestId, elapsed);
  };

  const handleDeclineClick = (request: Request) => {
    setRequestToDecline(request);
    setShowDeclineModal(true);
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (requestToDecline) {
      try {
        await declineRequest(requestToDecline.id, reason);
        setShowDeclineModal(false);
        setRequestToDecline(null);
        setSelectedRequest(null);
        // Async sync with server
        fetchRequests();
      } catch (error) {
        console.error('Failed to decline request:', error);
        // Error will be handled by declineRequest rollback, just close modal
        setShowDeclineModal(false);
        setRequestToDecline(null);
      }
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 xl:space-y-8 pb-24 md:pb-0">
      {/* Header - Mobile optimized with greeting */}
      <ExecutorHeader
        userName={user?.name}
        specialization={user?.specialization}
        executorStatus={currentExecutor?.status}
        language={language}
      />

      {/* Pending Reschedule Requests Alert */}
      <RescheduleAlert
        pendingReschedules={pendingReschedules}
        onRespond={(reschedule) => {
          setRescheduleToRespond(reschedule);
          setShowRescheduleResponseModal(true);
        }}
        language={language}
      />

      {/* Stats Cards - Personal Performance - Mobile optimized */}
      <StatsCards
        liveStats={liveStats}
        isLoadingStats={isLoadingStats}
        isCourier={user?.specialization === 'courier'}
        language={language}
      />

      {/* Active Work Timer - Mobile optimized - Show if there's work in progress */}
      <ActiveWorkTimer
        inProgressRequests={inProgressRequests}
        activeTimers={activeTimers}
        onPauseWork={handlePauseWork}
        onResumeWork={handleResumeWork}
        onComplete={handleComplete}
        formatTime={formatTime}
        language={language}
      />

      {/* Tabs - Mobile optimized with horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="glass-card p-1.5 md:p-1 flex gap-1 min-w-max md:min-w-0 md:inline-flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 md:py-2 min-h-[44px] rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap touch-manipulation ${
                    activeTab === tab.id
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'hover:bg-white/30 active:bg-white/50 text-gray-600'
                  }`}
                >
                  <span className="text-sm md:text-base">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs text-white font-medium ${tab.color}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Requests List or Marketplace Orders */}
          <TabContent
            activeTab={activeTab}
            language={language}
            isCourier={user?.specialization === 'courier'}
            isLoadingOrders={isLoadingOrders}
            activeMarketplaceOrders={activeMarketplaceOrders}
            completedMarketplaceOrders={completedMarketplaceOrders}
            availableMarketplaceOrders={availableMarketplaceOrders}
            assignedMarketplaceOrders={assignedMarketplaceOrders}
            onViewMarketplaceOrder={setSelectedMarketplaceOrder}
            onUpdateMarketplaceStatus={updateMarketplaceOrderStatus}
            onTakeMarketplaceOrder={(orderId) => takeMarketplaceOrder(orderId)}
            deliveryTimers={deliveryTimers}
            formatTime={formatTime}
            currentRequests={currentRequests}
            activeTimers={activeTimers}
            inProgressCount={inProgressRequests.length}
            onViewRequest={setSelectedRequest}
            onTakeRequest={handleTakeRequest}
            onAccept={handleAccept}
            onStartWork={handleStartWork}
            onPauseWork={handlePauseWork}
            onResumeWork={handleResumeWork}
            onComplete={handleComplete}
            onDecline={handleDeclineClick}
            onReschedule={(request) => {
              setRequestToReschedule(request);
              setShowRescheduleModal(true);
            }}
          />

      {/* Install App / Notifications */}
      <InstallAppSection language={language} roleContext={user?.specialization === 'courier' ? 'executor' : 'executor'} />

      {/* Request Details Modal */}
      {selectedRequest && !showDeclineModal && (
        <RequestDetailsModal
          request={selectedRequest}
          timerSeconds={activeTimers[selectedRequest.id]}
          onClose={() => setSelectedRequest(null)}
          onTakeRequest={() => {
            handleTakeRequest(selectedRequest.id);
            setSelectedRequest(null);
          }}
          onAccept={() => {
            handleAccept(selectedRequest.id);
            setSelectedRequest(null);
          }}
          onStartWork={() => {
            handleStartWork(selectedRequest.id);
            setSelectedRequest(null);
          }}
          onComplete={() => {
            handleComplete(selectedRequest.id);
            setSelectedRequest(null);
          }}
          onDecline={() => handleDeclineClick(selectedRequest)}
          onReschedule={() => {
            setRequestToReschedule(selectedRequest);
            setShowRescheduleModal(true);
            setSelectedRequest(null);
          }}
          formatTime={formatTime}
        />
      )}

      {/* Decline Request Modal */}
      {requestToDecline && (
        <DeclineRequestModal
          isOpen={showDeclineModal}
          request={requestToDecline}
          onClose={() => {
            setShowDeclineModal(false);
            setRequestToDecline(null);
          }}
          onDecline={(_requestId, reason) => handleDeclineConfirm(reason)}
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
          role="executor"
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

      {/* Marketplace Order Details Modal */}
      {selectedMarketplaceOrder && (
        <MarketplaceOrderDetailsModal
          order={selectedMarketplaceOrder}
          onClose={() => setSelectedMarketplaceOrder(null)}
          onUpdateStatus={updateMarketplaceOrderStatus}
          language={language}
        />
      )}
    </div>
  );
}
