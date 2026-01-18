import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Clock, CheckCircle, MapPin, Phone, User,
  Play, Check, X, Star, TrendingUp, Timer, Hand,
  CalendarDays, XCircle, Ban, AlertCircle,
  Pause, PlayCircle, RefreshCw, Send, ChevronRight,
  ShoppingBag, Package, Truck, ChefHat
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { executorsApi, apiRequest } from '../services/api';
import { formatAddress } from '../utils/formatAddress';
import { SPECIALIZATION_LABELS, STATUS_LABELS, RESCHEDULE_REASON_LABELS } from '../types';
import type { Request, ExecutorSpecialization, RequestStatus, RescheduleReason, RescheduleRequest } from '../types';

// Marketplace order interface
interface MarketplaceOrder {
  id: string;
  order_number: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  status: 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered';
  total_amount: number;
  delivery_address: string;
  delivery_notes?: string;
  items_count: number;
  created_at: string;
  assigned_at?: string;
}

// Stats interface for API response
interface ExecutorStats {
  totalCompleted: number;
  thisWeek: number;
  thisMonth: number;
  rating: number;
  avgCompletionTime: number;
  // Courier-specific stats
  totalDelivered?: number;
  deliveredThisWeek?: number;
}

export function ExecutorDashboard() {
  const { user } = useAuthStore();
  const { requests, executors, acceptRequest, startWork, pauseWork, resumeWork, completeWork, assignRequest, declineRequest, createRescheduleRequest, respondToRescheduleRequest, getPendingRescheduleForUser, fetchRequests, fetchPendingReschedules } = useDataStore();
  const { language } = useLanguageStore();
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

  // Marketplace orders (assigned to me - active only)
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  // Available marketplace orders (not assigned)
  const [availableMarketplaceOrders, setAvailableMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  // Delivered marketplace orders
  const [deliveredMarketplaceOrders, setDeliveredMarketplaceOrders] = useState<MarketplaceOrder[]>([]);

  // Split marketplace orders into assigned (confirmed) and active (preparing, ready, delivering)
  const assignedMarketplaceOrders = marketplaceOrders.filter(o => o.status === 'confirmed');
  const activeMarketplaceOrders = marketplaceOrders.filter(o => ['preparing', 'ready', 'delivering'].includes(o.status));
  // Completed orders are from separate deliveredMarketplaceOrders state
  const completedMarketplaceOrders = deliveredMarketplaceOrders;
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedMarketplaceOrder, setSelectedMarketplaceOrder] = useState<MarketplaceOrder | null>(null);

  // Fetch marketplace orders (my orders)
  const fetchMarketplaceOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const response = await apiRequest('/api/marketplace/executor/orders') as { orders: MarketplaceOrder[] };
      setMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch marketplace orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  // Fetch available marketplace orders
  const fetchAvailableMarketplaceOrders = useCallback(async () => {
    try {
      const response = await apiRequest('/api/marketplace/executor/available') as { orders: MarketplaceOrder[] };
      setAvailableMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch available marketplace orders:', error);
    }
  }, []);

  // Fetch delivered marketplace orders
  const fetchDeliveredMarketplaceOrders = useCallback(async () => {
    try {
      const response = await apiRequest('/api/marketplace/executor/delivered') as { orders: MarketplaceOrder[] };
      setDeliveredMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch delivered marketplace orders:', error);
    }
  }, []);

  // Take a marketplace order
  const takeMarketplaceOrder = async (orderId: string) => {
    try {
      await apiRequest(`/api/marketplace/executor/orders/${orderId}/take`, {
        method: 'POST',
      });
      // Refresh both lists
      await Promise.all([fetchMarketplaceOrders(), fetchAvailableMarketplaceOrders()]);
    } catch (error: any) {
      console.error('Failed to take order:', error);
      alert(language === 'ru' ? (error?.message || 'Ошибка при взятии заказа') : 'Buyurtmani olishda xatolik');
      // Refresh to get current state
      fetchAvailableMarketplaceOrders();
    }
  };

  // Update marketplace order status
  const updateMarketplaceOrderStatus = async (orderId: string, status: string) => {
    try {
      await apiRequest(`/api/marketplace/executor/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      // Update local state immediately for responsive UI
      if (status === 'delivered') {
        // Remove from active orders
        setMarketplaceOrders(prev => prev.filter(order => order.id !== orderId));
      } else {
        setMarketplaceOrders(prev => prev.map(order =>
          order.id === orderId ? { ...order, status: status as MarketplaceOrder['status'] } : order
        ));
      }
      setSelectedMarketplaceOrder(null);
      // Also fetch fresh data from server
      await Promise.all([fetchMarketplaceOrders(), fetchDeliveredMarketplaceOrders()]);
    } catch (error: any) {
      console.error('Failed to update order status:', error);
      // Refresh orders to get current state
      await Promise.all([fetchMarketplaceOrders(), fetchDeliveredMarketplaceOrders()]);
      const errorMsg = error?.message || 'Ошибка при обновлении статуса';
      alert(language === 'ru' ? errorMsg : 'Status yangilashda xatolik');
    }
  };

  // Fetch requests and pending reschedules from D1 database on mount and poll every 30 seconds
  useEffect(() => {
    fetchRequests();
    fetchPendingReschedules();
    // Only fetch marketplace orders for couriers
    if (user?.specialization === 'courier') {
      fetchMarketplaceOrders();
      fetchAvailableMarketplaceOrders();
      fetchDeliveredMarketplaceOrders();
    }
    const interval = setInterval(() => {
      fetchPendingReschedules();
      if (user?.specialization === 'courier') {
        fetchMarketplaceOrders();
        fetchAvailableMarketplaceOrders();
        fetchDeliveredMarketplaceOrders();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchPendingReschedules, fetchMarketplaceOrders, fetchAvailableMarketplaceOrders, fetchDeliveredMarketplaceOrders, user?.specialization]);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
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
  // This ensures requests assigned via user.id are properly displayed
  const myRequests = requests.filter(r => r.executorId === user?.id);

  // Available requests - new requests matching executor's specialization (not yet assigned)
  const availableRequests = requests.filter(r =>
    r.status === 'new' && r.category === mySpecialization
  );

  const assignedRequests = myRequests.filter(r => r.status === 'assigned' || r.status === 'accepted');
  const inProgressRequests = myRequests.filter(r => r.status === 'in_progress');
  const completedRequests = myRequests.filter(r => r.status === 'completed' || r.status === 'pending_approval');

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

  // For couriers, include available marketplace orders in "available" count
  const availableCount = user?.specialization === 'courier'
    ? availableRequests.length + availableMarketplaceOrders.length
    : availableRequests.length;

  const baseTabs = [
    { id: 'available' as const, label: language === 'ru' ? 'Доступные' : 'Mavjud', count: availableCount, color: 'bg-purple-500', icon: FileText },
    { id: 'assigned' as const, label: language === 'ru' ? 'Назначенные' : 'Tayinlangan', count: assignedRequests.length, color: 'bg-blue-500', icon: Clock },
    { id: 'in_progress' as const, label: language === 'ru' ? 'В работе' : 'Ishda', count: inProgressRequests.length, color: 'bg-amber-500', icon: Play },
    { id: 'completed' as const, label: language === 'ru' ? 'Выполненные' : 'Bajarilgan', count: completedRequests.length, color: 'bg-green-500', icon: CheckCircle },
  ];

  // For couriers: include assigned marketplace orders in "Назначенные" count
  const assignedCount = user?.specialization === 'courier'
    ? assignedRequests.length + assignedMarketplaceOrders.length
    : assignedRequests.length;

  // For couriers: "Мои доставки" first, then "Доступные", "Назначенные", "Доставленные" (no "В работе")
  const tabs = user?.specialization === 'courier'
    ? [
        { id: 'marketplace' as const, label: language === 'ru' ? 'Мои доставки' : 'Mening yetkazishlarim', count: activeMarketplaceOrders.length, color: 'bg-orange-500', icon: ShoppingBag },
        { id: 'available' as const, label: language === 'ru' ? 'Доступные' : 'Mavjud', count: availableCount, color: 'bg-purple-500', icon: FileText },
        { id: 'assigned' as const, label: language === 'ru' ? 'Назначенные' : 'Tayinlangan', count: assignedCount, color: 'bg-blue-500', icon: Clock },
        { id: 'delivered' as const, label: language === 'ru' ? 'Доставленные' : 'Yetkazilganlar', count: completedMarketplaceOrders.length, color: 'bg-emerald-500', icon: Truck },
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
      alert('Сначала завершите текущую работу');
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
      } catch (error) {
        console.error('Failed to decline request:', error);
        // Error will be handled by declineRequest rollback, just close modal
        setShowDeclineModal(false);
        setRequestToDecline(null);
      }
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header - Mobile optimized */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Мои заявки</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1 truncate">
            {user?.name} • {SPECIALIZATION_LABELS[user?.specialization as ExecutorSpecialization] || 'Исполнитель'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <div className={`px-3 py-2 rounded-xl text-sm font-medium ${
            currentExecutor?.status === 'available' ? 'bg-green-100 text-green-700' :
            currentExecutor?.status === 'busy' ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {currentExecutor?.status === 'available' ? 'Доступен' :
             currentExecutor?.status === 'busy' ? 'Занят' : 'Оффлайн'}
          </div>
        </div>
      </div>

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
                {language === 'ru' ? 'Житель предлагает перенести заявку' : 'Yashovchi arizani ko\'chirishni taklif qiladi'}
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

      {/* Stats Cards - Personal Performance - Mobile optimized */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">
                {isLoadingStats ? '...' : (liveStats?.rating || 5.0)}
              </div>
              <div className="text-xs md:text-sm text-gray-500">
                {language === 'ru' ? 'Рейтинг' : 'Reyting'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
              {user?.specialization === 'courier' ? (
                <Truck className="w-5 h-5 md:w-6 md:h-6 text-white" />
              ) : (
                <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">
                {isLoadingStats ? '...' : (
                  user?.specialization === 'courier'
                    ? (liveStats?.totalDelivered || 0)
                    : (liveStats?.totalCompleted || 0)
                )}
              </div>
              <div className="text-xs md:text-sm text-gray-500">
                {user?.specialization === 'courier'
                  ? (language === 'ru' ? 'Доставлено' : 'Yetkazildi')
                  : (language === 'ru' ? 'Выполнено' : 'Bajarildi')
                }
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">
                {isLoadingStats ? '...' : (
                  user?.specialization === 'courier'
                    ? (liveStats?.deliveredThisWeek || 0)
                    : (liveStats?.thisWeek || 0)
                )}
              </div>
              <div className="text-xs md:text-sm text-gray-500">
                {language === 'ru' ? 'За неделю' : 'Hafta'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Timer className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl md:text-3xl font-bold">
                {isLoadingStats ? '...' : (liveStats?.avgCompletionTime || 0)}
              </div>
              <div className="text-xs md:text-sm text-gray-500 leading-tight">
                {language === 'ru' ? 'Сред. мин' : 'O\'rt. daq'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Work Timer - Mobile optimized - Show if there's work in progress */}
      {inProgressRequests.length > 0 && (
        <div className={`glass-card p-4 md:p-6 border-2 ${inProgressRequests[0]?.isPaused ? 'border-gray-400 bg-gray-50/50' : 'border-amber-400 bg-amber-50/50'}`}>
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className={`w-3 h-3 rounded-full ${inProgressRequests[0]?.isPaused ? 'bg-gray-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className={`font-medium ${inProgressRequests[0]?.isPaused ? 'text-gray-700' : 'text-amber-700'}`}>
              {inProgressRequests[0]?.isPaused ? 'Работа приостановлена' : 'Активная работа'}
            </span>
          </div>
          {inProgressRequests.map(req => (
            <div key={req.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base md:text-lg truncate">#{req.number} - {req.title}</div>
                <div className="text-sm md:text-base text-gray-600 truncate">{formatAddress(req.address, req.apartment)}</div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4">
                <div className="text-center">
                  <div className={`text-3xl md:text-4xl font-mono font-bold ${req.isPaused ? 'text-gray-500' : 'text-amber-600'}`}>
                    {formatTime(activeTimers[req.id] || 0)}
                  </div>
                  <div className="text-xs md:text-sm text-gray-500">
                    {req.isPaused ? 'Пауза' : 'Время работы'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {req.isPaused ? (
                    <button
                      onClick={() => handleResumeWork(req.id)}
                      className="py-3 px-4 md:px-5 rounded-xl font-semibold text-white flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                    >
                      <PlayCircle className="w-5 h-5" />
                      <span className="hidden md:inline">Продолжить</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePauseWork(req.id)}
                      className="py-3 px-4 md:px-5 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-300 flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                    >
                      <Pause className="w-5 h-5" />
                      <span className="hidden md:inline">Пауза</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleComplete(req.id)}
                    className="py-3 px-4 md:px-5 rounded-xl font-semibold text-white flex items-center gap-2 active:scale-95 transition-transform touch-manipulation"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    <Check className="w-5 h-5" />
                    <span className="hidden md:inline">Завершить</span>
                    <span className="md:hidden">Готово</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs - Mobile optimized with horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="glass-card p-1.5 md:p-1 flex gap-1 min-w-max md:min-w-0 md:inline-flex">
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
          {activeTab === 'marketplace' ? (
            <div className="space-y-4">
              {isLoadingOrders ? (
                <div className="glass-card p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-500">{language === 'ru' ? 'Загрузка заказов...' : 'Buyurtmalar yuklanmoqda...'}</p>
                </div>
              ) : activeMarketplaceOrders.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Truck className="w-8 h-8 text-orange-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">
                    {language === 'ru' ? 'Нет активных доставок' : 'Faol yetkazishlar yo\'q'}
                  </h3>
                  <p className="text-gray-400 mt-1">
                    {language === 'ru' ? 'Возьмите заказ из вкладки "Доступные"' : '"Mavjud" bo\'limidan buyurtma oling'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeMarketplaceOrders.map((order) => (
                    <MarketplaceOrderCard
                      key={order.id}
                      order={order}
                      onView={() => setSelectedMarketplaceOrder(order)}
                      onUpdateStatus={updateMarketplaceOrderStatus}
                      language={language}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'delivered' ? (
            <div className="space-y-4">
              {isLoadingOrders ? (
                <div className="glass-card p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-500">{language === 'ru' ? 'Загрузка заказов...' : 'Buyurtmalar yuklanmoqda...'}</p>
                </div>
              ) : completedMarketplaceOrders.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">
                    {language === 'ru' ? 'Нет доставленных заказов' : 'Yetkazilgan buyurtmalar yo\'q'}
                  </h3>
                  <p className="text-gray-400 mt-1">
                    {language === 'ru' ? 'Здесь будут отображаться доставленные заказы' : 'Bu yerda yetkazilgan buyurtmalar ko\'rsatiladi'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedMarketplaceOrders.map((order) => (
                    <CompletedMarketplaceOrderCard
                      key={order.id}
                      order={order}
                      onView={() => setSelectedMarketplaceOrder(order)}
                      language={language}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* For couriers on "available" tab - show marketplace orders first */}
              {activeTab === 'available' && user?.specialization === 'courier' && availableMarketplaceOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-orange-500" />
                    {language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari'}
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
                      {availableMarketplaceOrders.length}
                    </span>
                  </h3>
                  {availableMarketplaceOrders.map((order) => (
                    <AvailableMarketplaceOrderCard
                      key={order.id}
                      order={order}
                      onTake={() => takeMarketplaceOrder(order.id)}
                      language={language}
                    />
                  ))}
                </div>
              )}

              {/* For couriers on "assigned" tab - show assigned marketplace orders */}
              {activeTab === 'assigned' && user?.specialization === 'courier' && assignedMarketplaceOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-500" />
                    {language === 'ru' ? 'Назначенные заказы' : 'Tayinlangan buyurtmalar'}
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                      {assignedMarketplaceOrders.length}
                    </span>
                  </h3>
                  {assignedMarketplaceOrders.map((order) => (
                    <MarketplaceOrderCard
                      key={order.id}
                      order={order}
                      onView={() => setSelectedMarketplaceOrder(order)}
                      onUpdateStatus={updateMarketplaceOrderStatus}
                      language={language}
                    />
                  ))}
                </div>
              )}

              {/* Regular service requests */}
              {currentRequests.length > 0 && (
                <div className="space-y-3">
                  {/* Show section header if there are also marketplace orders in the same tab */}
                  {((activeTab === 'available' && user?.specialization === 'courier' && availableMarketplaceOrders.length > 0) ||
                    (activeTab === 'assigned' && user?.specialization === 'courier' && assignedMarketplaceOrders.length > 0)) && (
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-500" />
                      {language === 'ru' ? 'Заявки на услуги' : 'Xizmat so\'rovlari'}
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">
                        {currentRequests.length}
                      </span>
                    </h3>
                  )}
                  {currentRequests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      timerSeconds={activeTimers[request.id]}
                      hasActiveWork={inProgressRequests.length > 0}
                      onView={() => setSelectedRequest(request)}
                      onTakeRequest={() => handleTakeRequest(request.id)}
                      onAccept={() => handleAccept(request.id)}
                      onStartWork={() => handleStartWork(request.id)}
                      onPauseWork={() => handlePauseWork(request.id)}
                      onResumeWork={() => handleResumeWork(request.id)}
                      onComplete={() => handleComplete(request.id)}
                      onDecline={() => handleDeclineClick(request)}
                      onReschedule={() => {
                        setRequestToReschedule(request);
                        setShowRescheduleModal(true);
                      }}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              )}

              {/* Empty state - only show if both lists are empty */}
              {currentRequests.length === 0 &&
               !(activeTab === 'available' && user?.specialization === 'courier' && availableMarketplaceOrders.length > 0) &&
               !(activeTab === 'assigned' && user?.specialization === 'courier' && assignedMarketplaceOrders.length > 0) && (
                <div className="glass-card p-8 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">Нет заявок</h3>
                  <p className="text-gray-400 mt-1">
                    {activeTab === 'available' && 'Нет доступных заявок по вашей специализации'}
                    {activeTab === 'assigned' && 'Нет назначенных заявок'}
                    {activeTab === 'in_progress' && 'Нет заявок в работе'}
                    {activeTab === 'completed' && 'Нет выполненных заявок'}
                  </p>
                </div>
              )}
            </div>
          )}

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
      {showDeclineModal && requestToDecline && (
        <DeclineRequestModal
          request={requestToDecline}
          onClose={() => {
            setShowDeclineModal(false);
            setRequestToDecline(null);
          }}
          onConfirm={handleDeclineConfirm}
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

// Request Card Component - Mobile optimized
function RequestCard({
  request,
  timerSeconds,
  hasActiveWork,
  onView,
  onTakeRequest,
  onAccept,
  onStartWork,
  onPauseWork,
  onResumeWork,
  onComplete,
  onDecline,
  onReschedule,
  formatTime
}: {
  request: Request;
  timerSeconds?: number;
  hasActiveWork?: boolean;
  onView: () => void;
  onTakeRequest: () => void;
  onAccept: () => void;
  onStartWork: () => void;
  onPauseWork: () => void;
  onResumeWork: () => void;
  onComplete: () => void;
  onDecline: () => void;
  onReschedule: () => void;
  formatTime: (s: number) => string;
}) {
  // Can decline/release if assigned, accepted, or in_progress (for illness, etc.)
  const canDecline = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-amber-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    const baseClass = "px-2 py-1 rounded-lg text-xs font-medium";
    switch (status) {
      case 'new': return <span className={`${baseClass} bg-purple-100 text-purple-700`}>Новая</span>;
      case 'assigned': return <span className={`${baseClass} bg-blue-100 text-blue-700`}>Назначена</span>;
      case 'accepted': return <span className={`${baseClass} bg-cyan-100 text-cyan-700`}>Принята</span>;
      case 'in_progress': return <span className={`${baseClass} bg-amber-100 text-amber-700`}>В работе</span>;
      case 'pending_approval': return <span className={`${baseClass} bg-purple-100 text-purple-700`}>Ожидает</span>;
      case 'completed': return <span className={`${baseClass} bg-green-100 text-green-700`}>Выполнена</span>;
      default: return <span className={baseClass}>{STATUS_LABELS[status]}</span>;
    }
  };

  return (
    <div className="glass-card p-4 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation" onClick={onView}>
      {/* Header with priority indicator */}
      <div className="flex items-start gap-3">
        <div className={`w-2 h-full min-h-[20px] rounded-full ${getPriorityColor(request.priority)} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          {/* Title and status */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs text-gray-400">#{request.number}</span>
            {getStatusBadge(request.status)}
            {request.status === 'in_progress' && timerSeconds !== undefined && (
              <span className={`flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-xs ${request.isPaused ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                {request.isPaused ? <Pause className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                {formatTime(timerSeconds)}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-base md:text-lg leading-tight truncate">{request.title}</h3>
          <p className="text-gray-600 text-sm line-clamp-2 mt-1">{request.description}</p>

          {/* Contact info - compact on mobile */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs md:text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">{request.residentName}</span>
            </span>
            <a
              href={`tel:${request.residentPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-primary-600 active:text-primary-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Позвонить</span>
            </a>
          </div>

          {/* Address and date */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{formatAddress(request.address, request.apartment)}</span>
            </span>
          </div>

          {/* Scheduled date if exists */}
          {request.scheduledDate && (
            <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>{new Date(request.scheduledDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
              {request.scheduledTime && <span>{request.scheduledTime}</span>}
            </div>
          )}

          {/* Priority info - show for assigned/accepted/in_progress requests */}
          {['assigned', 'accepted', 'in_progress'].includes(request.status) && (
            <div className="mt-3 p-2 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500">
                <span className="text-gray-400">Приоритет: </span>
                <span className={`font-medium ${
                  request.priority === 'urgent' ? 'text-red-600' :
                  request.priority === 'high' ? 'text-orange-600' :
                  request.priority === 'medium' ? 'text-amber-600' : 'text-gray-600'
                }`}>
                  {request.priority === 'urgent' ? 'Срочный' :
                   request.priority === 'high' ? 'Высокий' :
                   request.priority === 'medium' ? 'Средний' : 'Низкий'}
                </span>
              </div>
            </div>
          )}

          {/* Reschedule button - prominent, similar to residents view */}
          {['assigned', 'accepted', 'in_progress'].includes(request.status) && (
            <button
              onClick={(e) => { e.stopPropagation(); onReschedule(); }}
              className="mt-3 w-full py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] touch-manipulation"
            >
              <RefreshCw className="w-4 h-4" />
              Перенести на другое время
            </button>
          )}

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                />
              ))}
            </div>
          )}

          {/* Pending approval notice */}
          {request.status === 'pending_approval' && (
            <div className="mt-2 text-xs text-purple-600 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Ожидание подтверждения
            </div>
          )}

          {/* Rejection info */}
          {request.status === 'in_progress' && request.rejectionReason && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-1 text-red-700 font-medium text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                Требуется доработка
              </div>
              <p className="text-xs text-red-600 mt-1 line-clamp-2">{request.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons - full width on mobile */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200/50" onClick={(e) => e.stopPropagation()}>
        {canDecline && (
          <button
            onClick={onDecline}
            className="py-3 px-4 text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors touch-manipulation"
          >
            <XCircle className="w-4 h-4" />
            <span className="hidden md:inline">{request.status === 'in_progress' ? 'Освободить' : 'Отказаться'}</span>
          </button>
        )}
        {request.status === 'new' && (
          <button
            onClick={onTakeRequest}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
          >
            <Hand className="w-5 h-5" />
            Взять заявку
          </button>
        )}
        {request.status === 'assigned' && (
          <button
            onClick={onAccept}
            className="flex-1 py-3 px-4 rounded-xl font-semibold bg-white border-2 border-gray-200 text-gray-700 flex items-center justify-center gap-2 active:scale-[0.98] active:bg-gray-50 transition-all touch-manipulation"
          >
            <Check className="w-5 h-5" />
            Принять
          </button>
        )}
        {request.status === 'accepted' && (
          hasActiveWork ? (
            <div className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 text-gray-500 flex items-center justify-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4" />
              Сначала завершите текущую работу
            </div>
          ) : (
            <button
              onClick={onStartWork}
              className="flex-1 py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #FFE500, #FFC700)', color: '#000' }}
            >
              <Play className="w-5 h-5" />
              Начать работу
            </button>
          )
        )}
        {request.status === 'in_progress' && (
          <div className="flex-1 flex gap-2">
            {request.isPaused ? (
              <button
                onClick={onResumeWork}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
              >
                <PlayCircle className="w-5 h-5" />
                Продолжить
              </button>
            ) : (
              <button
                onClick={onPauseWork}
                className="py-3 px-4 rounded-xl font-semibold text-gray-700 bg-white border-2 border-gray-300 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onComplete}
              className="flex-1 py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Check className="w-5 h-5" />
              Завершить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Request Details Modal
function RequestDetailsModal({
  request,
  timerSeconds,
  onClose,
  onTakeRequest,
  onAccept,
  onStartWork,
  onComplete,
  onDecline,
  onReschedule,
  formatTime
}: {
  request: Request;
  timerSeconds?: number;
  onClose: () => void;
  onTakeRequest: () => void;
  onAccept: () => void;
  onStartWork: () => void;
  onComplete: () => void;
  onDecline: () => void;
  onReschedule: () => void;
  formatTime: (s: number) => string;
}) {
  // Can decline/release if assigned, accepted, or in_progress (for illness, etc.)
  const canDecline = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  // Can reschedule if assigned, accepted, or in_progress
  const canReschedule = ['assigned', 'accepted', 'in_progress'].includes(request.status);
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return { label: 'Срочно', color: 'text-red-600 bg-red-50' };
      case 'high': return { label: 'Высокий', color: 'text-orange-600 bg-orange-50' };
      case 'medium': return { label: 'Средний', color: 'text-amber-600 bg-amber-50' };
      default: return { label: 'Низкий', color: 'text-gray-600 bg-gray-50' };
    }
  };

  const priority = getPriorityLabel(request.priority);

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-500">Заявка #{request.number}</div>
            <h2 className="text-xl font-bold">{request.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Timer Display */}
        {request.status === 'in_progress' && timerSeconds !== undefined && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
                <span className="font-medium text-amber-700">Работа в процессе</span>
              </div>
              <div className="text-3xl font-mono font-bold text-amber-600">
                {formatTime(timerSeconds)}
              </div>
            </div>
          </div>
        )}

        {/* Rejection Info - show if work was rejected */}
        {request.status === 'in_progress' && request.rejectionReason && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
              <AlertCircle className="w-5 h-5" />
              <span>Работа отклонена - требуется доработка</span>
              {request.rejectionCount && request.rejectionCount > 1 && (
                <span className="text-xs bg-red-100 px-2 py-0.5 rounded">
                  {request.rejectionCount}-й раз
                </span>
              )}
            </div>
            <p className="text-red-600 mb-3">
              <span className="font-medium">Причина отклонения:</span> {request.rejectionReason}
            </p>
            <p className="text-sm text-red-600/80">
              Пожалуйста, устраните проблему и завершите работу снова. После выполнения нажмите "Завершить работу".
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Priority & Category */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${priority.color}`}>
              {priority.label}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
              {SPECIALIZATION_LABELS[request.category]}
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Описание</h3>
            <p className="text-gray-900">{request.description}</p>
          </div>

          {/* Scheduled Date/Time */}
          {request.scheduledDate && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="font-medium text-blue-800 flex items-center gap-2 mb-2">
                <CalendarDays className="w-4 h-4" />
                Желаемое время выполнения
              </h3>
              <div className="flex items-center gap-4 text-blue-700">
                <span>{new Date(request.scheduledDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                {request.scheduledTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {request.scheduledTime}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Resident Info */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">Информация о жителе</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{request.residentName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <a href={`tel:${request.residentPhone}`} className="text-primary-600 hover:underline">
                  {request.residentPhone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{formatAddress(request.address, request.apartment)}</span>
              </div>
              {request.accessInfo && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-700 font-medium mb-1">🔑 Доступ в квартиру:</div>
                  <div className="text-sm text-amber-900">{request.accessInfo}</div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">История</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Создана</span>
                <span>{formatDate(request.createdAt)}</span>
              </div>
              {request.assignedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Назначена</span>
                  <span>{formatDate(request.assignedAt)}</span>
                </div>
              )}
              {request.acceptedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Принята</span>
                  <span>{formatDate(request.acceptedAt)}</span>
                </div>
              )}
              {request.startedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Работа начата</span>
                  <span>{formatDate(request.startedAt)}</span>
                </div>
              )}
              {request.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Работа завершена</span>
                  <span>{formatDate(request.completedAt)}</span>
                </div>
              )}
              {request.approvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Подтверждена</span>
                  <span>{formatDate(request.approvedAt)}</span>
                </div>
              )}
              {request.workDuration && (
                <div className="flex items-center justify-between border-t pt-2 mt-2">
                  <span className="text-gray-500">Время работы</span>
                  <span className="font-medium">{Math.round(request.workDuration / 60)} мин</span>
                </div>
              )}
            </div>
          </div>

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="bg-white/30 rounded-xl p-4">
              <h3 className="font-medium mb-2">Оценка</h3>
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
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-3">
            <a
              href={`tel:${request.residentPhone}`}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Позвонить
            </a>
            {request.status === 'new' && (
              <button
                onClick={onTakeRequest}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
              >
                <Hand className="w-4 h-4" />
                Взять заявку
              </button>
            )}
            {request.status === 'assigned' && (
              <button onClick={onAccept} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                Принять заявку
              </button>
            )}
            {request.status === 'accepted' && (
              <button onClick={onStartWork} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Play className="w-4 h-4" />
                Начать работу
              </button>
            )}
            {request.status === 'in_progress' && (
              <button
                onClick={onComplete}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Check className="w-4 h-4" />
                Завершить
              </button>
            )}
          </div>
          {canReschedule && (
            <button
              onClick={onReschedule}
              className="w-full py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Перенести на другое время
            </button>
          )}
          {canDecline && (
            <button
              onClick={onDecline}
              className="w-full py-2 px-4 rounded-xl font-medium text-red-600 border border-red-300 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              {request.status === 'in_progress' ? 'Освободить заявку' : 'Отказаться от заявки'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Decline Request Modal (for executors)
function DeclineRequestModal({
  request,
  onClose,
  onConfirm
}: {
  request: Request;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const isInProgress = request.status === 'in_progress';

  const predefinedReasons = isInProgress ? [
    'Заболел/Не могу продолжить работу',
    'Необходима помощь другого специалиста',
    'Нет необходимых материалов для завершения',
    'Срочные личные обстоятельства',
    'Требуется другая специализация',
  ] : [
    'Не смогу прибыть в указанное время',
    'Нет необходимых материалов/инструментов',
    'Заболел/Не могу работать',
    'Слишком далеко от текущего местоположения',
    'Загружен другими заявками',
  ];

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-red-600 flex items-center gap-2">
            <Ban className="w-5 h-5" />
            {isInProgress ? 'Освободить заявку' : 'Отказаться от заявки'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            Заявка <strong>#{request.number}</strong> будет возвращена в очередь и может быть назначена другому исполнителю.
            {isInProgress && ' Прогресс работы будет сброшен.'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Причина отказа
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
              placeholder="Или укажите свою причину..."
            />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Отмена
            </button>
            <button
              onClick={() => reason.trim() && onConfirm(reason)}
              className="flex-1 py-2 px-4 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!reason.trim()}
            >
              <Ban className="w-4 h-4 mr-2 inline" />
              {isInProgress ? 'Освободить' : 'Отказаться'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reschedule Request Modal for Executor
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
  const [reason, setReason] = useState<RescheduleReason>('busy_time');
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
              ? `Предложите новое время для заявки #${request.number}. Житель получит уведомление.`
              : `#${request.number} ariza uchun yangi vaqt taklif qiling.`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Причина переноса' : 'Ko\'chirish sababi'}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {/* Filter out 'not_at_home' - this reason is only for residents, not executors */}
              {(Object.keys(RESCHEDULE_REASON_LABELS) as RescheduleReason[])
                .filter(r => r !== 'not_at_home')
                .map((r) => (
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

// Reschedule Response Modal for Executor
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

// Available Marketplace Order Card Component (for taking orders)
function AvailableMarketplaceOrderCard({
  order,
  onTake,
  language,
}: {
  order: MarketplaceOrder;
  onTake: () => void;
  language: 'ru' | 'uz';
}) {
  return (
    <div className="glass-card p-4 border-2 border-purple-200 bg-purple-50/30">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Package className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-purple-100 text-purple-700">
              {language === 'ru' ? 'Новый' : 'Yangi'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {order.items_count} {language === 'ru' ? 'товар(ов)' : 'mahsulot'} • {order.total_amount.toLocaleString()} сум
          </div>

          {/* Customer Info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{order.user_name}</span>
            </span>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Take Button */}
      <div className="mt-4 pt-3 border-t border-purple-200/50">
        <button
          onClick={onTake}
          className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
        >
          <Hand className="w-5 h-5" />
          {language === 'ru' ? 'Взять заказ' : 'Buyurtmani olish'}
        </button>
      </div>
    </div>
  );
}

// Completed Marketplace Order Card Component (for delivered orders in Completed tab)
function CompletedMarketplaceOrderCard({
  order,
  onView,
  language,
}: {
  order: MarketplaceOrder;
  onView: () => void;
  language: 'ru' | 'uz';
}) {
  return (
    <div
      className="glass-card p-4 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation border-2 border-green-200 bg-green-50/30"
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-100 text-green-700">
              {language === 'ru' ? 'Доставлен' : 'Yetkazildi'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {order.items_count} {language === 'ru' ? 'товар(ов)' : 'mahsulot'} • {order.total_amount.toLocaleString()} сум
          </div>

          {/* Customer Info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{order.user_name}</span>
            </span>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Marketplace Order Card Component
function MarketplaceOrderCard({
  order,
  onView,
  onUpdateStatus,
  language,
}: {
  order: MarketplaceOrder;
  onView: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  language: 'ru' | 'uz';
}) {
  const MARKETPLACE_ORDER_STATUS_LABELS: Record<string, { label: string; labelUz: string; color: string; icon: typeof Package }> = {
    confirmed: { label: 'Назначен', labelUz: 'Tayinlangan', color: 'bg-indigo-100 text-indigo-700', icon: Package },
    preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'bg-amber-100 text-amber-700', icon: ChefHat },
    ready: { label: 'Готов', labelUz: 'Tayyor', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'bg-blue-100 text-blue-700', icon: Truck },
    delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'bg-gray-100 text-gray-700', icon: CheckCircle },
  };

  const statusInfo = MARKETPLACE_ORDER_STATUS_LABELS[order.status] || MARKETPLACE_ORDER_STATUS_LABELS.confirmed;
  const StatusIcon = statusInfo.icon;

  const getNextStatus = () => {
    const transitions: Record<string, string> = {
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'delivering',
      delivering: 'delivered',
    };
    return transitions[order.status];
  };

  const getNextStatusLabel = () => {
    const labels: Record<string, { ru: string; uz: string }> = {
      preparing: { ru: 'Начать готовить', uz: 'Tayyorlashni boshlash' },
      ready: { ru: 'Готово к доставке', uz: 'Yetkazishga tayyor' },
      delivering: { ru: 'Начать доставку', uz: 'Yetkazishni boshlash' },
      delivered: { ru: 'Доставлено', uz: 'Yetkazildi' },
    };
    const next = getNextStatus();
    return next ? labels[next] : null;
  };

  const nextStatusLabel = getNextStatusLabel();

  return (
    <div className="glass-card p-4 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation" onClick={onView}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1 ${statusInfo.color}`}>
              <StatusIcon className="w-3 h-3" />
              {language === 'ru' ? statusInfo.label : statusInfo.labelUz}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {order.items_count} {language === 'ru' ? 'товар(ов)' : 'mahsulot'} • {order.total_amount.toLocaleString()} сум
          </div>

          {/* Customer Info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{order.user_name}</span>
            </span>
            <a
              href={`tel:${order.user_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-primary-600 active:text-primary-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{language === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq'}</span>
            </a>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Action Button */}
      {nextStatusLabel && (
        <div className="mt-4 pt-3 border-t border-gray-200/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onUpdateStatus(order.id, getNextStatus())}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
            style={{
              background: order.status === 'confirmed' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                order.status === 'preparing' ? 'linear-gradient(135deg, #10b981, #059669)' :
                order.status === 'ready' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                'linear-gradient(135deg, #10b981, #059669)'
            }}
          >
            {order.status === 'confirmed' && <ChefHat className="w-5 h-5" />}
            {order.status === 'preparing' && <CheckCircle className="w-5 h-5" />}
            {order.status === 'ready' && <Truck className="w-5 h-5" />}
            {order.status === 'delivering' && <CheckCircle className="w-5 h-5" />}
            {language === 'ru' ? nextStatusLabel.ru : nextStatusLabel.uz}
          </button>
        </div>
      )}
    </div>
  );
}

// Marketplace Order Details Modal
function MarketplaceOrderDetailsModal({
  order,
  onClose,
  onUpdateStatus,
  language,
}: {
  order: MarketplaceOrder;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  language: 'ru' | 'uz';
}) {
  const MARKETPLACE_ORDER_STATUS_LABELS: Record<string, { label: string; labelUz: string; color: string }> = {
    confirmed: { label: 'Назначен', labelUz: 'Tayinlangan', color: 'bg-indigo-100 text-indigo-700' },
    preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'bg-amber-100 text-amber-700' },
    ready: { label: 'Готов', labelUz: 'Tayyor', color: 'bg-green-100 text-green-700' },
    delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'bg-blue-100 text-blue-700' },
    delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'bg-gray-100 text-gray-700' },
  };

  const statusInfo = MARKETPLACE_ORDER_STATUS_LABELS[order.status] || MARKETPLACE_ORDER_STATUS_LABELS.confirmed;

  const getNextStatus = () => {
    const transitions: Record<string, string> = {
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'delivering',
      delivering: 'delivered',
    };
    return transitions[order.status];
  };

  const getNextStatusLabel = () => {
    const labels: Record<string, { ru: string; uz: string; icon: typeof Package }> = {
      preparing: { ru: 'Начать готовить', uz: 'Tayyorlashni boshlash', icon: ChefHat },
      ready: { ru: 'Готово к доставке', uz: 'Yetkazishga tayyor', icon: CheckCircle },
      delivering: { ru: 'Начать доставку', uz: 'Yetkazishni boshlash', icon: Truck },
      delivered: { ru: 'Доставлено', uz: 'Yetkazildi', icon: CheckCircle },
    };
    const next = getNextStatus();
    return next ? labels[next] : null;
  };

  const nextStatusInfo = getNextStatusLabel();
  const NextIcon = nextStatusInfo?.icon || Package;

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-500">
              {language === 'ru' ? 'Заказ магазина' : 'Do\'kon buyurtmasi'} #{order.order_number}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2.5 py-1 rounded-lg text-sm font-medium ${statusInfo.color}`}>
                {language === 'ru' ? statusInfo.label : statusInfo.labelUz}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Order Info */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">
                  {order.items_count} {language === 'ru' ? 'товар(ов)' : 'mahsulot'}
                </div>
                <div className="text-lg font-bold text-orange-600">
                  {order.total_amount.toLocaleString()} сум
                </div>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? 'Информация о клиенте' : 'Mijoz haqida'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{order.user_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <a href={`tel:${order.user_phone}`} className="text-primary-600 hover:underline">
                  {order.user_phone}
                </a>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span>{order.delivery_address}</span>
              </div>
            </div>
          </div>

          {/* Delivery Notes */}
          {order.delivery_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-medium text-amber-800 mb-2">
                {language === 'ru' ? 'Примечание к доставке' : 'Yetkazish uchun eslatma'}
              </h3>
              <p className="text-sm text-amber-700">{order.delivery_notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? 'История' : 'Tarix'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Создан' : 'Yaratildi'}</span>
                <span>{new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {order.assigned_at && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? 'Назначен' : 'Tayinlandi'}</span>
                  <span>{new Date(order.assigned_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-3">
            <a
              href={`tel:${order.user_phone}`}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              {language === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq'}
            </a>
          </div>

          {nextStatusInfo && (
            <button
              onClick={() => {
                onUpdateStatus(order.id, getNextStatus());
              }}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{
                background: order.status === 'confirmed' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                  order.status === 'preparing' ? 'linear-gradient(135deg, #10b981, #059669)' :
                  order.status === 'ready' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                  'linear-gradient(135deg, #10b981, #059669)'
              }}
            >
              <NextIcon className="w-5 h-5" />
              {language === 'ru' ? nextStatusInfo.ru : nextStatusInfo.uz}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

