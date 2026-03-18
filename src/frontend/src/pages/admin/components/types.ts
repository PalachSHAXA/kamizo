export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'kamizo.uz';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  url: string;
  admin_url: string | null;
  color: string;
  color_secondary: string;
  plan: 'basic' | 'pro' | 'enterprise';
  features: string;
  logo: string | null;
  contract_template: string | null;
  admin_email: string | null;
  admin_phone: string | null;
  users_count: number;
  requests_count: number;
  votes_count: number;
  qr_count: number;
  revenue: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  show_useful_contacts_banner: number;
  show_marketplace_banner: number;
}

export interface TenantFormData {
  name: string;
  slug: string;
  url: string;
  admin_url: string;
  color: string;
  color_secondary: string;
  plan: 'basic' | 'pro' | 'enterprise';
  features: string[];
  admin_email: string;
  admin_phone: string;
  logo: string;
  contract_template: string;
  contract_template_name: string;
  director_login: string;
  director_password: string;
  director_name: string;
  admin_login: string;
  admin_password: string;
  admin_name: string;
}

export interface GrowthPoint {
  period: string;
  users: number;
  requests: number;
  revenue: number;
  orders: number;
  buildings: number;
}

export interface AnalyticsData {
  totals: {
    users: number;
    requests: number;
    buildings: number;
    revenue: number;
    tenants: number;
  };
  perTenant: Array<{
    name: string;
    slug: string;
    users_count: number;
    requests_count: number;
    buildings_count: number;
    revenue: number;
  }>;
  planDistribution: Array<{ plan: string; count: number }>;
  featureUsage: Array<{ feature: string; count: number }>;
  growth: {
    daily: GrowthPoint[];
    weekly: GrowthPoint[];
    monthly: GrowthPoint[];
  };
}

export interface TenantStats {
  residents: number;
  requests: number;
  votes: number;
  qr_codes: number;
  buildings: number;
  staff: number;
}

export type DetailTab = 'requests' | 'residents' | 'votes' | 'qr' | 'staff' | 'settings';

export type TabType = 'dashboard' | 'analytics' | 'ads' | 'banners' | 'users';

export interface SuperAd {
  id: string;
  title: string;
  description: string;
  phone: string;
  phone2: string;
  telegram: string;
  instagram: string;
  facebook: string;
  website: string;
  address: string;
  work_hours: string;
  logo_url: string;
  category_name: string;
  category_icon: string;
  tenant_name: string;
  tenant_slug: string;
  creator_name: string;
  status: string;
  target_type: string;
  target_branches: string;
  target_buildings: string;
  views_count: number;
  coupons_issued: number;
  coupons_activated: number;
  starts_at: string;
  expires_at: string;
  created_at: string;
  discount_percent: number;
  badges: string;
  assigned_tenants_count: number;
  assigned_tenant_names: string;
}

export interface AdTenantAssignment {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  color: string;
  color_secondary: string;
  enabled: number;
  assigned_at: string;
}

export interface AdCategory {
  id: string;
  name_ru: string;
  name_uz: string;
  icon: string;
}

export type TimePeriod = 'daily' | 'weekly' | 'monthly';

export const adCategoryIcons: Record<string, string> = {
  'cleaning': '🧹', 'renovation': '🏠', 'minor_repair': '🔧', 'electrical': '⚡',
  'plumbing': '🚿', 'moving': '🚚', 'auto': '🚗', 'construction': '🧱',
  'ac': '❄️', 'beauty': '💄', 'tailoring': '🧵', 'it': '💻',
  'domestic': '👩‍🍳', 'pest_control': '🦠', 'dry_cleaning': '🧴', 'delivery': '📦', 'other': '📋'
};

export const INITIAL_FORM_DATA: TenantFormData = {
  name: '',
  slug: '',
  url: `https://.${BASE_DOMAIN}`,
  admin_url: `https://.${BASE_DOMAIN}/admin`,
  color: '#F97316',
  color_secondary: '#fb923c',
  plan: 'basic',
  features: ['requests', 'qr', 'notepad'],
  admin_email: '',
  admin_phone: '',
  logo: '',
  contract_template: '',
  contract_template_name: '',
  director_login: '',
  director_password: '',
  director_name: '',
  admin_login: '',
  admin_password: '',
  admin_name: '',
};

export const AVAILABLE_FEATURES = [
  { value: 'requests', labelRu: 'Заявки', labelUz: 'Arizalar' },
  { value: 'rentals', labelRu: 'Аренда', labelUz: 'Ijaralar' },
  { value: 'qr', labelRu: 'QR / Гостевые пропуска', labelUz: 'QR / Mehmon oʻtkazmalari' },
  { value: 'marketplace', labelRu: 'Маркетплейс', labelUz: 'Bozor' },
  { value: 'meetings', labelRu: 'Собрания', labelUz: 'Yigʻinlar' },
  { value: 'chat', labelRu: 'Чат', labelUz: 'Chat' },
  { value: 'announcements', labelRu: 'Объявления', labelUz: 'Eʼlonotlar' },
  { value: 'trainings', labelRu: 'Обучение', labelUz: 'Taʼlim' },
  { value: 'colleagues', labelRu: 'Коллеги', labelUz: 'Hamkorlar' },
  { value: 'vehicles', labelRu: 'Авто / Поиск авто', labelUz: 'Avtomobil / Qidiruv' },
  { value: 'useful-contacts', labelRu: 'Полезные контакты', labelUz: 'Foydali kontaktlar' },
  { value: 'notepad', labelRu: 'Заметки', labelUz: 'Yozuvlar' },
  { value: 'communal', labelRu: 'Ком. услуги', labelUz: 'Jamoaviy xizmatlar' },
  { value: 'advertiser', labelRu: 'Менеджер рекламы', labelUz: 'Reklama menejeri' },
  { value: 'reports', labelRu: 'Отчёты', labelUz: 'Hisobot' },
];

export const PLAN_COLORS: Record<string, string> = {
  basic: '#9CA3AF',
  pro: '#3B82F6',
  enterprise: '#8B5CF6',
};

export const PLAN_FEATURES: Record<string, string[]> = {
  basic: ['requests', 'qr', 'notepad'],
  pro: ['requests', 'qr', 'marketplace', 'meetings', 'chat', 'announcements', 'vehicles', 'useful-contacts', 'notepad', 'communal', 'reports'],
  enterprise: ['requests', 'rentals', 'qr', 'marketplace', 'meetings', 'chat', 'announcements', 'trainings', 'colleagues', 'vehicles', 'useful-contacts', 'notepad', 'communal', 'advertiser', 'reports'],
};

export const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const FEATURE_COLORS = ['#f97316', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export const FEATURE_LABELS_RU: Record<string, string> = {
  requests: 'Заявки',
  rentals: 'Аренда',
  qr: 'QR Коды',
  marketplace: 'Маркетплейс',
  meetings: 'Собрания',
  chat: 'Чат',
  announcements: 'Объявления',
  notepad: 'Заметки',
  reports: 'Отчёты',
  votes: 'Голосования',
  advertiser: 'Менеджер рекламы',
};

export const FEATURE_LABELS_UZ: Record<string, string> = {
  requests: 'Arizalar',
  rentals: 'Ijaralar',
  qr: 'QR Kodlar',
  marketplace: 'Bozor',
  meetings: 'Yigʻinlar',
  chat: 'Chat',
  announcements: 'Eʼlonotlar',
  notepad: 'Yozuvlar',
  reports: 'Hisobot',
  votes: 'Ovozlar',
  advertiser: 'Reklama menejeri',
};

export function getFeatureLabel(feature: string, language: string): string {
  const labels = language === 'ru' ? FEATURE_LABELS_RU : FEATURE_LABELS_UZ;
  return labels[feature] || feature;
}

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'new': return 'bg-blue-100 text-blue-700';
    case 'in_progress': return 'bg-orange-100 text-orange-700';
    case 'completed': return 'bg-green-100 text-green-700';
    case 'cancelled': return 'bg-red-100 text-red-700';
    case 'assigned': return 'bg-purple-100 text-purple-700';
    case 'approved': return 'bg-green-100 text-green-700';
    case 'draft': return 'bg-gray-100 text-gray-600';
    case 'active': case 'available': return 'bg-green-100 text-green-700';
    case 'used': case 'expired': return 'bg-gray-100 text-gray-600';
    case 'revoked': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const getRoleColor = (role: string) => {
  switch (role) {
    case 'director': return 'bg-orange-100 text-orange-700';
    case 'admin': return 'bg-red-100 text-red-700';
    case 'manager': return 'bg-purple-100 text-purple-700';
    case 'advertiser': return 'bg-orange-100 text-orange-700';
    case 'department_head': return 'bg-blue-100 text-blue-700';
    case 'executor': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const ROLE_LABELS_MAP: Record<string, string> = {
  director: 'Директор',
  admin: 'Администратор',
  manager: 'Менеджер',
  advertiser: 'Реклама',
  department_head: 'Глава отдела',
  executor: 'Исполнитель',
  resident: 'Житель',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Завершена',
  cancelled: 'Отменена',
  assigned: 'Назначена',
  approved: 'Одобрена',
  draft: 'Черновик',
  active: 'Активен',
  available: 'Доступен',
  used: 'Использован',
  expired: 'Истёк',
  revoked: 'Отозван',
  pending: 'Ожидает',
  scheduled: 'Запланировано',
  voting: 'Голосование',
};
