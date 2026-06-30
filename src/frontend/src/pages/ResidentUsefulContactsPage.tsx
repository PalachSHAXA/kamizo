// Resident "Полезные контакты" — Claude Design §08-kontakty handoff
// (design/handoff/contacts-handoff.md). Sticky header + category chips,
// 4-tile emergency strip (hardcoded UZ national numbers), partner promo
// cards split into a featured gradient hero + regular rows, and a
// "Стать партнёром" CTA. Tapping a partner opens the existing detail
// view (with coupon flow). The detail view registers with
// useModalPresence so the global BottomBar hides while it's open.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, MapPin, Clock, ArrowLeft,
  CheckCircle, Loader2, Flame, Sparkles,
  Tag, Eye, Gift, Globe, Shield, HeartPulse, Zap,
  Wrench, Droplet, Truck, Hammer, Scissors, Laptop,
  Bug, Briefcase, Wind, Heart, Car, Star, Package,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';
import { useToastStore } from '../stores/toastStore';
import { useModalPresence } from '../stores/modalStore';
import { useBackGuard } from '../hooks/useBackGuard';
import { API_URL } from '../services/api/client';

// ── shared visual tokens (kept literal so the page renders correctly
//    even if a global token gets renamed) ─────────────────────────────
const TEXT_PRIMARY = '#1C1917';
const TEXT_SECONDARY = '#6F6A62';
const TEXT_MUTED = '#A8A29E';
const SURFACE = '#FFFFFF';
const SURFACE_2 = '#F4F0E8';
const SURFACE_SUNKEN = '#EDE7DB';
const BORDER = '#E6DFD2';
const BORDER_STRONG = '#D8CFBE';
const STATUS_CRITICAL = '#E2483D';
const STATUS_CRITICAL_BG = 'rgba(226,72,61,0.12)';
const BRAND = '#F97316';
const BRAND_DARK = '#EA580C';
const BRAND_TINT = '#FFF3EA';
const INK = '#1C1917';
const TEXT_ON_DARK = '#F4F0E8';
const SHADOW_SM = '0 1px 2px rgba(28,25,23,0.04)';
const SHADOW_BRAND = '0 8px 22px rgba(249,115,22,0.26)';

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

// ── category style map: each backend category_icon resolves to a
//    lucide icon and a gradient (used for the 52×52 icon box on the
//    regular rows and the full-bleed gradient on the featured card).
//    Unknown values fall back to the brand gradient + Briefcase. ────
const CATEGORY_STYLE: Record<string, { Icon: React.ElementType; gradient: string; tone: string }> = {
  cleaning:    { Icon: Sparkles,   gradient: 'linear-gradient(140deg, #5EE7E0, #0E9AAB)', tone: '#0E7A88' },
  dry_cleaning:{ Icon: Sparkles,   gradient: 'linear-gradient(140deg, #5EE7E0, #0E9AAB)', tone: '#0E7A88' },
  delivery:    { Icon: Truck,      gradient: 'linear-gradient(140deg, #FBBF24, #D97706)', tone: '#92400E' },
  food:        { Icon: Truck,      gradient: 'linear-gradient(140deg, #FBBF24, #D97706)', tone: '#92400E' },
  domestic:    { Icon: Briefcase,  gradient: 'linear-gradient(140deg, #FBBF24, #D97706)', tone: '#92400E' },
  minor_repair:{ Icon: Wrench,     gradient: 'linear-gradient(140deg, #818CF8, #6366F1)', tone: '#3730A3' },
  renovation:  { Icon: Hammer,     gradient: 'linear-gradient(140deg, #818CF8, #6366F1)', tone: '#3730A3' },
  construction:{ Icon: Hammer,     gradient: 'linear-gradient(140deg, #818CF8, #6366F1)', tone: '#3730A3' },
  electrical:  { Icon: Zap,        gradient: 'linear-gradient(140deg, #FCD34D, #D97706)', tone: '#92400E' },
  plumbing:    { Icon: Droplet,    gradient: 'linear-gradient(140deg, #60A5FA, #2F77C2)', tone: '#1E3A8A' },
  ac:          { Icon: Wind,       gradient: 'linear-gradient(140deg, #60A5FA, #2F77C2)', tone: '#1E3A8A' },
  beauty:      { Icon: Heart,      gradient: 'linear-gradient(140deg, #F472B6, #DB2777)', tone: '#9D174D' },
  it:          { Icon: Laptop,     gradient: 'linear-gradient(140deg, #818CF8, #6366F1)', tone: '#3730A3' },
  pest_control:{ Icon: Bug,        gradient: 'linear-gradient(140deg, #34D399, #15A06E)', tone: '#065F46' },
  auto:        { Icon: Car,        gradient: 'linear-gradient(140deg, #FB923C, #EA580C)', tone: '#9A3412' },
  moving:      { Icon: Package,    gradient: 'linear-gradient(140deg, #FB923C, #EA580C)', tone: '#9A3412' },
  tailoring:   { Icon: Scissors,   gradient: 'linear-gradient(140deg, #F472B6, #DB2777)', tone: '#9D174D' },
  other:       { Icon: Briefcase,  gradient: 'linear-gradient(140deg, #FB923C, #EA580C)', tone: '#9A3412' },
};
const DEFAULT_STYLE = { Icon: Briefcase, gradient: 'linear-gradient(140deg, #FB923C, #EA580C)', tone: '#9A3412' };

const getCategoryStyle = (iconKey: string) => CATEGORY_STYLE[iconKey] || DEFAULT_STYLE;

// Hardcoded UZ-national emergency numbers — these never come from the
// API (they're public-service constants), so they live in the file.
const EMERGENCY_CONTACTS = (lang: 'ru' | 'uz') => [
  { label: lang === 'ru' ? 'Полиция'   : 'Politsiya',     tel: '102', Icon: Shield },
  { label: lang === 'ru' ? 'Пожарная'  : "O't o'chirish", tel: '101', Icon: Flame },
  { label: lang === 'ru' ? 'Скорая'    : 'Tez yordam',    tel: '103', Icon: HeartPulse },
  { label: lang === 'ru' ? 'Газ'       : 'Gaz',           tel: '104', Icon: Zap },
];

export default function ResidentUsefulContactsPage() {
  // v118.94 — navigate for the new back arrow added to the sticky header.
  // Page stays inside Layout (BottomBar continues to render), so this is
  // the /guest-access pattern (v220), NOT the standalone-fullscreen one.
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { language } = useLanguageStore();
  const { config } = useTenantStore();
  const addToast = useToastStore(s => s.addToast);

  const [categories, setCategories] = useState<AdCategory[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [userCoupon, setUserCoupon] = useState<Coupon | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Hide the global BottomBar while the detail view is open (the registry
  // shipped in feature/hide-bottombar-on-overlays).
  useModalPresence(!!selectedAd);

  // Intercept browser/hardware back when a detail view is open.
  useBackGuard(!!selectedAd, () => { setSelectedAd(null); setUserCoupon(null); });

  // API_URL (https://api.kamizo.uz) is the single source of truth from
  // services/api/client.ts. The previous `VITE_API_URL || ''` fallback
  // produced an empty string which made the fetches RELATIVE — that
  // resolves to the WebView's bundled-asset host in the Capacitor
  // native shell and 404s. Aliased to API_BASE to keep the existing
  // call sites and useCallback deps stable.
  const API_BASE = API_URL;

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/categories`, {
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
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
      addToast('success', language === 'ru' ? 'Промокод скопирован' : 'Promokod nusxalandi');
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

  // Categories with at least one active ad (so the chip strip never
  // shows empty placeholders).
  const visibleCategories = categories.filter(c => c.active_ads_count > 0);

  const filteredAds = selectedCategoryId === 'all'
    ? ads
    : ads.filter(a => a.category_id === selectedCategoryId);

  // Featured: the first ad in the filtered list whose badges.recommended
  // or badges.hot is set. Falls back to the first ad if none qualify.
  const featuredAd = filteredAds.find(a => a.badges?.recommended || a.badges?.hot) || filteredAds[0] || null;
  const regularAds = filteredAds.filter(a => a.id !== featuredAd?.id);

  // "Стать партнёром" target — tenant-specific contact email if defined,
  // platform fallback otherwise. Triggers the system mail composer.
  const tenantContact = config?.tenant as { contact_email?: string } | undefined;
  const partnerMailto = (() => {
    const to = tenantContact?.contact_email || 'partners@kamizo.uz';
    const subj = language === 'ru' ? 'Заявка на партнёрство' : 'Hamkorlik uchun ariza';
    const body = language === 'ru'
      ? `Здравствуйте! Я бы хотел разместить услугу для жителей дома.\n\nКомпания:\nКатегория:\nКонтакты:\nПредложение:\n`
      : "Salom! Uy aholisi uchun xizmat joylashtirmoqchiman.\n\nKompaniya:\nKategoriya:\nKontaktlar:\nTaklif:\n";
    return `mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  })();

  // ────────────────────────────────────────────────────────────────────
  // Detail view (unchanged data flow — coupon issue + copy work as before)
  // ────────────────────────────────────────────────────────────────────
  if (selectedAd) {
    const hasContacts = selectedAd.phone2 || selectedAd.telegram || selectedAd.instagram
      || selectedAd.facebook || selectedAd.website;

    return (
      <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 overflow-x-hidden">
        {/* Top nav */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => { setSelectedAd(null); setUserCoupon(null); }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">{language === 'ru' ? 'Назад' : 'Orqaga'}</span>
            </button>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Eye className="w-4 h-4" /> {selectedAd.views_count}
            </span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto overflow-hidden">
          <div className="bg-white">
            <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-gray-50 to-white">
              {selectedAd.logo_url ? (
                <div className="w-full h-36 sm:h-44 rounded-2xl bg-white shadow-lg overflow-hidden flex items-center justify-center border border-gray-100">
                  <img src={selectedAd.logo_url} alt="" className="max-w-full max-h-full object-contain p-4" />
                </div>
              ) : (() => {
                  const { Icon, gradient } = getCategoryStyle(selectedAd.category_icon);
                  return (
                    <div
                      className="w-full h-36 sm:h-44 rounded-2xl flex items-center justify-center shadow-lg"
                      style={{ background: gradient }}
                    >
                      <Icon className="w-20 h-20 text-white" />
                    </div>
                  );
                })()}
            </div>

            <div className="px-4 pb-4 text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{selectedAd.title}</h1>
              <p className="text-gray-500 mt-1">{selectedAd.category_name}</p>
            </div>

            {(selectedAd.badges?.hot || selectedAd.badges?.new || selectedAd.discount_percent > 0) && (
              <div className="flex flex-wrap justify-center gap-2 px-4 pb-4">
                {selectedAd.badges?.new && (
                  <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> {language === 'ru' ? 'Новый' : 'Yangi'}
                  </span>
                )}
                {selectedAd.badges?.hot && (
                  <span className="px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold flex items-center gap-1.5">
                    <Flame className="w-4 h-4" /> {language === 'ru' ? 'Топ' : 'Top'}
                  </span>
                )}
                {selectedAd.discount_percent > 0 && (
                  <span className="px-4 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-bold flex items-center gap-1.5">
                    <Tag className="w-4 h-4" /> {language === 'ru' ? 'Скидка' : 'Chegirma'} {selectedAd.discount_percent}%
                  </span>
                )}
              </div>
            )}

            {hasContacts && (
              <div className="flex flex-wrap justify-center gap-3 px-4 pb-4">
                {selectedAd.phone2 && (
                  <a href={`tel:${selectedAd.phone2}`} className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors" title={`${language === 'ru' ? 'Доп. телефон' : "Qoʻshimcha telefon"}: ${selectedAd.phone2}`}>
                    <Phone className="w-5 h-5 text-gray-600" />
                  </a>
                )}
                {selectedAd.telegram && (
                  <a href={`https://t.me/${selectedAd.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                     className="w-11 h-11 rounded-full bg-[#0088cc] hover:bg-[#0077b5] flex items-center justify-center transition-colors" title={`Telegram: ${selectedAd.telegram}`}>
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
                     className="w-11 h-11 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors" title={language === 'ru' ? 'Веб-сайт' : 'Veb-sayt'}>
                    <Globe className="w-5 h-5 text-white" />
                  </a>
                )}
              </div>
            )}

            <div className="px-4 pb-4">
              <a
                href={`tel:${selectedAd.phone}`}
                className="flex items-center justify-center gap-3 w-full py-4 bg-green-500 hover:bg-green-600 rounded-2xl text-white font-semibold text-lg transition-colors shadow-lg shadow-green-200"
              >
                <Phone className="w-6 h-6" />
                <span>{language === 'ru' ? 'Позвонить' : "Qoʻngʻiroq qilish"}: {selectedAd.phone}</span>
              </a>
            </div>
          </div>

          {selectedAd.description && (
            <div className="bg-white mt-2 px-4 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">{language === 'ru' ? 'Описание' : 'Tavsif'}</h2>
              <p className="text-gray-700 whitespace-pre-line leading-relaxed break-words">{selectedAd.description}</p>
            </div>
          )}

          {(selectedAd.address || selectedAd.work_hours) && (
            <div className="bg-white mt-2 px-4 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-3">{language === 'ru' ? 'Информация' : "Ma'lumot"}</h2>
              <div className="space-y-3">
                {selectedAd.address && (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <MapPin className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
                      <div className="text-gray-900 break-words">{selectedAd.address}</div>
                    </div>
                  </div>
                )}
                {selectedAd.work_hours && (
                  <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                    <Clock className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-500 mb-0.5">{language === 'ru' ? 'Время работы' : 'Ish vaqti'}</div>
                      <div className="text-gray-900 break-words">{selectedAd.work_hours} {selectedAd.work_days && `• ${selectedAd.work_days}`}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedAd.discount_percent > 0 && (
            <div className="bg-white mt-2 px-4 py-4">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-4 text-white">
                {userCoupon ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-10 h-10 text-green-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs opacity-80">{language === 'ru' ? 'Ваш промокод' : 'Sizning promokodingiz'}</div>
                      <div
                        onClick={copyCode}
                        className="bg-white/20 rounded-lg px-3 py-1.5 mt-1 cursor-pointer hover:bg-white/30 transition-colors inline-block"
                      >
                        <code className="text-lg font-mono font-bold tracking-wider">{userCoupon.code}</code>
                      </div>
                      <div className="text-xs mt-1 opacity-70">
                        {copiedCode ? (language === 'ru' ? '✓ Скопировано!' : '✓ Koʻchirib olindi!') : (language === 'ru' ? 'Нажмите, чтобы скопировать' : 'Nusxalash uchun bosing')} • {language === 'ru' ? 'до' : 'gacha'} {new Date(userCoupon.expires_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Gift className="w-10 h-10 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-lg font-bold">{language === 'ru' ? 'Скидка' : 'Chegirma'} {selectedAd.discount_percent}%</div>
                      <div className="text-xs opacity-80">{language === 'ru' ? 'Эксклюзивно для жителей' : 'Turar joy egalari uchun eksklyuziv'}</div>
                    </div>
                    <button
                      onClick={getCoupon}
                      disabled={loadingCoupon}
                      className="px-4 py-2 bg-white text-purple-600 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50 shadow flex-shrink-0"
                    >
                      {loadingCoupon ? <Loader2 className="w-5 h-5 animate-spin" /> : (language === 'ru' ? 'Получить' : 'Olish')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="h-8" />
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // List view — Claude Design §08-kontakty
  // ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--app-bg)',
      color: TEXT_PRIMARY,
      paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
      letterSpacing: '-0.01em',
    }}>
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: 'var(--themed-strip-bg, rgba(244,240,232,0.92))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}>
        <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 10px' }}>
          {/* v118.94 — back arrow + heading inline row. Explicit
              navigate('/') (NOT history.back) so the user always lands on
              Home regardless of how they reached /useful-contacts. Page
              stays inside Layout so the BottomBar continues to render. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
              style={{
                width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
                background: 'var(--surface, #FFFFFF)',
                border: '1px solid var(--border-c, #E6DFD2)',
                color: 'var(--text-primary, #1C1917)',
                display: 'grid', placeItems: 'center',
                cursor: 'pointer', padding: 0,
              }}
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
                color: 'var(--text-secondary, #6F6A62)', textTransform: 'uppercase',
              }}>
                {language === 'ru' ? 'Сервисы рядом с домом' : 'Uy yonidagi xizmatlar'}
              </div>
              <div style={{
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2,
                color: 'var(--text-primary, #1C1917)',
              }}>
                {language === 'ru' ? 'Полезное рядом' : 'Foydali yonida'}
              </div>
            </div>
          </div>
        </div>
        {/* Category chips */}
        <div style={{
          display: 'flex', gap: 8, padding: '0 16px 12px',
          overflowX: 'auto', overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          <CategoryChip
            label={language === 'ru' ? 'Все' : 'Hammasi'}
            active={selectedCategoryId === 'all'}
            onClick={() => setSelectedCategoryId('all')}
          />
          {visibleCategories.map(c => (
            <CategoryChip
              key={c.id}
              label={language === 'ru' ? c.name_ru : c.name_uz}
              active={selectedCategoryId === c.id}
              onClick={() => setSelectedCategoryId(c.id)}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* ── Emergency compact strip ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {EMERGENCY_CONTACTS(language === 'ru' ? 'ru' : 'uz').map((e) => (
            <a
              key={e.tel}
              href={`tel:${e.tel}`}
              aria-label={`${e.label} ${e.tel}`}
              style={{
                flex: '1 0 auto', minWidth: 76,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '11px 8px', borderRadius: 14,
                background: SURFACE, border: `1px solid ${BORDER}`,
                boxShadow: SHADOW_SM,
                textDecoration: 'none',
                color: TEXT_PRIMARY,
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: STATUS_CRITICAL_BG, color: STATUS_CRITICAL,
                display: 'grid', placeItems: 'center',
              }}>
                <e.Icon size={16} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 650 as unknown as number, color: TEXT_PRIMARY }}>
                {e.label}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: STATUS_CRITICAL,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {e.tel}
              </span>
            </a>
          ))}
        </div>

        {/* ── Partner promo cards ─────────────────────────────────────── */}
        {loading ? (
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18,
            padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW_SM,
          }}>
            <Loader2 className="animate-spin" size={28} style={{ color: TEXT_MUTED, margin: '0 auto' }} />
            <div style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 10 }}>
              {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
            </div>
          </div>
        ) : filteredAds.length === 0 ? (
          <EmptyPartners language={language} hasFilter={selectedCategoryId !== 'all'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {featuredAd && (
              <FeaturedAdCard
                ad={featuredAd}
                language={language}
                onOpen={() => fetchAdDetails(featuredAd.id)}
              />
            )}
            {regularAds.map(ad => (
              <RegularAdRow
                key={ad.id}
                ad={ad}
                language={language}
                onOpen={() => fetchAdDetails(ad.id)}
              />
            ))}
          </div>
        )}

        {/* ── "Стать партнёром" CTA ───────────────────────────────────── */}
        <div style={{
          marginTop: 16, padding: 16,
          borderRadius: 20,
          border: `1.5px dashed ${BORDER_STRONG}`,
          textAlign: 'center',
          background: SURFACE_2,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: TEXT_PRIMARY }}>
            {language === 'ru' ? 'Здесь может быть ваш сервис' : 'Bu yerda sizning xizmatingiz boʻlishi mumkin'}
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 4, lineHeight: 1.4 }}>
            {language === 'ru'
              ? 'Размещайте предложения для жителей дома — химчистка, доставка, ремонт'
              : 'Uy aholisi uchun takliflar joylashtiring — kimyoviy tozalash, yetkazib berish, taʼmirlash'}
          </div>
          <a
            href={partnerMailto}
            style={{
              display: 'inline-block', marginTop: 12,
              padding: '10px 20px', borderRadius: 999,
              background: SURFACE, border: `1px solid ${BORDER_STRONG}`,
              color: BRAND_DARK, fontSize: 13, fontWeight: 700,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            {language === 'ru' ? 'Стать партнёром' : 'Hamkor boʻlish'}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── inner helpers ────────────────────────────────────────────────────

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        padding: '8px 15px', borderRadius: 999,
        background: active ? INK : SURFACE_SUNKEN,
        // Active chip's foreground reads through --themed-pill-fg so the
        // dark+selected combo (beige bg from inverted INK) gets dark text
        // for legibility. Light mode falls back to the literal #F4F0E8
        // (light beige) the file declared, so light is byte-identical.
        color: active ? 'var(--themed-pill-fg, #F4F0E8)' : TEXT_SECONDARY,
        border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 650 as unknown as number,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function FeaturedAdCard({ ad, language, onOpen }: { ad: Ad; language: string; onOpen: () => void }) {
  const { gradient, tone } = getCategoryStyle(ad.category_icon);
  const promo = ad.discount_percent > 0
    ? (language === 'ru' ? `Скидка ${ad.discount_percent}% жителям` : `Aholiga ${ad.discount_percent}% chegirma`)
    : (ad.badges?.recommended
        ? (language === 'ru' ? 'Партнёр дома' : 'Uy hamkori')
        : (language === 'ru' ? 'Специальное предложение' : 'Maxsus taklif'));
  const tagline = ad.category_name || '';
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 28,
        background: gradient,
        color: '#fff', padding: 18,
        boxShadow: '0 12px 28px -10px rgba(28,25,23,0.45)',
        cursor: 'pointer',
      }}
    >
      <div aria-hidden style={{
        position: 'absolute', right: -30, top: -40,
        width: 150, height: 150, borderRadius: 999,
        background: 'rgba(255,255,255,0.13)',
      }} />
      <div style={{ position: 'relative' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
          background: 'rgba(255,255,255,0.22)', padding: '4px 10px', borderRadius: 999,
        }}>
          {language === 'ru' ? 'Партнёр дома' : 'Uy hamkori'}
        </span>
        <div style={{
          fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ad.title}
        </div>
        {tagline && (
          <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 2 }}>{tagline}</div>
        )}
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>{promo}</div>
        {ad.description && (
          <div style={{
            fontSize: 12.5, opacity: 0.88, marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {ad.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <a
            href={`tel:${ad.phone}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, padding: 12, borderRadius: 14,
              background: '#fff', color: tone,
              border: 'none', fontSize: 14, fontWeight: 750 as unknown as number,
              cursor: 'pointer', textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
            aria-label={language === 'ru' ? 'Позвонить' : "Qo'ng'iroq qilish"}
          >
            <Phone size={16} />
            {language === 'ru' ? 'Связаться' : 'Bogʻlanish'}
          </a>
          {ad.views_count > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 13, fontWeight: 700,
            }}>
              <Eye size={14} /> {ad.views_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RegularAdRow({ ad, language, onOpen }: { ad: Ad; language: string; onOpen: () => void }) {
  const { Icon, gradient } = getCategoryStyle(ad.category_icon);
  const promo = ad.discount_percent > 0
    ? `−${ad.discount_percent}%`
    : (ad.badges?.recommended ? (language === 'ru' ? 'Рекомендуем' : 'Tavsiya') : (language === 'ru' ? 'Партнёр' : 'Hamkor'));
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: 20, boxShadow: SHADOW_SM,
        padding: 14,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 15,
        background: gradient, color: '#fff',
        display: 'grid', placeItems: 'center',
        flex: '0 0 auto',
      }}>
        <Icon size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 15.5, fontWeight: 750 as unknown as number, letterSpacing: '-0.01em',
            color: TEXT_PRIMARY,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ad.title}
          </span>
          {ad.badges?.verified && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11.5, fontWeight: 700, color: TEXT_SECONDARY,
              flex: '0 0 auto',
            }}>
              <Star size={11} style={{ color: '#F59E0B', fill: '#F59E0B' }} strokeWidth={0} />
            </span>
          )}
        </div>
        <div style={{
          fontSize: 12.5, color: TEXT_SECONDARY, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {ad.category_name}
        </div>
        <div style={{
          display: 'inline-block', fontSize: 11.5, fontWeight: 800,
          color: BRAND_DARK, background: BRAND_TINT,
          padding: '3px 9px', borderRadius: 999, marginTop: 8,
        }}>
          {promo}
        </div>
      </div>
      <a
        href={`tel:${ad.phone}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={language === 'ru' ? `Позвонить ${ad.title}` : `${ad.title} ga qoʻngʻiroq qilish`}
        style={{
          width: 44, height: 44, borderRadius: 999,
          background: BRAND, color: '#fff',
          border: 'none',
          display: 'grid', placeItems: 'center',
          cursor: 'pointer', flex: '0 0 auto',
          boxShadow: SHADOW_BRAND,
          textDecoration: 'none',
        }}
      >
        <Phone size={18} />
      </a>
    </div>
  );
}

function EmptyPartners({ language, hasFilter }: { language: string; hasFilter: boolean }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 18,
      padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW_SM,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 999,
        background: SURFACE_SUNKEN, color: TEXT_MUTED,
        margin: '0 auto 12px',
        display: 'grid', placeItems: 'center',
      }}>
        <Briefcase size={28} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4 }}>
        {hasFilter
          ? (language === 'ru' ? 'В этой категории пока пусто' : "Bu kategoriyada hozircha bo'sh")
          : (language === 'ru' ? 'Партнёры появятся скоро' : "Hamkorlar tez orada paydo bo'ladi")}
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
        {hasFilter
          ? (language === 'ru' ? 'Попробуйте выбрать другую категорию' : 'Boshqa kategoriyani tanlab koʻring')
          : (language === 'ru' ? 'Мы отбираем лучших специалистов для вас' : 'Sizga eng yaxshi mutaxassislarni tanlamoqdamiz')}
      </div>
    </div>
  );
}
