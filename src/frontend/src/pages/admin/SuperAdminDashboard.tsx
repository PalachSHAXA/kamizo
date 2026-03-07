import { useState, useEffect } from 'react';
import { Building2, Users, DollarSign, Plus, Edit2, Trash2, CheckCircle, XCircle, RefreshCw, FileText, TrendingUp, BarChart3, Upload, X, QrCode, Vote, ClipboardList, Settings, ExternalLink, UserCog, Search, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
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

type TabType = 'dashboard' | 'analytics';
type TimePeriod = 'daily' | 'weekly' | 'monthly';

const INITIAL_FORM_DATA: TenantFormData = {
  name: '',
  slug: '',
  url: 'https://.kamizo.uz',
  admin_url: 'https://.kamizo.uz/admin',
  color: '#F97316',
  color_secondary: '#fb923c',
  plan: 'basic',
  features: ['requests', 'votes', 'qr'],
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
  { value: 'requests', label: 'Заявки' },
  { value: 'rentals', label: 'Аренда' },
  { value: 'qr', label: 'QR Коды' },
  { value: 'marketplace', label: 'Маркетплейс' },
  { value: 'meetings', label: 'Собрания' },
  { value: 'chat', label: 'Чат' },
  { value: 'announcements', label: 'Объявления' },
  { value: 'advertiser', label: 'Менеджер рекламы' },
];

const PLAN_COLORS: Record<string, string> = {
  basic: '#9CA3AF',
  pro: '#3B82F6',
  enterprise: '#8B5CF6',
};

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const FEATURE_COLORS = ['#6366f1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const FEATURE_LABELS: Record<string, string> = {
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

export function SuperAdminDashboard() {
  const { logout } = useAuthStore();
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

  const [isCreatingDemo, setIsCreatingDemo] = useState(false);
  const handleCreateKamizoDemo = async () => {
    if (!confirm('Создать демо-тенант "Kamizo Demo" со всеми демо-данными (жители, заявки, здания, авто, собрания)?')) return;
    setIsCreatingDemo(true);
    try {
      await apiRequest('/api/seed-kamizo-demo', { method: 'POST' });
      alert('Kamizo Demo успешно создан! Доступен на kamizo-demo.kamizo.uz');
      await loadTenants();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания демо');
    } finally {
      setIsCreatingDemo(false);
    }
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
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
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
      case 'director': return 'bg-indigo-100 text-indigo-700';
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            {selectedTenant.logo ? (
              <img src={selectedTenant.logo} alt={selectedTenant.name} className="w-12 h-12 rounded-lg object-cover border" />
            ) : (
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ background: `linear-gradient(135deg, ${selectedTenant.color}, ${selectedTenant.color_secondary})` }}
              >
                {selectedTenant.name[0]}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{selectedTenant.name}</h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>{selectedTenant.slug}.kamizo.uz</span>
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
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const resp = await apiRequest<{ user: any; token: string; tenantUrl: string }>(
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
                    version: 3
                  })));
                  window.open(`${selectedTenant.url}?auto_auth=${encodeURIComponent(authData)}`, '_blank');
                } catch (e: any) {
                  alert('Не удалось войти: ' + (e.message || 'Ошибка'));
                }
              }}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Войти в админку УК
            </button>
            <button
              onClick={() => handleEditTenant(selectedTenant)}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Stats Cards */}
        {isLoadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : tenantStats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded-lg"><Users className="w-4 h-4 text-blue-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.residents}</div>
                    <div className="text-xs text-gray-500">Жители</div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 rounded-lg"><ClipboardList className="w-4 h-4 text-amber-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.requests}</div>
                    <div className="text-xs text-gray-500">Заявки</div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-100 rounded-lg"><Vote className="w-4 h-4 text-purple-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.votes}</div>
                    <div className="text-xs text-gray-500">Голосования</div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-green-100 rounded-lg"><QrCode className="w-4 h-4 text-green-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.qr_codes}</div>
                    <div className="text-xs text-gray-500">QR-коды</div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 rounded-lg"><Building2 className="w-4 h-4 text-indigo-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.buildings}</div>
                    <div className="text-xs text-gray-500">Здания</div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-100 rounded-lg"><UserCog className="w-4 h-4 text-red-600" /></div>
                  <div>
                    <div className="text-lg font-bold">{tenantStats.staff}</div>
                    <div className="text-xs text-gray-500">Персонал</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex gap-1 border-b border-gray-200">
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => loadTabData(tab.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                    detailTab === tab.key
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
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
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
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
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
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
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Slug:</span> <span className="font-medium">{selectedTenant.slug}</span></div>
                      <div><span className="text-gray-500">URL:</span> <a href={selectedTenant.url} target="_blank" className="text-indigo-600 hover:underline">{selectedTenant.url}</a></div>
                      <div><span className="text-gray-500">Тариф:</span> <span className="font-medium">{PLAN_LABELS[selectedTenant.plan]}</span></div>
                      <div><span className="text-gray-500">Email:</span> <span className="font-medium">{selectedTenant.admin_email || '—'}</span></div>
                      <div><span className="text-gray-500">Телефон:</span> <span className="font-medium">{selectedTenant.admin_phone || '—'}</span></div>
                      <div><span className="text-gray-500">Создан:</span> <span className="font-medium">{new Date(selectedTenant.created_at).toLocaleDateString('ru-RU')}</span></div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-sm">Функции:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(selectedTenant.features ? JSON.parse(selectedTenant.features) : []).map((f: string) => (
                          <span key={f} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                            {FEATURE_LABELS[f] || f}
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
    <div className="p-6 space-y-5">
      {/* Header with clock, settings, logout */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Super Admin</h1>
        <div className="flex items-center gap-3">
          {activeTab === 'dashboard' && (
            <>
              <button
                onClick={loadTenants}
                className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500"
                title="Обновить"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleCreateKamizoDemo}
                disabled={isCreatingDemo}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {isCreatingDemo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                Kamizo Demo
              </button>
              <button
                onClick={handleCreateTenant}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Добавить УК
              </button>
            </>
          )}
          {activeTab === 'analytics' && (
            <button
              onClick={() => { setAnalytics(null); loadAnalytics(); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
          )}
          <button
            onClick={() => navigate('/settings')}
            className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="p-2 border rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Дашборд
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Аналитика
        </button>
      </div>

      {/* ========== TAB: Dashboard ========== */}
      {activeTab === 'dashboard' && (
        <>
          {/* Stat Cards - clickable */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              onClick={() => setStatFilter(statFilter === 'all' ? 'all' : 'all')}
              className={`p-5 rounded-xl shadow-sm border cursor-pointer transition-all ${
                statFilter === 'all' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Всего УК</div>
                  <div className="text-2xl font-bold">{totalStats.total}</div>
                </div>
              </div>
            </div>
            <div
              onClick={() => setStatFilter(statFilter === 'active' ? 'all' : 'active')}
              className={`p-5 rounded-xl shadow-sm border cursor-pointer transition-all ${
                statFilter === 'active' ? 'bg-green-50 border-green-300 ring-2 ring-green-200' : 'bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Активных</div>
                  <div className="text-2xl font-bold">{totalStats.active}</div>
                </div>
              </div>
            </div>
            <div
              onClick={() => setStatFilter(statFilter === 'users' ? 'all' : 'users')}
              className={`p-5 rounded-xl shadow-sm border cursor-pointer transition-all ${
                statFilter === 'users' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Всего жителей</div>
                  <div className="text-2xl font-bold">{totalStats.users}</div>
                </div>
              </div>
            </div>
            <div
              onClick={() => setStatFilter(statFilter === 'revenue' ? 'all' : 'revenue')}
              className={`p-5 rounded-xl shadow-sm border cursor-pointer transition-all ${
                statFilter === 'revenue' ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-200' : 'bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Общий доход</div>
                  <div className="text-2xl font-bold">${totalStats.revenue.toLocaleString('en-US')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Master-Detail */}
          <div className="flex gap-4" style={{ height: 'calc(100vh - 370px)' }}>
          {/* Left: Tenant List (Dark Theme) */}
          <div className="w-80 flex-shrink-0 bg-slate-800 rounded-xl p-4 space-y-3 overflow-y-auto">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск УК..."
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
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
                className={`p-3 rounded-xl cursor-pointer transition-all group ${
                  selectedTenant?.id === tenant.id
                    ? 'bg-indigo-600/30 border border-indigo-500/50'
                    : 'bg-slate-700/40 border border-slate-700 hover:bg-slate-700/70'
                }`}
                onClick={() => loadTenantDetails(tenant)}
              >
                <div className="flex items-center gap-3">
                  {tenant.logo ? (
                    <img src={tenant.logo} alt={tenant.name} className="w-10 h-10 rounded-lg object-cover border border-slate-600 flex-shrink-0" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color_secondary})` }}
                    >
                      {tenant.name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-white truncate">{tenant.name}</div>
                    <div className="text-xs text-slate-400 truncate">{tenant.slug}.kamizo.uz</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pl-[52px]">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tenant.users_count}</span>
                    <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {tenant.requests_count}</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {Number(tenant.revenue || 0)}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant); }}
                    className="p-1 text-slate-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

            {/* Right: Detail View */}
            <div className="flex-1 bg-gray-50 rounded-xl border p-5 overflow-y-auto">
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
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : analytics ? (
            <>
              {/* Summary Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 rounded-lg">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Тенанты</div>
                      <div className="text-xl font-bold">{analytics.totals.tenants}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600" />
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
                        ? 'bg-indigo-600 text-white'
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
                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="bg-white p-5 rounded-lg shadow-sm border">
                      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2 text-gray-700">
                        <Users className="w-4 h-4 text-blue-500" />
                        Пользователи по {periodLabel}
                      </h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={growthData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip labelFormatter={formatPeriod} />
                          <Bar dataKey="users" fill="#6366f1" name="Пользователи" radius={[4, 4, 0, 0]} />
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
                          <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
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
                          <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 11 }} />
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
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <h3 className="font-semibold text-sm mb-4 text-gray-700">Распределение по тарифам</h3>
                  <div className="flex items-center gap-6">
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
                <div className="bg-white p-5 rounded-lg shadow-sm border">
                  <h3 className="font-semibold text-sm mb-4 text-gray-700">Использование функций</h3>
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={analytics.featureUsage.map(f => ({ ...f, label: FEATURE_LABELS[f.feature] || f.feature }))}
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
                            <span className="text-sm text-gray-600">{FEATURE_LABELS[item.feature] || item.feature}</span>
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
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={formatPeriod} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip labelFormatter={formatPeriod} />
                          <Legend />
                          <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} fill="url(#gradUsers)" name="Новые пользователи" />
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">
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
                        url: `https://${slug}.kamizo.uz`,
                        admin_url: `https://${slug}.kamizo.uz/admin`
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
                  Домен будет доступен по адресу: {formData.slug ? `${formData.slug}.kamizo.uz` : '(введите slug)'}
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
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
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
                    <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
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

              <div className="grid grid-cols-3 gap-4">
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
                  <label className="block text-sm font-medium mb-1">Тариф</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
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
                  <label className="block text-sm font-medium mb-1">Email администратора</label>
                  <input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Телефон администратора</label>
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
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <label className="block text-sm font-semibold text-blue-800">Первый директор (будет создан автоматически)</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">ФИО *</label>
                      <input
                        type="text"
                        value={formData.director_name}
                        onChange={(e) => setFormData({ ...formData, director_name: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm"
                        placeholder="Иванов И.И."
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">Логин *</label>
                      <input
                        type="text"
                        value={formData.director_login}
                        onChange={(e) => setFormData({ ...formData, director_login: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm"
                        placeholder="director"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">Пароль *</label>
                      <input
                        type="text"
                        value={formData.director_password}
                        onChange={(e) => setFormData({ ...formData, director_password: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm"
                        placeholder="password123"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Доступные функции</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_FEATURES.map((feature) => (
                    <label key={feature.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.features.includes(feature.value)}
                        onChange={() => handleFeatureToggle(feature.value)}
                        className="rounded"
                      />
                      <span className="text-sm">{feature.label}</span>
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {editingTenant ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
