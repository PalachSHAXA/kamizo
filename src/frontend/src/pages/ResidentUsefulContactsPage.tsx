import { useState, useEffect, useCallback } from 'react';
import {
  Phone, MapPin, Clock, Search, ArrowLeft,
  Ticket, CheckCircle, Loader2, Flame, Sparkles,
  Tag, Eye, Gift, Globe, ChevronRight, Shield, Siren,
  HeartPulse, FireExtinguisher, Zap, PlugZap
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';

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
  category_name_uz: string;
  category_icon: string;
  title: string;
  description: string;
  phone: string;
  phone2?: string;
  telegram?: string;
  instagram?: string;
  facebook?: string;
  website?: string;
  address?: string;
  work_hours?: string;
  work_days?: string;
  logo_url?: string;
  photos: string[];
  discount_percent: number;
  badges: { recommended?: boolean; new?: boolean; hot?: boolean; verified?: boolean };
  views_count: number;
  starts_at: string;
  expires_at: string;
  user_has_coupon: number;
}

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  status: string;
  issued_at: string;
  expires_at: string;
}

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

export default function ResidentUsefulContactsPage() {
  const { token } = useAuthStore();
  const { language } = useLanguageStore();
  const { config } = useTenantStore();
  const [categories, setCategories] = useState<AdCategory[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [userCoupon, setUserCoupon] = useState<Coupon | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);

  const API_BASE = import.meta.env.VITE_API_URL || '';

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, [token, API_BASE]);

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAds(data.ads || []);
      }
    } catch (err) {
      console.error('Error fetching ads:', err);
    }
  }, [token, API_BASE]);

  const fetchAdDetails = useCallback(async (adId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/${adId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedAd(data.ad);
        setUserCoupon(data.userCoupon);
      }
    } catch (err) {
      console.error('Error fetching ad details:', err);
    }
  }, [token, API_BASE]);

  const getCoupon = async () => {
    if (!selectedAd) return;

    setLoadingCoupon(true);
    try {
      const res = await fetch(`${API_BASE}/api/ads/${selectedAd.id}/get-coupon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserCoupon(data.coupon);
      }
    } catch (err) {
      console.error('Error getting coupon:', err);
    } finally {
      setLoadingCoupon(false);
    }
  };

  const copyCode = () => {
    if (userCoupon) {
      navigator.clipboard.writeText(userCoupon.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const fetchBanners = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/banners?placement=useful-contacts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBanners(data.banners || []);
      }
    } catch { /* non-critical */ }
  }, [token, API_BASE]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchAds(), fetchBanners()]);
      setLoading(false);
    };
    init();
  }, [fetchCategories, fetchAds, fetchBanners]);

  const getCategoryName = (cat: AdCategory) => {
    return language === 'uz' ? cat.name_uz : cat.name_ru;
  };

  // Group ads by category
  const adsByCategory = categories
    .filter(cat => cat.active_ads_count > 0)
    .map(cat => ({
      category: cat,
      ads: ads.filter(ad => ad.category_id === cat.id)
    }))
    .filter(group => group.ads.length > 0);

  // Filter by search
  const filteredGroups = searchQuery
    ? adsByCategory.map(group => ({
        ...group,
        ads: group.ads.filter(ad =>
          ad.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ad.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(group => group.ads.length > 0)
    : adsByCategory;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Full Page View for Ad Details (OLX style)
  if (selectedAd) {
    // Check if there are any contacts to show
    const hasContacts = selectedAd.phone2 || selectedAd.telegram || selectedAd.instagram || selectedAd.facebook || selectedAd.website;

    return (
      <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 overflow-x-hidden">
        {/* Top Navigation Bar */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => { setSelectedAd(null); setUserCoupon(null); }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Назад</span>
            </button>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Eye className="w-4 h-4" /> {selectedAd.views_count}
            </span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto overflow-hidden">
          {/* Main Content */}
          <div className="bg-white">
            {/* Logo/Image Section - Full width like button */}
            <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-gray-50 to-white">
              {selectedAd.logo_url ? (
                <div className="w-full h-36 sm:h-44 rounded-2xl bg-white shadow-lg overflow-hidden flex items-center justify-center border border-gray-100">
                  <img src={selectedAd.logo_url} alt="" className="max-w-full max-h-full object-contain p-4" />
                </div>
              ) : (
                <div className="w-full h-36 sm:h-44 rounded-2xl bg-gradient-to-br from-primary-100 to-indigo-100 flex items-center justify-center shadow-lg">
                  <span className="text-7xl sm:text-8xl">{categoryIcons[selectedAd.category_icon] || '📋'}</span>
                </div>
              )}
            </div>

            {/* Title & Category */}
            <div className="px-4 pb-4 text-center">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{selectedAd.title}</h1>
                {selectedAd.badges?.verified && <VerifiedBadge size="lg" />}
              </div>
              <p className="text-gray-500 mt-1">{categoryIcons[selectedAd.category_icon]} {selectedAd.category_name}</p>
            </div>

            {/* Badges */}
            {(selectedAd.badges?.hot || selectedAd.badges?.new || selectedAd.discount_percent > 0) && (
              <div className="flex flex-wrap justify-center gap-2 px-4 pb-4">
                {selectedAd.badges?.new && (
                  <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Новый
                  </span>
                )}
                {selectedAd.badges?.hot && (
                  <span className="px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold flex items-center gap-1.5">
                    <Flame className="w-4 h-4" /> Топ
                  </span>
                )}
                {selectedAd.discount_percent > 0 && (
                  <span className="px-4 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-bold flex items-center gap-1.5">
                    <Tag className="w-4 h-4" /> Скидка {selectedAd.discount_percent}%
                  </span>
                )}
              </div>
            )}

            {/* Contact Icons Row - Under badges */}
            {hasContacts && (
              <div className="flex flex-wrap justify-center gap-3 px-4 pb-4">
                {selectedAd.phone2 && (
                  <a href={`tel:${selectedAd.phone2}`} className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors" title={`Доп. телефон: ${selectedAd.phone2}`}>
                    <Phone className="w-5 h-5 text-gray-600" />
                  </a>
                )}
                {selectedAd.telegram && (
                  <a href={`https://t.me/${selectedAd.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                     className="w-11 h-11 rounded-full bg-[#0088cc] hover:bg-[#0077b5] flex items-center justify-center transition-colors" title="Telegram">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                  </a>
                )}
                {selectedAd.instagram && (
                  <a href={`https://instagram.com/${selectedAd.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                     className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 flex items-center justify-center transition-all" title="Instagram">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                )}
                {selectedAd.facebook && (
                  <a href={selectedAd.facebook.startsWith('http') ? selectedAd.facebook : `https://facebook.com/${selectedAd.facebook}`} target="_blank" rel="noopener noreferrer"
                     className="w-11 h-11 rounded-full bg-[#1877f2] hover:bg-[#166fe5] flex items-center justify-center transition-colors" title="Facebook">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                )}
                {selectedAd.website && (
                  <a href={selectedAd.website.startsWith('http') ? selectedAd.website : `https://${selectedAd.website}`} target="_blank" rel="noopener noreferrer"
                     className="w-11 h-11 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors" title="Веб-сайт">
                    <Globe className="w-5 h-5 text-white" />
                  </a>
                )}
              </div>
            )}

            {/* Call Button */}
            <div className="px-4 pb-4">
              <a
                href={`tel:${selectedAd.phone}`}
                className="flex items-center justify-center gap-3 w-full py-4 bg-green-500 hover:bg-green-600 rounded-2xl text-white font-semibold text-lg transition-colors shadow-lg shadow-green-200"
              >
                <Phone className="w-6 h-6" />
                <span>Позвонить: {selectedAd.phone}</span>
              </a>
            </div>
          </div>

          {/* Description Section - Multi-line */}
          {selectedAd.description && (
            <div className="bg-white mt-2 px-4 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Описание</h2>
              <p className="text-gray-700 whitespace-pre-line leading-relaxed break-words">{selectedAd.description}</p>
            </div>
          )}

          {/* Info Cards */}
          {(selectedAd.address || selectedAd.work_hours) && (
            <div className="bg-white mt-2 px-4 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Информация</h2>
              <div className="space-y-3">
                {selectedAd.address && (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <MapPin className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-500 mb-0.5">Адрес</div>
                      <div className="text-gray-900 break-words">{selectedAd.address}</div>
                    </div>
                  </div>
                )}
                {selectedAd.work_hours && (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <Clock className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-500 mb-0.5">Время работы</div>
                      <div className="text-gray-900 break-words">{selectedAd.work_hours} {selectedAd.work_days && `• ${selectedAd.work_days}`}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coupon Section - Compact */}
          {selectedAd.discount_percent > 0 && (
            <div className="bg-white mt-2 px-4 py-4">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-4 text-white">
                {userCoupon ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-10 h-10 text-green-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs opacity-80">Ваш промокод</div>
                      <div
                        onClick={copyCode}
                        className="bg-white/20 rounded-lg px-3 py-1.5 mt-1 cursor-pointer hover:bg-white/30 transition-colors inline-block"
                      >
                        <code className="text-lg font-mono font-bold tracking-wider">{userCoupon.code}</code>
                      </div>
                      <div className="text-xs mt-1 opacity-70">
                        {copiedCode ? '✓ Скопировано!' : 'Нажмите, чтобы скопировать'} • до {new Date(userCoupon.expires_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Gift className="w-10 h-10 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-lg font-bold">Скидка {selectedAd.discount_percent}%</div>
                      <div className="text-xs opacity-80">Эксклюзивно для жителей</div>
                    </div>
                    <button
                      onClick={getCoupon}
                      disabled={loadingCoupon}
                      className="px-4 py-2 bg-white text-purple-600 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50 shadow flex-shrink-0"
                    >
                      {loadingCoupon ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Получить'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom padding */}
          <div className="h-8" />
        </div>
      </div>
    );
  }

  // Main View - Modern card design
  return (
    <div className="max-w-4xl mx-auto pb-24 md:pb-0">
      {/* Header */}
      <div className="mb-5 px-1">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {language === 'ru' ? 'Полезные контакты' : 'Foydali kontaktlar'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {language === 'ru'
            ? 'Проверенные специалисты для жителей комплекса'
            : 'Majmua aholisi uchun tekshirilgan mutaxassislar'}
        </p>
      </div>

      {/* Banners */}
      {banners.length > 0 && (
        <div className="mb-5 px-1 space-y-3">
          {banners.map((banner: any) => (
            <div
              key={banner.id}
              onClick={() => banner.link_url && window.open(banner.link_url, '_blank')}
              className={`rounded-2xl overflow-hidden ${banner.link_url ? 'cursor-pointer active:scale-[0.99]' : ''} transition-transform`}
              style={{ background: 'linear-gradient(135deg, #FFF9E6 0%, #FFF3CC 100%)' }}
            >
              {banner.image_url ? (
                <img src={banner.image_url} alt={banner.title} className="w-full h-36 object-cover" />
              ) : (
                <div className="p-5 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--brand, #F97316), #FB923C)' }}>
                        <span className="text-white font-extrabold text-lg">K</span>
                      </div>
                      <span className="font-bold text-gray-800">kamizo</span>
                    </div>
                    <h3 className="font-bold text-gray-900">{banner.title}</h3>
                    {banner.description && <p className="text-sm text-gray-600 mt-0.5">{banner.description}</p>}
                  </div>
                  <div className="px-5 py-2.5 rounded-xl text-white font-bold text-sm flex-shrink-0" style={{ background: 'var(--brand, #F97316)' }}>
                    {language === 'ru' ? 'СКИДКИ' : 'CHEGIRMALAR'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Emergency Services - Compact grid */}
      <div className="mb-5 px-1">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
              <Siren className="w-4.5 h-4.5 text-red-600" />
            </div>
            <h2 className="font-semibold text-gray-900 text-[15px]">
              {language === 'ru' ? 'Экстренные службы' : 'Tez yordam xizmatlari'}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { name: language === 'ru' ? 'Пожарная' : 'Yong\'in xizmati', number: '101', icon: FireExtinguisher, color: 'bg-red-500' },
              { name: language === 'ru' ? 'Полиция' : 'Politsiya', number: '102', icon: Shield, color: 'bg-blue-600' },
              { name: language === 'ru' ? 'Скорая помощь' : 'Tez yordam', number: '103', icon: HeartPulse, color: 'bg-green-600' },
              { name: language === 'ru' ? 'Газовая служба' : 'Gaz xizmati', number: '104', icon: Zap, color: 'bg-yellow-500' },
              { name: language === 'ru' ? 'МЧС' : 'FVV', number: '1050', icon: Siren, color: 'bg-orange-500' },
              { name: language === 'ru' ? 'Электросеть' : 'Elektr tarmog\'i', number: '1055', icon: PlugZap, color: 'bg-indigo-500' },
            ].map(service => (
              <a
                key={service.number}
                href={`tel:${service.number}`}
                className="flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl p-2.5 transition-all active:scale-[0.98]"
              >
                <div className={`w-9 h-9 rounded-full ${service.color} flex items-center justify-center flex-shrink-0`}>
                  <service.icon className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 truncate leading-tight">{service.name}</div>
                  <div className="text-[16px] font-bold text-gray-900 leading-tight">{service.number}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder={language === 'ru' ? 'Поиск услуг...' : 'Xizmatlarni qidirish...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      {/* Contacts by Category */}
      {filteredGroups.length > 0 ? (
        <div className="space-y-6">
          {filteredGroups.map(group => (
            <div key={group.category.id}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-xl">{categoryIcons[group.category.icon] || '📋'}</span>
                <h2 className="font-semibold text-gray-900">{getCategoryName(group.category)}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{group.ads.length}</span>
              </div>

              {/* Service cards - glass-card style */}
              <div className="space-y-2.5">
                {group.ads.map(ad => (
                  <button
                    key={ad.id}
                    onClick={() => fetchAdDetails(ad.id)}
                    className="w-full glass-card p-4 hover:shadow-lg transition-all text-left group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Logo/Icon */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-50 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
                        {ad.logo_url ? (
                          <img
                            src={ad.logo_url}
                            alt=""
                            className="max-w-full max-h-full object-contain p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`flex items-center justify-center ${ad.logo_url ? 'hidden' : ''}`}>
                          <span className="text-3xl">{categoryIcons[ad.category_icon] || '📋'}</span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-[15px] truncate">{ad.title}</h3>
                          {ad.badges?.verified && <VerifiedBadge size="sm" />}
                        </div>

                        {/* Badges */}
                        {(ad.badges?.new || ad.badges?.hot || ad.discount_percent > 0) && (
                          <div className="flex items-center gap-1.5 mt-1">
                            {ad.badges?.new && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-semibold">{language === 'ru' ? 'Новый' : 'Yangi'}</span>}
                            {ad.badges?.hot && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[11px] font-semibold">{language === 'ru' ? 'Топ' : 'Top'}</span>}
                            {ad.discount_percent > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-bold">-{ad.discount_percent}%</span>}
                          </div>
                        )}

                        {/* Description */}
                        {ad.description && (
                          <p className="text-[13px] text-gray-500 line-clamp-2 mt-1.5">{ad.description}</p>
                        )}

                        {/* Bottom row */}
                        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                          <a href={`tel:${ad.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-green-600 font-medium text-[13px] hover:text-green-700">
                            <Phone className="w-3.5 h-3.5" />
                            {ad.phone}
                          </a>

                          {/* Social icons inline */}
                          <div className="flex items-center gap-1">
                            {ad.telegram && (
                              <div className="w-6 h-6 rounded-full bg-[#0088cc]/10 flex items-center justify-center">
                                <svg className="w-3 h-3 text-[#0088cc]" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                </svg>
                              </div>
                            )}
                            {ad.instagram && (
                              <div className="w-6 h-6 rounded-full bg-pink-50 flex items-center justify-center">
                                <svg className="w-3 h-3 text-pink-600" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                              </div>
                            )}
                            {ad.website && (
                              <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center">
                                <Globe className="w-3 h-3 text-indigo-600" />
                              </div>
                            )}
                          </div>

                          {ad.user_has_coupon > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium ml-auto">
                              <Ticket className="w-3 h-3" /> {language === 'ru' ? 'Купон' : 'Kupon'}
                            </span>
                          )}

                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all ml-auto shrink-0" />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        (() => {
          const showContactsBanner = (config?.tenant as any)?.show_useful_contacts_banner !== 0 && ads.length === 0 && !loading && !searchQuery;
          if (showContactsBanner) {
            return (
              <div className="space-y-4 pb-24 md:pb-0">
                {/* Privileges banner */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #FFF9E6, #FFF3CC)' }}>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-500">
                            <span className="text-white font-extrabold text-lg">K</span>
                          </div>
                          <span className="font-bold text-gray-800 text-lg">kamizo</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">{language === 'ru' ? 'Привилегии для резидентов' : 'Rezidentlar uchun imtiyozlar'}</h2>
                        <p className="text-sm text-gray-600">{language === 'ru' ? 'Особые условия у проверенных партнёров' : 'Tasdiqlangan hamkorlar bilan maxsus shartlar'}</p>
                      </div>
                      <div className="px-5 py-2.5 rounded-xl text-white font-bold text-sm flex-shrink-0 bg-orange-500 ml-3">
                        {language === 'ru' ? 'СКИДКИ' : 'CHEGIRMALAR'}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Emergency services */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border">
                  <h3 className="font-bold text-gray-800 mb-3">{language === 'ru' ? 'Экстренные службы' : 'Favqulodda xizmatlar'}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[{num:'101',label:language==='ru'?'Пожарные':'O\'t o\'chirish',color:'bg-red-100 text-red-700'},{num:'102',label:language==='ru'?'Полиция':'Militsiya',color:'bg-blue-100 text-blue-700'},{num:'103',label:language==='ru'?'Скорая':'Tez yordam',color:'bg-green-100 text-green-700'}].map(s => (
                      <a key={s.num} href={`tel:${s.num}`} className={`flex flex-col items-center p-3 rounded-xl ${s.color} transition-all active:scale-95`}>
                        <span className="text-2xl font-black">{s.num}</span>
                        <span className="text-xs font-medium mt-1 text-center">{s.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
                {/* Coming soon partners */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border text-center">
                  <div className="w-14 h-14 mx-auto mb-3 bg-orange-50 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl">🤝</span>
                  </div>
                  <p className="font-semibold text-gray-700">{language === 'ru' ? 'Партнёры появятся скоро' : 'Hamkorlar tez orada paydo bo\'ladi'}</p>
                  <p className="text-sm text-gray-400 mt-1">{language === 'ru' ? 'Ваша УК скоро добавит полезные контакты' : 'Sizning UKingiz tez orada foydali kontaktlar qo\'shadi'}</p>
                </div>
              </div>
            );
          }
          return (
            <div className="text-center py-16 px-4">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Ticket className="w-10 h-10 text-primary-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {searchQuery
                  ? (language === 'ru' ? 'Ничего не найдено' : 'Hech narsa topilmadi')
                  : (language === 'ru' ? 'Скоро здесь появятся предложения' : 'Tez orada takliflar paydo bo\'ladi')
                }
              </h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                {searchQuery
                  ? (language === 'ru' ? 'Попробуйте изменить поисковый запрос' : 'So\'rovni o\'zgartirib ko\'ring')
                  : (language === 'ru'
                      ? 'Мы подбираем лучших специалистов для жителей комплекса'
                      : 'Majmua aholisi uchun eng yaxshi mutaxassislarni tanlamoqdamiz')
                }
              </p>
            </div>
          );
        })()
      )}
    </div>
  );
}
