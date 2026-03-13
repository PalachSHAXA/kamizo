import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { InstallAppSection } from '../components/InstallAppSection';
import {
  Plus, FileText, Clock, CheckCircle, Star, X, Check,
  User, Calendar, History, ChevronRight, MapPin, Ban, RefreshCw, Send,
  MessageCircle, QrCode, Bell, Vote, ShoppingBag, Phone, Megaphone,
  ScrollText, Wrench, ArrowRight, Menu, Search, Wallet,
  Zap, ShieldCheck, Sparkles, ArrowUpDown, Trash2, Flame, Snowflake, ClipboardList, Filter
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useTenantStore } from '../stores/tenantStore';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../types';
import type { Request, ExecutorSpecialization, RequestPriority, RescheduleRequest } from '../types';
import { RequestStatusTracker, RequestStatusTrackerCompact } from '../components/RequestStatusTracker';
import { formatAddress } from '../utils/formatAddress';
import RescheduleModal from '../components/modals/RescheduleModal';
import RescheduleResponseModal from '../components/modals/RescheduleResponseModal';
import { CancelRequestModal } from '../components/modals/CancelRequestModal';

export function ResidentDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { requests, addRequest, approveRequest, rejectRequest, cancelRequest, createRescheduleRequest, respondToRescheduleRequest, getPendingRescheduleForUser, getActiveRescheduleForRequest, fetchRequests, fetchPendingReschedules } = useDataStore();

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
  const [activeTab, setActiveTab] = useState<'home' | 'requests'>(() => tabParam === 'requests' ? 'requests' : 'home');
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCatFilter, setServiceCatFilter] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

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
  const switchTab = (tab: 'home' | 'requests') => {
    setActiveTab(tab);
    if (tab === 'requests') {
      setSearchParams({ tab: 'requests' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };
  const [requestsSubTab, setRequestsSubTab] = useState<'active' | 'pending_tab' | 'history_tab'>('active');
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

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all touch-manipulation active:scale-[0.96] ${
      active
        ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.25)]'
        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
    }`;

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
        <div className="space-y-3 px-2.5 md:px-0">

          {/* ── ACTIVE REQUESTS — using RequestStatusTrackerCompact ── */}
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

          {/* ── ACTIONS SECTION ── */}
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.8px] px-1">
            {language === 'ru' ? 'Действия' : 'Amallar'}
          </div>

          {/* Hero card — Вызвать мастера */}
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
                <Search className="w-[21px] h-[21px] text-amber-500" strokeWidth={1.8} />
              </div>
              <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Найти авто' : 'Avto qidirish'}</div>
              <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Поиск по номеру' : 'Raqam bo\'yicha qidirish'}</div>
            </button>
            <button
              onClick={() => navigate('/useful-contacts')}
              className="bg-white rounded-[18px] p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)] active:scale-[0.94] transition-transform touch-manipulation"
            >
              <div className="w-[42px] h-[42px] rounded-[13px] bg-red-50 flex items-center justify-center mb-[11px]">
                <Phone className="w-[21px] h-[21px] text-red-500" strokeWidth={1.8} />
              </div>
              <div className="text-[14px] font-bold text-gray-900">{language === 'ru' ? 'Контакты' : 'Kontaktlar'}</div>
              <div className="text-[11px] text-gray-500 font-medium mt-0.5">{language === 'ru' ? 'Полезные' : 'Foydali'}</div>
            </button>
          </div>

          {/* ── COMMUNAL PAYMENTS CARD ── */}
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

          {/* ── NEWS — Announcements & Meetings ── */}
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

          {/* ── MORE SERVICES — small grid ── */}
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
      )}

      {/* ── All Services Bottom Sheet (FAB menu) ── */}
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
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
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
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
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
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    requestsSubTab === sub.id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {sub.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Active requests */}
          {requestsSubTab === 'active' && (
            <div className="space-y-3">
              {activeRequests.length === 0 ? (
                <div className="bg-white rounded-[18px] p-8 text-center shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-7 h-7 text-gray-300" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-gray-500">{language === 'ru' ? 'Больше заявок нет' : 'Boshqa arizalar yo\'q'}</h3>
                  <p className="text-[13px] text-gray-400 mt-1">{language === 'ru' ? 'Создайте заявку на главной' : 'Bosh sahifada ariza yarating'}</p>
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
          {requestsSubTab === 'pending_tab' && (
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
          {requestsSubTab === 'history_tab' && (
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
    const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        <div className="bg-white/60 rounded-lg p-3 md:p-4">
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:max-w-lg md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[88vh] md:max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryInfo?.icon}</span>
            <div>
              <h2 className="text-[17px] font-bold text-gray-900">{language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}</h2>
              <p className="text-[13px] text-gray-500 font-medium">{language === 'ru' ? categoryInfo?.name : categoryInfo?.nameUz}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors touch-manipulation"
          >
            <X className="w-[18px] h-[18px] text-gray-400" />
          </button>
        </div>

        {/* Scrollable form content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
              <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
                <label className="block text-sm font-medium text-primary-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === 'ru' ? 'Дата и время вывоза' : 'Olib ketish sanasi va vaqti'} *
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'} <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={trashDate}
                      onChange={(e) => setTrashDate(e.target.value)}
                      min={getMinDate()}
                      max={getMaxDate()}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'} <span className="text-red-500">*</span></label>
                    <select
                      value={trashTime}
                      onChange={(e) => setTrashTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
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
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
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
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[90px] text-sm resize-none"
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
            <div className="grid grid-cols-2 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all touch-manipulation ${
                    priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white shadow-md' :
                        p === 'high' ? 'bg-orange-500 text-white shadow-md' :
                        p === 'medium' ? 'bg-primary-500 text-white shadow-md' :
                        'bg-gray-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {language === 'ru' ? PRIORITY_LABELS[p] : PRIORITY_LABELS_UZ[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled Date and Time - only for non-trash categories */}
          {category !== 'trash' && (
            <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
              <label className="block text-sm font-medium text-primary-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {language === 'ru' ? 'Желаемое время (необязательно)' : 'Istalgan vaqt (ixtiyoriy)'}
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'}</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'}</label>
                  <select
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
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
                <p className="text-xs text-primary-600 mt-2">
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

        {/* Fixed footer button */}
        <div className="px-5 py-4 border-t border-gray-100 bg-white safe-area-bottom">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim())}
            className={`w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all touch-manipulation ${
              (category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim()))
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary-500 text-white active:scale-[0.98] shadow-lg shadow-primary-500/25'
            }`}
          >
            <Send className="w-[18px] h-[18px]" />
            {language === 'ru' ? 'Отправить заявку' : 'Arizani yuborish'}
          </button>
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
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center">
        <div className="w-full md:max-w-md md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[92vh] md:max-h-[90vh]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-[18px] font-bold text-red-600">{language === 'ru' ? 'Отклонить работу' : 'Ishni rad etish'}</h2>
            <button
              onClick={onClose}
              className="w-[36px] h-[36px] bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors touch-manipulation"
            >
              <X className="w-[18px] h-[18px] text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <p className="text-[13px] text-gray-500 mb-3">
              {language === 'ru'
                ? 'Укажите причину, почему работа не выполнена качественно. Исполнитель получит уведомление.'
                : 'Ish sifatsiz bajarilganligining sababini ko\'rsating. Ijrochi xabar oladi.'}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-4 py-3 rounded-[14px] border border-gray-200 bg-gray-50 focus:bg-white focus:border-red-300 min-h-[150px] text-[14px] resize-none outline-none transition-colors"
              placeholder={language === 'ru' ? 'Опишите, что не так...' : 'Nima noto\'g\'ri ekanligini yozing...'}
              required
            />
          </div>
          <div className="px-5 pt-3 pb-5 border-t border-gray-100 bg-white" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowReject(false)}
                className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
              >
                {language === 'ru' ? 'Назад' : 'Orqaga'}
              </button>
              <button
                onClick={() => rejectReason.trim() && onReject(rejectReason)}
                className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] text-white bg-red-500 active:bg-red-600 disabled:opacity-50 transition-colors touch-manipulation"
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center">
      <div className="w-full md:max-w-md md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[92vh] md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[18px] font-bold text-gray-900">{language === 'ru' ? 'Подтвердить' : 'Tasdiqlash'}</h2>
          <button
            onClick={onClose}
            className="w-[36px] h-[36px] bg-gray-100 rounded-full flex items-center justify-center active:bg-gray-200 transition-colors touch-manipulation"
          >
            <X className="w-[18px] h-[18px] text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
          {/* Request Info */}
          <div className="bg-gray-50 rounded-[14px] p-4">
            <div className="text-[11px] text-gray-400 font-medium">{language === 'ru' ? 'Заявка' : 'Ariza'} #{request.number}</div>
            <div className="font-bold text-[15px] text-gray-900 mt-0.5">{request.title}</div>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <span className="flex items-center gap-1.5 text-[12px] text-gray-600 bg-white px-2.5 py-1.5 rounded-[10px]">
                <User className="w-3.5 h-3.5 text-gray-400" />
                {request.executorName}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-gray-600 bg-white px-2.5 py-1.5 rounded-[10px]">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {formatDuration(request.workDuration)}
              </span>
            </div>
          </div>

          {/* Rating */}
          <div className="text-center">
            <label className="block text-[13px] font-semibold text-gray-700 mb-3">
              {language === 'ru' ? 'Оцените работу исполнителя' : 'Ijrochi ishini baholang'}
            </label>
            <div className="flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1.5 active:scale-90 transition-transform touch-manipulation"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= rating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="text-[13px] text-gray-500 mt-1.5 font-medium">
              {rating === 5 && (language === 'ru' ? 'Отлично!' : 'A\'lo!')}
              {rating === 4 && (language === 'ru' ? 'Хорошо' : 'Yaxshi')}
              {rating === 3 && (language === 'ru' ? 'Нормально' : 'O\'rtacha')}
              {rating === 2 && (language === 'ru' ? 'Плохо' : 'Yomon')}
              {rating === 1 && (language === 'ru' ? 'Очень плохо' : 'Juda yomon')}
            </div>
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-2">
              {language === 'ru' ? 'Отзыв (необязательно)' : 'Fikr-mulohaza (ixtiyoriy)'}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full px-4 py-3 rounded-[14px] border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-300 min-h-[100px] text-[14px] resize-none outline-none transition-colors"
              placeholder={language === 'ru' ? 'Напишите отзыв о работе...' : 'Ish haqida fikringizni yozing...'}
            />
          </div>
        </div>

        {/* Footer buttons */}
        <div className="px-5 pt-3 pb-5 border-t border-gray-100 bg-white" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2.5">
            <button
              onClick={() => setShowReject(true)}
              className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] text-red-600 bg-red-50 active:bg-red-100 transition-colors touch-manipulation flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              {language === 'ru' ? 'Отклонить' : 'Rad etish'}
            </button>
            <button
              onClick={() => onApprove(rating, feedback || undefined)}
              className="flex-1 py-3.5 min-h-[48px] rounded-[14px] font-semibold text-[14px] text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation bg-green-500 shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
            >
              <CheckCircle className="w-4 h-4" />
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
              className="w-full py-3 min-h-[44px] bg-amber-100 hover:bg-amber-200 active:bg-amber-300 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all touch-manipulation"
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
          className="w-full mt-4 py-3.5 min-h-[48px] bg-white active:bg-gray-100 rounded-xl font-semibold text-gray-600 transition-colors touch-manipulation shadow-lg"
          style={{ marginBottom: 'max(50px, env(safe-area-inset-bottom, 50px))' }}
        >
          {language === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </div>
  );
}

/* ── Service Icons & Bottom Sheet ── */
const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  plumber: Wrench,
  electrician: Zap,
  security: ShieldCheck,
  cleaning: Sparkles,
  elevator: ArrowUpDown,
  intercom: Phone,
  trash: Trash2,
  boiler: Flame,
  ac: Snowflake,
  gardener: Sparkles,
  other: ClipboardList,
};

const SERVICE_CAT_COLORS: Record<string, { color: string; bg: string }> = {
  plumber: { color: '#FF6B35', bg: '#FFF0EB' },
  electrician: { color: '#FF9500', bg: '#FFF8E0' },
  security: { color: '#FF3B30', bg: '#FFF0EF' },
  cleaning: { color: '#30D158', bg: '#E8FAF0' },
  elevator: { color: '#0A84FF', bg: '#E8F4FF' },
  intercom: { color: '#BF5AF2', bg: '#F5EEFF' },
  trash: { color: '#30D158', bg: '#E8FAF0' },
  boiler: { color: '#FF6B35', bg: '#FFF0EB' },
  ac: { color: '#0A84FF', bg: '#E8F4FF' },
  gardener: { color: '#34C759', bg: '#E8F8ED' },
  other: { color: '#BF5AF2', bg: '#F5F0FF' },
};

const SERVICE_CAT_MAP: Record<string, string> = {
  plumber: 'repair', electrician: 'repair', boiler: 'repair', ac: 'repair',
  cleaning: 'clean', trash: 'clean',
  security: 'safety', intercom: 'safety',
  elevator: 'other', gardener: 'other', other: 'other',
};

function ServiceBottomSheet({
  language, serviceSearch, setServiceSearch, serviceCatFilter, setServiceCatFilter,
  selectedServiceId, setSelectedServiceId, onClose, onSubmit,
}: {
  language: string;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  serviceCatFilter: string;
  setServiceCatFilter: (v: string) => void;
  selectedServiceId: string | null;
  setSelectedServiceId: (v: string | null) => void;
  onClose: () => void;
  onSubmit: (id: string) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; currentY: number; isDragging: boolean }>({ startY: 0, currentY: 0, isDragging: false });

  const catTabs = language === 'ru'
    ? [{ id: 'all', label: 'Все' }, { id: 'repair', label: '🔧 Ремонт' }, { id: 'clean', label: '🧹 Уборка' }, { id: 'safety', label: '🛡 Охрана' }, { id: 'other', label: '⚙️ Прочее' }]
    : [{ id: 'all', label: 'Hammasi' }, { id: 'repair', label: '🔧 Ta\'mir' }, { id: 'clean', label: '🧹 Tozalash' }, { id: 'safety', label: '🛡 Xavfsizlik' }, { id: 'other', label: '⚙️ Boshqa' }];

  const searchVal = serviceSearch.toLowerCase();
  const filteredCategories = SERVICE_CATEGORIES.filter(c => {
    const matchesCat = serviceCatFilter === 'all' || SERVICE_CAT_MAP[c.id] === serviceCatFilter;
    const matchesSearch = !searchVal || (language === 'ru' ? c.name : c.nameUz).toLowerCase().includes(searchVal);
    return matchesCat && matchesSearch;
  });
  const mainGrid = filteredCategories.filter(c => c.id !== 'other');
  const otherItem = filteredCategories.find(c => c.id === 'other');
  const selectedCat = selectedServiceId ? SERVICE_CATEGORIES.find(c => c.id === selectedServiceId) : null;
  const selectedColors = selectedServiceId ? SERVICE_CAT_COLORS[selectedServiceId] : null;

  // Swipe-to-close handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Only allow swipe from the drag handle area or the header (not from scrollable content)
    const sheet = sheetRef.current;
    if (!sheet) return;
    const scrollArea = sheet.querySelector('[data-scroll]') as HTMLElement;
    if (scrollArea && scrollArea.contains(target) && scrollArea.scrollTop > 0) return;
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, isDragging: true };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.isDragging || !sheetRef.current) return;
    const deltaY = e.touches[0].clientY - dragRef.current.startY;
    dragRef.current.currentY = e.touches[0].clientY;
    if (deltaY > 0) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.isDragging || !sheetRef.current) return;
    const deltaY = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.isDragging = false;
    sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(.32,.72,0,1)';
    if (deltaY > 120) {
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(onClose, 300);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[28px] flex flex-col animate-[slide-up_0.44s_cubic-bezier(.32,.72,0,1)]"
        style={{ maxHeight: '90vh', boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-0 flex-shrink-0">
          <h3 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight">
            {language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}
          </h3>
          <p className="text-[13px] text-gray-400 font-medium mt-1">
            {language === 'ru' ? 'Выберите тип услуги' : 'Xizmat turini tanlang'}
          </p>
        </div>

        {/* Search */}
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-gray-50 rounded-[13px] px-3.5 py-2.5 flex-shrink-0">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск услуги...' : 'Xizmatni qidirish...'}
            value={serviceSearch}
            onChange={e => setServiceSearch(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-gray-900 font-medium outline-none placeholder:text-gray-300"
          />
          {serviceSearch && (
            <button onClick={() => setServiceSearch('')} className="p-0.5">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div data-scroll className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-2" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {/* Category filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {catTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setServiceCatFilter(tab.id)}
                className={`px-3.5 py-[7px] rounded-full text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 touch-manipulation ${
                  serviceCatFilter === tab.id
                    ? 'text-white shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]'
                    : 'bg-gray-50 text-gray-500'
                }`}
                style={serviceCatFilter === tab.id ? { background: `rgb(var(--brand-rgb))` } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Section label */}
          <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-2.5">
            {language === 'ru'
              ? (serviceCatFilter === 'all' ? 'Все услуги' : catTabs.find(t => t.id === serviceCatFilter)?.label || 'Услуги')
              : (serviceCatFilter === 'all' ? 'Barcha xizmatlar' : catTabs.find(t => t.id === serviceCatFilter)?.label || 'Xizmatlar')
            }
          </div>

          {/* Services grid */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {mainGrid.map(category => {
              const colors = SERVICE_CAT_COLORS[category.id] || { color: '#8E8E93', bg: '#F2F2F7' };
              const isSelected = selectedServiceId === category.id;
              const IconComponent = SERVICE_ICON_MAP[category.id] || Wrench;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedServiceId(isSelected ? null : category.id)}
                  className={`relative flex flex-col items-center gap-2 p-3.5 rounded-[18px] border-2 transition-all duration-200 touch-manipulation select-none ${
                    isSelected
                      ? 'bg-white shadow-[0_6px_20px_rgba(0,0,0,0.08)]'
                      : 'border-transparent bg-gray-50 active:scale-[0.91]'
                  }`}
                  style={isSelected ? { borderColor: colors.color } : undefined}
                >
                  {/* Check badge */}
                  <div
                    className={`absolute top-[7px] right-[7px] w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all duration-200 ${
                      isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                    }`}
                    style={{ background: colors.color }}
                  >
                    <Check className="w-[10px] h-[10px] text-white" strokeWidth={3} />
                  </div>

                  {/* Icon */}
                  <div
                    className={`w-[50px] h-[50px] rounded-[15px] flex items-center justify-center transition-transform duration-200 ${
                      isSelected ? 'scale-110 -rotate-[6deg]' : ''
                    }`}
                    style={{
                      background: isSelected ? colors.color : colors.bg,
                      boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.1)' : undefined,
                    }}
                  >
                    <IconComponent
                      className="w-[24px] h-[24px]"
                      style={{ color: isSelected ? '#fff' : colors.color }}
                      strokeWidth={2}
                    />
                  </div>

                  {/* Name */}
                  <span
                    className="text-[11px] font-bold text-center leading-tight"
                    style={{ color: isSelected ? colors.color : '#1C1C1E' }}
                  >
                    {language === 'ru' ? category.name : category.nameUz}
                  </span>
                </button>
              );
            })}
          </div>

          {/* "Other" wide item */}
          {otherItem && (() => {
            const colors = SERVICE_CAT_COLORS.other;
            const isSelected = selectedServiceId === 'other';
            return (
              <button
                onClick={() => setSelectedServiceId(isSelected ? null : 'other')}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-[16px] border-2 transition-all duration-200 touch-manipulation mb-1 ${
                  isSelected
                    ? 'bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                    : 'bg-gray-50 border-transparent active:scale-[0.98]'
                }`}
                style={isSelected ? { borderColor: colors.color } : undefined}
              >
                <div
                  className="w-[44px] h-[44px] rounded-[13px] flex items-center justify-center flex-shrink-0"
                  style={{ background: isSelected ? colors.color : colors.bg }}
                >
                  <ClipboardList
                    className="w-[22px] h-[22px]"
                    style={{ color: isSelected ? '#fff' : colors.color }}
                    strokeWidth={2}
                  />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[14px] font-bold text-gray-900">
                    {language === 'ru' ? 'Другое' : 'Boshqa'}
                  </div>
                  <div className="text-[12px] text-gray-400 font-medium mt-0.5">
                    {language === 'ru' ? 'Опишите проблему своими словами' : 'Muammoni o\'z so\'zlaringiz bilan tasvirlab bering'}
                  </div>
                </div>
                <ChevronRight className="w-[14px] h-[14px] text-gray-300 flex-shrink-0" />
              </button>
            );
          })()}
        </div>

        {/* CTA Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white rounded-b-none px-4 pt-2.5" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {/* Selected tag */}
          <div className="flex items-center gap-2 min-h-[30px] mb-2.5 flex-wrap">
            {selectedCat && selectedColors ? (
              <div
                className="flex items-center gap-1.5 py-1 px-2.5 rounded-full animate-[popIn_0.22s_cubic-bezier(.34,1.46,.64,1)_both]"
                style={{ background: selectedColors.bg }}
              >
                <span className="text-[12px] font-bold" style={{ color: selectedColors.color }}>
                  {language === 'ru' ? selectedCat.name : selectedCat.nameUz}
                </span>
                <button
                  onClick={() => setSelectedServiceId(null)}
                  className="p-0 leading-none text-[15px] opacity-70"
                  style={{ color: selectedColors.color }}
                >×</button>
              </div>
            ) : (
              <span className="text-[13px] text-gray-300 font-medium">
                {language === 'ru' ? 'Услуга не выбрана' : 'Xizmat tanlanmagan'}
              </span>
            )}
          </div>

          {/* Submit button */}
          <button
            disabled={!selectedServiceId}
            onClick={() => { if (selectedServiceId) onSubmit(selectedServiceId); }}
            className={`w-full py-[15px] rounded-[16px] text-[16px] font-extrabold flex items-center justify-center gap-2.5 transition-all duration-200 touch-manipulation ${
              selectedServiceId
                ? 'text-white shadow-[0_6px_20px_rgba(var(--brand-rgb),0.35)] active:scale-[0.97]'
                : 'bg-gray-100 text-gray-300 cursor-default'
            }`}
            style={selectedServiceId ? { background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.85))` } : undefined}
          >
            <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.5} />
            {selectedServiceId && selectedCat
              ? (language === 'ru' ? `Далее — ${selectedCat.name}` : `Davom — ${selectedCat.nameUz}`)
              : (language === 'ru' ? 'Выбрать услугу' : 'Xizmatni tanlang')
            }
          </button>
        </div>
      </div>
    </div>
  );
}

