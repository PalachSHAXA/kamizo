import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard, FileText, Users, Wrench, Building2, Settings,
  LogOut, User, Home, Shield, BarChart3,
  Megaphone, Vote, GraduationCap,
  CalendarDays, Car, QrCode, MessageCircle, ScrollText, Key,
  X as CloseIcon, Star, StickyNote, Phone, ShoppingBag, Package, Headphones, Lock, CreditCard,
  FileSpreadsheet, ClipboardList, AlertTriangle, TrendingUp, TrendingDown, ShieldCheck,
  ChevronDown, ChevronRight, Globe, Send, Check
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { useLanguageStore } from '../../stores/languageStore';
import { useModalPresence } from '../../stores/modalStore';
import { useRequestStore, useAnnouncementStore, useExecutorStore, useVehicleStore, useGuestAccessStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useFeatureFetch } from '../../stores/useFeatureFetch';
import { useBuildingStore } from '../../stores/buildingStore';
import { AppLogo } from '../common/AppLogo';
import { chatApi } from '../../services/api';
import { FeatureLockedModal } from '../FeatureLockedModal';
import { ConfirmDialog } from '../common';
import { formatName } from '../../utils/formatName';

interface SidebarProps {
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ onLogout, isOpen, onClose }: SidebarProps) {
  // Drawer is an overlay — hide the global BottomBar while it's open via the
  // shared modal-presence registry. Gated on isOpen so the bar reappears on
  // close / backdrop tap / swipe-to-dismiss / unmount.
  useModalPresence(isOpen);

  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const location = useLocation();
  const { user } = useAuthStore();
  const { t, language } = useLanguageStore();
  const requests = useRequestStore(s => s.requests);
  const executors = useExecutorStore(s => s.executors);
  const getAnnouncementsForEmployees = useAnnouncementStore(s => s.getAnnouncementsForEmployees);
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);
  const { meetings } = useMeetingStore();
  const { hasFeature, config } = useTenantStore();
  const tenantName = config?.tenant?.name || 'Kamizo';
  const tenantLogo = config?.tenant?.logo || null;
  // Resident's building (ЖК) — fetched lazily on first render of the
  // resident-role drawer. Falls back to the user's building number /
  // address when the building hasn't loaded yet or the API failed.
  const fetchBuildingById = useBuildingStore(s => s.fetchBuildingById);
  const residentBuilding = useBuildingStore(s =>
    user?.buildingId ? s.buildings.find(b => b.id === user.buildingId) : undefined
  );
  useEffect(() => {
    if (user?.buildingId && !residentBuilding) {
      fetchBuildingById(user.buildingId);
    }
  }, [user?.buildingId, residentBuilding, fetchBuildingById]);
  const isMobile = useIsMobile();
  const vehicles = useVehicleStore(s => s.vehicles);
  const guestAccessCodes = useGuestAccessStore(s => s.guestAccessCodes);
  const [lockedFeatureName, setLockedFeatureName] = useState<string | null>(null);
  const [lockedFeatureKey, setLockedFeatureKey] = useState<string | null>(null);
  // Collapsible sidebar sections — persisted per session
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  };

  // Swipe to close sidebar
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  // null = undecided, 'h' = horizontal swipe, 'v' = vertical scroll
  const [touchAxis, setTouchAxis] = useState<'h' | 'v' | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setTouchCurrentX(e.touches[0].clientX);
    setIsSwiping(false);
    setTouchAxis(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = touchStartX - currentX;  // positive = swipe left
    const diffY = Math.abs(currentY - touchStartY);

    // Axis lock: determine dominant direction once threshold exceeded
    if (touchAxis === null) {
      if (Math.abs(diffX) < 5 && diffY < 5) return; // not enough movement yet
      if (diffY > Math.abs(diffX)) {
        // Primarily vertical — mark as scroll, never apply horizontal offset
        setTouchAxis('v');
        return;
      }
      // Primarily horizontal
      setTouchAxis('h');
    }

    if (touchAxis === 'v') return; // locked to vertical scroll

    // Only track leftward swipes (closing direction)
    if (diffX > 8) {
      setIsSwiping(true);
      setTouchCurrentX(currentX);
    }
  }, [touchStartX, touchStartY, touchAxis]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX !== null && touchCurrentX !== null && isSwiping && touchAxis === 'h') {
      const swipeDistance = touchStartX - touchCurrentX;
      // Close if swiped more than 80px to the left
      if (swipeDistance > 80) {
        onClose();
      }
    }
    setTouchStartX(null);
    setTouchStartY(null);
    setTouchCurrentX(null);
    setIsSwiping(false);
    setTouchAxis(null);
  }, [touchStartX, touchCurrentX, isSwiping, touchAxis, onClose]);

  // Calculate swipe offset for visual feedback — only when axis is horizontal
  const swipeOffset = (isSwiping && touchAxis === 'h' && touchStartX !== null && touchCurrentX !== null)
    ? Math.max(0, touchStartX - touchCurrentX)
    : 0;

  // Chat unread count state
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Fetch chat unread count
  const fetchChatUnreadCount = useCallback(async () => {
    if (!user) return;
    // Only fetch for users who have chat access
    if (!['super_admin', 'admin', 'manager', 'director', 'department_head', 'executor', 'security', 'resident'].includes(user.role)) return;

    try {
      const response = await chatApi.getUnreadCount();
      setChatUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch chat unread count:', error);
    }
  }, [user]);

  // Initial fetch and polling every 30 seconds (WebSocket handles real-time).
  // Gate: feature `chat` — если у тенанта отключено, backend вернёт 403,
  // catch поглотит тихо (только console.error), но лишние сетевые
  // запросы каждые 30 сек не нужны.
  useFeatureFetch('chat', () => {
    fetchChatUnreadCount();
  }, [fetchChatUnreadCount]);
  useEffect(() => {
    const enabled = useTenantStore.getState().hasFeature('chat');
    if (!enabled) return;
    const interval = setInterval(fetchChatUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchChatUnreadCount]);

  // Calculate meeting status for badge color
  const meetingStatus = useMemo(() => {
    if (!user) return null;
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find meetings relevant to user
    const relevantMeetings = meetings.filter(m => {
      if (m.status === 'cancelled') return false;

      // Show badge for meetings with open schedule poll or voting
      if (m.status === 'schedule_poll_open' || m.status === 'voting_open') {
        return true;
      }

      // For other statuses, check if meeting is within next week
      if (!m.confirmedDateTime) return false;
      const meetingDate = new Date(m.confirmedDateTime);
      return meetingDate >= now && meetingDate <= weekFromNow;
    });

    if (relevantMeetings.length === 0) return null;

    // Check if any meeting has active voting (voting_open status)
    const hasActiveVoting = relevantMeetings.some(m =>
      m.status === 'voting_open' || m.status === 'schedule_poll_open'
    );

    // Check if any meeting is confirmed/completed (voting finished, results published)
    const hasConfirmedMeeting = relevantMeetings.some(m =>
      m.status === 'voting_closed' ||
      m.status === 'results_published' ||
      m.status === 'protocol_generated' ||
      m.status === 'protocol_approved'
    );

    if (hasActiveVoting) return 'voting'; // blue
    if (hasConfirmedMeeting) return 'confirmed'; // green
    return 'upcoming'; // normal count
  }, [user, meetings]);

  // Calculate notification badges
  const badges = useMemo(() => {
    if (!user) return {};

    // For executors and security
    if (user.role === 'executor' || user.role === 'security') {
      const currentExecutor = executors.find(e => e.login === user.login);
      const mySpecialization = currentExecutor?.specialization || user.specialization;

      // Count new requests matching executor's specialization
      const availableRequestsCount = requests.filter(r =>
        r.status === 'new' && r.category === mySpecialization
      ).length;

      // Count assigned requests waiting for action
      const assignedRequestsCount = requests.filter(r =>
        r.executorId === currentExecutor?.id && (r.status === 'assigned' || r.status === 'accepted')
      ).length;

      // Count unread announcements for employees
      const employeeAnnouncements = getAnnouncementsForEmployees();
      const unreadAnnouncementsCount = employeeAnnouncements.filter(a =>
        !a.viewedBy?.includes(user.id)
      ).length;

      return {
        '/': availableRequestsCount + assignedRequestsCount,
        '/announcements': unreadAnnouncementsCount,
        '/chat': chatUnreadCount,
      };
    }

    // For residents
    if (user.role === 'resident') {
      // Count active requests (not completed)
      const activeRequestsCount = requests.filter(r =>
        r.residentId === user.id && !['completed', 'closed', 'cancelled'].includes(r.status)
      ).length;

      // Count unread announcements using targeting logic
      const residentAnnouncements = getAnnouncementsForResidents(
        user.login || '', user.buildingId || '', user.entrance || '', user.floor || '', user.branch || '', user.apartment || ''
      );
      const unreadAnnouncementsCount = residentAnnouncements.filter(a =>
        !a.viewedBy?.includes(user.id)
      ).length;

      // Count upcoming meetings
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const upcomingMeetingsCount = meetings.filter(m => {
        if (m.status === 'cancelled') return false;
        if (!m.confirmedDateTime) return false;
        const meetingDate = new Date(m.confirmedDateTime);
        return meetingDate >= now && meetingDate <= weekFromNow;
      }).length;

      return {
        '/': activeRequestsCount,
        '/announcements': unreadAnnouncementsCount,
        '/meetings': upcomingMeetingsCount,
        '/chat': chatUnreadCount,
      };
    }

    // For managers/admins/director
    if (user.role === 'manager' || user.role === 'admin' || user.role === 'department_head' || user.role === 'director') {
      // Count new unassigned requests
      const newRequestsCount = requests.filter(r => r.status === 'new').length;

      // Count upcoming meetings for managers
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const upcomingMeetingsCount = meetings.filter(m => {
        if (m.status === 'cancelled') return false;
        if (!m.confirmedDateTime) return false;
        const meetingDate = new Date(m.confirmedDateTime);
        return meetingDate >= now && meetingDate <= weekFromNow;
      }).length;

      return {
        '/requests': newRequestsCount,
        '/meetings': upcomingMeetingsCount,
        '/chat': chatUnreadCount,
      };
    }

    return {};
  }, [user, requests, executors, getAnnouncementsForEmployees, getAnnouncementsForResidents, chatUnreadCount, meetings]);

  // Different nav items based on role and account_type
  const getNavItems = () => {
    // Special account types first (check both account_type and role)
    if (user?.account_type === 'advertiser' || user?.role === 'advertiser') {
      return [
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Мои объявления' : 'Mening e\'lonlarim' },
        { path: '/announcements', icon: Megaphone, label: language === 'ru' ? 'Объявления' : 'E\'lonlar' },
        { path: '/settings', icon: Settings, label: language === 'ru' ? 'Настройки' : 'Sozlamalar' },
      ];
    }
    if (user?.role === 'marketplace_manager') {
      return [
        { path: '/', icon: ShoppingBag, label: language === 'ru' ? 'Управление магазином' : 'Do\'konni boshqarish' },
        { path: '/marketplace-orders', icon: ShoppingBag, label: language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari' },
      ];
    }

    if (user?.role === 'executor' || user?.role === 'security') {
      const isSecurity = user?.role === 'security' || user?.specialization === 'security';
      return [
        // Работа
        { path: '/', icon: FileText, label: language === 'ru' ? (user?.specialization === 'courier' ? 'Заказы' : 'Заявки') : (user?.specialization === 'courier' ? 'Buyurtmalar' : 'Arizalar'), section: language === 'ru' ? 'Работа' : 'Ish' },
        { path: '/schedule', icon: CalendarDays, label: language === 'ru' ? 'Расписание' : 'Jadval' },
        { path: '/my-stats', icon: BarChart3, label: language === 'ru' ? 'Статистика' : 'Statistika' },
        // Инструменты — security получает QR + поиск авто, обычный executor не нужен поиск авто
        ...(isSecurity ? [
          { path: '/qr-scanner', icon: QrCode, label: language === 'ru' ? 'Сканер QR' : 'QR skaner', section: language === 'ru' ? 'Инструменты' : 'Asboblar' },
          { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        ] : []),
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', section: isSecurity ? undefined : (language === 'ru' ? 'Инструменты' : 'Asboblar') },
        // Прочее
        { path: '/announcements', icon: Megaphone, label: language === 'ru' ? 'Объявления' : 'E\'lonlar', section: language === 'ru' ? 'Прочее' : 'Boshqa' },
        { path: '/trainings', icon: GraduationCap, label: language === 'ru' ? 'Тренинги' : 'Treninglar' },
        { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Коллеги' : 'Hamkasblar' },
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Заметки' : 'Eslatmalar' },
      ];
    }
    if (user?.role === 'resident') {
      return [
        // 🏠 Дом
        { path: '/', icon: Home, label: t('nav.services'), section: language === 'ru' ? 'Дом' : 'Uy' },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чат с УК' : 'UK bilan chat' },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/meetings', icon: Vote, label: language === 'ru' ? 'Собрания' : 'Yig\'ilishlar' },
        // 🚗 Доступ и имущество
        { path: '/vehicles', icon: Car, label: language === 'ru' ? 'Мои авто' : 'Mening avtomobillarim', section: language === 'ru' ? 'Доступ и имущество' : 'Kirish va mulk' },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевой доступ' : 'Mehmon kirishi' },
        // /contract used to live only on the home tab — exposing it in the
        // drawer too because the contract is a primary document, residents
        // open it routinely (download QR for sign-up, share with relatives).
        { path: '/contract', icon: ScrollText, label: language === 'ru' ? 'Договор с УК' : 'UK bilan shartnoma' },
        // ℹ️ Информация
        { path: '/useful-contacts', icon: Phone, label: language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar', section: language === 'ru' ? 'Информация' : 'Ma\'lumot' },
        { path: '/marketplace', icon: Headphones, label: language === 'ru' ? 'Маркет УК' : 'BK marketi' },
        { path: '/rate-employees', icon: Star, label: language === 'ru' ? 'Оценить УК' : 'UK ni baholash' },
        // /trainings intentionally NOT in the resident drawer — that surface
        // is for staff training (executors / managers), residents have no
        // use for it and seeing it on a resident's home was confusing.
      ];
    }
    if (user?.role === 'tenant' || user?.role === 'commercial_owner') {
      // Tenant's drawer previously had only "Мои квартиры" — rendering all the
      // working routes (announcements, chat, guest-access, marketplace) invisible
      // unless the user guessed URLs. Now expose them like resident drawer, but
      // keep grouping flat since the feature set is smaller.
      // Audit P1 fix: surface /contract and /useful-contacts for tenants too —
      // they have a rental contract and need the same emergency numbers as
      // owners. The routes themselves were already accessible (no guard in
      // Layout.tsx), the drawer just hid them.
      return [
        { path: '/', icon: Key, label: t('nav.myApartments') },
        { path: '/requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar' },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чат с УК' : 'UK bilan chat' },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
        { path: '/useful-contacts', icon: Phone, label: language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar' },
        { path: '/marketplace', icon: ShoppingBag, label: language === 'ru' ? 'Маркет УК' : 'BK marketi' },
      ];
    }
    if (user?.role === 'super_admin') {
      return [
        { path: '/', icon: Building2, label: language === 'ru' ? 'Управляющие компании' : 'Boshqaruv kompaniyalari' },
        { path: '/settings', icon: Settings, label: language === 'ru' ? 'Настройки' : 'Sozlamalar' },
      ];
    }
    if (user?.role === 'admin') {
      return [
        // Операции
        { path: '/', icon: Shield, label: t('nav.monitoring'), section: language === 'ru' ? 'Операции' : 'Operatsiyalar' },
        { path: '/requests', icon: FileText, label: t('nav.requests') },
        { path: '/work-orders', icon: Wrench, label: t('nav.workOrders') },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
        // Люди
        { path: '/team', icon: Users, label: language === 'ru' ? 'Персонал' : 'Xodimlar', section: language === 'ru' ? 'Люди' : 'Odamlar' },
        { path: '/residents', icon: Users, label: t('nav.residents') },
        // Объекты и доступ
        { path: '/buildings', icon: Building2, label: t('nav.buildings'), section: language === 'ru' ? 'Объекты' : 'Obyektlar' },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
        { path: '/rentals', icon: Key, label: language === 'ru' ? 'Аренда квартир' : 'Kvartira ijarasi' },
        // Коммуникации
        { path: '/announcements', icon: Megaphone, label: t('announcements.title'), section: language === 'ru' ? 'Коммуникации' : 'Aloqalar' },
        { path: '/meetings', icon: Vote, label: t('meetings.title') },
        { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
        // Финансы
        { path: '/finance/estimates', icon: FileSpreadsheet, label: language === 'ru' ? 'Смета' : 'Smeta', section: language === 'ru' ? 'Финансы' : 'Moliya' },
        { path: '/finance/charges', icon: ClipboardList, label: language === 'ru' ? 'Начисления' : 'Hisob-kitob' },
        { path: '/finance/debtors', icon: AlertTriangle, label: language === 'ru' ? 'Должники' : 'Qarzdorlar' },
        { path: '/finance/income', icon: TrendingUp, label: language === 'ru' ? 'Доходы УК' : 'UK daromadlari' },
        { path: '/finance/expenses', icon: TrendingDown, label: language === 'ru' ? 'Расходы' : 'Xarajatlar' },
        { path: '/finance/materials', icon: Package, label: language === 'ru' ? 'Материалы' : 'Materiallar' },
        { path: '/finance/settings', icon: ShieldCheck, label: language === 'ru' ? 'Доступ' : 'Kirish' },
        // Управление
        { path: '/payments', icon: CreditCard, label: language === 'ru' ? 'Платежи' : 'To\'lovlar', section: language === 'ru' ? 'Управление' : 'Boshqaruv' },
        { path: '/reports', icon: BarChart3, label: t('nav.reports') },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    // Director (Управляющий директор) - обзор всей компании
    if (user?.role === 'director') {
      return [
        // Обзор
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Обзор компании' : 'Kompaniya sharhi', section: language === 'ru' ? 'Обзор' : 'Umumiy' },
        { path: '/reports', icon: BarChart3, label: t('nav.reports') },
        { path: '/requests', icon: FileText, label: t('nav.requests') },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
        // Люди
        { path: '/team', icon: Users, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar', section: language === 'ru' ? 'Люди' : 'Odamlar' },
        { path: '/residents', icon: Users, label: t('nav.residents') },
        // Объекты
        { path: '/buildings', icon: Building2, label: t('nav.buildings'), section: language === 'ru' ? 'Объекты' : 'Obyektlar' },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
        { path: '/rentals', icon: Key, label: language === 'ru' ? 'Аренда' : 'Ijara' },
        // Коммуникации
        { path: '/announcements', icon: Megaphone, label: t('announcements.title'), section: language === 'ru' ? 'Коммуникации' : 'Aloqalar' },
        { path: '/meetings', icon: Vote, label: t('meetings.title') },
        // Финансы
        { path: '/finance/estimates', icon: FileSpreadsheet, label: language === 'ru' ? 'Смета' : 'Smeta', section: language === 'ru' ? 'Финансы' : 'Moliya' },
        { path: '/finance/charges', icon: ClipboardList, label: language === 'ru' ? 'Начисления' : 'Hisob-kitob' },
        { path: '/finance/debtors', icon: AlertTriangle, label: language === 'ru' ? 'Должники' : 'Qarzdorlar' },
        { path: '/finance/income', icon: TrendingUp, label: language === 'ru' ? 'Доходы УК' : 'UK daromadlari' },
        { path: '/finance/expenses', icon: TrendingDown, label: language === 'ru' ? 'Расходы' : 'Xarajatlar' },
        { path: '/finance/materials', icon: Package, label: language === 'ru' ? 'Материалы' : 'Materiallar' },
        { path: '/finance/settings', icon: ShieldCheck, label: language === 'ru' ? 'Доступ' : 'Kirish' },
        // Управление
        { path: '/payments', icon: CreditCard, label: language === 'ru' ? 'Платежи' : 'To\'lovlar', section: language === 'ru' ? 'Управление' : 'Boshqaruv' },
        // Прочее
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Блокнот' : 'Bloknot', section: language === 'ru' ? 'Прочее' : 'Boshqa' },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    // Department Head (Глава отдела) - limited manager view for their department
    if (user?.role === 'department_head') {
      return [
        // Отдел
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Мой отдел' : 'Mening bo\'limim', section: language === 'ru' ? 'Отдел' : 'Bo\'lim' },
        { path: '/requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar' },
        { path: '/executors', icon: Wrench, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar' },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat' },
        // Прочее — /vehicle-search removed: dept_head doesn't have access (was silently
        // redirecting to /), so clicking the drawer link felt like a broken app.
        { path: '/announcements', icon: Megaphone, label: t('announcements.title'), section: language === 'ru' ? 'Прочее' : 'Boshqa' },
        { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
        { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Коллеги' : 'Hamkasblar' },
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Блокнот' : 'Bloknot' },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    // Manager - оптимизированное меню с секциями
    return [
      // Операции
      { path: '/', icon: LayoutDashboard, label: t('nav.dashboard'), section: language === 'ru' ? 'Операции' : 'Operatsiyalar' },
      { path: '/requests', icon: FileText, label: t('nav.requests') },
      { path: '/work-orders', icon: Wrench, label: t('nav.workOrders') },
      { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
      // Люди
      { path: '/executors', icon: Wrench, label: t('nav.executors'), section: language === 'ru' ? 'Люди' : 'Odamlar' },
      { path: '/residents', icon: Users, label: t('nav.residents') },
      { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Мои коллеги' : 'Hamkasblar' },
      // Объекты и доступ
      { path: '/buildings', icon: Building2, label: t('nav.buildings'), section: language === 'ru' ? 'Объекты' : 'Obyektlar' },
      { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
      { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
      { path: '/rentals', icon: Key, label: t('nav.rentals') },
      // Коммуникации
      { path: '/announcements', icon: Megaphone, label: t('announcements.title'), section: language === 'ru' ? 'Коммуникации' : 'Aloqalar' },
      { path: '/meetings', icon: Vote, label: t('meetings.title') },
      { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
      // Маркетплейс
      { path: '/marketplace-orders', icon: ShoppingBag, label: language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari', section: language === 'ru' ? 'Маркетплейс' : 'Marketplace' },
      { path: '/marketplace-products', icon: Package, label: language === 'ru' ? 'Товары и склад' : 'Mahsulotlar va ombor' },
      // Финансы
      { path: '/finance/estimates', icon: FileSpreadsheet, label: language === 'ru' ? 'Смета' : 'Smeta', section: language === 'ru' ? 'Финансы' : 'Moliya' },
      { path: '/finance/charges', icon: ClipboardList, label: language === 'ru' ? 'Начисления' : 'Hisob-kitob' },
      { path: '/finance/debtors', icon: AlertTriangle, label: language === 'ru' ? 'Должники' : 'Qarzdorlar' },
      { path: '/finance/expenses', icon: TrendingDown, label: language === 'ru' ? 'Расходы' : 'Xarajatlar' },
      { path: '/finance/materials', icon: Package, label: language === 'ru' ? 'Материалы' : 'Materiallar' },
      // Управление
      { path: '/payments', icon: CreditCard, label: language === 'ru' ? 'Платежи' : 'To\'lovlar', section: language === 'ru' ? 'Управление' : 'Boshqaruv' },
      { path: '/reports', icon: BarChart3, label: t('nav.reports') },
      { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Заметки' : 'Eslatmalar' },
      { path: '/settings', icon: Settings, label: t('nav.settings') },
    ];
  };

  // Feature to menu path mapping
  const featurePathMap: Record<string, string[]> = {
    'requests': ['/', '/requests', '/executors', '/work-orders', '/schedule', '/my-stats'],
    'meetings': ['/meetings'],
    'qr': ['/qr-scanner', '/guest-access'],
    'chat': ['/chat'],
    'marketplace': ['/marketplace', '/marketplace-orders', '/marketplace-products'],
    'announcements': ['/announcements'],
    'trainings': ['/trainings'],
    'rentals': ['/rentals'],
    'colleagues': ['/colleagues'],
    'vehicles': ['/vehicles', '/vehicle-search'],
    'useful-contacts': ['/useful-contacts'],
    'notepad': ['/notepad'],
    'communal': ['/payments', '/finance/estimates', '/finance/charges', '/finance/debtors', '/finance/income', '/finance/expenses', '/finance/materials', '/finance/settings'],
  };

  // Always-allowed paths that are never locked
  const alwaysAllowed = [
    '/', '/settings', '/profile', '/buildings', '/residents',
    '/contract', '/rate-employees', '/team', '/reports'
  ];

  // Check if a path is locked (feature disabled for tenant)
  const isPathLocked = (path: string): boolean => {
    // No tenant or super_admin -> nothing is locked
    if (!config?.tenant || user?.role === 'super_admin') return false;
    if (alwaysAllowed.includes(path)) return false;

    for (const [feature, paths] of Object.entries(featurePathMap)) {
      if (paths.includes(path)) {
        return !hasFeature(feature);
      }
    }
    return false;
  };

  // Get friendly name for a locked feature
  const getFeatureName = (path: string): string => {
    const nameMap: Record<string, Record<string, string>> = {
      '/marketplace': { ru: 'Маркет УК', uz: 'BK marketi' },
      '/chat': { ru: 'Чат', uz: 'Chat' },
      '/meetings': { ru: 'Собрания', uz: 'Yig\'ilishlar' },
      '/announcements': { ru: 'Объявления', uz: 'E\'lonlar' },
      '/trainings': { ru: 'Обучение', uz: 'O\'qitish' },
      '/colleagues': { ru: 'Коллеги', uz: 'Hamkasblar' },
      '/rentals': { ru: 'Аренда', uz: 'Ijara' },
      '/vehicles': { ru: 'Авто', uz: 'Avto' },
      '/vehicle-search': { ru: 'Поиск авто', uz: 'Avto qidirish' },
      '/useful-contacts': { ru: 'Полезные контакты', uz: 'Foydali kontaktlar' },
      '/notepad': { ru: 'Заметки', uz: 'Eslatmalar' },
      '/qr-scanner': { ru: 'QR сканер', uz: 'QR skaner' },
      '/guest-access': { ru: 'Гостевые пропуска', uz: 'Mehmon ruxsatnomalari' },
      '/payments': { ru: 'Платежи', uz: 'To\'lovlar' },
    };
    const lang = language === 'ru' ? 'ru' : 'uz';
    return nameMap[path]?.[lang] || (language === 'ru' ? 'Функция' : 'Funksiya');
  };

  // Get feature key for a locked path
  const getFeatureKey = (path: string): string | null => {
    for (const [feature, paths] of Object.entries(featurePathMap)) {
      if (paths.includes(path)) return feature;
    }
    return null;
  };

  // Filter: still show all items but mark locked ones
  const filterByFeatures = (items: Array<{ path: string; icon: React.ElementType; label: string; section?: string }>): Array<{ path: string; icon: React.ElementType; label: string; section?: string }> => {
    // If no tenant (main domain) or super_admin, show all items
    if (!config?.tenant || user?.role === 'super_admin') {
      return items;
    }
    // Don't filter - show all items, locked ones get visual indicator in render
    return items;
  };

  const navItems = filterByFeatures(getNavItems());

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation. Reactive useIsMobile keeps
    // this correct if the user resizes / rotates between renders.
    if (isMobile) {
      onClose();
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Resident-style drawer (Claude Design §11-sidebar handoff).
  // Source: design/handoff/sidebar-handoff.md. Renders for residents,
  // tenants, and commercial owners. All staff roles keep the existing
  // role-aware list below.
  // ─────────────────────────────────────────────────────────────────────
  const isResidentRole = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';

  if (isResidentRole) {
    // ── counts wired to real stores ──
    const activeRequestCount = badges['/'] || 0;
    const unreadAnnouncementCount = badges['/announcements'] || 0;
    const vehicleCount = vehicles.filter(v => v.residentId === user!.id).length;
    const activeGuestPassCount = guestAccessCodes.filter(
      c => c.residentId === user!.id && c.status === 'active'
    ).length;
    const hasUnreadChat = chatUnreadCount > 0;
    const isMeetingActive = meetingStatus === 'voting';

    // ── header values from user / tenant ──
    const displayName = formatName(user?.name) || user?.name || '';
    const initials = (() => {
      const parts = displayName.trim().split(/\s+/);
      if (!parts[0]) return '·';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    })();
    // Prefer the building's real name (ЖК) from the buildings API, then
    // its address, then the legacy single-string fields on the user
    // record (user.building is the bare number, e.g. "12A").
    const buildingLabel = residentBuilding?.name
      || residentBuilding?.address
      || user?.building
      || user?.address
      || '—';
    const apartmentLabel = user?.apartment ? `${language === 'ru' ? 'Кв.' : 'Kv.'} ${user.apartment}` : '';
    const headerSubtitle = apartmentLabel ? `${buildingLabel} · ${apartmentLabel}` : buildingLabel;
    const verified = Boolean(user?.contractSignedAt);
    const contractNumber = user?.contractNumber || '—';
    const langLabel = language === 'ru' ? 'Русский' : "O'zbekcha";

    // ── navigation: lock-aware, closes drawer after navigate ──
    const go = (path: string) => {
      if (isPathLocked(path)) {
        setLockedFeatureName(getFeatureName(path));
        setLockedFeatureKey(getFeatureKey(path));
        onClose();
        return;
      }
      navigate(path);
      onClose();
    };

    const TEXT_ON_DARK = '#F4F0E8';

    return createPortal(
      <>
        {/* ── Backdrop ── */}
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(28,25,23,0.45)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.22s var(--ease-emphasized, cubic-bezier(0.2,0,0,1))',
          }}
        />

        {/* ── Drawer panel ── */}
        <aside
          role="navigation"
          aria-label={language === 'ru' ? 'Главное меню' : 'Asosiy menyu'}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 61,
            width: 326, maxWidth: '90vw',
            background: 'var(--app-bg)',
            boxShadow: '0 0 50px rgba(28,25,23,0.22)',
            transform: isOpen ? `translateX(-${swipeOffset}px)` : 'translateX(-100%)',
            transition: swipeOffset > 0 ? 'none' : 'transform 0.28s var(--ease-emphasized, cubic-bezier(0.2,0,0,1))',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            // Round the right edge of the drawer (its outer edge once
            // it's slid in from the left). Left edge stays square
            // because it's flush with the viewport. The brown header
            // inside keeps its own borderBottomLeft/RightRadius — the
            // overflow:hidden on this panel clips the brown header's
            // top-right corner against the panel's rounded edge so the
            // visual reads as one coherent floating card.
            borderTopRightRadius: 24,
            borderBottomRightRadius: 24,
          }}
        >
          {/* ── Dark stone header ──
              Bottom corners rounded so the brown block reads as a
              floating card on the warm beige drawer surface (matches
              the card radius family used across the app). Top corners
              stay square because the header runs flush with the
              drawer's top edge (safe-area + status bar). Only this
              block changes — the inner quick-access tiles + ЕЩЁ list +
              the bottom white profile/logout card are untouched. */}
          <div style={{
            position: 'relative',
            padding: 'calc(env(safe-area-inset-top, 0px) + 20px) 18px 20px',
            background: 'var(--dark-surface, #2A2018)',
            color: TEXT_ON_DARK,
            overflow: 'hidden',
            borderBottomLeftRadius: 22,
            borderBottomRightRadius: 22,
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.18,
              background: 'radial-gradient(120% 90% at 95% 0%, #FB923C 0%, transparent 55%)',
              pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* When the УК has uploaded a logo we render it as a 50px chip;
                  otherwise fall back to the orange Building2 gradient. */}
              {tenantLogo ? (
                // Fill only in dark theme (brown sidebar sky can swallow
                // dark logos); in light theme the logo reads directly.
                <div className="tenant-logo-badge" style={{
                  width: 50, height: 50, borderRadius: 15,
                  display: 'grid', placeItems: 'center',
                  flex: '0 0 auto', overflow: 'hidden',
                }}>
                  <img
                    src={tenantLogo}
                    alt={tenantName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ) : (
                <div style={{
                  width: 50, height: 50, borderRadius: 15,
                  background: 'linear-gradient(135deg, #FB923C, #EA580C)', color: '#fff',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  boxShadow: '0 6px 16px rgba(249,115,22,0.4)',
                }}>
                  <Building2 size={23} strokeWidth={2.2} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Eyebrow = real УК name (was hardcoded "ТСЖ «...»"). The
                    legal-form prefix isn't in the tenants table, so we drop
                    it rather than show a wrong one — tenants are not all
                    ТСЖ. */}
                <div style={{
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em',
                  color: '#FDBA74', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {tenantName}
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2,
                  color: TEXT_ON_DARK,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {headerSubtitle}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label={language === 'ru' ? 'Закрыть меню' : 'Menyuni yopish'}
                style={{
                  width: 32, height: 32, borderRadius: 999,
                  background: 'rgba(244,240,232,0.12)',
                  border: '1px solid rgba(244,240,232,0.14)',
                  display: 'grid', placeItems: 'center',
                  color: TEXT_ON_DARK, cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* ── Stats strip ── */}
            {/* Resident-facing УК rating is not exposed by the backend yet
                — /api/uk-ratings/summary is admin-only. We keep the slot
                with a dash so the layout is stable and only fill it once a
                public endpoint lands. */}
            <div style={{ position: 'relative', display: 'flex', marginTop: 16 }}>
              {[
                { v: user?.totalArea ? String(user.totalArea) : '—', l: language === 'ru' ? 'м² площадь' : "m² maydon" },
                { v: String(vehicleCount), l: language === 'ru' ? 'авто' : 'avto' },
                { v: '—', l: language === 'ru' ? 'рейтинг УК' : 'UK reytingi' },
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, textAlign: 'center',
                    borderRight: i < 2 ? '1px solid rgba(244,240,232,0.12)' : 'none',
                  }}
                >
                  <div style={{
                    fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    color: TEXT_ON_DARK,
                  }}>
                    {s.v}
                  </div>
                  <div style={{
                    fontSize: 10.5, color: 'rgba(244,240,232,0.6)', marginTop: 1,
                  }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: '16px 16px 12px',
          }}>
            {/* Section: Quick access */}
            <SectionLabel>{language === 'ru' ? 'Быстрый доступ' : 'Tezkor kirish'}</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <QuickTile
                Icon={FileText}
                fg="#EA580C"
                bg="var(--brand-tint, #FFF3EA)"
                label={language === 'ru' ? 'Заявки' : 'Arizalar'}
                sub={
                  activeRequestCount > 0
                    ? (language === 'ru' ? `${activeRequestCount} в работе` : `${activeRequestCount} ishda`)
                    : (language === 'ru' ? 'нет активных' : "faol yo'q")
                }
                onClick={() => go('/?tab=requests')}
              />
              <QuickTile
                Icon={Vote}
                fg="#0E9AAB"
                bg="rgba(14,154,171,0.12)"
                label={language === 'ru' ? 'Собрания' : "Yig'ilishlar"}
                sub={
                  isMeetingActive
                    ? (language === 'ru' ? 'голосование' : "ovoz berish")
                    : (language === 'ru' ? 'нет активных' : "faol yo'q")
                }
                dot={isMeetingActive ? '#0E9AAB' : undefined}
                onClick={() => go('/meetings')}
              />
              <QuickTile
                Icon={QrCode}
                fg="#15A06E"
                bg="var(--status-active-bg, rgba(21,160,110,0.12))"
                label={language === 'ru' ? 'Пропуска' : 'Ruxsatlar'}
                sub={
                  activeGuestPassCount > 0
                    ? (language === 'ru' ? `${activeGuestPassCount} активный` : `${activeGuestPassCount} faol`)
                    : (language === 'ru' ? 'нет активных' : "faol yo'q")
                }
                onClick={() => go('/guest-access')}
              />
              <QuickTile
                Icon={Car}
                fg="rgb(var(--brand-rgb))"
                bg="var(--brand-tint, rgba(249,115,22,0.12))"
                label={language === 'ru' ? 'Транспорт' : 'Transport'}
                sub={
                  vehicleCount > 0
                    ? (language === 'ru' ? `${vehicleCount} авто` : `${vehicleCount} avto`)
                    : (language === 'ru' ? 'нет авто' : "avto yo'q")
                }
                onClick={() => go('/vehicles')}
              />
            </div>

            {/* Section: More */}
            <div style={{ paddingTop: 18 }}>
              <SectionLabel>{language === 'ru' ? 'Ещё' : 'Yana'}</SectionLabel>
            </div>
            <div style={{
              background: 'var(--surface, #fff)',
              border: '1px solid var(--border-c, #E6DFD2)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
              overflow: 'hidden',
            }}>
              <NavRow
                Icon={Megaphone}
                label={language === 'ru' ? 'Объявления' : "E'lonlar"}
                badge={unreadAnnouncementCount > 0 ? unreadAnnouncementCount : undefined}
                onClick={() => go('/announcements')}
                isLast={false}
              />
              <NavRow
                Icon={CreditCard}
                label={language === 'ru' ? 'Оплата' : "To'lov"}
                sub={language === 'ru' ? 'Начисления' : 'Hisob-kitob'}
                onClick={() => go('/finance/charges')}
                isLast={false}
              />
              {/* Marketplace — always visible. MarketplacePage decides
                  what to render:
                    (1) tenant.features NO 'marketplace' → resident-
                        facing full-page stub (what the section gives
                        you + chat/tel CTA). NOT the admin-oriented
                        FeatureLockedModal — no plan/pricing language.
                    (2) feature on, 0 products → educational empty
                        state (order in-app, cash on receipt, courier
                        delivery by УК).
                    (3) feature on, N products → normal shop grid.
                  ProtectedRoute for /marketplace no longer carries
                  requiredFeature — check moved into the page so the
                  stub can render for tenants without the feature. */}
              <NavRow
                Icon={ShoppingBag}
                label={language === 'ru' ? 'Маркет УК' : 'BK marketi'}
                onClick={() => go('/marketplace')}
                isLast={false}
              />
              {/* Apartment rentals — resident-facing announcement.
                  Feature doesn't exist for any tenant; tapping opens
                  ApartmentRentalsPage, a static "в разработке" screen.
                  No lock affordance in the row — NavRow doesn't have
                  one, and Home QuickTiles' padlock convention is for
                  non-functional buttons. This button IS functional
                  (opens a real screen), so a plain row matches the
                  Marketplace pattern above. Distinct from /rentals
                  (RentalsPage, admin-only УК contract table). */}
              <NavRow
                Icon={Key}
                label={language === 'ru' ? 'Аренда квартир' : 'Kvartira ijarasi'}
                onClick={() => go('/apartment-rentals')}
                isLast={false}
              />
              <NavRow
                Icon={Star}
                label={language === 'ru' ? 'Оценить сотрудников' : 'Xodimlarni baholash'}
                onClick={() => go('/rate-employees')}
                isLast={false}
              />
              <NavRow
                Icon={Phone}
                label={language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar'}
                onClick={() => go('/useful-contacts')}
                isLast={false}
              />
              <NavRow
                Icon={Send}
                label={language === 'ru' ? 'Чат с УК' : 'UK bilan chat'}
                dot={hasUnreadChat}
                onClick={() => go('/chat')}
                isLast={false}
              />
              <NavRow
                Icon={ScrollText}
                label={language === 'ru' ? 'Договор' : 'Shartnoma'}
                sub={contractNumber !== '—' ? `№ ${contractNumber}` : (language === 'ru' ? 'Не привязан' : "Bog'lanmagan")}
                onClick={() => go('/contract')}
                isLast={false}
              />
              <NavRow
                Icon={Globe}
                label={language === 'ru' ? 'Язык' : 'Til'}
                sub={langLabel}
                onClick={() => go('/profile')}
                isLast={true}
              />
            </div>
          </div>

          {/* ── Footer profile card ──
              Bottom pad = pure safe-area (was + 6px, was + 18px). Any
              extra additive offset reads as a beige gap under the white
              card in the drawer; drop it entirely so the card sits
              flush against the home-indicator safe zone. Fallback 8px
              covers Android where safe-area-inset-bottom = 0. */}
          <div style={{
            padding: '10px 16px env(safe-area-inset-bottom, 8px)',
            background: 'var(--surface-2, #F4F0E8)',
            borderTop: '1px solid var(--border-c, #E6DFD2)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 11,
              background: 'var(--surface, #fff)',
              border: '1px solid var(--border-c, #E6DFD2)',
              borderRadius: 20,
              padding: '10px 12px',
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
            }}>
              <button
                onClick={() => go('/profile')}
                aria-label={language === 'ru' ? 'Открыть профиль' : 'Profilni ochish'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  flex: 1, minWidth: 0,
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 999,
                  background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                  color: '#fff', fontWeight: 800, fontSize: 14,
                  display: 'grid', placeItems: 'center',
                  flex: '0 0 auto',
                  letterSpacing: '-0.01em',
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 750 as unknown as number,
                    letterSpacing: '-0.01em', color: 'var(--text-primary, #1C1917)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayName || (language === 'ru' ? 'Профиль' : 'Profil')}
                  </div>
                  {verified && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 700,
                      color: 'var(--status-active, #15A06E)', marginTop: 2,
                    }}>
                      <Check size={11} strokeWidth={3} />
                      {language === 'ru' ? 'Верифицирован' : 'Tasdiqlangan'}
                    </div>
                  )}
                </div>
              </button>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                aria-label={language === 'ru' ? 'Выйти' : 'Chiqish'}
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: 'var(--status-critical-bg, rgba(226,72,61,0.12))',
                  border: 'none', cursor: 'pointer',
                  color: 'var(--status-critical, #E2483D)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>

        <FeatureLockedModal
          isOpen={!!lockedFeatureName}
          onClose={() => { setLockedFeatureName(null); setLockedFeatureKey(null); }}
          featureName={lockedFeatureName || undefined}
          featureKey={lockedFeatureKey || undefined}
        />

        <ConfirmDialog
          isOpen={showLogoutConfirm}
          tone="primary"
          icon={<LogOut className="w-6 h-6" />}
          title={language === 'ru' ? 'Выйти из аккаунта?' : 'Akkauntdan chiqasizmi?'}
          description={language === 'ru'
            ? 'Вам потребуется снова ввести логин и пароль при следующем входе'
            : 'Keyingi safar login va parol qayta kiritish kerak bo\'ladi'}
          confirmLabel={language === 'ru' ? 'Выйти' : 'Chiqish'}
          cancelLabel={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={() => { setShowLogoutConfirm(false); onClose(); onLogout(); }}
        />
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      {/* Mobile overlay — rendered at document.body level to avoid scroll/stacking issues */}
      <div
        className={`sidebar-overlay touch-manipulation ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      <div
        className={`sidebar ${isOpen ? 'open' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={swipeOffset > 0 ? { transform: `translateX(-${swipeOffset}px)`, transition: 'none' } : undefined}
        role="navigation"
        aria-label={language === 'ru' ? 'Главное меню' : 'Asosiy menyu'}
      >
        {/* Compact header - logo + name in one row like Click app */}
        <div className="px-4 pb-3 sidebar-safe-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AppLogo size="sm" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-[15px]">{tenantName}</span>
                {config?.tenant?.slug && (
                  <span className="text-xs font-bold uppercase tracking-wide bg-primary-50 text-primary-500 px-1.5 py-0.5 rounded-md">
                    {config.tenant.is_demo ? 'DEMO' : config.tenant.slug.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="md:hidden w-11 h-11 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
              aria-label={language === 'ru' ? 'Закрыть меню' : 'Menyuni yopish'}
            >
              <CloseIcon className="w-4.5 h-4.5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-100 mx-4 mb-1" />

        <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden px-1" style={{ contain: 'layout', willChange: 'scroll-position' }}>
          {(() => {
            // Precompute which section each item belongs to
            let currentSection = '';
            const itemsWithSection = navItems.map((item: { path: string; icon: React.ElementType; label: string; section?: string }) => {
              // eslint-disable-next-line react-hooks/immutability
              if (item.section) currentSection = item.section;
              return { ...item, currentSection };
            });

            return itemsWithSection.map((item, index) => {
              const badgeCount = badges[item.path as keyof typeof badges] || 0;
              const isMeetingsTab = item.path === '/meetings';
              // v119: meetings-tab voting-state badge swapped from
              // bg-blue-500 → bg-primary-500 (brand orange). The blue
              // was a categorical marker for "active vote" but read as
              // off-brand on the sidebar surface where every other
              // count badge is brand orange. The animate-pulse on
              // shouldAnimate (line below) still flags it as urgent —
              // orange + pulse is more in line with Kamizo's palette.
              // The `confirmed` green stays — that's a different
              // success-state semantic ("vote concluded"), and the
              // user's complaint was specifically about the blue.
              const badgeColor = isMeetingsTab && meetingStatus
                ? (meetingStatus === 'voting' ? 'bg-primary-500' : meetingStatus === 'confirmed' ? 'bg-green-500' : 'bg-primary-500')
                : 'bg-primary-500';
              const shouldAnimate = !isMeetingsTab || meetingStatus === 'voting';
              const isResident = user?.role === 'resident';
              const isActive = location.pathname === item.path;
              const locked = isPathLocked(item.path);

              // Hide item if its section is collapsed (but not the section header itself)
              const sectionCollapsed = item.currentSection && collapsedSections.has(item.currentSection);
              const isHidden = sectionCollapsed && !item.section;

              return (
                <div key={item.path + index} style={{ width: '100%', position: 'relative' }}>
                  {/* Section header — clickable to collapse/expand */}
                  {item.section && (
                    <button
                      onClick={() => toggleSection(item.section!)}
                      className={`w-full flex items-center justify-between px-5 pb-2 touch-manipulation select-none ${index === 0 ? 'pt-3' : 'pt-5 mt-1'}`}
                    >
                      <span className={`text-xs font-bold uppercase tracking-[1.2px] ${isResident ? 'text-primary-500' : 'text-gray-400'}`}>
                        {item.section}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isResident ? 'text-primary-400' : 'text-gray-300'} ${collapsedSections.has(item.section) ? '-rotate-90' : ''}`}
                      />
                    </button>
                  )}
                  {/* Nav item — hidden when section is collapsed */}
                  {!isHidden && (
                    locked ? (
                      <button
                        onClick={() => { setLockedFeatureName(getFeatureName(item.path)); setLockedFeatureKey(getFeatureKey(item.path)); onClose(); }}
                        className={`sidebar-item min-h-[46px] touch-manipulation w-full opacity-50 ${isResident ? 'sidebar-item-resident' : ''}`}
                      >
                        <item.icon className="w-[20px] h-[20px] shrink-0 text-gray-300" />
                        <span className="flex-1 truncate text-gray-400">{item.label}</span>
                        <Lock className="w-3.5 h-3.5 text-gray-300 ml-auto shrink-0" />
                      </button>
                    ) : (
                      <Link
                        to={item.path}
                        onClick={handleNavClick}
                        className={`sidebar-item min-h-[46px] touch-manipulation ${isActive ? 'active' : ''} ${isResident ? 'sidebar-item-resident' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <item.icon className={`w-[20px] h-[20px] shrink-0 ${isActive ? 'text-primary-500' : 'text-gray-400'}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className={`ml-auto w-6 h-6 flex items-center justify-center text-xs font-bold text-white ${badgeColor} rounded-full ${shouldAnimate ? 'animate-pulse' : ''}`}>
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </Link>
                    )
                  )}
                </div>
              );
            });
          })()}
        </nav>

        <div className="mx-5 h-px bg-gray-100" />
        <div className="p-3 px-1">
          {(user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner') && (
            <Link
              to="/profile"
              onClick={handleNavClick}
              className={`sidebar-item min-h-[46px] touch-manipulation sidebar-item-resident ${location.pathname === '/profile' ? 'active' : ''}`}
              aria-current={location.pathname === '/profile' ? 'page' : undefined}
            >
              <User className={`w-[20px] h-[20px] shrink-0 ${location.pathname === '/profile' ? 'text-primary-500' : 'text-gray-400'}`} />
              <span>{language === 'ru' ? 'Мой профиль' : 'Mening profilim'}</span>
            </Link>
          )}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="sidebar-item min-h-[46px] touch-manipulation w-full text-primary-500 hover:text-primary-600 hover:bg-primary-50"
            aria-label={language === 'ru' ? 'Выйти из аккаунта' : 'Akkauntdan chiqish'}
          >
            <LogOut className="w-[20px] h-[20px] shrink-0" />
            <span className="font-medium">{language === 'ru' ? 'Выйти' : 'Chiqish'}</span>
          </button>
        </div>
      </div>

      <FeatureLockedModal
        isOpen={!!lockedFeatureName}
        onClose={() => { setLockedFeatureName(null); setLockedFeatureKey(null); }}
        featureName={lockedFeatureName || undefined}
        featureKey={lockedFeatureKey || undefined}
      />

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        tone="primary"
        icon={<LogOut className="w-6 h-6" />}
        title={language === 'ru' ? 'Выйти из аккаунта?' : 'Akkauntdan chiqasizmi?'}
        description={language === 'ru'
          ? 'Вам потребуется снова ввести логин и пароль при следующем входе'
          : 'Keyingi safar login va parol qayta kiritish kerak bo\'ladi'}
        confirmLabel={language === 'ru' ? 'Выйти' : 'Chiqish'}
        cancelLabel={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => { setShowLogoutConfirm(false); onLogout(); }}
      />
    </>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers for the resident drawer (Claude Design §11-sidebar handoff).
// Kept local so they only carry the one styling shape we need; the rest
// of the app uses different list primitives and shouldn't share these.
// ─────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em',
      color: 'var(--text-secondary, #6F6A62)', textTransform: 'uppercase',
      padding: '0 2px 8px',
    }}>
      {children}
    </div>
  );
}

function QuickTile({
  Icon, fg, bg, label, sub, dot, onClick,
}: {
  Icon: React.ElementType;
  fg: string;
  bg: string;
  label: string;
  sub: string;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border-c, #E6DFD2)',
        borderRadius: 20,
        padding: 13,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
        display: 'flex', flexDirection: 'column', gap: 9,
        minWidth: 0,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: bg, color: fg,
        display: 'grid', placeItems: 'center',
        flex: '0 0 auto',
      }}>
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-primary, #1C1917)',
        }}>
          {label}
          {dot && (
            <span
              aria-hidden
              style={{
                width: 6, height: 6, borderRadius: 999,
                background: dot,
                animation: 'kzPulse 1.6s infinite',
              }}
            />
          )}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {sub}
        </div>
      </div>
    </button>
  );
}

function NavRow({
  Icon, label, sub, badge, dot, onClick, isLast,
}: {
  Icon: React.ElementType;
  label: string;
  sub?: string;
  badge?: number;
  dot?: boolean;
  onClick: () => void;
  isLast: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderBottom: isLast ? 'none' : '1px solid var(--hairline, rgba(28,25,23,0.06))',
        minWidth: 0,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: '#EDE7DB',
        color: 'var(--text-secondary, #6F6A62)',
        display: 'grid', placeItems: 'center',
        flex: '0 0 auto',
      }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 650 as unknown as number, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-primary, #1C1917)',
        }}>
          {label}
          {dot && (
            <span
              aria-hidden
              style={{
                width: 6, height: 6, borderRadius: 999,
                background: 'var(--status-active, #15A06E)',
                animation: 'kzPulse 1.6s infinite',
              }}
            />
          )}
        </div>
        {sub && (
          <div style={{
            fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {sub}
          </div>
        )}
      </div>
      {typeof badge === 'number' ? (
        <span style={{
          minWidth: 20, height: 20, padding: '0 6px',
          borderRadius: 999,
          background: 'var(--brand, #F97316)',
          color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'grid', placeItems: 'center',
          flex: '0 0 auto',
        }}>
          {badge}
        </span>
      ) : (
        <ChevronRight size={15} style={{ color: 'var(--text-muted, #A8A29E)', flex: '0 0 auto' }} />
      )}
    </button>
  );
}
