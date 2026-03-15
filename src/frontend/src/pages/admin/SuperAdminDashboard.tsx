import { useState, useEffect } from 'react';

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'kamizo.uz';

import { Building2, Users, DollarSign, Plus, Edit2, Trash2, CheckCircle, XCircle, RefreshCw, FileText, TrendingUp, BarChart3, Upload, X, QrCode, Vote, ClipboardList, Settings, ExternalLink, UserCog, Search, LayoutDashboard, LogOut, Megaphone, Eye, EyeOff, Phone, Globe, MapPin, Clock, Image, ChevronDown, ChevronUp, Ticket, User, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useLanguageStore } from '../../stores/languageStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from '../../components/LazyCharts';

interface Tenant {
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

interface TenantFormData {
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

interface GrowthPoint {
  period: string;
  users: number;
  requests: number;
  revenue: number;
  orders: number;
  buildings: number;
}

interface AnalyticsData {
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

interface TenantStats {
  residents: number;
  requests: number;
  votes: number;
  qr_codes: number;
  buildings: number;
  staff: number;
}

type DetailTab = 'requests' | 'residents' | 'votes' | 'qr' | 'staff' | 'settings';

type TabType = 'dashboard' | 'analytics' | 'ads' | 'banners' | 'users';

const adCategoryIcons: Record<string, string> = {
  'cleaning': '🧹', 'renovation': '🏠', 'minor_repair': '🔧', 'electrical': '⚡',
  'plumbing': '🚿', 'moving': '🚚', 'auto': '🚗', 'construction': '🧱',
  'ac': '❄️', 'beauty': '💄', 'tailoring': '🧵', 'it': '💻',
  'domestic': '👩‍🍳', 'pest_control': '🦠', 'dry_cleaning': '🧴', 'delivery': '📦', 'other': '📋'
};

interface SuperAd {
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

interface AdTenantAssignment {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  color: string;
  color_secondary: string;
  enabled: number;
  assigned_at: string;
}

interface AdCategory {
  id: string;
  name_ru: string;
  name_uz: string;
  icon: string;
}
type TimePeriod = 'daily' | 'weekly' | 'monthly';

const INITIAL_FORM_DATA: TenantFormData = {
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

const AVAILABLE_FEATURES = [
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

const PLAN_COLORS: Record<string, string> = {
  basic: '#9CA3AF',
  pro: '#3B82F6',
  enterprise: '#8B5CF6',
};

const PLAN_FEATURES: Record<string, string[]> = {
  basic: ['requests', 'qr', 'notepad'],
  pro: ['requests', 'qr', 'marketplace', 'meetings', 'chat', 'announcements', 'vehicles', 'useful-contacts', 'notepad', 'communal', 'reports'],
  enterprise: ['requests', 'rentals', 'qr', 'marketplace', 'meetings', 'chat', 'announcements', 'trainings', 'colleagues', 'vehicles', 'useful-contacts', 'notepad', 'communal', 'advertiser', 'reports'],
};

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const FEATURE_COLORS = ['#f97316', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const FEATURE_LABELS_RU: Record<string, string> = {
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

const FEATURE_LABELS_UZ: Record<string, string> = {
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

function getFeatureLabel(feature: string, language: string): string {
  const labels = language === 'ru' ? FEATURE_LABELS_RU : FEATURE_LABELS_UZ;
  return labels[feature] || feature;
}

export function SuperAdminDashboard() {
  const { logout } = useAuthStore();
  const { language } = useLanguageStore();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(INITIAL_FORM_DATA);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');

  // Ads management (ads tab)
  const [allAds, setAllAds] = useState<SuperAd[]>([]);
  const [adCategories, setAdCategories] = useState<AdCategory[]>([]);
  const [isLoadingAds, setIsLoadingAds] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);
  const [adsFilter, setAdsFilter] = useState<'all' | 'active' | 'paused' | 'expired'>('all');
  const [adForm, setAdForm] = useState({
    category_id: '',
    title: '',
    description: '',
    phone: '',
    phone2: '',
    telegram: '',
    instagram: '',
    facebook: '',
    website: '',
    address: '',
    work_hours: '',
    logo_url: '',
    discount_percent: 10,
    duration_type: 'month' as string,
    badges: { recommended: false, new: true, hot: false, verified: false },
    target_tenant_ids: [] as string[],
  });
  const [isSubmittingAd, setIsSubmittingAd] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<SuperAd | null>(null);
  const [assignModalData, setAssignModalData] = useState<{ assignments: AdTenantAssignment[]; all_tenants: any[] }>({ assignments: [], all_tenants: [] });
  const [isLoadingAssign, setIsLoadingAssign] = useState(false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  const [showViewsModal, setShowViewsModal] = useState<SuperAd | null>(null);
  const [adViews, setAdViews] = useState<any[]>([]);
  const [isLoadingViews, setIsLoadingViews] = useState(false);
  const [showCouponsModal, setShowCouponsModal] = useState<SuperAd | null>(null);
  const [adCoupons, setAdCoupons] = useState<any[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);

  // Banners management
  const [banners, setBanners] = useState<any[]>([]);
  const [isLoadingBanners, setIsLoadingBanners] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [bannerForm, setBannerForm] = useState({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace' as string, is_active: true });

  // Users tab
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [usersTenantFilter, setUsersTenantFilter] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // Tenant detail view (dashboard tab)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantStats, setTenantStats] = useState<TenantStats | null>(null);
  const [tenantTabData, setTenantTabData] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('requests');
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingTabData, setIsLoadingTabData] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [statFilter, setStatFilter] = useState<'all' | 'active' | 'users' | 'revenue'>('all');

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      loadAnalytics();
    }
    if (activeTab === 'ads' && allAds.length === 0) {
      loadAds();
    }
    if (activeTab === 'banners' && banners.length === 0) {
      loadBanners();
    }
    if (activeTab === 'users') {
      loadUsers(1, '', '', '');
    }
  }, [activeTab]);

  const loadTenants = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<{ tenants: Tenant[] }>('/api/tenants');
      setTenants(response.tenants);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async (page: number, search: string, role: string, tenant: string) => {
    setIsLoadingUsers(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      if (tenant) params.set('tenant', tenant);
      const res = await apiRequest<{ users: any[]; total: number; page: number }>(`/api/super-admin/users?${params}`);
      setAllUsers(res.users);
      setUsersTotal(res.total);
      setUsersPage(res.page);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки пользователей');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const response = await apiRequest<{ analytics: AnalyticsData }>('/api/super-admin/analytics');
      setAnalytics(response.analytics);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки аналитики');
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const loadBanners = async () => {
    setIsLoadingBanners(true);
    try {
      const res = await apiRequest<{ banners: any[] }>('/api/super-admin/banners');
      setBanners(res.banners || []);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки баннеров');
    } finally {
      setIsLoadingBanners(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!bannerForm.title) return;
    try {
      if (editingBanner) {
        await apiRequest(`/api/super-admin/banners/${editingBanner.id}`, { method: 'PATCH', body: JSON.stringify(bannerForm) });
      } else {
        await apiRequest('/api/super-admin/banners', { method: 'POST', body: JSON.stringify(bannerForm) });
      }
      setShowBannerModal(false);
      setEditingBanner(null);
      setBannerForm({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace', is_active: true });
      loadBanners();
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  const handleToggleBanner = async (banner: any) => {
    try {
      await apiRequest(`/api/super-admin/banners/${banner.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !banner.is_active }) });
      loadBanners();
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Удалить баннер?')) return;
    try {
      await apiRequest(`/api/super-admin/banners/${id}`, { method: 'DELETE' });
      loadBanners();
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  const loadAds = async () => {
    setIsLoadingAds(true);
    try {
      const [adsRes, catRes] = await Promise.all([
        apiRequest<{ ads: SuperAd[] }>('/api/super-admin/ads'),
        apiRequest<{ categories: AdCategory[] }>('/api/ads/categories'),
      ]);
      setAllAds(adsRes.ads || []);
      setAdCategories(catRes.categories || []);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки рекламы');
    } finally {
      setIsLoadingAds(false);
    }
  };

  const handleCreateSuperAd = async () => {
    if (!adForm.category_id || !adForm.title || !adForm.phone || adForm.target_tenant_ids.length === 0) return;
    setIsSubmittingAd(true);
    try {
      await apiRequest('/api/super-admin/ads', {
        method: 'POST',
        body: JSON.stringify(adForm),
      });
      setShowAdModal(false);
      setAdForm({ category_id: '', title: '', description: '', phone: '', phone2: '', telegram: '', instagram: '', facebook: '', website: '', address: '', work_hours: '', logo_url: '', discount_percent: 10, duration_type: 'month', badges: { recommended: false, new: true, hot: false, verified: false }, target_tenant_ids: [] });
      await loadAds();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания рекламы');
    } finally {
      setIsSubmittingAd(false);
    }
  };

  const handleDeleteAd = async (adId: string) => {
    if (!confirm('Удалить эту рекламу?')) return;
    try {
      await apiRequest(`/api/super-admin/ads/${adId}`, { method: 'DELETE' });
      setAllAds(prev => prev.filter(a => a.id !== adId));
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  const handleToggleAdStatus = async (adId: string, newStatus: string) => {
    try {
      await apiRequest(`/api/super-admin/ads/${adId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setAllAds(prev => prev.map(a => a.id === adId ? { ...a, status: newStatus } : a));
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  const loadAdViews = async (ad: SuperAd) => {
    setShowViewsModal(ad);
    setIsLoadingViews(true);
    try {
      const res = await apiRequest<{ views: any[] }>(`/api/super-admin/ads/${ad.id}/views`);
      setAdViews(res.views || []);
    } catch {
      setAdViews([]);
    } finally {
      setIsLoadingViews(false);
    }
  };

  const loadAdCoupons = async (ad: SuperAd) => {
    setShowCouponsModal(ad);
    setIsLoadingCoupons(true);
    try {
      const res = await apiRequest<{ coupons: any[] }>(`/api/super-admin/ads/${ad.id}/coupons`);
      setAdCoupons(res.coupons || []);
    } catch {
      setAdCoupons([]);
    } finally {
      setIsLoadingCoupons(false);
    }
  };

  const openAssignModal = async (ad: SuperAd) => {
    setShowAssignModal(ad);
    setIsLoadingAssign(true);
    try {
      const res = await apiRequest<{ assignments: AdTenantAssignment[]; all_tenants: any[] }>(`/api/super-admin/ads/${ad.id}/tenants`);
      setAssignModalData(res);
      setAssignSelectedIds((res.assignments || []).map((a) => a.tenant_id));
    } catch {
      setAssignModalData({ assignments: [], all_tenants: [] });
      setAssignSelectedIds([]);
    } finally {
      setIsLoadingAssign(false);
    }
  };

  const handleSaveAssignments = async () => {
    if (!showAssignModal) return;
    setIsSavingAssign(true);
    try {
      await apiRequest(`/api/super-admin/ads/${showAssignModal.id}/assign-tenants`, {
        method: 'POST',
        body: JSON.stringify({ tenant_ids: assignSelectedIds }),
      });
      setAllAds(prev => prev.map(a => a.id === showAssignModal.id
        ? { ...a, assigned_tenants_count: assignSelectedIds.length, assigned_tenant_names: assignSelectedIds.map(id => (assignModalData?.all_tenants || []).find(t => t.id === id)?.name || id).join(', ') }
        : a));
      setShowAssignModal(null);
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setIsSavingAssign(false);
    }
  };

  const handleToggleTenantEnabled = async (adId: string, tenantId: string, enabled: boolean) => {
    try {
      await apiRequest(`/api/super-admin/ads/${adId}/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      setAssignModalData(prev => ({
        ...prev,
        assignments: prev.assignments.map(a => a.tenant_id === tenantId ? { ...a, enabled: enabled ? 1 : 0 } : a),
      }));
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    }
  };

  // Auto-select first tenant when switching to dashboard tab
  useEffect(() => {
    if (activeTab === 'dashboard' && tenants.length > 0 && !selectedTenant) {
      loadTenantDetails(tenants[0]);
    }
  }, [activeTab, tenants]);

  const loadTenantDetails = async (tenant: Tenant, tab: DetailTab = 'requests') => {
    setSelectedTenant(tenant);
    setDetailTab(tab);
    setIsLoadingDetail(true);
    setTenantTabData(null);
    try {
      const response = await apiRequest<{ tenant: Tenant; stats: TenantStats; tabData: any }>(
        `/api/super-admin/tenants/${tenant.id}/details?tab=${tab}`
      );
      setTenantStats(response.stats);
      setTenantTabData(response.tabData);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных тенанта');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const loadTabData = async (tab: DetailTab) => {
    if (!selectedTenant) return;
    setDetailTab(tab);
    setIsLoadingTabData(true);
    setTenantTabData(null);
    try {
      const response = await apiRequest<{ tenant: Tenant; stats: TenantStats; tabData: any }>(
        `/api/super-admin/tenants/${selectedTenant.id}/details?tab=${tab}`
      );
      setTenantTabData(response.tabData);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setIsLoadingTabData(false);
    }
  };

  const handleCreateTenant = () => {
    setEditingTenant(null);
    setFormData(INITIAL_FORM_DATA);
    setShowModal(true);
  };


  const handleEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    const features = tenant.features ? JSON.parse(tenant.features) : [];
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      url: tenant.url,
      admin_url: tenant.admin_url || '',
      color: tenant.color,
      color_secondary: tenant.color_secondary,
      plan: tenant.plan,
      features,
      admin_email: tenant.admin_email || '',
      admin_phone: tenant.admin_phone || '',
      logo: tenant.logo || '',
      contract_template: tenant.contract_template || '',
      contract_template_name: tenant.contract_template ? 'Шаблон загружен' : '',
      director_login: '',
      director_password: '',
      director_name: '',
      admin_login: '',
      admin_password: '',
      admin_name: '',
    });
    setShowModal(true);
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (!confirm(`Вы уверены что хотите удалить "${tenant.name}"?`)) return;

    try {
      await apiRequest(`/api/tenants/${tenant.id}`, {
        method: 'DELETE',
      });
      await loadTenants();
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  const handleToggleActive = async (tenant: Tenant) => {
    const newStatus = tenant.is_active ? 0 : 1;
    // Optimistic UI update
    const updated = { ...tenant, is_active: newStatus };
    setTenants(prev => prev.map(t => t.id === tenant.id ? updated : t));
    if (selectedTenant?.id === tenant.id) {
      setSelectedTenant(updated);
    }
    try {
      const resp = await apiRequest<{ tenant: Tenant }>(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newStatus }),
      });
      if (resp.tenant) {
        setTenants(prev => prev.map(t => t.id === resp.tenant.id ? resp.tenant : t));
        if (selectedTenant?.id === resp.tenant.id) {
          setSelectedTenant(resp.tenant);
        }
      }
    } catch (err: any) {
      // Revert on error
      setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t));
      if (selectedTenant?.id === tenant.id) {
        setSelectedTenant(tenant);
      }
      alert(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const { contract_template_name, ...rest } = formData;
      const body = {
        ...rest,
        features: formData.features,
      };

      if (editingTenant) {
        await apiRequest(`/api/tenants/${editingTenant.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest('/api/tenants', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      setShowModal(false);
      await loadTenants();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    }
  };

  const handleFeatureToggle = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Максимальный размер логотипа: 2 МБ');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleContractTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Максимальный размер шаблона: 5 МБ');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, contract_template: reader.result as string, contract_template_name: file.name }));
    };
    reader.readAsDataURL(file);
  };

  const totalStats = {
    total: tenants.length,
    active: tenants.filter(t => t.is_active).length,
    users: tenants.reduce((sum, t) => sum + t.users_count, 0),
    revenue: tenants.reduce((sum, t) => sum + Number(t.revenue || 0), 0),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Helper for status badge colors
  const getStatusColor = (status: string) => {
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

  const getRoleColor = (role: string) => {
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

  const ROLE_LABELS_MAP: Record<string, string> = {
    director: 'Директор',
    admin: 'Администратор',
    manager: 'Менеджер',
    advertiser: 'Реклама',
    department_head: 'Глава отдела',
    executor: 'Исполнитель',
    resident: 'Житель',
  };

  const STATUS_LABELS: Record<string, string> = {
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

  const DETAIL_TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'requests', label: 'Заявки', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'residents', label: 'Жители', icon: <Users className="w-4 h-4" /> },
    { key: 'votes', label: 'Голосования', icon: <Vote className="w-4 h-4" /> },
    { key: 'qr', label: 'QR-доступ', icon: <QrCode className="w-4 h-4" /> },
    { key: 'staff', label: 'Персонал', icon: <UserCog className="w-4 h-4" /> },
    { key: 'settings', label: 'Настройки', icon: <Settings className="w-4 h-4" /> },
  ];

  // Helper to render detail content for selected tenant (used in dashboard tab)
  const renderTenantDetail = () => {
    if (!selectedTenant) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Выберите управляющую компанию</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 sm:gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {selectedTenant.logo ? (
              <img src={selectedTenant.logo} alt={selectedTenant.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border flex-shrink-0" />
            ) : (
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${selectedTenant.color}, ${selectedTenant.color_secondary})` }}
              >
                {selectedTenant.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold truncate">{selectedTenant.name}</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className="text-xs truncate">{selectedTenant.url?.replace('https://', '') || `${selectedTenant.slug}.${BASE_DOMAIN}`}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedTenant.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                  selectedTenant.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {PLAN_LABELS[selectedTenant.plan] || selectedTenant.plan}
                </span>
                <button
                  onClick={() => handleToggleActive(selectedTenant)}
                  className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                >
                  {selectedTenant.is_active ? (
                    <><CheckCircle className="w-3 h-3 text-green-600" /> <span className="text-green-600">Активен</span></>
                  ) : (
                    <><XCircle className="w-3 h-3 text-gray-400" /> <span className="text-gray-400">Неактивен</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={async () => {
                try {
                  const resp = await apiRequest<{ user: any; token: string; tenantUrl: string; tenantName: string }>(
                    `/api/super-admin/impersonate/${selectedTenant.id}`,
                    { method: 'POST' }
                  );
                  const transformedUser = {
                    ...resp.user,
                    passwordChangedAt: resp.user.password_changed_at,
                    contractSignedAt: resp.user.contract_signed_at,
                    buildingId: resp.user.building_id,
                    totalArea: resp.user.total_area,
                    accountType: resp.user.account_type,
                    tenantId: resp.user.tenant_id,
                  };
                  const authData = btoa(encodeURIComponent(JSON.stringify({
                    state: { user: transformedUser, token: resp.token },
                    version: 3,
                    is_impersonated: true,
                    super_admin_url: window.location.href,
                    tenant_name: resp.tenantName || selectedTenant.name,
                  })));
                  window.open(`${selectedTenant.url}?auto_auth=${encodeURIComponent(authData)}`, '_blank');
                } catch (e: any) {
                  alert(e.message || 'Не удалось войти в админку УК');
                }
              }}
              className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm transition-all"
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Войти в админку УК</span>
              <span className="sm:hidden">Войти</span>
            </button>
            <button
              onClick={() => handleEditTenant(selectedTenant)}
              className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Stats Cards */}
        {isLoadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : tenantStats && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { icon: Users, value: tenantStats.residents, label: 'Жители', gradient: 'from-blue-500 to-cyan-400' },
                { icon: ClipboardList, value: tenantStats.requests, label: 'Заявки', gradient: 'from-amber-500 to-orange-400' },
                { icon: Vote, value: tenantStats.votes, label: 'Голосования', gradient: 'from-purple-500 to-violet-400' },
                { icon: QrCode, value: tenantStats.qr_codes, label: 'QR-коды', gradient: 'from-emerald-500 to-green-400' },
                { icon: Building2, value: tenantStats.buildings, label: 'Здания', gradient: 'from-orange-500 to-amber-400' },
                { icon: UserCog, value: tenantStats.staff, label: 'Персонал', gradient: 'from-rose-500 to-red-400' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-sm`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <div className="text-base font-bold text-gray-900">{s.value}</div>
                        <div className="text-[10px] text-gray-400">{s.label}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail Tabs */}
            <div className="flex gap-1 bg-gray-50/80 p-1 rounded-xl overflow-x-auto scrollbar-hide">
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => loadTabData(tab.key)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    detailTab === tab.key
                      ? 'bg-white text-orange-600 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {isLoadingTabData ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : tenantTabData ? (
              <div className="space-y-3">
                {detailTab === 'requests' && Array.isArray(tenantTabData) && (
                  tenantTabData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Нет заявок</div>
                  ) : (
                    tenantTabData.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                        <span className="text-sm font-medium flex-1 truncate">{item.title || item.description}</span>
                        <span className="text-xs text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : ''}</span>
                      </div>
                    ))
                  )
                )}
                {detailTab === 'residents' && Array.isArray(tenantTabData) && (
                  tenantTabData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Нет жителей</div>
                  ) : (
                    tenantTabData.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-bold text-sm">
                          {(item.name || '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.apartment ? `Кв. ${item.apartment}` : item.login}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(item.role)}`}>
                          {ROLE_LABELS_MAP[item.role] || item.role}
                        </span>
                      </div>
                    ))
                  )
                )}
                {detailTab === 'votes' && Array.isArray(tenantTabData) && (
                  tenantTabData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Нет голосований</div>
                  ) : (
                    tenantTabData.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                        <span className="text-sm font-medium flex-1 truncate">{item.title}</span>
                        <span className="text-xs text-gray-400">{item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString('ru-RU') : ''}</span>
                      </div>
                    ))
                  )
                )}
                {detailTab === 'qr' && Array.isArray(tenantTabData) && (
                  tenantTabData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Нет QR-кодов</div>
                  ) : (
                    tenantTabData.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center gap-3">
                        <QrCode className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.guest_name || 'Гость'}</div>
                          <div className="text-xs text-gray-500">{item.code}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </div>
                    ))
                  )
                )}
                {detailTab === 'staff' && Array.isArray(tenantTabData) && (
                  tenantTabData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Нет персонала</div>
                  ) : (
                    tenantTabData.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                          {(item.name || '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.position || item.login}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(item.role)}`}>
                          {ROLE_LABELS_MAP[item.role] || item.role}
                        </span>
                      </div>
                    ))
                  )
                )}
                {detailTab === 'settings' && tenantTabData && (
                  <div className="bg-white p-4 rounded-lg border space-y-3">
                    {/* Coming Soon Banners */}
                    <div className="bg-white rounded-xl border p-4 space-y-3">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-orange-500" />
                        Coming Soon баннеры
                      </h3>
                      <p className="text-xs text-gray-500">Когда у тенанта нет данных, показывать красивый placeholder вместо пустой страницы</p>
                      {[
                        { key: 'show_useful_contacts_banner', label: 'Полезные контакты', desc: 'Показать Coming Soon если нет контактов' },
                        { key: 'show_marketplace_banner', label: 'Маркетплейс', desc: 'Показать Coming Soon если нет товаров' },
                      ].map(item => {
                        const isOn = !!(selectedTenant as any)[item.key];
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{item.label}</p>
                              <p className="text-xs text-gray-500">{item.desc}</p>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const updated = await apiRequest<{ tenant: any }>(`/api/super-admin/tenants/${selectedTenant!.id}/banners`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ [item.key]: !isOn }),
                                  });
                                  setTenants(prev => prev.map(t => t.id === selectedTenant!.id ? { ...t, ...updated.tenant } : t));
                                  setSelectedTenant(prev => prev ? { ...prev, ...updated.tenant } : prev);
                                } catch {}
                              }}
                              className={`relative w-11 h-6 rounded-full transition-colors ${isOn ? 'bg-orange-500' : 'bg-gray-300'}`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : ''}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Slug:</span> <span className="font-medium">{selectedTenant.slug}</span></div>
                      <div><span className="text-gray-500">URL:</span> <a href={selectedTenant.url} target="_blank" className="text-orange-600 hover:underline">{selectedTenant.url}</a></div>
                      <div><span className="text-gray-500">{language === 'ru' ? 'Тариф:' : 'Tarif:'}</span> <span className="font-medium">{PLAN_LABELS[selectedTenant.plan]}</span></div>
                      <div><span className="text-gray-500">{language === 'ru' ? 'Email:' : 'Email:'}</span> <span className="font-medium">{selectedTenant.admin_email || '—'}</span></div>
                      <div><span className="text-gray-500">{language === 'ru' ? 'Телефон:' : 'Telefon:'}</span> <span className="font-medium">{selectedTenant.admin_phone || '—'}</span></div>
                      <div><span className="text-gray-500">{language === 'ru' ? 'Создан:' : 'Yaratilgan:'}</span> <span className="font-medium">{new Date(selectedTenant.created_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}</span></div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-sm">{language === 'ru' ? 'Функции:' : 'Imkoniyatlar:'}</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(selectedTenant.features ? JSON.parse(selectedTenant.features) : []).map((f: string) => (
                          <span key={f} className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-xs font-medium">
                            {getFeatureLabel(f, language)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30">
      {/* Modern Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-sm">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900">Kamizo</h1>
                <p className="text-[10px] text-gray-400 -mt-0.5 hidden sm:block">Super Admin Panel</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {activeTab === 'dashboard' && (
                <>
                  <button
                    onClick={loadTenants}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Обновить"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCreateTenant}
                    className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Добавить УК</span>
                    <span className="sm:hidden">+ УК</span>
                  </button>
                </>
              )}
              {activeTab === 'analytics' && (
                <button
                  onClick={() => { setAnalytics(null); loadAnalytics(); }}
                  className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Обновить
                </button>
              )}
              {activeTab === 'ads' && (
                <>
                  <button
                    onClick={() => { setAllAds([]); loadAds(); }}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Обновить"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowAdModal(true)}
                    className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Добавить рекламу</span>
                    <span className="sm:hidden">+ Реклама</span>
                  </button>
                </>
              )}
              <button
                onClick={() => navigate('/settings')}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Настройки"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs - integrated into header */}
          <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
            {([
              { key: 'dashboard' as TabType, icon: <LayoutDashboard className="w-4 h-4" />, label: 'Дашборд' },
              { key: 'analytics' as TabType, icon: <BarChart3 className="w-4 h-4" />, label: 'Аналитика' },
              { key: 'ads' as TabType, icon: <Megaphone className="w-4 h-4" />, label: 'Реклама' },
              { key: 'banners' as TabType, icon: <Image className="w-4 h-4" />, label: 'Баннеры' },
              { key: 'users' as TabType, icon: <UserCog className="w-4 h-4" />, label: 'Пользователи' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 sm:px-4 py-2.5 font-medium text-xs sm:text-sm border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.key
                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ========== TAB: Dashboard ========== */}
      {activeTab === 'dashboard' && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'all' as const, icon: Building2, label: 'Всего УК', value: totalStats.total, gradient: 'from-orange-500 to-amber-400', bg: 'bg-orange-50', border: 'border-orange-200', ring: 'ring-orange-200' },
              { key: 'active' as const, icon: CheckCircle, label: 'Активных', value: totalStats.active, gradient: 'from-emerald-500 to-green-400', bg: 'bg-green-50', border: 'border-green-200', ring: 'ring-green-200' },
              { key: 'users' as const, icon: Users, label: 'Жителей', value: totalStats.users, gradient: 'from-blue-500 to-cyan-400', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-200' },
              { key: 'revenue' as const, icon: DollarSign, label: 'Доход', value: `$${totalStats.revenue.toLocaleString('en-US')}`, gradient: 'from-purple-500 to-violet-400', bg: 'bg-purple-50', border: 'border-purple-200', ring: 'ring-purple-200' },
            ].map(card => {
              const Icon = card.icon;
              const isActive = statFilter === card.key;
              return (
                <div
                  key={card.key}
                  onClick={() => setStatFilter(statFilter === card.key ? 'all' : card.key)}
                  className={`relative overflow-hidden p-4 rounded-2xl cursor-pointer transition-all ${
                    isActive ? `${card.bg} ${card.border} border-2 ring-2 ${card.ring}` : 'bg-white border border-gray-100 hover:shadow-lg hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-400 font-medium uppercase tracking-wider">{card.label}</div>
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">{card.value}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Master-Detail */}
          <div className="flex flex-col md:flex-row gap-4" style={{ minHeight: 'min(500px, calc(100vh - 370px))' }}>
          {/* Left: Tenant List */}
          <div className="w-full md:w-80 md:flex-shrink-0 bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 space-y-3 overflow-y-auto shadow-sm max-h-[40vh] md:max-h-none">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                placeholder="Поиск УК..."
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 transition-all"
              />
            </div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
              {statFilter === 'active' ? 'Активные' : statFilter === 'users' ? 'По жителям ↓' : statFilter === 'revenue' ? 'По доходу ↓' : 'Управляющие компании'} ({tenants
                .filter(t => {
                  if (statFilter === 'active' && !t.is_active) return false;
                  if (!dashboardSearch) return true;
                  return t.name.toLowerCase().includes(dashboardSearch.toLowerCase()) || t.slug.toLowerCase().includes(dashboardSearch.toLowerCase());
                }).length})
            </div>
            {tenants
              .filter(t => {
                if (statFilter === 'active' && !t.is_active) return false;
                if (!dashboardSearch) return true;
                return t.name.toLowerCase().includes(dashboardSearch.toLowerCase()) || t.slug.toLowerCase().includes(dashboardSearch.toLowerCase());
              })
              .sort((a, b) => {
                if (statFilter === 'users') return b.users_count - a.users_count;
                if (statFilter === 'revenue') return Number(b.revenue || 0) - Number(a.revenue || 0);
                return 0;
              })
              .map(tenant => (
              <div
                key={tenant.id}
                className={`p-3 rounded-2xl cursor-pointer transition-all group ${
                  selectedTenant?.id === tenant.id
                    ? 'bg-gradient-to-r from-orange-50 to-amber-50/50 border-2 border-orange-300/60 shadow-sm'
                    : 'bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}
                onClick={() => loadTenantDetails(tenant)}
              >
                <div className="flex items-center gap-3">
                  {tenant.logo ? (
                    <img src={tenant.logo} alt={tenant.name} className="w-10 h-10 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color_secondary})` }}
                    >
                      {tenant.name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-gray-900 truncate">{tenant.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{tenant.url?.replace('https://', '') || `${tenant.slug}.${BASE_DOMAIN}`}</div>
                  </div>
                  {!tenant.is_active && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-md text-[9px] font-medium flex-shrink-0">OFF</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 pl-[52px]">
                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tenant.users_count || 0}</span>
                    <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {tenant.requests_count || 0}</span>
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {(tenant as any).buildings_count || 0}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant); }}
                    className="p-1 text-gray-300 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

            {/* Right: Detail View */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 overflow-y-auto max-h-[60vh] md:max-h-none shadow-sm">
              {renderTenantDetail()}
            </div>
          </div>
        </>
      )}

      {/* ========== TAB: Analytics ========== */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {isLoadingAnalytics ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : analytics ? (
            <>
              {/* Summary Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-100 rounded-lg">
                      <Building2 className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Тенанты</div>
                      <div className="text-xl font-bold">{analytics.totals.tenants}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary-100 rounded-lg">
                      <Users className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Пользователи</div>
                      <div className="text-xl font-bold">{analytics.totals.users.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100 rounded-lg">
                      <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Заявки</div>
                      <div className="text-xl font-bold">{analytics.totals.requests.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-100 rounded-lg">
                      <Building2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Здания</div>
                      <div className="text-xl font-bold">{analytics.totals.buildings.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Выручка</div>
                      <div className="text-xl font-bold">{Number(analytics.totals.revenue).toLocaleString('ru-RU')} сум</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Period Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 mr-1">Период:</span>
                {([['daily', 'Дни'], ['weekly', 'Недели'], ['monthly', 'Месяцы']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTimePeriod(key)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      timePeriod === key
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Bar Charts Row */}
              {(() => {
                const growthData = analytics.growth[timePeriod] || [];
                const periodLabel = timePeriod === 'daily' ? 'дням' : timePeriod === 'weekly' ? 'неделям' : 'месяцам';
                const formatPeriod = (val: string) => {
                  if (timePeriod === 'daily') {
                    // "2026-02-07" → "07.02"
                    const parts = val.split('-');
                    return parts.length === 3 ? `${parts[2]}.${parts[1]}` : val;
                  }
                  if (timePeriod === 'weekly') {
                    // "2026-W06" → "Нед 6"
                    const m = val.match(/W(\d+)/);
                    return m ? `Нед ${parseInt(m[1])}` : val;
                  }
                  // "2026-02" → "02.2026"
                  const parts = val.split('-');
                  return parts.length === 2 ? `${parts[1]}.${parts[0]}` : val;
                };
                return (
                  <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className="bg-white p-5 rounded-lg shadow-sm border">
                      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
                        <Users className="w-4 h-4 text-primary-500" />
                        Пользователи по {periodLabel}
                      </h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={growthData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                          <Tooltip labelFormatter={formatPeriod} />
                          <Bar dataKey="users" fill="#f97316" name="Пользователи" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white p-5 rounded-lg shadow-sm border">
                      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
                        <FileText className="w-4 h-4 text-amber-500" />
                        Заявки по {periodLabel}
                      </h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={growthData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                          <Tooltip labelFormatter={formatPeriod} />
                          <Bar dataKey="requests" fill="#F59E0B" name="Заявки" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white p-5 rounded-lg shadow-sm border">
                      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
                        <DollarSign className="w-4 h-4 text-green-500" />
                        Выручка по {periodLabel}
                      </h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={growthData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip labelFormatter={formatPeriod} formatter={(value: number) => Number(value).toLocaleString('ru-RU') + ' сум'} />
                          <Bar dataKey="revenue" fill="#10B981" name="Выручка" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Pie Charts Row */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Plan Distribution */}
                <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border">
                  <h3 className="font-semibold text-sm mb-4 text-gray-700">Распределение по тарифам</h3>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={analytics.planDistribution.map(p => ({ ...p, label: PLAN_LABELS[p.plan] || p.plan }))}
                            cx="50%" cy="50%"
                            outerRadius={80}
                            innerRadius={40}
                            dataKey="count"
                            nameKey="label"
                            label={false}
                          >
                            {analytics.planDistribution.map((entry, index) => (
                              <Cell key={`plan-${index}`} fill={PLAN_COLORS[entry.plan] || '#9CA3AF'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number, name: string) => [`${value} УК`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3 shrink-0">
                      {analytics.planDistribution.map((entry) => (
                        <div key={entry.plan} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[entry.plan] || '#9CA3AF' }} />
                          <span className="text-sm text-gray-600">{PLAN_LABELS[entry.plan] || entry.plan}</span>
                          <span className="text-sm font-bold ml-1">{entry.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Feature Usage - Pie Chart */}
                <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border">
                  <h3 className="font-semibold text-sm mb-4 text-gray-700">Использование функций</h3>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={analytics.featureUsage.map(f => ({ ...f, label: getFeatureLabel(f.feature, language) }))}
                            cx="50%" cy="50%"
                            outerRadius={80}
                            innerRadius={40}
                            dataKey="count"
                            nameKey="label"
                            label={false}
                          >
                            {analytics.featureUsage.map((_, index) => (
                              <Cell key={`feat-${index}`} fill={FEATURE_COLORS[index % FEATURE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number, name: string) => [`${value} УК`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 shrink-0">
                      {analytics.featureUsage
                        .sort((a, b) => b.count - a.count)
                        .map((item, index) => (
                          <div key={item.feature} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: FEATURE_COLORS[index % FEATURE_COLORS.length] }} />
                            <span className="text-sm text-gray-600">{getFeatureLabel(item.feature, language)}</span>
                            <span className="text-sm font-bold ml-1">{item.count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Area Chart: Growth */}
              {(() => {
                const growthData = analytics.growth[timePeriod] || [];
                const periodTitle = timePeriod === 'daily' ? 'за 30 дней' : timePeriod === 'weekly' ? 'за 12 недель' : 'за 12 месяцев';
                const formatPeriod = (val: string) => {
                  if (timePeriod === 'daily') {
                    const parts = val.split('-');
                    return parts.length === 3 ? `${parts[2]}.${parts[1]}` : val;
                  }
                  if (timePeriod === 'weekly') {
                    const m = val.match(/W(\d+)/);
                    return m ? `Нед ${parseInt(m[1])}` : val;
                  }
                  const parts = val.split('-');
                  return parts.length === 2 ? `${parts[1]}.${parts[0]}` : val;
                };
                return (
                  <div className="bg-white p-5 rounded-lg shadow-sm border">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      Динамика роста {periodTitle}
                    </h3>
                    {growthData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={growthData}>
                          <defs>
                            <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip labelFormatter={formatPeriod} />
                          <Legend />
                          <Area type="monotone" dataKey="users" stroke="#f97316" strokeWidth={2} fill="url(#gradUsers)" name="Новые пользователи" />
                          <Area type="monotone" dataKey="requests" stroke="#F59E0B" strokeWidth={2} fill="url(#gradRequests)" name="Новые заявки" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        Нет данных за выбранный период
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-20 text-gray-400">
              Нет данных для отображения
            </div>
          )}
        </div>
      )}

      {/* ========== TAB: Ads ========== */}
      {activeTab === 'ads' && (
        <div className="space-y-5">
          {isLoadingAds ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              {/* Stats overview */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => setAdsFilter('all')}
                  className={`group relative overflow-hidden rounded-2xl p-4 text-left transition-all ${
                    adsFilter === 'all'
                      ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-200'
                      : 'bg-white border border-gray-100 hover:shadow-md'
                  }`}
                >
                  <Megaphone className={`w-8 h-8 mb-2 ${adsFilter === 'all' ? 'text-white/80' : 'text-orange-400'}`} />
                  <div className={`text-3xl font-bold ${adsFilter === 'all' ? '' : 'text-gray-900'}`}>{allAds.length}</div>
                  <div className={`text-xs mt-0.5 ${adsFilter === 'all' ? 'text-white/70' : 'text-gray-400'}`}>
                    Всего / {[...new Set(allAds.map(a => a.tenant_name).filter(Boolean))].length} УК
                  </div>
                </button>
                <button
                  onClick={() => setAdsFilter('active')}
                  className={`group relative overflow-hidden rounded-2xl p-4 text-left transition-all ${
                    adsFilter === 'active'
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-200'
                      : 'bg-white border border-gray-100 hover:shadow-md'
                  }`}
                >
                  <CheckCircle className={`w-8 h-8 mb-2 ${adsFilter === 'active' ? 'text-white/80' : 'text-emerald-400'}`} />
                  <div className={`text-3xl font-bold ${adsFilter === 'active' ? '' : 'text-gray-900'}`}>{allAds.filter(a => a.status === 'active').length}</div>
                  <div className={`text-xs mt-0.5 ${adsFilter === 'active' ? 'text-white/70' : 'text-gray-400'}`}>Активных</div>
                </button>
                <div className="bg-white border border-gray-100 rounded-2xl p-4">
                  <Eye className="w-8 h-8 mb-2 text-blue-400" />
                  <div className="text-3xl font-bold text-gray-900">{allAds.reduce((s, a) => s + (a.views_count || 0), 0)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Просмотров</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-4">
                  <Ticket className="w-8 h-8 mb-2 text-purple-400" />
                  <div className="text-3xl font-bold text-gray-900">{allAds.reduce((s, a) => s + (a.coupons_issued || 0), 0)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Купонов / {allAds.reduce((s, a) => s + (a.coupons_activated || 0), 0)} акт.
                  </div>
                </div>
              </div>

              {/* Filter pills */}
              <div className="flex gap-2 flex-wrap">
                {(['all', 'active', 'paused', 'expired'] as const).map(f => {
                  const count = f === 'all' ? allAds.length : allAds.filter(a => a.status === f).length;
                  const label = f === 'all' ? 'Все' : f === 'active' ? 'Активные' : f === 'paused' ? 'На паузе' : 'Истекшие';
                  return (
                    <button
                      key={f}
                      onClick={() => setAdsFilter(f)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        adsFilter === f
                          ? 'bg-gray-900 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {label} <span className={adsFilter === f ? 'text-white/60' : 'text-gray-400'}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Ads grid */}
              {allAds.filter(a => adsFilter === 'all' || a.status === adsFilter).length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                    <Megaphone className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-medium">Нет рекламных объявлений</p>
                  <p className="text-gray-300 text-sm mt-1">Нажмите «Добавить рекламу» чтобы создать</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {allAds.filter(a => adsFilter === 'all' || a.status === adsFilter).map(ad => (
                    <div
                      key={ad.id}
                      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group"
                    >
                      {/* Card header */}
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => setExpandedAdId(expandedAdId === ad.id ? null : ad.id)}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Logo */}
                          {ad.logo_url ? (
                            <img src={ad.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-2xl flex-shrink-0">
                              {adCategoryIcons[ad.category_icon] || '📋'}
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h3 className="font-bold text-gray-900 truncate">{ad.title}</h3>
                              {ad.discount_percent > 0 && (
                                <span className="bg-red-500 text-white px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0">-{ad.discount_percent}%</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleAdStatus(ad.id, ad.status === 'active' ? 'paused' : 'active'); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  ad.status === 'active' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
                                  ad.status === 'paused' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' :
                                  'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {ad.status === 'active' ? 'Активна' : ad.status === 'paused' ? 'Пауза' : 'Истекла'}
                              </button>
                              {ad.tenant_name ? (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" /> {ad.tenant_name}
                                </span>
                              ) : ad.assigned_tenants_count > 0 ? (
                                <span className="text-xs text-indigo-500 flex items-center gap-1" title={ad.assigned_tenant_names || ''}>
                                  <Building2 className="w-3 h-3" /> {ad.assigned_tenants_count} УК
                                </span>
                              ) : (
                                <span className="text-xs text-amber-500 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" /> Не назначено
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand arrow */}
                          <div className="text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0 mt-1">
                            {expandedAdId === ad.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>

                        {/* Stats bar */}
                        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-50">
                          <button
                            onClick={(e) => { e.stopPropagation(); loadAdViews(ad); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            {ad.views_count || 0}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); loadAdCoupons(ad); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                          >
                            <Ticket className="w-4 h-4" />
                            {ad.coupons_issued || 0}
                          </button>
                          {ad.phone && (
                            <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                              <Phone className="w-3.5 h-3.5" /> {ad.phone}
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openAssignModal(ad); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-500 hover:bg-indigo-50 transition-colors ml-auto"
                            title="Назначить УК"
                          >
                            <Building2 className="w-4 h-4" />
                            УК
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteAd(ad.id); }}
                            className="p-1.5 ml-1 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expandedAdId === ad.id && (
                        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Категория</div>
                              <div className="font-medium text-gray-700">{adCategoryIcons[ad.category_icon] || '📋'} {ad.category_name}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">УК</div>
                              {ad.tenant_name ? (
                                <>
                                  <div className="font-medium text-gray-700">{ad.tenant_name}</div>
                                  <div className="text-[10px] text-gray-400">{ad.tenant_slug}.{BASE_DOMAIN}</div>
                                </>
                              ) : (
                                <button
                                  onClick={() => openAssignModal(ad)}
                                  className="font-medium text-indigo-600 hover:underline text-sm"
                                >
                                  {ad.assigned_tenants_count > 0 ? `${ad.assigned_tenants_count} УК назначено` : 'Назначить УК'}
                                </button>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Период</div>
                              <div className="font-medium text-gray-700">
                                {ad.starts_at ? new Date(ad.starts_at).toLocaleDateString('ru-RU') : '—'} — {ad.expires_at ? new Date(ad.expires_at).toLocaleDateString('ru-RU') : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Статистика</div>
                              <div className="flex gap-3 text-gray-700">
                                <button onClick={() => loadAdViews(ad)} className="font-medium hover:text-blue-600 transition-colors">
                                  <Eye className="w-3.5 h-3.5 inline mr-0.5" /> {ad.views_count || 0}
                                </button>
                                <button onClick={() => loadAdCoupons(ad)} className="font-medium hover:text-purple-600 transition-colors">
                                  <Ticket className="w-3.5 h-3.5 inline mr-0.5" /> {ad.coupons_issued || 0} / {ad.coupons_activated || 0}
                                </button>
                              </div>
                            </div>
                          </div>
                          {(ad.description || ad.phone2 || ad.telegram || ad.instagram || ad.address || ad.work_hours || ad.website) && (
                            <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t border-gray-200/60">
                              {ad.description && (
                                <div className="col-span-2">
                                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Описание</div>
                                  <div className="text-gray-700">{ad.description}</div>
                                </div>
                              )}
                              {ad.phone2 && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Доп. телефон</div><div className="text-gray-700">{ad.phone2}</div></div>}
                              {ad.telegram && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Telegram</div><div className="text-gray-700">@{ad.telegram}</div></div>}
                              {ad.instagram && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Instagram</div><div className="text-gray-700">@{ad.instagram}</div></div>}
                              {ad.website && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Сайт</div><div className="text-gray-700">{ad.website}</div></div>}
                              {ad.address && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Адрес</div><div className="text-gray-700">{ad.address}</div></div>}
                              {ad.work_hours && <div><div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Часы работы</div><div className="text-gray-700">{ad.work_hours}</div></div>}
                            </div>
                          )}
                          <div className="text-[10px] text-gray-400 mt-4 pt-2 border-t border-gray-200/60">
                            Создано: {ad.created_at ? new Date(ad.created_at).toLocaleString('ru-RU') : '—'} {ad.creator_name && `(${ad.creator_name})`}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tenant Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowAssignModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <div>
                <h3 className="font-bold text-base">Назначить УК</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{showAssignModal.title}</p>
              </div>
              <button onClick={() => setShowAssignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingAssign ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              </div>
            ) : (
              <>
                <div className="overflow-y-auto flex-1 p-4">
                  {/* Quick select */}
                  <div className="flex items-center gap-3 mb-3">
                    <button type="button" onClick={() => setAssignSelectedIds(assignModalData.all_tenants.map(t => t.id))} className="text-xs text-indigo-600 hover:underline">Выбрать все</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={() => setAssignSelectedIds([])} className="text-xs text-gray-500 hover:underline">Снять все</button>
                    <span className="ml-auto text-xs text-gray-400">Выбрано: {assignSelectedIds.length} из {assignModalData.all_tenants.length}</span>
                  </div>

                  {/* Tenant list with enabled toggles */}
                  <div className="space-y-1.5">
                    {assignModalData.all_tenants.map(t => {
                      const isSelected = assignSelectedIds.includes(t.id);
                      const assignment = assignModalData.assignments.find(a => a.tenant_id === t.id);
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                            isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              if (e.target.checked) setAssignSelectedIds(prev => [...prev, t.id]);
                              else setAssignSelectedIds(prev => prev.filter(id => id !== t.id));
                            }}
                            className="w-4 h-4 text-indigo-600 rounded"
                          />
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${t.color || '#6366f1'}, ${t.color_secondary || '#8b5cf6'})` }}>
                            {t.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{t.name}</div>
                            <div className="text-[10px] text-gray-400">{t.slug}</div>
                          </div>
                          {/* Enabled toggle — only shown for already-assigned tenants */}
                          {isSelected && assignment && (
                            <button
                              onClick={() => handleToggleTenantEnabled(showAssignModal.id, t.id, assignment.enabled === 0)}
                              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${assignment.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                              title={assignment.enabled ? 'Показывается жильцам' : 'Скрыто от жильцов'}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${assignment.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 border-t flex gap-3 flex-shrink-0">
                  <button onClick={() => setShowAssignModal(null)} className="flex-1 py-2.5 border rounded-xl hover:bg-gray-50 text-sm">Отмена</button>
                  <button
                    onClick={handleSaveAssignments}
                    disabled={isSavingAssign}
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                  >
                    {isSavingAssign && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Сохранить ({assignSelectedIds.length} УК)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Views Modal */}
      {showViewsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowViewsModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-base">Просмотры</h3>
                <p className="text-xs text-gray-500 mt-0.5">{showViewsModal.title} — {adViews.length} чел.</p>
              </div>
              <button onClick={() => setShowViewsModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2">
              {isLoadingViews ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : adViews.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Ещё никто не просмотрел</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {adViews.map((v: any, i: number) => (
                    <div key={v.id || i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{v.user_name || 'Без имени'}</div>
                        <div className="text-[11px] text-gray-400">
                          {v.user_phone && <span>{v.user_phone}</span>}
                          {v.apartment_number && <span> · кв. {v.apartment_number}</span>}
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 flex-shrink-0">
                        {v.viewed_at ? new Date(v.viewed_at).toLocaleDateString('ru-RU') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coupons Modal */}
      {showCouponsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowCouponsModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-base">Купоны</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {showCouponsModal.title} — выдано: {showCouponsModal.coupons_issued || 0}, активировано: {showCouponsModal.coupons_activated || 0}
                </p>
              </div>
              <button onClick={() => setShowCouponsModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-2">
              {isLoadingCoupons ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              ) : adCoupons.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Нет купонов</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {adCoupons.map((c: any, i: number) => (
                    <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        c.status === 'activated' ? 'bg-green-100' : c.status === 'expired' ? 'bg-gray-200' : 'bg-purple-100'
                      }`}>
                        <Ticket className={`w-4 h-4 ${
                          c.status === 'activated' ? 'text-green-600' : c.status === 'expired' ? 'text-gray-400' : 'text-purple-600'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-bold text-gray-900 bg-white px-1.5 py-0.5 rounded border">{c.code}</code>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            c.status === 'activated' ? 'bg-green-100 text-green-700' :
                            c.status === 'expired' ? 'bg-gray-100 text-gray-500' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {c.status === 'activated' ? 'Активирован' : c.status === 'expired' ? 'Истёк' : 'Выдан'}
                          </span>
                          {c.discount_percent > 0 && (
                            <span className="text-[10px] font-bold text-red-500">-{c.discount_percent}%</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {c.user_name || 'Без имени'}{c.user_phone ? ` · ${c.user_phone}` : ''}
                          {c.issued_at && ` · ${new Date(c.issued_at).toLocaleDateString('ru-RU')}`}
                        </div>
                        {c.status === 'activated' && c.discount_amount != null && (
                          <div className="text-[11px] text-green-600 mt-0.5">
                            Скидка: {Number(c.discount_amount).toLocaleString()} сум
                            {c.activated_by_name && ` · ${c.activated_by_name}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ad Creation Modal - Full Form */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">Добавить рекламу</h2>
              <button onClick={() => setShowAdModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Row: Category + Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
                  <select value={adForm.category_id} onChange={e => setAdForm({ ...adForm, category_id: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                    <option value="">Выберите</option>
                    {adCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name_ru}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Длительность</label>
                  <select value={adForm.duration_type} onChange={e => setAdForm({ ...adForm, duration_type: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                    <option value="week">1 неделя</option>
                    <option value="2weeks">2 недели</option>
                    <option value="month">1 месяц</option>
                    <option value="3months">3 месяца</option>
                    <option value="6months">6 месяцев</option>
                    <option value="year">1 год</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                <input type="text" value={adForm.title} onChange={e => setAdForm({ ...adForm, title: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="Название услуги / компании" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea value={adForm.description} onChange={e => setAdForm({ ...adForm, description: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" rows={2} placeholder="Краткое описание услуги" />
              </div>

              {/* Phones */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
                  <input type="text" value={adForm.phone} onChange={e => setAdForm({ ...adForm, phone: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="+998..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Доп. телефон</label>
                  <input type="text" value={adForm.phone2} onChange={e => setAdForm({ ...adForm, phone2: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="+998..." />
                </div>
              </div>

              {/* Social */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telegram</label>
                  <input type="text" value={adForm.telegram} onChange={e => setAdForm({ ...adForm, telegram: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="@username" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                  <input type="text" value={adForm.instagram} onChange={e => setAdForm({ ...adForm, instagram: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="@account" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Facebook</label>
                  <input type="text" value={adForm.facebook} onChange={e => setAdForm({ ...adForm, facebook: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="page name" />
                </div>
              </div>

              {/* Website + Address */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Сайт</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={adForm.website} onChange={e => setAdForm({ ...adForm, website: e.target.value })} className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm" placeholder="https://..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={adForm.address} onChange={e => setAdForm({ ...adForm, address: e.target.value })} className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm" placeholder="Адрес компании" />
                  </div>
                </div>
              </div>

              {/* Work hours + Logo + Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Часы работы</label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={adForm.work_hours} onChange={e => setAdForm({ ...adForm, work_hours: e.target.value })} className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm" placeholder="09:00 - 18:00" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Лого (URL)</label>
                  <div className="relative">
                    <Image className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={adForm.logo_url} onChange={e => setAdForm({ ...adForm, logo_url: e.target.value })} className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm" placeholder="https://..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Скидка %</label>
                  <input type="number" min={0} max={100} value={adForm.discount_percent} onChange={e => setAdForm({ ...adForm, discount_percent: Number(e.target.value) })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
              </div>

              {/* Badges */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Бейджи</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'recommended' as const, label: 'Рекомендуем', color: 'orange' },
                    { key: 'new' as const, label: 'Новинка', color: 'green' },
                    { key: 'hot' as const, label: 'Горячее', color: 'red' },
                    { key: 'verified' as const, label: 'Проверено', color: 'blue' },
                  ].map(b => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setAdForm({ ...adForm, badges: { ...adForm.badges, [b.key]: !adForm.badges[b.key] } })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        adForm.badges[b.key]
                          ? `bg-${b.color}-100 text-${b.color}-700 border-${b.color}-300`
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Tenants (УК) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">В каких УК показывать *</label>
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setAdForm({ ...adForm, target_tenant_ids: tenants.map(t => t.id) })} className="text-xs text-orange-600 hover:underline">Выбрать все</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setAdForm({ ...adForm, target_tenant_ids: [] })} className="text-xs text-gray-500 hover:underline">Снять все</button>
                  <span className="ml-auto text-xs text-gray-400">Выбрано: {adForm.target_tenant_ids.length} из {tenants.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {tenants.map(t => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        adForm.target_tenant_ids.includes(t.id) ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={adForm.target_tenant_ids.includes(t.id)}
                        onChange={e => {
                          if (e.target.checked) setAdForm({ ...adForm, target_tenant_ids: [...adForm.target_tenant_ids, t.id] });
                          else setAdForm({ ...adForm, target_tenant_ids: adForm.target_tenant_ids.filter(id => id !== t.id) });
                        }}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color_secondary})` }}>{t.name[0]}</div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{t.name}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowAdModal(false)} className="flex-1 py-2.5 border rounded-lg hover:bg-gray-50 text-sm">Отмена</button>
              <button
                onClick={handleCreateSuperAd}
                disabled={isSubmittingAd || !adForm.category_id || !adForm.title || !adForm.phone || adForm.target_tenant_ids.length === 0}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {isSubmittingAd && <RefreshCw className="w-4 h-4 animate-spin" />}
                Создать ({adForm.target_tenant_ids.length} УК)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== TAB: Banners ========== */}
      {activeTab === 'banners' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Баннеры</h2>
              <p className="text-sm text-gray-500">Баннеры для маркетплейса и полезных контактов</p>
            </div>
            <button
              onClick={() => { setEditingBanner(null); setBannerForm({ title: '', description: '', image_url: '', link_url: '', placement: 'marketplace', is_active: true }); setShowBannerModal(true); }}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Добавить баннер
            </button>
          </div>

          {isLoadingBanners ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : banners.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Баннеров пока нет</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map((banner: any) => (
                <div key={banner.id} className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${banner.is_active ? 'border-green-200' : 'border-gray-200 opacity-60'}`}>
                  {banner.image_url && (
                    <img src={banner.image_url} alt={banner.title} className="w-full h-40 object-cover" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{banner.title}</h3>
                        {banner.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{banner.description}</p>}
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${
                        banner.placement === 'marketplace' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                      }`}>
                        {banner.placement === 'marketplace' ? 'Маркет для дома' : 'Полезные контакты'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleBanner(banner)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${banner.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${banner.is_active ? 'left-[26px]' : 'left-0.5'}`} />
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingBanner(banner);
                            setBannerForm({
                              title: banner.title || '',
                              description: banner.description || '',
                              image_url: banner.image_url || '',
                              link_url: banner.link_url || '',
                              placement: banner.placement || 'marketplace',
                              is_active: Boolean(banner.is_active),
                            });
                            setShowBannerModal(true);
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => handleDeleteBanner(banner.id)} className="p-2 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Banner Modal */}
      {showBannerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingBanner ? 'Редактировать баннер' : 'Новый баннер'}</h2>
              <button onClick={() => { setShowBannerModal(false); setEditingBanner(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Название *</label>
              <input type="text" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Скидки для резидентов" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Описание</label>
              <textarea value={bannerForm.description} onChange={(e) => setBannerForm({ ...bannerForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} placeholder="Особые условия у проверенных партнёров" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">URL изображения</label>
              <input type="text" value={bannerForm.image_url} onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="https://..." />
              {bannerForm.image_url && (
                <img src={bannerForm.image_url} alt="Preview" className="mt-2 h-24 rounded-lg object-cover" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ссылка (при нажатии)</label>
              <input type="text" value={bannerForm.link_url} onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="https://..." />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Размещение</label>
              <div className="flex gap-2">
                {[
                  { value: 'marketplace', label: 'Маркет для дома' },
                  { value: 'useful-contacts', label: 'Полезные контакты' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBannerForm({ ...bannerForm, placement: opt.value })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      bannerForm.placement === opt.value ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Активен</label>
              <button
                type="button"
                onClick={() => setBannerForm({ ...bannerForm, is_active: !bannerForm.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${bannerForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bannerForm.is_active ? 'left-[26px]' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowBannerModal(false); setEditingBanner(null); }} className="flex-1 px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">Отмена</button>
              <button onClick={handleSaveBanner} className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium">{editingBanner ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b">
              <h2 className="text-lg sm:text-xl font-bold">
                {editingTenant ? 'Редактировать УК' : 'Создать УК'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Название *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Slug *</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => {
                      const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                      setFormData({
                        ...formData,
                        slug,
                        url: `https://${slug}.${BASE_DOMAIN}`,
                        admin_url: `https://${slug}.${BASE_DOMAIN}/admin`
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                    pattern="[a-z0-9-]+"
                    placeholder="my-uk"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">URL (генерируется автоматически)</label>
                <input
                  type="text"
                  value={formData.url}
                  className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">
                  Домен будет доступен по адресу: {formData.slug ? `${formData.slug}.${BASE_DOMAIN}` : '(введите slug)'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Логотип</label>
                <div className="flex items-center gap-4">
                  {formData.logo ? (
                    <div className="relative">
                      <img
                        src={formData.logo}
                        alt="Logo"
                        className="w-16 h-16 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, logo: '' }))}
                        className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
                      <Upload className="w-5 h-5 text-gray-400" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  <div className="text-xs text-gray-500">
                    PNG, JPG до 2 МБ
                  </div>
                </div>
              </div>

              {/* Contract Template Upload */}
              <div>
                <label className="block text-sm font-medium mb-1">Шаблон договора (.docx)</label>
                <div className="flex items-center gap-3">
                  {formData.contract_template ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                      <FileText className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-700">{formData.contract_template_name || 'Шаблон загружен'}</span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, contract_template: '', contract_template_name: '' }))}
                        className="p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
                      <Upload className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">Загрузить шаблон</span>
                      <input
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleContractTemplateChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  <div className="text-xs text-gray-500">
                    DOCX до 5 МБ
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Основной цвет</label>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full h-10 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Вторичный цвет</label>
                  <input
                    type="color"
                    value={formData.color_secondary}
                    onChange={(e) => setFormData({ ...formData, color_secondary: e.target.value })}
                    className="w-full h-10 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Тариф' : 'Tarif'}</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => {
                      const plan = e.target.value as 'basic' | 'pro' | 'enterprise';
                      setFormData({ ...formData, plan, features: PLAN_FEATURES[plan] || PLAN_FEATURES.basic });
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Email администратора' : 'Adminstrator emali'}</label>
                  <input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Телефон администратора' : 'Administrator telefoni'}</label>
                  <input
                    type="tel"
                    value={formData.admin_phone}
                    onChange={(e) => setFormData({ ...formData, admin_phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    maxLength={13}
                  />
                </div>
              </div>

              {/* Director credentials - only for creating new tenant */}
              {!editingTenant && (
                <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg space-y-3">
                  <label className="block text-sm font-semibold text-primary-800">Первый директор (будет создан автоматически)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-primary-700 mb-1">ФИО *</label>
                      <input
                        type="text"
                        value={formData.director_name}
                        onChange={(e) => setFormData({ ...formData, director_name: e.target.value })}
                        className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                        placeholder="Иванов И.И."
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary-700 mb-1">Логин *</label>
                      <input
                        type="text"
                        value={formData.director_login}
                        onChange={(e) => setFormData({ ...formData, director_login: e.target.value })}
                        className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                        placeholder="director"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary-700 mb-1">Пароль *</label>
                      <input
                        type="text"
                        value={formData.director_password}
                        onChange={(e) => setFormData({ ...formData, director_password: e.target.value })}
                        className="w-full px-3 py-2 border border-primary-200 rounded-lg text-sm"
                        placeholder="password123"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'Доступные функции' : 'Mavjud imkoniyatlar'}</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_FEATURES.map((feature) => (
                    <label key={feature.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.features.includes(feature.value)}
                        onChange={() => handleFeatureToggle(feature.value)}
                        className="rounded"
                      />
                      <span className="text-sm">{language === 'ru' ? feature.labelRu : feature.labelUz}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                >
                  {editingTenant ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== TAB: Users ========== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="text"
                  placeholder="Поиск по логину, имени, телефону..."
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadUsers(1, usersSearch, usersRoleFilter, usersTenantFilter); }}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 transition-all"
                />
              </div>
              <select
                value={usersRoleFilter}
                onChange={(e) => { setUsersRoleFilter(e.target.value); loadUsers(1, usersSearch, e.target.value, usersTenantFilter); }}
                className="px-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300"
              >
                <option value="">Все роли</option>
                {Object.entries(ROLE_LABELS_MAP).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                <option value="super_admin">Супер админ</option>
              </select>
              <select
                value={usersTenantFilter}
                onChange={(e) => { setUsersTenantFilter(e.target.value); loadUsers(1, usersSearch, usersRoleFilter, e.target.value); }}
                className="px-3 py-2.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300"
              >
                <option value="">Все компании</option>
                {tenants.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <button
                onClick={() => loadUsers(1, usersSearch, usersRoleFilter, usersTenantFilter)}
                className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-medium hover:from-orange-600 hover:to-amber-600 flex items-center gap-2 shadow-sm"
              >
                <Search className="w-4 h-4" />
                Найти
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-3">
              Найдено: <span className="font-semibold text-gray-600">{usersTotal}</span> пользователей
              {' · '}Показано: <span className="font-semibold text-gray-600">{allUsers.length}</span>
            </div>
          </div>

          {/* Table */}
          {isLoadingUsers ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 animate-spin text-orange-400" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Компания</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Имя</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Роль</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Логин</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Пароль</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Телефон</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Филиал</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {u.tenant_name || <span className="text-orange-600 font-medium">super_admin</span>}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{u.name || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            u.role === 'admin' ? 'bg-red-100 text-red-700' :
                            u.role === 'director' ? 'bg-rose-100 text-rose-700' :
                            u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                            u.role === 'resident' ? 'bg-green-100 text-green-700' :
                            u.role === 'executor' ? 'bg-amber-100 text-amber-700' :
                            u.role === 'security' ? 'bg-slate-100 text-slate-700' :
                            u.role === 'super_admin' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>{u.role}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-800 whitespace-nowrap">{u.login}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-800 text-xs">
                              {visiblePasswords.has(u.id) ? (u.password || '—') : '••••••••'}
                            </span>
                            <button
                              onClick={() => setVisiblePasswords(prev => {
                                const next = new Set(prev);
                                if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                                return next;
                              })}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              {visiblePasswords.has(u.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{u.phone || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{u.branch || '—'}</td>
                      </tr>
                    ))}
                    {allUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                          Нет пользователей по заданным фильтрам
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {usersTotal > 50 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Страница {usersPage} из {Math.ceil(usersTotal / 50)}</span>
              <div className="flex gap-2">
                <button
                  disabled={usersPage <= 1}
                  onClick={() => { const p = usersPage - 1; setUsersPage(p); loadUsers(p, usersSearch, usersRoleFilter, usersTenantFilter); }}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                >← Пред.</button>
                <button
                  disabled={usersPage >= Math.ceil(usersTotal / 50)}
                  onClick={() => { const p = usersPage + 1; setUsersPage(p); loadUsers(p, usersSearch, usersRoleFilter, usersTenantFilter); }}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                >След. →</button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
