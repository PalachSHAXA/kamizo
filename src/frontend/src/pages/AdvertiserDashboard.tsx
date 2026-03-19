import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Plus, Eye, Ticket, CheckCircle, AlertTriangle,
  Edit, Trash2, X, Loader2, Phone,
  Calendar, TrendingUp,
  Star, Flame, Sparkles, Globe, BadgeCheck
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';

interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
}

interface BuildingOption {
  id: string;
  name: string;
  address: string;
  branch_code?: string;
}

interface AdCategory {
  id: string;
  name_ru: string;
  name_uz: string;
  icon: string;
  active_ads_count: number;
}

interface Ad {
  id: string;
  category_id: string;
  category_name: string;
  title: string;
  description: string;
  phone: string;
  phone2?: string;
  telegram?: string;
  address?: string;
  work_hours?: string;
  work_days?: string;
  logo_url?: string;
  photos?: string[];
  discount_percent: number;
  badges?: { recommended?: boolean; new?: boolean; hot?: boolean; verified?: boolean };
  target_type: 'all' | 'branches' | 'buildings';
  target_branches?: string[];
  target_buildings?: string[];
  starts_at: string;
  expires_at: string;
  duration_type: 'week' | 'month' | 'custom';
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived';
  views_count: number;
  coupons_issued: number;
  coupons_activated: number;
  created_at: string;
}

interface DashboardStats {
  active_ads: number;
  expired_ads: number;
  draft_ads: number;
  total_views: number;
  total_coupons_issued: number;
  total_coupons_activated: number;
}

interface Coupon {
  id: string;
  code: string;
  user_name: string;
  user_phone: string;
  discount_percent: number;
  status: string;
  issued_at: string;
  activated_at?: string;
  activated_by_name?: string;
  activation_amount?: number;
  discount_amount?: number;
}

// Instagram-style verified badge component
const VerifiedBadge = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };
  return (
    <svg className={`${sizes[size]} text-[#1DA1F2]`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
    </svg>
  );
};

const categoryIcons: Record<string, string> = {
  'cleaning': '🧹',
  'renovation': '🏠',
  'minor_repair': '🔧',
  'electrical': '⚡',
  'plumbing': '🚿',
  'moving': '🚚',
  'auto': '🚗',
  'construction': '🧱',
  'ac': '❄️',
  'beauty': '💄',
  'tailoring': '🧵',
  'it': '💻',
  'domestic': '👩‍🍳',
  'pest_control': '🦠',
  'dry_cleaning': '🧴',
  'delivery': '📦',
  'other': '📋'
};

export function AdvertiserDashboard() {
  const { token } = useAuthStore();
  const { language } = useLanguageStore();
  const [categories, setCategories] = useState<AdCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [expiringSoon, setExpiringSoon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'expired' | 'draft'>('all');
  const [showAdModal, setShowAdModal] = useState(false);
  const [showCouponsModal, setShowCouponsModal] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    work_days: '',
    logo_url: '',
    discount_percent: 10,
    duration_type: 'month' as 'week' | '2weeks' | 'month' | '3months' | '6months' | 'year',
    target_type: 'all' as 'all' | 'branches' | 'buildings',
    badges: { recommended: false, new: true, hot: false, verified: false },
    target_branches: [] as string[],
    target_buildings: [] as string[]
  });

  const API_BASE = import.meta.env.VITE_API_URL || '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, dashRes, adsRes, branchRes, buildingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/ads/categories`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/ads/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/ads/my`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/branches`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/buildings`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (catRes.ok) {
        const data = await catRes.json();
        setCategories(data.categories || []);
      }
      if (dashRes.ok) {
        const data = await dashRes.json();
        setStats(data.stats);
        setExpiringSoon(data.expiringSoon || []);
      }
      if (adsRes.ok) {
        const data = await adsRes.json();
        setAds(data.ads?.map((ad: any) => ({
          ...ad,
          badges: ad.badges ? JSON.parse(ad.badges) : {},
          photos: ad.photos ? JSON.parse(ad.photos) : [],
          target_branches: ad.target_branches ? JSON.parse(ad.target_branches) : [],
          target_buildings: ad.target_buildings ? JSON.parse(ad.target_buildings) : []
        })) || []);
      }
      if (branchRes.ok) {
        const data = await branchRes.json();
        setBranches(data.branches || []);
      }
      if (buildingsRes.ok) {
        const data = await buildingsRes.json();
        setBuildings((data.buildings || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          address: b.address || '',
          branch_code: b.branch_code
        })));
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [token, API_BASE]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchCoupons = async (adId: string) => {
    setLoadingCoupons(true);
    try {
      const res = await fetch(`${API_BASE}/api/ads/${adId}/coupons`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
      }
    } catch (err) {
      console.error('Failed to fetch coupons:', err);
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleCreateAd = async () => {
    if (!adForm.category_id || !adForm.title || !adForm.phone) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(adForm)
      });

      if (res.ok) {
        setShowAdModal(false);
        resetForm();
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create ad:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAd = async () => {
    if (!selectedAd) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ads/${selectedAd.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(adForm)
      });

      if (res.ok) {
        setShowAdModal(false);
        setSelectedAd(null);
        resetForm();
        fetchData();
      }
    } catch (err) {
      console.error('Failed to update ad:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAd = async (adId: string) => {
    if (!confirm(language === 'ru' ? 'Архивировать это объявление?' : 'Ushbu e\'lonni arxivlash?')) return;

    try {
      await fetch(`${API_BASE}/api/ads/${adId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      console.error('Failed to delete ad:', err);
    }
  };

  const resetForm = () => {
    setAdForm({
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
      work_days: '',
      logo_url: '',
      discount_percent: 10,
      duration_type: 'month',
      target_type: 'all',
      badges: { recommended: false, new: true, hot: false, verified: false },
      target_branches: [],
      target_buildings: []
    });
  };

  const openEditModal = (ad: Ad) => {
    setSelectedAd(ad);
    setAdForm({
      category_id: ad.category_id,
      title: ad.title,
      description: ad.description || '',
      phone: ad.phone,
      phone2: ad.phone2 || '',
      telegram: ad.telegram || '',
      instagram: (ad as any).instagram || '',
      facebook: (ad as any).facebook || '',
      website: (ad as any).website || '',
      address: ad.address || '',
      work_hours: ad.work_hours || '',
      work_days: ad.work_days || '',
      logo_url: ad.logo_url || '',
      discount_percent: ad.discount_percent,
      duration_type: ad.duration_type as any,
      target_type: ad.target_type,
      badges: {
        recommended: ad.badges?.recommended ?? false,
        new: ad.badges?.new ?? false,
        hot: ad.badges?.hot ?? false,
        verified: ad.badges?.verified ?? false
      },
      target_branches: ad.target_branches || [],
      target_buildings: (ad as any).target_buildings || []
    });
    setShowAdModal(true);
  };

  const openCouponsModal = (ad: Ad) => {
    setSelectedAd(ad);
    fetchCoupons(ad.id);
    setShowCouponsModal(true);
  };

  const filteredAds = ads.filter(ad => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return ad.status === 'active';
    if (activeTab === 'expired') return ad.status === 'expired' || ad.status === 'archived';
    if (activeTab === 'draft') return ad.status === 'draft';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{language === 'ru' ? 'Рекламный кабинет' : 'Reklama kabineti'}</h1>
          <p className="text-gray-500">{language === 'ru' ? 'Управление объявлениями и купонами' : 'E\'lonlar va kuponlarni boshqarish'}</p>
        </div>
        <button
          onClick={() => { resetForm(); setSelectedAd(null); setShowAdModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-5 h-5" />
          {language === 'ru' ? 'Новое объявление' : 'Yangi e\'lon'}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4 xl:gap-5 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-white/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.active_ads || 0}</div>
                <div className="text-sm text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-white/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total_views || 0}</div>
                <div className="text-sm text-gray-500">{language === 'ru' ? 'Просмотров' : 'Ko\'rishlar'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-white/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Ticket className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total_coupons_issued || 0}</div>
                <div className="text-sm text-gray-500">{language === 'ru' ? 'Выдано купонов' : 'Berilgan kuponlar'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-white/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total_coupons_activated || 0}</div>
                <div className="text-sm text-gray-500">{language === 'ru' ? 'Активировано' : 'Faollashtirilgan'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expiring Soon Warning */}
      {expiringSoon.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-yellow-700 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">{language === 'ru' ? `Скоро истекают (${expiringSoon.length})` : `Tez orada tugaydi (${expiringSoon.length})`}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiringSoon.map((ad: any) => (
              <span key={ad.id} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                {ad.title} - {new Date(ad.expires_at).toLocaleDateString('ru-RU')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        {(['all', 'active', 'expired', 'draft'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'all' && (language === 'ru' ? 'Все' : 'Hammasi')}
            {tab === 'active' && (language === 'ru' ? 'Активные' : 'Faol')}
            {tab === 'expired' && (language === 'ru' ? 'Истёкшие' : 'Tugagan')}
            {tab === 'draft' && (language === 'ru' ? 'Черновики' : 'Qoralamalar')}
          </button>
        ))}
      </div>

      {/* Ads List - OLX style */}
      <div className="space-y-2">
        {filteredAds.length === 0 ? (
          <div className="text-center py-12 bg-white/90 backdrop-blur-sm rounded-2xl border border-white/60 shadow-lg">
            <LayoutDashboard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{language === 'ru' ? 'Нет объявлений' : 'E\'lonlar yo\'q'}</p>
            <button
              onClick={() => { resetForm(); setShowAdModal(true); }}
              className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
            >
              {language === 'ru' ? 'Создать первое объявление' : 'Birinchi e\'lonni yaratish'}
            </button>
          </div>
        ) : (
          filteredAds.map(ad => (
            <div key={ad.id} className="w-full flex bg-white/90 backdrop-blur-sm rounded-2xl border border-white/60 hover:border-primary-200 hover:shadow-lg transition-all overflow-hidden shadow-lg">
              {/* Image/Logo - left side */}
              <div className="w-32 sm:w-40 h-32 sm:h-36 bg-gray-50 flex-shrink-0 flex items-center justify-center relative p-2">
                {ad.logo_url ? (
                  <img
                    src={ad.logo_url}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-5xl">{categoryIcons[(categories.find(c => c.id === ad.category_id)?.icon) || 'other'] || '📋'}</span>
                )}

                {/* Status ribbon */}
                <div className={`absolute top-0 left-0 text-white text-xs font-bold px-2 py-0.5 rounded-br-lg ${
                  ad.status === 'active' ? 'bg-green-500' :
                  ad.status === 'expired' ? 'bg-red-500' :
                  ad.status === 'draft' ? 'bg-gray-500' :
                  'bg-primary-500'
                }`}>
                  {ad.status === 'active' ? (language === 'ru' ? 'Активно' : 'Faol') :
                   ad.status === 'expired' ? (language === 'ru' ? 'Истекло' : 'Tugagan') :
                   ad.status === 'draft' ? (language === 'ru' ? 'Черновик' : 'Qoralama') : (language === 'ru' ? 'Пауза' : 'Pauza')}
                </div>

                {/* Verified ribbon */}
                {ad.badges?.verified && (
                  <div className="absolute top-0 right-0 bg-[#1DA1F2] text-white text-xs font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-0.5">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
                    </svg>
                  </div>
                )}

                {/* Discount badge */}
                {ad.discount_percent > 0 && (
                  <div className="absolute bottom-2 left-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    -{ad.discount_percent}%
                  </div>
                )}
              </div>

              {/* Content - right side */}
              <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-gray-900 truncate text-sm sm:text-base">{ad.title}</h3>
                      {ad.badges?.verified && <VerifiedBadge size="sm" />}
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {ad.badges?.new && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">{language === 'ru' ? 'Новое' : 'Yangi'}</span>
                      )}
                      {ad.badges?.hot && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">{language === 'ru' ? 'Топ' : 'Top'}</span>
                      )}
                      {ad.badges?.recommended && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">{language === 'ru' ? 'Рекомендуем' : 'Tavsiya qilamiz'}</span>
                      )}
                      {ad.target_type === 'branches' && ad.target_branches && ad.target_branches.length > 0 && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                          {ad.target_branches.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openCouponsModal(ad)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-purple-600 transition-colors"
                      title={language === 'ru' ? 'Купоны' : 'Kuponlar'}
                    >
                      <Ticket className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(ad)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
                      title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAd(ad.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                      title={language === 'ru' ? 'Архивировать' : 'Arxivlash'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Category */}
                <div className="text-xs text-gray-500 mt-1">{ad.category_name}</div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mt-auto pt-2 text-xs flex-wrap">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{ad.views_count}</span>
                  </div>
                  <div className="flex items-center gap-1 text-purple-600">
                    <Ticket className="w-3.5 h-3.5" />
                    <span>{ad.coupons_issued}</span>
                  </div>
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{ad.coupons_activated}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400 ml-auto">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{language === 'ru' ? 'до' : 'gacha'} {new Date(ad.expires_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-center gap-1.5 text-green-600 font-medium text-sm mt-2">
                  <Phone className="w-4 h-4" />
                  {ad.phone}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Ad Modal */}
      {/* TODO: migrate to <Modal> component */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">
                {selectedAd ? (language === 'ru' ? 'Редактировать объявление' : 'E\'lonni tahrirlash') : (language === 'ru' ? 'Новое объявление' : 'Yangi e\'lon')}
              </h2>
              <button onClick={() => { setShowAdModal(false); setSelectedAd(null); }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Закрыть">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Категория' : 'Kategoriya'}<span className="text-red-500 ml-1">*</span></label>
                <select
                  value={adForm.category_id}
                  onChange={e => setAdForm({ ...adForm, category_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">{language === 'ru' ? 'Выберите категорию' : 'Kategoriyani tanlang'}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{language === 'ru' ? cat.name_ru : cat.name_uz}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Название' : 'Nomi'}<span className="text-red-500 ml-1">*</span></label>
                <input
                  type="text"
                  value={adForm.title}
                  onChange={e => setAdForm({ ...adForm, title: e.target.value })}
                  placeholder={language === 'ru' ? "Например: Химчистка 'Чистый дом'" : "Masalan: 'Toza uy' kimyoviy tozalash"}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Описание' : 'Tavsif'}</label>
                <textarea
                  value={adForm.description}
                  onChange={e => setAdForm({ ...adForm, description: e.target.value })}
                  placeholder={language === 'ru' ? 'Опишите услуги...' : 'Xizmatlarni tavsiflab bering...'}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}<span className="text-red-500 ml-1">*</span></label>
                  <input
                    type="tel"
                    value={adForm.phone}
                    onChange={e => setAdForm({ ...adForm, phone: e.target.value })}
                    placeholder="+998901234567"
                    className="w-full px-3 py-2 border rounded-lg"
                    maxLength={13}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Доп. телефон' : 'Qo\'shimcha telefon'}</label>
                  <input
                    type="tel"
                    value={adForm.phone2}
                    onChange={e => setAdForm({ ...adForm, phone2: e.target.value })}
                    placeholder="+998901234567"
                    className="w-full px-3 py-2 border rounded-lg"
                    maxLength={13}
                  />
                </div>
              </div>

              {/* Social Networks */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">{language === 'ru' ? 'Социальные сети' : 'Ijtimoiy tarmoqlar'}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {/* Telegram */}
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#0088cc]" fill="currentColor">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={adForm.telegram}
                      onChange={e => setAdForm({ ...adForm, telegram: e.target.value })}
                      placeholder="@username"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  {/* Instagram */}
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#E4405F]" fill="currentColor">
                        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={adForm.instagram}
                      onChange={e => setAdForm({ ...adForm, instagram: e.target.value })}
                      placeholder="@username"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  {/* Facebook */}
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#1877F2]" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={adForm.facebook}
                      onChange={e => setAdForm({ ...adForm, facebook: e.target.value })}
                      placeholder="facebook.com/page"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  {/* Website */}
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-gray-500" />
                    </div>
                    <input
                      type="url"
                      value={adForm.website}
                      onChange={e => setAdForm({ ...adForm, website: e.target.value })}
                      placeholder="https://example.com"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Адрес' : 'Manzil'}</label>
                <input
                  type="text"
                  value={adForm.address}
                  onChange={e => setAdForm({ ...adForm, address: e.target.value })}
                  placeholder={language === 'ru' ? 'Город, улица, дом' : 'Shahar, ko\'cha, uy'}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Work hours */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Часы работы' : 'Ish vaqti'}</label>
                  <input
                    type="text"
                    value={adForm.work_hours}
                    onChange={e => {
                      let v = e.target.value;
                      setAdForm({ ...adForm, work_hours: v });
                    }}
                    onBlur={() => {
                      const v = adForm.work_hours.trim();
                      const m = v.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
                      if (m) {
                        setAdForm({ ...adForm, work_hours: `${m[1]}:00 - ${m[2]}:00` });
                      }
                    }}
                    placeholder="9:00 - 18:00"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Дни работы' : 'Ish kunlari'}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => {
                      const selected = (adForm.work_days || '').split(', ').filter(Boolean).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const days = (adForm.work_days || '').split(', ').filter(Boolean);
                            const newDays = selected ? days.filter(d => d !== day) : [...days, day];
                            const order = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
                            newDays.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                            setAdForm({ ...adForm, work_days: newDays.join(', ') });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            selected
                              ? 'bg-primary-500 text-white border-primary-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Ссылка на логотип' : 'Logotipga havola'}</label>
                <input
                  type="url"
                  value={adForm.logo_url}
                  onChange={e => setAdForm({ ...adForm, logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Discount */}
              <div>
                <label className="block text-sm font-medium mb-1">{language === 'ru' ? 'Скидка по купону (%)' : 'Kupon bo\'yicha chegirma (%)'}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={adForm.discount_percent}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    const num = Math.min(parseInt(val) || 0, 100);
                    setAdForm({ ...adForm, discount_percent: val === '' ? 0 : num });
                  }}
                  maxLength={3}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Срок размещения' : 'Joylashtirish muddati'}</label>
                <div className="grid grid-cols-3 xl:grid-cols-3 gap-2 xl:gap-3">
                  {[
                    { value: 'week', label: language === 'ru' ? '1 неделя' : '1 hafta' },
                    { value: '2weeks', label: language === 'ru' ? '2 недели' : '2 hafta' },
                    { value: 'month', label: language === 'ru' ? '1 месяц' : '1 oy' },
                    { value: '3months', label: language === 'ru' ? '3 месяца' : '3 oy' },
                    { value: '6months', label: language === 'ru' ? '6 месяцев' : '6 oy' },
                    { value: 'year', label: language === 'ru' ? '1 год' : '1 yil' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAdForm({ ...adForm, duration_type: opt.value as any })}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        adForm.duration_type === opt.value
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Badges - Telegram style toggles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">{language === 'ru' ? 'Бейджи' : 'Nishonlar'}</label>
                <div className="space-y-3">
                  {/* Recommended */}
                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Star className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{language === 'ru' ? 'Рекомендуем' : 'Tavsiya qilamiz'}</div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Показывать как рекомендованное' : 'Tavsiya etilgan sifatida ko\'rsatish'}</div>
                      </div>
                    </div>
                    <div className={`relative w-12 h-7 rounded-full transition-colors ${adForm.badges.recommended ? 'bg-primary-600' : 'bg-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={adForm.badges.recommended}
                        onChange={e => setAdForm({ ...adForm, badges: { ...adForm.badges, recommended: e.target.checked } })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${adForm.badges.recommended ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </label>

                  {/* New */}
                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{language === 'ru' ? 'Новинка' : 'Yangilik'}</div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Отметить как новое' : 'Yangi sifatida belgilash'}</div>
                      </div>
                    </div>
                    <div className={`relative w-12 h-7 rounded-full transition-colors ${adForm.badges.new ? 'bg-green-600' : 'bg-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={adForm.badges.new}
                        onChange={e => setAdForm({ ...adForm, badges: { ...adForm.badges, new: e.target.checked } })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${adForm.badges.new ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </label>

                  {/* Hot */}
                  <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <Flame className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{language === 'ru' ? 'Горячее' : 'Issiq'}</div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Популярное предложение' : 'Mashhur taklif'}</div>
                      </div>
                    </div>
                    <div className={`relative w-12 h-7 rounded-full transition-colors ${adForm.badges.hot ? 'bg-red-600' : 'bg-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={adForm.badges.hot}
                        onChange={e => setAdForm({ ...adForm, badges: { ...adForm.badges, hot: e.target.checked } })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${adForm.badges.hot ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </label>

                  {/* Verified - Instagram style */}
                  <label className="flex items-center justify-between p-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-xl cursor-pointer hover:from-sky-100 hover:to-blue-100 transition-colors border border-sky-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-sky-200">
                        <BadgeCheck className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-1.5">
                          {language === 'ru' ? 'Проверено' : 'Tasdiqlangan'}
                          <svg className="w-4 h-4 text-sky-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Официальный партнёр УК' : 'BK rasmiy hamkori'}</div>
                      </div>
                    </div>
                    <div className={`relative w-12 h-7 rounded-full transition-colors ${adForm.badges.verified ? 'bg-gradient-to-r from-sky-400 to-blue-500' : 'bg-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={adForm.badges.verified}
                        onChange={e => setAdForm({ ...adForm, badges: { ...adForm.badges, verified: e.target.checked } })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${adForm.badges.verified ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </label>
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Где показывать рекламу' : 'Reklamani qayerda ko\'rsatish'}</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="target_type"
                      checked={adForm.target_type === 'all'}
                      onChange={() => setAdForm({ ...adForm, target_type: 'all', target_branches: [], target_buildings: [] })}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{language === 'ru' ? 'Все объекты' : 'Barcha obyektlar'}</div>
                      <div className="text-xs text-gray-500">{language === 'ru' ? `Рекламу увидят все жители (${buildings.length} объектов, ${branches.length} филиалов)` : `Reklamani barcha aholi ko'radi (${buildings.length} obyekt, ${branches.length} filial)`}</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="target_type"
                      checked={adForm.target_type === 'buildings'}
                      onChange={() => setAdForm({ ...adForm, target_type: 'buildings', target_branches: [] })}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{language === 'ru' ? 'Выбрать объекты (комплексы)' : 'Obyektlarni tanlash (komplekslar)'}</div>
                      <div className="text-xs text-gray-500">{language === 'ru' ? 'Только для определённых комплексов' : 'Faqat ma\'lum komplekslar uchun'}</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="target_type"
                      checked={adForm.target_type === 'branches'}
                      onChange={() => setAdForm({ ...adForm, target_type: 'branches', target_buildings: [] })}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{language === 'ru' ? 'Выбрать филиалы (УК)' : 'Filiallarni tanlash (BK)'}</div>
                      <div className="text-xs text-gray-500">{language === 'ru' ? 'Только для определённых управляющих компаний' : 'Faqat ma\'lum boshqaruv kompaniyalari uchun'}</div>
                    </div>
                  </label>
                </div>

                {adForm.target_type === 'buildings' && (
                  <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {buildings.map(building => (
                      <label
                        key={building.id}
                        className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border-2 transition-all ${
                          adForm.target_buildings.includes(building.id)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={adForm.target_buildings.includes(building.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setAdForm({ ...adForm, target_buildings: [...adForm.target_buildings, building.id] });
                            } else {
                              setAdForm({ ...adForm, target_buildings: adForm.target_buildings.filter(b => b !== building.id) });
                            }
                          }}
                          className="w-4 h-4 text-primary-600 rounded"
                        />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{building.name}</div>
                          <div className="text-xs text-gray-500">{building.address}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {adForm.target_type === 'branches' && (
                  <div className="mt-3 grid grid-cols-2 xl:grid-cols-3 gap-2">
                    {branches.map(branch => (
                      <label
                        key={branch.code}
                        className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border-2 transition-all ${
                          adForm.target_branches.includes(branch.code)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={adForm.target_branches.includes(branch.code)}
                          onChange={e => {
                            if (e.target.checked) {
                              setAdForm({ ...adForm, target_branches: [...adForm.target_branches, branch.code] });
                            } else {
                              setAdForm({ ...adForm, target_branches: adForm.target_branches.filter(b => b !== branch.code) });
                            }
                          }}
                          className="w-4 h-4 text-primary-600 rounded"
                        />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{branch.code}</div>
                          <div className="text-xs text-gray-500">{branch.name}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => { setShowAdModal(false); setSelectedAd(null); }}
                className="flex-1 py-2.5 border rounded-lg hover:bg-gray-50"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={selectedAd ? handleUpdateAd : handleCreateAd}
                disabled={submitting || !adForm.category_id || !adForm.title || !adForm.phone}
                className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {selectedAd ? (language === 'ru' ? 'Сохранить' : 'Saqlash') : (language === 'ru' ? 'Создать' : 'Yaratish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupons Modal */}
      {/* TODO: migrate to <Modal> component */}
      {showCouponsModal && selectedAd && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold">{language === 'ru' ? 'Купоны' : 'Kuponlar'}: {selectedAd.title}</h2>
                <p className="text-sm text-gray-500">
                  {language === 'ru' ? 'Выдано' : 'Berilgan'}: {selectedAd.coupons_issued} | {language === 'ru' ? 'Активировано' : 'Faollashtirilgan'}: {selectedAd.coupons_activated}
                </p>
              </div>
              <button onClick={() => { setShowCouponsModal(false); setSelectedAd(null); }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Закрыть">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {loadingCoupons ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : coupons.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {language === 'ru' ? 'Купоны пока не выданы' : 'Kuponlar hali berilmagan'}
                </div>
              ) : (
                <div className="space-y-3">
                  {coupons.map(coupon => (
                    <div key={coupon.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 bg-white border rounded font-mono text-sm">{coupon.code}</code>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            coupon.status === 'activated' ? 'bg-green-100 text-green-700' :
                            coupon.status === 'expired' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {coupon.status === 'activated' ? (language === 'ru' ? 'Активирован' : 'Faollashtirilgan') :
                             coupon.status === 'expired' ? (language === 'ru' ? 'Истёк' : 'Tugagan') : (language === 'ru' ? 'Выдан' : 'Berilgan')}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {coupon.user_name} • {coupon.user_phone}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {language === 'ru' ? 'Выдан' : 'Berilgan'}: {new Date(coupon.issued_at).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">-{coupon.discount_percent}%</div>
                        {coupon.status === 'activated' && coupon.activation_amount && (
                          <div className="text-sm text-green-600">
                            {language === 'ru' ? 'Скидка' : 'Chegirma'}: {coupon.discount_amount?.toLocaleString()} {language === 'ru' ? 'сум' : 'so\'m'}
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
    </div>
  );
}
