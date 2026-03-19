import { Link, useLocation } from 'react-router-dom';
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, FileText, Users, Wrench, Building2, Settings,
  LogOut, User, Home, Shield, BarChart3,
  Megaphone, Vote, GraduationCap,
  CalendarDays, Car, QrCode, MessageCircle, ScrollText, Key,
  X as CloseIcon, Star, StickyNote, Phone, ShoppingBag, Package, Headphones, Lock, CreditCard,
  Wallet, FileSpreadsheet, ClipboardList, AlertTriangle, TrendingUp, ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useDataStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { useTenantStore } from '../../stores/tenantStore';
import { AppLogo } from '../common/AppLogo';
import { chatApi } from '../../services/api';
import { FeatureLockedModal } from '../FeatureLockedModal';

interface SidebarProps {
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ onLogout, isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuthStore();
  const { t, language } = useLanguageStore();
  const { requests, announcements, executors, getAnnouncementsForEmployees, getAnnouncementsForResidents } = useDataStore();
  const { meetings } = useMeetingStore();
  const { hasFeature, config } = useTenantStore();
  const tenantName = config?.tenant?.name || 'Kamizo';
  const [lockedFeatureName, setLockedFeatureName] = useState<string | null>(null);

  // Swipe to close sidebar
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchCurrentX(e.touches[0].clientX);
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    const diff = touchStartX - currentX;
    // Only track left swipes (closing)
    if (diff > 10) {
      setIsSwiping(true);
      setTouchCurrentX(currentX);
    }
  }, [touchStartX]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX !== null && touchCurrentX !== null && isSwiping) {
      const swipeDistance = touchStartX - touchCurrentX;
      // Close if swiped more than 80px to the left
      if (swipeDistance > 80) {
        onClose();
      }
    }
    setTouchStartX(null);
    setTouchCurrentX(null);
    setIsSwiping(false);
  }, [touchStartX, touchCurrentX, isSwiping, onClose]);

  // Calculate swipe offset for visual feedback
  const swipeOffset = isSwiping && touchStartX !== null && touchCurrentX !== null
    ? Math.max(0, touchStartX - touchCurrentX)
    : 0;

  // Chat unread count state
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Fetch chat unread count
  const fetchChatUnreadCount = useCallback(async () => {
    if (!user) return;
    // Only fetch for users who have chat access
    if (!['admin', 'manager', 'director', 'department_head', 'executor', 'security', 'resident'].includes(user.role)) return;

    try {
      const response = await chatApi.getUnreadCount();
      setChatUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch chat unread count:', error);
    }
  }, [user]);

  // Initial fetch and polling every 30 seconds (WebSocket handles real-time)
  useEffect(() => {
    fetchChatUnreadCount();
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
  }, [user, requests, announcements, executors, getAnnouncementsForEmployees, getAnnouncementsForResidents, chatUnreadCount, meetings]);

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
        // Инструменты
        ...(isSecurity ? [
          { path: '/qr-scanner', icon: QrCode, label: language === 'ru' ? 'Сканер QR' : 'QR skaner', section: language === 'ru' ? 'Инструменты' : 'Asboblar' },
        ] : [
          { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish', section: language === 'ru' ? 'Инструменты' : 'Asboblar' },
        ]),
        ...(isSecurity ? [{ path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' }] : []),
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat' },
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
        { path: '/contract', icon: ScrollText, label: language === 'ru' ? 'Договор' : 'Shartnoma' },
        // ℹ️ Информация
        { path: '/useful-contacts', icon: Phone, label: language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar', section: language === 'ru' ? 'Информация' : 'Ma\'lumot' },
        { path: '/marketplace', icon: Headphones, label: language === 'ru' ? 'Маркет для дома' : 'Uy uchun market' },
        { path: '/rate-employees', icon: Star, label: language === 'ru' ? 'Оценить УК' : 'UK ni baholash' },
      ];
    }
    if (user?.role === 'tenant' || user?.role === 'commercial_owner') {
      return [
        { path: '/', icon: Key, label: t('nav.myApartments') },
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
        // Прочее
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish', section: language === 'ru' ? 'Прочее' : 'Boshqa' },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
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
    'communal': ['/payments', '/finance/estimates', '/finance/charges', '/finance/debtors', '/finance/income', '/finance/materials', '/finance/settings'],
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
      '/marketplace': { ru: 'Маркет для дома', uz: 'Uy uchun market' },
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

  // Filter: still show all items but mark locked ones
  const filterByFeatures = (items: Array<{ path: string; icon: any; label: string; section?: string }>): Array<{ path: string; icon: any; label: string; section?: string }> => {
    // If no tenant (main domain) or super_admin, show all items
    if (!config?.tenant || user?.role === 'super_admin') {
      return items;
    }
    // Don't filter - show all items, locked ones get visual indicator in render
    return items;
  };

  const navItems = filterByFeatures(getNavItems());

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
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
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-primary-50 text-primary-500 px-1.5 py-0.5 rounded-md">
                    {config.tenant.is_demo ? 'DEMO' : config.tenant.slug.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="md:hidden w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation"
              aria-label={language === 'ru' ? 'Закрыть меню' : 'Menyuni yopish'}
            >
              <CloseIcon className="w-4.5 h-4.5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-100 mx-4 mb-1" />

        <nav className="flex-1 py-1 overflow-y-auto px-1">
          {navItems.map((item: { path: string; icon: React.ElementType; label: string; section?: string }, index: number) => {
            const badgeCount = badges[item.path as keyof typeof badges] || 0;
            const isMeetingsTab = item.path === '/meetings';
            const badgeColor = isMeetingsTab && meetingStatus
              ? (meetingStatus === 'voting' ? 'bg-blue-500' : meetingStatus === 'confirmed' ? 'bg-green-500' : 'bg-primary-500')
              : 'bg-primary-500';
            const shouldAnimate = !isMeetingsTab || meetingStatus === 'voting';
            const isResident = user?.role === 'resident';
            const isActive = location.pathname === item.path;
            const locked = isPathLocked(item.path);

            return (
              <div key={item.path}>
                {item.section && (
                  <div className={`px-5 pt-5 pb-2 ${index === 0 ? '' : 'mt-1'}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-[1.2px] ${isResident ? 'text-primary-500' : 'text-gray-400'}`}>
                      {item.section}
                    </span>
                  </div>
                )}
                {locked ? (
                  <button
                    onClick={() => { setLockedFeatureName(getFeatureName(item.path)); onClose(); }}
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
                      <span className={`ml-auto w-6 h-6 flex items-center justify-center text-[11px] font-bold text-white ${badgeColor} rounded-full ${shouldAnimate ? 'animate-pulse' : ''}`}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
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
          <button onClick={onLogout} className="sidebar-item min-h-[46px] touch-manipulation w-full text-primary-500 hover:text-primary-600 hover:bg-primary-50" aria-label={language === 'ru' ? 'Выйти из аккаунта' : 'Akkauntdan chiqish'}>
            <LogOut className="w-[20px] h-[20px] shrink-0" />
            <span className="font-medium">{language === 'ru' ? 'Выйти' : 'Chiqish'}</span>
          </button>
        </div>
      </div>

      <FeatureLockedModal
        isOpen={!!lockedFeatureName}
        onClose={() => setLockedFeatureName(null)}
        featureName={lockedFeatureName || undefined}
      />
    </>
  );
}
