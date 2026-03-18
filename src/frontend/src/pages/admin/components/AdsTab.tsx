import { useState } from 'react';
import { Building2, Plus, Trash2, CheckCircle, RefreshCw, X, Eye, EyeOff, Phone, Globe, MapPin, Clock, Image, ChevronDown, ChevronUp, Ticket, User, Megaphone } from 'lucide-react';
import { apiRequest } from '../../../services/api';
import { useToastStore } from '../../../stores/toastStore';
import {
  Tenant, SuperAd, AdCategory, AdTenantAssignment, adCategoryIcons, BASE_DOMAIN,
} from './types';

interface AdsTabProps {
  allAds: SuperAd[];
  setAllAds: React.Dispatch<React.SetStateAction<SuperAd[]>>;
  adCategories: AdCategory[];
  isLoadingAds: boolean;
  tenants: Tenant[];
  loadAds: () => void;
}

export function AdsTab({ allAds, setAllAds, adCategories, isLoadingAds, tenants, loadAds }: AdsTabProps) {
  const addToast = useToastStore(s => s.addToast);

  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);
  const [adsFilter, setAdsFilter] = useState<'all' | 'active' | 'paused' | 'expired'>('all');

  // Ad creation modal
  const [showAdModal, setShowAdModal] = useState(false);
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

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState<SuperAd | null>(null);
  const [assignModalData, setAssignModalData] = useState<{ assignments: AdTenantAssignment[]; all_tenants: any[] }>({ assignments: [], all_tenants: [] });
  const [isLoadingAssign, setIsLoadingAssign] = useState(false);
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);

  // Views modal
  const [showViewsModal, setShowViewsModal] = useState<SuperAd | null>(null);
  const [adViews, setAdViews] = useState<any[]>([]);
  const [isLoadingViews, setIsLoadingViews] = useState(false);

  // Coupons modal
  const [showCouponsModal, setShowCouponsModal] = useState<SuperAd | null>(null);
  const [adCoupons, setAdCoupons] = useState<any[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);

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
      addToast('error', err.message || 'Ошибка создания рекламы');
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
      addToast('error', err.message || 'Ошибка');
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
      addToast('error', err.message || 'Ошибка');
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
      addToast('error', err.message || 'Ошибка сохранения');
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
      addToast('error', err.message || 'Ошибка');
    }
  };

  return (
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
                      {ad.logo_url ? (
                        <img src={ad.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-2xl flex-shrink-0">
                          {adCategoryIcons[ad.category_icon] || '📋'}
                        </div>
                      )}

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

      {/* Tenant Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4" onClick={() => setShowAssignModal(null)}>
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
                  <div className="flex items-center gap-3 mb-3">
                    <button type="button" onClick={() => setAssignSelectedIds(assignModalData.all_tenants.map(t => t.id))} className="text-xs text-indigo-600 hover:underline">Выбрать все</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={() => setAssignSelectedIds([])} className="text-xs text-gray-500 hover:underline">Снять все</button>
                    <span className="ml-auto text-xs text-gray-400">Выбрано: {assignSelectedIds.length} из {assignModalData.all_tenants.length}</span>
                  </div>

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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4" onClick={() => setShowViewsModal(null)}>
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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4" onClick={() => setShowCouponsModal(null)}>
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

      {/* Ad Creation Modal */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">Добавить рекламу</h2>
              <button onClick={() => setShowAdModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
                <input type="text" value={adForm.title} onChange={e => setAdForm({ ...adForm, title: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" placeholder="Название услуги / компании" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea value={adForm.description} onChange={e => setAdForm({ ...adForm, description: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" rows={2} placeholder="Краткое описание услуги" />
              </div>

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
    </div>
  );
}

// Export setter for parent to open create modal
AdsTab.openCreateModal = null as (() => void) | null;
