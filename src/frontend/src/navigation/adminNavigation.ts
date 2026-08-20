import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Car,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Key,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Package,
  QrCode,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  StickyNote,
  TrendingDown,
  TrendingUp,
  Users,
  Vote,
  Wrench,
} from 'lucide-react';
import type { UserRole } from '../types/common';

export const ADMIN_NAV_ROLES = ['admin', 'director', 'manager', 'department_head', 'dispatcher'] as const;
export type AdminNavigationRole = (typeof ADMIN_NAV_ROLES)[number];
type NavigationLanguage = 'ru' | 'uz';

const RESIDENT_MEETINGS_ROLES: readonly UserRole[] = ['resident', 'commercial_owner'];
const RESIDENT_GUEST_ACCESS_ROLES: readonly UserRole[] = ['resident', 'commercial_owner'];
const appRouteRoles = {
  meetings: [...ADMIN_NAV_ROLES, 'resident', 'tenant', 'commercial_owner'],
  guestAccess: [...ADMIN_NAV_ROLES, 'resident', 'tenant', 'commercial_owner'],
  contract: ['resident', 'tenant', 'commercial_owner'],
} satisfies Record<string, UserRole[]>;

interface LocalizedText {
  ru: string;
  uz: string;
}

interface NavigationDefinition {
  id: string;
  path: string;
  icon: LucideIcon;
  label: LocalizedText;
  section?: LocalizedText;
  bottom?: boolean;
  hideInDemo?: boolean;
}

export interface AdminNavigationItem {
  id: string;
  path: string;
  icon: LucideIcon;
  label: string;
  section?: string;
}

const text = (ru: string, uz: string): LocalizedText => ({ ru, uz });

const operations = text('Операции', 'Operatsiyalar');
const people = text('Люди', 'Odamlar');
const objects = text('Объекты', 'Obyektlar');
const communications = text('Коммуникации', 'Aloqalar');
const finance = text('Финансы', 'Moliya');
const management = text('Управление', 'Boshqaruv');

const sharedManagement: NavigationDefinition[] = [
  { id: 'requests', path: '/requests', icon: FileText, label: text('Заявки', 'Arizalar'), bottom: true },
  { id: 'work-orders', path: '/work-orders', icon: Wrench, label: text('Наряды', 'Ish buyurtmalari') },
  { id: 'chat', path: '/chat', icon: MessageCircle, label: text('Чаты', 'Chatlar'), bottom: true },
];

const objectRoutes: NavigationDefinition[] = [
  { id: 'buildings', path: '/buildings', icon: Building2, label: text('Дома', 'Uylar'), section: objects },
  { id: 'vehicle-search', path: '/vehicle-search', icon: Car, label: text('Поиск авто', 'Avto qidirish') },
  { id: 'guest-access', path: '/guest-access', icon: QrCode, label: text('Гостевые пропуска', 'Mehmon ruxsatnomalari') },
  { id: 'rentals', path: '/rentals', icon: Key, label: text('Договоры краткосрочной аренды', 'Qisqa muddatli ijara shartnomalari') },
  { id: 'rentals-moderation', path: '/rentals-moderation', icon: ShieldAlert, label: text('Модерация объявлений', "E'lonlarni moderatsiya") },
];

const communicationRoutes: NavigationDefinition[] = [
  { id: 'announcements', path: '/announcements', icon: Megaphone, label: text('Объявления', "E'lonlar"), section: communications },
  { id: 'meetings', path: '/meetings', icon: Vote, label: text('Собрания', "Yig'ilishlar") },
  { id: 'protocols', path: '/protocols', icon: ScrollText, label: text('Протоколы', 'Protokollar') },
];

const financeRoutes: NavigationDefinition[] = [
  { id: 'estimates', path: '/finance/estimates', icon: FileSpreadsheet, label: text('Смета', 'Smeta'), section: finance },
  { id: 'charges', path: '/finance/charges', icon: ClipboardList, label: text('Начисления', 'Hisob-kitob') },
  { id: 'debtors', path: '/finance/debtors', icon: AlertTriangle, label: text('Должники', 'Qarzdorlar') },
  { id: 'income', path: '/finance/income', icon: TrendingUp, label: text('Доходы УК', 'UK daromadlari') },
  { id: 'expenses', path: '/finance/expenses', icon: TrendingDown, label: text('Расходы', 'Xarajatlar') },
  { id: 'materials', path: '/finance/materials', icon: Package, label: text('Материалы', 'Materiallar') },
  { id: 'finance-settings', path: '/finance/settings', icon: ShieldCheck, label: text('Доступ', 'Kirish') },
];

const navigationByRole: Record<AdminNavigationRole, NavigationDefinition[]> = {
  admin: [
    { id: 'home', path: '/', icon: Shield, label: text('Мониторинг', 'Monitoring'), section: operations, bottom: true, hideInDemo: true },
    ...sharedManagement,
    { id: 'team', path: '/team', icon: Users, label: text('Персонал', 'Xodimlar'), section: people, bottom: true },
    { id: 'executors', path: '/executors', icon: Wrench, label: text('Исполнители', 'Ijrochilar') },
    { id: 'residents', path: '/residents', icon: Users, label: text('Жильцы', 'Aholi') },
    ...objectRoutes,
    ...communicationRoutes,
    { id: 'trainings', path: '/trainings', icon: GraduationCap, label: text('Обучение', "O'qitish") },
    ...financeRoutes,
    { id: 'reports', path: '/reports', icon: BarChart3, label: text('Отчёты', 'Hisobotlar'), section: management },
    { id: 'settings', path: '/settings', icon: Settings, label: text('Настройки', 'Sozlamalar') },
  ],
  director: [
    { id: 'home', path: '/', icon: LayoutDashboard, label: text('Обзор компании', 'Kompaniya sharhi'), section: text('Обзор', 'Umumiy'), bottom: true },
    { id: 'reports', path: '/reports', icon: BarChart3, label: text('Отчёты', 'Hisobotlar'), bottom: true },
    { id: 'requests', path: '/requests', icon: FileText, label: text('Заявки', 'Arizalar'), bottom: true },
    { id: 'chat', path: '/chat', icon: MessageCircle, label: text('Чаты', 'Chatlar'), bottom: true },
    { id: 'work-orders', path: '/work-orders', icon: Wrench, label: text('Наряды', 'Ish buyurtmalari') },
    { id: 'executors', path: '/executors', icon: Wrench, label: text('Исполнители', 'Ijrochilar') },
    { id: 'team', path: '/team', icon: Users, label: text('Сотрудники', 'Xodimlar'), section: people },
    { id: 'residents', path: '/residents', icon: Users, label: text('Жильцы', 'Aholi') },
    ...objectRoutes,
    ...communicationRoutes,
    ...financeRoutes,
    { id: 'notepad', path: '/notepad', icon: StickyNote, label: text('Блокнот', 'Bloknot'), section: text('Прочее', 'Boshqa') },
    { id: 'settings', path: '/settings', icon: Settings, label: text('Настройки', 'Sozlamalar') },
  ],
  manager: [
    { id: 'home', path: '/', icon: LayoutDashboard, label: text('Главная', 'Bosh sahifa'), section: operations, bottom: true },
    ...sharedManagement,
    { id: 'executors', path: '/executors', icon: Wrench, label: text('Исполнители', 'Ijrochilar'), section: people, bottom: true },
    { id: 'residents', path: '/residents', icon: Users, label: text('Жильцы', 'Aholi') },
    { id: 'colleagues', path: '/colleagues', icon: Users, label: text('Мои коллеги', 'Hamkasblar') },
    ...objectRoutes,
    ...communicationRoutes,
    { id: 'trainings', path: '/trainings', icon: GraduationCap, label: text('Обучение', "O'qitish") },
    { id: 'marketplace-orders', path: '/marketplace-orders', icon: ShoppingBag, label: text('Заказы магазина', "Do'kon buyurtmalari"), section: text('Маркетплейс', 'Marketplace') },
    { id: 'marketplace-products', path: '/marketplace-products', icon: Package, label: text('Товары и склад', 'Mahsulotlar va ombor') },
    ...financeRoutes.filter(item => item.id !== 'income' && item.id !== 'finance-settings'),
    { id: 'reports', path: '/reports', icon: BarChart3, label: text('Отчёты', 'Hisobotlar'), section: management },
    { id: 'notepad', path: '/notepad', icon: StickyNote, label: text('Заметки', 'Eslatmalar') },
    { id: 'settings', path: '/settings', icon: Settings, label: text('Настройки', 'Sozlamalar') },
  ],
  department_head: [
    { id: 'home', path: '/', icon: LayoutDashboard, label: text('Мой отдел', "Mening bo'limim"), section: text('Отдел', "Bo'lim"), bottom: true },
    { id: 'requests', path: '/requests', icon: FileText, label: text('Заявки', 'Arizalar'), bottom: true },
    { id: 'executors', path: '/executors', icon: Wrench, label: text('Сотрудники', 'Xodimlar'), bottom: true },
    { id: 'chat', path: '/chat', icon: MessageCircle, label: text('Чат', 'Chat'), bottom: true },
    { id: 'work-orders', path: '/work-orders', icon: Wrench, label: text('Наряды', 'Ish buyurtmalari') },
    // Смета: department_head вводит и правит её, но не утверждает —
    // остальные финансовые разделы ему по-прежнему не показываем.
    { id: 'estimates', path: '/finance/estimates', icon: FileSpreadsheet, label: text('Смета', 'Smeta'), section: finance },
    { id: 'announcements', path: '/announcements', icon: Megaphone, label: text('Объявления', "E'lonlar"), section: text('Прочее', 'Boshqa') },
    { id: 'trainings', path: '/trainings', icon: GraduationCap, label: text('Обучение', "O'qitish") },
    { id: 'colleagues', path: '/colleagues', icon: Users, label: text('Коллеги', 'Hamkasblar') },
    { id: 'notepad', path: '/notepad', icon: StickyNote, label: text('Блокнот', 'Bloknot') },
    { id: 'settings', path: '/settings', icon: Settings, label: text('Настройки', 'Sozlamalar') },
  ],
  dispatcher: [
    { id: 'home', path: '/', icon: LayoutDashboard, label: text('Главная', 'Bosh sahifa'), section: operations, bottom: true },
    { id: 'requests', path: '/requests', icon: FileText, label: text('Заявки', 'Arizalar'), bottom: true },
    { id: 'work-orders', path: '/work-orders', icon: ClipboardList, label: text('Наряды', 'Ish buyurtmalari') },
    { id: 'executors', path: '/executors', icon: Wrench, label: text('Исполнители', 'Ijrochilar'), bottom: true },
  ],
};

export function isAdminNavigationRole(role: UserRole | undefined): role is AdminNavigationRole {
  return !!role && (ADMIN_NAV_ROLES as readonly UserRole[]).includes(role);
}

export function isStaffShellRole(role: UserRole | undefined): role is AdminNavigationRole {
  return isAdminNavigationRole(role);
}

export function isResidentMeetingsRole(role: UserRole | undefined): boolean {
  return !!role && RESIDENT_MEETINGS_ROLES.includes(role);
}

export function isResidentGuestAccessRole(role: UserRole | undefined): boolean {
  return !!role && RESIDENT_GUEST_ACCESS_ROLES.includes(role);
}

export function getRouteRoles(route: keyof typeof appRouteRoles): UserRole[] {
  return [...appRouteRoles[route]];
}

export function getAdminNavigation(
  role: AdminNavigationRole,
  language: NavigationLanguage,
  options: { demoSession?: boolean } = {},
): AdminNavigationItem[] {
  return navigationByRole[role]
    .filter(item => !(options.demoSession && item.hideInDemo))
    .map(item => ({
      id: item.id,
      path: item.path,
      icon: item.icon,
      label: item.label[language],
      section: item.section?.[language],
    }));
}

export function getBottomNavigation(
  role: AdminNavigationRole,
  language: NavigationLanguage,
  options: { demoSession?: boolean } = {},
): AdminNavigationItem[] {
  return navigationByRole[role]
    .filter(item => item.bottom && !(options.demoSession && item.hideInDemo))
    .slice(0, 3)
    .map(item => ({ id: item.id, path: item.path, icon: item.icon, label: item.label[language] }));
}

const routeMatches = (path: string, itemPath: string, search: string): boolean => {
  if (itemPath === '/') return path === '/' && !search.includes('tab=');
  return path === itemPath || path.startsWith(`${itemPath}/`);
};

export function resolveBottomNavigationActiveId(
  path: string,
  search: string,
  bottomItems: AdminNavigationItem[],
  drawerItems: AdminNavigationItem[],
): string | 'more' | null {
  const primary = bottomItems.find(item => routeMatches(path, item.path, search));
  if (primary) return primary.id;
  return drawerItems.some(item => routeMatches(path, item.path, search)) ? 'more' : null;
}

const routeRoles: Record<'executors' | 'workOrders', UserRole[]> = {
  executors: [...ADMIN_NAV_ROLES],
  workOrders: [...ADMIN_NAV_ROLES, 'executor'],
};

export const adminRouteRoles = (route: keyof typeof routeRoles): UserRole[] => [...routeRoles[route]];
