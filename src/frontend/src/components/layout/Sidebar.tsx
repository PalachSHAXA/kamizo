import { Link, useLocation } from 'react-router-dom';
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, FileText, Users, Wrench, Building2, Settings,
  LogOut, User, Home, Shield, BarChart3,
  Megaphone, Vote, GraduationCap,
  CalendarDays, Car, QrCode, MessageCircle, ScrollText, Key,
  X as CloseIcon, Star, StickyNote, Phone, Ticket, ShoppingBag
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useDataStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { AppLogo } from '../common/AppLogo';
import { chatApi } from '../../services/api';

interface SidebarProps {
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ onLogout, isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuthStore();
  const { t, language } = useLanguageStore();
  const { requests, announcements, executors, getAnnouncementsForEmployees } = useDataStore();
  const { meetings } = useMeetingStore();

  // Chat unread count state
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Fetch chat unread count
  const fetchChatUnreadCount = useCallback(async () => {
    if (!user) return;
    // Only fetch for users who have chat access
    if (!['admin', 'manager', 'resident'].includes(user.role)) return;

    try {
      const response = await chatApi.getUnreadCount();
      setChatUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch chat unread count:', error);
    }
  }, [user]);

  // Initial fetch and polling every 10 seconds
  useEffect(() => {
    fetchChatUnreadCount();
    const interval = setInterval(fetchChatUnreadCount, 10000);
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

    // For executors
    if (user.role === 'executor') {
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
      };
    }

    // For residents
    if (user.role === 'resident') {
      // Count active requests (not completed)
      const activeRequestsCount = requests.filter(r =>
        r.residentId === user.id && !['completed', 'closed', 'cancelled'].includes(r.status)
      ).length;

      // Count unread announcements
      const unreadAnnouncementsCount = announcements.filter(a =>
        a.isActive && !a.viewedBy?.includes(user.id) && (a.type === 'residents' || a.type === 'all')
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
  }, [user, requests, announcements, executors, getAnnouncementsForEmployees, chatUnreadCount, meetings]);

  // Different nav items based on role and account_type
  const getNavItems = () => {
    // Special account types first (check both account_type and role)
    if (user?.account_type === 'advertiser' || user?.role === 'advertiser') {
      return [
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Мои объявления' : 'Mening e\'lonlarim' },
      ];
    }
    if (user?.account_type === 'coupon_checker' || user?.role === 'coupon_checker') {
      return [
        { path: '/', icon: Ticket, label: language === 'ru' ? 'Проверка купонов' : 'Kuponlarni tekshirish' },
      ];
    }
    if (user?.role === 'marketplace_manager') {
      return [
        { path: '/', icon: ShoppingBag, label: language === 'ru' ? 'Управление магазином' : 'Do\'konni boshqarish' },
        { path: '/marketplace-orders', icon: ShoppingBag, label: language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari' },
      ];
    }

    if (user?.role === 'executor') {
      // Security guards get QR scanner
      // Couriers see "Заказы" instead of "Заявки"
      const baseItems = [
        { path: '/', icon: FileText, label: language === 'ru' ? (user?.specialization === 'courier' ? 'Заказы' : 'Заявки') : (user?.specialization === 'courier' ? 'Buyurtmalar' : 'Arizalar') },
        { path: '/schedule', icon: CalendarDays, label: language === 'ru' ? 'Расписание' : 'Jadval' },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
      ];

      // Add QR scanner for security guards
      if (user?.specialization === 'security') {
        baseItems.push({ path: '/qr-scanner', icon: QrCode, label: language === 'ru' ? 'Сканер QR' : 'QR skaner' });
      }

      return [
        ...baseItems,
        { path: '/stats', icon: BarChart3, label: language === 'ru' ? 'Статистика' : 'Statistika' },
        { path: '/announcements', icon: Megaphone, label: language === 'ru' ? 'Объявления' : 'E\'lonlar' },
        { path: '/trainings', icon: GraduationCap, label: language === 'ru' ? 'Тренинги' : 'Treninglar' },
        { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Коллеги' : 'Hamkasblar' },
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Заметки' : 'Eslatmalar' },
      ];
    }
    if (user?.role === 'resident') {
      return [
        { path: '/', icon: Home, label: t('nav.services') },
        { path: '/marketplace', icon: ShoppingBag, label: language === 'ru' ? 'Магазин' : 'Do\'kon' },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Написать в УК' : 'UK ga yozish' },
        { path: '/vehicles', icon: Car, label: language === 'ru' ? 'Мои авто' : 'Mening avtomobillarim' },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевой доступ' : 'Mehmon kirishi' },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/meetings', icon: Vote, label: t('meetings.title') },
        { path: '/useful-contacts', icon: Phone, label: language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar' },
        { path: '/rate-employees', icon: Star, label: language === 'ru' ? 'Оценить' : 'Baholash' },
        { path: '/contract', icon: ScrollText, label: language === 'ru' ? 'Договор' : 'Shartnoma' },
      ];
    }
    if (user?.role === 'tenant' || user?.role === 'commercial_owner') {
      return [
        { path: '/', icon: Key, label: t('nav.myApartments') },
      ];
    }
    if (user?.role === 'admin') {
      return [
        { path: '/', icon: Shield, label: t('nav.monitoring') },
        { path: '/requests', icon: FileText, label: t('nav.requests') },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
        { path: '/team', icon: Users, label: language === 'ru' ? 'Персонал' : 'Xodimlar' },
        { path: '/residents', icon: Users, label: t('nav.residents') },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        { path: '/buildings', icon: Building2, label: t('nav.buildings') },
        { path: '/work-orders', icon: Wrench, label: t('nav.workOrders') },
        { path: '/meetings', icon: Vote, label: t('meetings.title') },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
        { path: '/reports', icon: BarChart3, label: t('nav.reports') },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    // Director (Управляющий директор) - обзор всей компании
    if (user?.role === 'director') {
      return [
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Обзор компании' : 'Kompaniya sharhi' },
        { path: '/requests', icon: FileText, label: t('nav.requests') },
        { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
        { path: '/team', icon: Users, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar' },
        { path: '/residents', icon: Users, label: t('nav.residents') },
        { path: '/buildings', icon: Building2, label: t('nav.buildings') },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
        { path: '/rentals', icon: Key, label: language === 'ru' ? 'Аренда' : 'Ijara' },
        { path: '/meetings', icon: Vote, label: t('meetings.title') },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Блокнот' : 'Bloknot' },
        { path: '/reports', icon: BarChart3, label: t('nav.reports') },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ];
    }
    // Department Head (Глава отдела) - limited manager view for their department
    if (user?.role === 'department_head') {
      return [
        { path: '/', icon: LayoutDashboard, label: language === 'ru' ? 'Мой отдел' : 'Mening bo\'limim' },
        { path: '/requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar' },
        { path: '/executors', icon: Wrench, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar' },
        { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
        { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
        { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
        { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Коллеги' : 'Hamkasblar' },
        { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Блокнот' : 'Bloknot' },
      ];
    }
    // Manager - оптимизированное меню
    return [
      { path: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
      { path: '/requests', icon: FileText, label: t('nav.requests') },
      { path: '/marketplace-orders', icon: ShoppingBag, label: language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari' },
      { path: '/chat', icon: MessageCircle, label: language === 'ru' ? 'Чаты' : 'Chatlar' },
      { path: '/executors', icon: Wrench, label: t('nav.executors') },
      { path: '/residents', icon: Users, label: t('nav.residents') },
      { path: '/vehicle-search', icon: Car, label: language === 'ru' ? 'Поиск авто' : 'Avto qidirish' },
      { path: '/guest-access', icon: QrCode, label: language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari' },
      { path: '/rentals', icon: Key, label: t('nav.rentals') },
      { path: '/buildings', icon: Building2, label: t('nav.buildings') },
      { path: '/work-orders', icon: Wrench, label: t('nav.workOrders') },
      { path: '/meetings', icon: Vote, label: t('meetings.title') },
      { path: '/announcements', icon: Megaphone, label: t('announcements.title') },
      { path: '/trainings', icon: GraduationCap, label: t('nav.trainings') },
      { path: '/colleagues', icon: Users, label: language === 'ru' ? 'Мои коллеги' : 'Hamkasblar' },
      { path: '/notepad', icon: StickyNote, label: language === 'ru' ? 'Заметки' : 'Eslatmalar' },
      { path: '/reports', icon: BarChart3, label: t('nav.reports') },
      { path: '/settings', icon: Settings, label: t('nav.settings') },
    ];
  };

  const navItems = getNavItems();

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
        className={`sidebar-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AppLogo size="md" />
              <div>
                <div className="font-bold text-gray-900">Kamizo</div>
                <div className="text-xs text-gray-500">CRM</div>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="md:hidden p-2 hover:bg-white/30 rounded-lg"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item: { path: string; icon: React.ElementType; label: string; separator?: boolean }) => {
            const badgeCount = badges[item.path as keyof typeof badges] || 0;
            // Special color for meetings based on voting status
            const isMeetingsTab = item.path === '/meetings';
            const badgeColor = isMeetingsTab && meetingStatus
              ? (meetingStatus === 'voting' ? 'bg-blue-500' : meetingStatus === 'confirmed' ? 'bg-green-500' : 'bg-red-500')
              : 'bg-red-500';
            const shouldAnimate = !isMeetingsTab || meetingStatus === 'voting';

            return (
              <div key={item.path}>
                {item.separator && (
                  <div className="my-3 mx-4 border-t border-white/20" />
                )}
                <Link
                  to={item.path}
                  onClick={handleNavClick}
                  className={`sidebar-item ${location.pathname === item.path ? 'active' : ''}`}
                >
                  <div className="relative">
                    <item.icon className="w-5 h-5" />
                    {badgeCount > 0 && (
                      <span className={`absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white ${badgeColor} rounded-full ${shouldAnimate ? 'animate-pulse' : ''}`}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className="flex-1">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className={`ml-auto px-2 py-0.5 text-xs font-bold text-white ${badgeColor} rounded-full`}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/20 space-y-1">
          {/* Profile link for residents and rental users */}
          {(user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner') && (
            <Link
              to="/profile"
              onClick={handleNavClick}
              className={`sidebar-item ${location.pathname === '/profile' ? 'active' : ''}`}
            >
              <User className="w-5 h-5" />
              <span>{language === 'ru' ? 'Мой профиль' : 'Mening profilim'}</span>
            </Link>
          )}
          <button onClick={onLogout} className="sidebar-item w-full text-red-500 hover:bg-red-50">
            <LogOut className="w-5 h-5" />
            <span>{language === 'ru' ? 'Выйти' : 'Chiqish'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
