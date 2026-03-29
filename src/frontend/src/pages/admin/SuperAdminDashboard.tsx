import { useState, useEffect } from 'react';
import { Building2, Plus, RefreshCw, Settings, X, XCircle, BarChart3, Megaphone, Image, UserCog, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useToastStore } from '../../stores/toastStore';
import {
  DashboardTab,
  AnalyticsTab,
  AdsTab,
  BannersTab,
  UsersTab,
  TenantFormModal,
} from './components';
import {
  Tenant, TenantFormData, AnalyticsData, SuperAd, AdCategory,
  TabType, INITIAL_FORM_DATA,
} from './components/types';

export function SuperAdminDashboard() {
  const { logout } = useAuthStore();
  const addToast = useToastStore(s => s.addToast);
  const navigate = useNavigate();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(INITIAL_FORM_DATA);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Ads
  const [allAds, setAllAds] = useState<SuperAd[]>([]);
  const [adCategories, setAdCategories] = useState<AdCategory[]>([]);
  const [isLoadingAds, setIsLoadingAds] = useState(false);

  // Banners
  const [banners, setBanners] = useState<any[]>([]);
  const [isLoadingBanners, setIsLoadingBanners] = useState(false);

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
      await apiRequest(`/api/tenants/${tenant.id}`, { method: 'DELETE' });
      await loadTenants();
    } catch (err: any) {
      addToast('error', err.message || 'Ошибка удаления');
    }
  };

  const handleToggleActive = async (tenant: Tenant) => {
    const newStatus = tenant.is_active ? 0 : 1;
    const updated = { ...tenant, is_active: newStatus };
    setTenants(prev => prev.map(t => t.id === tenant.id ? updated : t));
    try {
      const resp = await apiRequest<{ tenant: Tenant }>(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newStatus }),
      });
      if (resp.tenant) {
        setTenants(prev => prev.map(t => t.id === resp.tenant.id ? resp.tenant : t));
      }
    } catch (err: any) {
      setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t));
      addToast('error', err.message || 'Ошибка обновления статуса');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { contract_template_name, ...rest } = formData;
      const body = { ...rest, features: formData.features };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

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
                <p className="text-xs text-gray-400 -mt-0.5 hidden sm:block">Super Admin Panel</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {activeTab === 'dashboard' && (
                <>
                  <button
                    onClick={loadTenants}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Обновить"
                    aria-label="Обновить"
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
                <button
                  onClick={() => { setAllAds([]); loadAds(); }}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Обновить"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
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

      {activeTab === 'dashboard' && (
        <DashboardTab
          tenants={tenants}
          setTenants={setTenants}
          error={error}
          setError={setError}
          onEditTenant={handleEditTenant}
          onDeleteTenant={handleDeleteTenant}
          onToggleActive={handleToggleActive}
          loadTenants={loadTenants}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsTab
          analytics={analytics}
          isLoadingAnalytics={isLoadingAnalytics}
        />
      )}

      {activeTab === 'ads' && (
        <AdsTab
          allAds={allAds}
          setAllAds={setAllAds}
          adCategories={adCategories}
          isLoadingAds={isLoadingAds}
          tenants={tenants}
          loadAds={loadAds}
        />
      )}

      {activeTab === 'banners' && (
        <BannersTab
          banners={banners}
          isLoadingBanners={isLoadingBanners}
          loadBanners={loadBanners}
        />
      )}

      {activeTab === 'users' && (
        <UsersTab
          tenants={tenants}
          error={error}
          setError={setError}
        />
      )}

      </div>

      {/* Tenant Create/Edit Modal */}
      {showModal && (
        <TenantFormModal
          editingTenant={editingTenant}
          formData={formData}
          setFormData={setFormData}
          error={error}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
