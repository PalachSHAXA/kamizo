import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Settings, X, XCircle, BarChart3, Megaphone, Image, LayoutDashboard, LogOut, ShieldOff, Send } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { apiRequest, ApiError } from '../../services/api';
import { useToastStore } from '../../stores/toastStore';
import {
  DashboardTab,
  AnalyticsTab,
  AdsTab,
  BannersTab,
  TenantFormModal,
} from './components';
import type { Tenant, TenantFormData, AnalyticsData, SuperAd, AdCategory, TabType } from './components/types';
import { TelegramSuperAdminTab } from './components/TelegramSuperAdminTab';
import { INITIAL_FORM_DATA } from './components/types';

interface SuperBannerDto {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  placement?: string;
  is_active: boolean | number;
}

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
  // When the API rejects our credentials for a super-admin route, we don't
  // want to render the dashboard with zeros — that looks like data loss.
  // Show a session-expired notice with a "log in" action instead.
  //   'unauthorized' — 401, JWT missing/invalid/expired
  //   'forbidden'    — 403, JWT valid but role !== super_admin
  const [authError, setAuthError] = useState<null | 'unauthorized' | 'forbidden'>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Route the ApiError from any load-fn through here so we can distinguish
  // "you're not authorised" from a data-loading failure. Returns true when
  // the error was handled as an auth problem — caller should not also
  // setError() to avoid double-messaging.
  const handleLoadError = (err: unknown): boolean => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setAuthError(err.status === 401 ? 'unauthorized' : 'forbidden');
      return true;
    }
    return false;
  };

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Ads
  const [allAds, setAllAds] = useState<SuperAd[]>([]);
  const [adCategories, setAdCategories] = useState<AdCategory[]>([]);
  const [isLoadingAds, setIsLoadingAds] = useState(false);

  // Banners
  const [banners, setBanners] = useState<SuperBannerDto[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on tab change; analytics/allAds/banners are set inside and would re-trigger on every load
  }, [activeTab]);

  const loadTenants = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest<{ tenants: Tenant[] }>('/api/tenants');
      setTenants(response.tenants);
    } catch (err: unknown) {
      if (handleLoadError(err)) return;
      setError((err instanceof Error ? err.message : '') || 'Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const response = await apiRequest<{ analytics: AnalyticsData }>('/api/super-admin/analytics');
      setAnalytics(response.analytics);
    } catch (err: unknown) {
      if (handleLoadError(err)) return;
      setError((err instanceof Error ? err.message : '') || 'Ошибка загрузки аналитики');
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
    } catch (err: unknown) {
      if (handleLoadError(err)) return;
      setError((err instanceof Error ? err.message : '') || 'Ошибка загрузки рекламы');
    } finally {
      setIsLoadingAds(false);
    }
  };

  const loadBanners = async () => {
    setIsLoadingBanners(true);
    try {
      const res = await apiRequest<{ banners: SuperBannerDto[] }>('/api/super-admin/banners');
      setBanners(res.banners || []);
    } catch (err: unknown) {
      if (handleLoadError(err)) return;
      setError((err instanceof Error ? err.message : '') || 'Ошибка загрузки баннеров');
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
    } catch (err: unknown) {
      addToast('error', (err instanceof Error ? err.message : '') || 'Ошибка удаления');
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
    } catch (err: unknown) {
      setTenants(prev => prev.map(t => t.id === tenant.id ? tenant : t));
      addToast('error', (err instanceof Error ? err.message : '') || 'Ошибка обновления статуса');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contract_template_name: _contractTemplateName, ...rest } = formData;
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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : '') || 'Ошибка сохранения');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Auth-blocked short-circuit: render before the dashboard so we never
  // paint zeros over a real 401/403. 401 = session expired (log in again);
  // 403 = wrong role (log in as super-admin).
  if (authError) {
    const isForbidden = authError === 'forbidden';
    const title = isForbidden ? 'Нет доступа к панели' : 'Сессия истекла';
    const body = isForbidden
      ? 'Этот раздел доступен только под учётной записью супер-администратора. Войдите заново под нужной ролью.'
      : 'Срок сессии истёк или токен не принят. Войдите снова, чтобы продолжить работу с панелью.';
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-7 h-7" strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">{body}</p>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold shadow-sm hover:from-orange-600 hover:to-amber-600"
          >
            Войти заново
          </button>
        </div>
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
              <div className="w-8 h-8 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                <img src="/icons/favicon-64x64.png" alt="Kamizo" className="w-full h-full object-contain" />
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
              { key: 'telegram' as TabType, icon: <Send className="w-4 h-4" />, label: 'Telegram' },
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
          <button onClick={() => setError('')} className="ml-auto min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-red-100 rounded-lg" aria-label="Закрыть"><X className="w-4 h-4" /></button>
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

      {/* Telegram (§18 ТЗ): состояние интеграции, счётчики, доступ
          тенантов и отключение проблемных групп. */}
      {activeTab === 'telegram' && <TelegramSuperAdminTab />}

      {activeTab === 'banners' && (
        <BannersTab
          banners={banners}
          isLoadingBanners={isLoadingBanners}
          loadBanners={loadBanners}
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
