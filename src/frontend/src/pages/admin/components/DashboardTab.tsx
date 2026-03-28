import { useState, useEffect } from 'react';
import { Building2, Users, Banknote, CheckCircle, XCircle, Edit2, Trash2, ExternalLink, ClipboardList, Vote, QrCode, UserCog, Settings, Search, RefreshCw, Sparkles } from 'lucide-react';
import { apiRequest } from '../../../services/api';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import {
  Tenant, TenantStats, DetailTab,
  BASE_DOMAIN, PLAN_LABELS,
  getStatusColor, getRoleColor, getFeatureLabel,
  ROLE_LABELS_MAP, STATUS_LABELS,
} from './types';

interface DashboardTabProps {
  tenants: Tenant[];
  setTenants: React.Dispatch<React.SetStateAction<Tenant[]>>;
  error: string;
  setError: (error: string) => void;
  onEditTenant: (tenant: Tenant) => void;
  onDeleteTenant: (tenant: Tenant) => void;
  onToggleActive: (tenant: Tenant) => void;
  loadTenants: () => void;
}

export function DashboardTab({
  tenants, setTenants, error, setError,
  onEditTenant, onDeleteTenant, onToggleActive, loadTenants,
}: DashboardTabProps) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantStats, setTenantStats] = useState<TenantStats | null>(null);
  const [tenantTabData, setTenantTabData] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('requests');
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingTabData, setIsLoadingTabData] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [statFilter, setStatFilter] = useState<'all' | 'active' | 'users' | 'revenue'>('all');

  useEffect(() => {
    if (tenants.length > 0 && !selectedTenant) {
      loadTenantDetails(tenants[0]);
    }
  }, [tenants]);

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

  const handleToggleActive = async (tenant: Tenant) => {
    onToggleActive(tenant);
    // Also update local selectedTenant if needed
    if (selectedTenant?.id === tenant.id) {
      setSelectedTenant(prev => prev ? { ...prev, is_active: prev.is_active ? 0 : 1 } : prev);
    }
  };

  const totalStats = {
    total: tenants.length,
    active: tenants.filter(t => t.is_active).length,
    users: tenants.reduce((sum, t) => sum + t.users_count, 0),
    revenue: tenants.reduce((sum, t) => sum + Number(t.revenue || 0), 0),
  };

  const DETAIL_TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'requests', label: 'Заявки', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'residents', label: 'Жители', icon: <Users className="w-4 h-4" /> },
    { key: 'votes', label: 'Голосования', icon: <Vote className="w-4 h-4" /> },
    { key: 'qr', label: 'QR-доступ', icon: <QrCode className="w-4 h-4" /> },
    { key: 'staff', label: 'Персонал', icon: <UserCog className="w-4 h-4" /> },
    { key: 'settings', label: 'Настройки', icon: <Settings className="w-4 h-4" /> },
  ];

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
                  useToastStore.getState().addToast('error', e.message || 'Не удалось войти в админку УК');
                }
              }}
              className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm transition-all"
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Войти в админку УК</span>
              <span className="sm:hidden">Войти</span>
            </button>
            <button
              onClick={() => onEditTenant(selectedTenant)}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { icon: Users, value: tenantStats.residents, label: 'Жители', gradient: 'from-blue-500 to-cyan-400' },
                { icon: ClipboardList, value: tenantStats.requests, label: 'Заявки', gradient: 'from-amber-500 to-orange-400' },
                { icon: Vote, value: tenantStats.votes, label: 'Голосования', gradient: 'from-purple-500 to-violet-400' },
                { icon: QrCode, value: tenantStats.qr_codes, label: 'QR-коды', gradient: 'from-emerald-500 to-green-400' },
                { icon: Building2, value: tenantStats.buildings, label: 'Комплексы', gradient: 'from-orange-500 to-amber-400' },
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
    <>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: 'all' as const, icon: Building2, label: 'Всего УК', value: totalStats.total, gradient: 'from-orange-500 to-amber-400', bg: 'bg-orange-50', border: 'border-orange-200', ring: 'ring-orange-200' },
          { key: 'active' as const, icon: CheckCircle, label: 'Активных', value: totalStats.active, gradient: 'from-emerald-500 to-green-400', bg: 'bg-green-50', border: 'border-green-200', ring: 'ring-green-200' },
          { key: 'users' as const, icon: Users, label: 'Жителей', value: totalStats.users, gradient: 'from-blue-500 to-cyan-400', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-200' },
          { key: 'revenue' as const, icon: Banknote, label: 'Доход', value: `${totalStats.revenue.toLocaleString('ru-RU')} сум`, gradient: 'from-purple-500 to-violet-400', bg: 'bg-purple-50', border: 'border-purple-200', ring: 'ring-purple-200' },
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
      <div className="flex flex-col md:flex-row gap-4" style={{ minHeight: 'min(500px, calc(100dvh - 370px))' }}>
      {/* Left: Tenant List */}
      <div className="w-full md:w-80 md:flex-shrink-0 bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 space-y-3 overflow-y-auto shadow-sm max-h-[40dvh] md:max-h-none">
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
                <div className="text-xs text-gray-400 truncate">{tenant.url?.replace('https://', '') || `${tenant.slug}.${BASE_DOMAIN}`}</div>
              </div>
              {!tenant.is_active && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-md text-[9px] font-medium flex-shrink-0">OFF</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pl-[52px]">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {tenant.users_count || 0}</span>
                <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {tenant.requests_count || 0}</span>
                <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {(tenant as any).buildings_count || 0}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteTenant(tenant); }}
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
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 overflow-y-auto max-h-[60dvh] md:max-h-none shadow-sm">
          {renderTenantDetail()}
        </div>
      </div>
    </>
  );
}
