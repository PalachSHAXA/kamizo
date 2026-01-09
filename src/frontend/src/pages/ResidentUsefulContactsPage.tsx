import { useState, useEffect, useCallback } from 'react';
import {
  Phone, MapPin, Clock, Search, ArrowLeft,
  Ticket, CheckCircle, Loader2, Flame, Sparkles,
  Tag, Eye, Gift, Globe, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';

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
  const [categories, setCategories] = useState<AdCategory[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [userCoupon, setUserCoupon] = useState<Coupon | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchAds()]);
      setLoading(false);
    };
    init();
  }, [fetchCategories, fetchAds]);

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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
                <div className="w-full h-36 sm:h-44 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-lg">
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
                    <MapPin className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-500 mb-0.5">Адрес</div>
                      <div className="text-gray-900 break-words">{selectedAd.address}</div>
                    </div>
                  </div>
                )}
                {selectedAd.work_hours && (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
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

  // Main View - OLX style cards
  return (
    <div className="max-w-4xl mx-auto">
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

      {/* Search */}
      <div className="relative mb-5 px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder={language === 'ru' ? 'Поиск услуг...' : 'Xizmatlarni qidirish...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      {/* Contacts by Category */}
      {filteredGroups.length > 0 ? (
        <div className="space-y-6">
          {filteredGroups.map(group => (
            <div key={group.category.id}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                  <span className="text-lg">{categoryIcons[group.category.icon] || '📋'}</span>
                </div>
                <h2 className="font-semibold text-gray-900">{getCategoryName(group.category)}</h2>
                <span className="text-xs text-gray-400">({group.ads.length})</span>
              </div>

              {/* OLX-style Cards */}
              <div className="space-y-2">
                {group.ads.map(ad => (
                  <button
                    key={ad.id}
                    onClick={() => fetchAdDetails(ad.id)}
                    className="w-full flex bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all text-left group overflow-hidden"
                  >
                    {/* Image/Logo - left side with object-contain */}
                    <div className="w-32 sm:w-40 h-32 sm:h-36 bg-gray-50 flex-shrink-0 flex items-center justify-center relative p-2">
                      {ad.logo_url ? (
                        <img
                          src={ad.logo_url}
                          alt=""
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`flex items-center justify-center ${ad.logo_url ? 'hidden' : ''}`}>
                        <span className="text-5xl">{categoryIcons[ad.category_icon] || '📋'}</span>
                      </div>

                      {/* Verified ribbon */}
                      {ad.badges?.verified && (
                        <div className="absolute top-0 left-0 bg-[#1DA1F2] text-white text-[9px] font-bold px-2 py-0.5 rounded-br-lg flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
                          </svg>
                        </div>
                      )}

                      {/* Discount badge */}
                      {ad.discount_percent > 0 && (
                        <div className="absolute bottom-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
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
                          <div className="flex items-center gap-1.5 mt-1">
                            {ad.badges?.new && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">Новый</span>
                            )}
                            {ad.badges?.hot && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-semibold">Топ</span>
                            )}
                          </div>
                        </div>

                        {/* Contact icons - top right */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {ad.phone2 && (
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center" title={ad.phone2}>
                              <Phone className="w-3.5 h-3.5 text-gray-600" />
                            </div>
                          )}
                          {ad.telegram && (
                            <div className="w-7 h-7 rounded-full bg-[#0088cc]/10 flex items-center justify-center">
                              <svg className="w-4 h-4 text-[#0088cc]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                              </svg>
                            </div>
                          )}
                          {ad.instagram && (
                            <div className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center">
                              <svg className="w-4 h-4 text-pink-600" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            </div>
                          )}
                          {ad.website && (
                            <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center">
                              <Globe className="w-4 h-4 text-indigo-600" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {ad.description && (
                        <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 mt-2 flex-1">{ad.description}</p>
                      )}

                      {/* Bottom row */}
                      <div className="flex items-center justify-between mt-auto pt-2">
                        {/* Phone */}
                        <div className="flex items-center gap-1.5 text-green-600 font-medium text-sm">
                          <Phone className="w-4 h-4" />
                          {ad.phone}
                        </div>

                        {/* Has coupon indicator */}
                        {ad.user_has_coupon > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                            <Ticket className="w-3 h-3" /> Есть купон
                          </span>
                        )}

                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
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
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-10 h-10 text-blue-500" />
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
      )}
    </div>
  );
}
