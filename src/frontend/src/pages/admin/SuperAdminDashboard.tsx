import { useState, useEffect } from 'react';
import { Building2, Users, DollarSign, Plus, Edit2, Trash2, CheckCircle, XCircle, RefreshCw, FileText, TrendingUp, BarChart3, Upload, X } from 'lucide-react';
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
  director_login: string;
  director_password: string;
  director_name: string;
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

type TabType = 'companies' | 'analytics';
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
  director_login: '',
  director_password: '',
  director_name: '',
};

const AVAILABLE_FEATURES = [
  { value: 'requests', label: 'Заявки' },
  { value: 'votes', label: 'Голосования' },
  { value: 'qr', label: 'QR Коды' },
  { value: 'marketplace', label: 'Маркетплейс' },
  { value: 'meetings', label: 'Собрания' },
  { value: 'chat', label: 'Чат' },
  { value: 'announcements', label: 'Объявления' },
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
  votes: 'Голосования',
  qr: 'QR Коды',
  marketplace: 'Маркетплейс',
  meetings: 'Собрания',
  chat: 'Чат',
  announcements: 'Объявления',
};

export function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(INITIAL_FORM_DATA);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('companies');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');

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
      director_login: '',
      director_password: '',
      director_name: '',
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
    try {
      await apiRequest(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: tenant.is_active ? 0 : 1 }),
      });
      await loadTenants();
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const body = {
        ...formData,
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Super Admin</h1>
        {activeTab === 'companies' && (
          <button
            onClick={handleCreateTenant}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить УК
          </button>
        )}
        {activeTab === 'analytics' && (
          <button
            onClick={() => { setAnalytics(null); loadAnalytics(); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('companies')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'companies'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Управляющие компании
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

      {/* ========== TAB: Companies ========== */}
      {activeTab === 'companies' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <Building2 className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Всего УК</div>
                  <div className="text-2xl font-bold">{totalStats.total}</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Активных</div>
                  <div className="text-2xl font-bold">{totalStats.active}</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Всего жителей</div>
                  <div className="text-2xl font-bold">{totalStats.users}</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Общий доход</div>
                  <div className="text-2xl font-bold">${totalStats.revenue.toLocaleString('en-US')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tenants Table */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">УК</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тариф</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Жители</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Заявки</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Доход</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {tenant.logo ? (
                            <img
                              src={tenant.logo}
                              alt={tenant.name}
                              className="w-10 h-10 rounded-lg object-cover border"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                              style={{ background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color_secondary})` }}
                            >
                              {tenant.name[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-sm text-gray-500">{tenant.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={tenant.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-sm"
                        >
                          {tenant.url}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          tenant.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                          tenant.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{tenant.users_count}</td>
                      <td className="px-6 py-4 text-sm">{tenant.requests_count}</td>
                      <td className="px-6 py-4 text-sm">${Number(tenant.revenue || 0).toLocaleString('en-US')}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(tenant)}
                          className="flex items-center gap-1"
                        >
                          {tenant.is_active ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-sm">Активен</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-gray-400">
                              <XCircle className="w-4 h-4" />
                              <span className="text-sm">Неактивен</span>
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditTenant(tenant)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded"
                            title="Редактировать"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTenant(tenant)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {tenants.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет управляющих компаний</p>
                </div>
              )}
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
