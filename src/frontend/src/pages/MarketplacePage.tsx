import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  ShoppingCart, Search, Heart, Package, Plus, Minus, X,
  CheckCircle, ShoppingBag, Star, ArrowLeft, Truck
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useTenantStore } from '../stores/tenantStore';
import { useToastStore } from '../stores/toastStore';

interface MarketplaceCategoryAPI { id: string; name_ru: string; name_uz: string; icon?: string; sort_order: number; is_active: boolean; created_at: string; }
interface MarketplaceProductAPI { id: string; category_id: string; name_ru: string; name_uz: string; description_ru?: string; description_uz?: string; price: number; old_price?: number; unit: string; stock_quantity: number; image_url?: string; is_active: boolean; is_featured: boolean; created_at: string; }
interface MarketplaceCartItemAPI { id: string; product_id: string; quantity: number; added_at: string; }
interface MarketplaceOrderAPI { id: string; order_number: string; resident_id: string; resident_name?: string; resident_phone?: string; resident_address?: string; resident_apartment?: string; status: MarketplaceOrderStatus; items: MarketplaceOrderItemAPI[]; total_amount: number; items_count: number; delivery_note?: string; created_at: string; rating?: number; review?: string; }
interface MarketplaceOrderItemAPI { id: string; order_id?: string; product_id: string; product_name?: string; product_image?: string; quantity: number; price?: number; unit_price?: number; total_price?: number; }
type MarketplaceOrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';

const ORDER_STAGES = [
  { id: 'created', statuses: ['new'], labelRu: 'Новый', labelUz: 'Yangi', icon: ShoppingBag },
  { id: 'confirmed', statuses: ['confirmed'], labelRu: 'Принят', labelUz: 'Qabul', icon: CheckCircle },
  { id: 'preparing', statuses: ['preparing'], labelRu: 'Сборка', labelUz: 'Yig\'ish', icon: Package },
  { id: 'ready', statuses: ['ready'], labelRu: 'Готов', labelUz: 'Tayyor', icon: CheckCircle },
  { id: 'delivering', statuses: ['delivering'], labelRu: 'В пути', labelUz: 'Yo\'lda', icon: Truck },
  { id: 'delivered', statuses: ['delivered'], labelRu: 'Получен', labelUz: 'Qabul', icon: CheckCircle },
];

function getOrderStageIndex(status: MarketplaceOrderStatus): number {
  if (status === 'cancelled') return -1;
  for (let i = 0; i < ORDER_STAGES.length; i++) {
    if (ORDER_STAGES[i].statuses.includes(status)) return i;
  }
  return 0;
}

function getOrderStatusMessage(status: MarketplaceOrderStatus, lang: 'ru' | 'uz'): { title: string; subtitle: string } {
  const m: Record<string, { ru: [string, string]; uz: [string, string] }> = {
    new: { ru: ['Заказ оформлен', 'Ожидаем подтверждения'], uz: ['Buyurtma yaratildi', 'Tasdiqlanishini kutmoqdamiz'] },
    confirmed: { ru: ['Заказ принят', 'Начинаем сборку'], uz: ['Buyurtma qabul qilindi', 'Yig\'ishni boshlaymiz'] },
    preparing: { ru: ['Собираем заказ', 'Скоро будет готов'], uz: ['Buyurtma yig\'ilmoqda', 'Tez orada tayyor bo\'ladi'] },
    ready: { ru: ['Заказ готов', 'Передаём курьеру'], uz: ['Buyurtma tayyor', 'Kuryerga topshirilmoqda'] },
    delivering: { ru: ['Курьер в пути', 'Скоро будет у вас'], uz: ['Kuryer yo\'lda', 'Tez orada sizda bo\'ladi'] },
    delivered: { ru: ['Доставлен', 'Приятного аппетита!'], uz: ['Yetkazildi', 'Yoqimli ishtaha!'] },
    cancelled: { ru: ['Отменён', ''], uz: ['Bekor qilindi', ''] },
  };
  const v = m[status] || m.new;
  const [title, subtitle] = lang === 'ru' ? v.ru : v.uz;
  return { title, subtitle };
}

const CATEGORY_ICONS: Record<string, string> = {
  cat_groceries: '🛒', cat_dairy: '🥛', cat_meat: '🥩', cat_bakery: '🍞',
  cat_fruits: '🍎', cat_beverages: '🥤', cat_household: '🧹', cat_personal: '🧴',
  cat_baby: '👶', cat_pets: '🐾', cat_frozen: '❄️', cat_snacks: '🍿',
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  cat_groceries: 'from-amber-400 to-orange-500',
  cat_dairy: 'from-blue-300 to-blue-500',
  cat_meat: 'from-red-400 to-rose-500',
  cat_bakery: 'from-yellow-300 to-amber-500',
  cat_fruits: 'from-green-400 to-emerald-500',
  cat_beverages: 'from-cyan-400 to-blue-500',
  cat_household: 'from-violet-400 to-purple-500',
  cat_personal: 'from-pink-400 to-rose-500',
  cat_baby: 'from-sky-300 to-blue-400',
  cat_pets: 'from-lime-400 to-green-500',
  cat_frozen: 'from-slate-300 to-blue-400',
  cat_snacks: 'from-orange-400 to-red-500',
};

const PRODUCT_EMOJI: Record<string, string> = {
  'соль': '🧂', 'сахар': '🍬', 'масло': '🫒', 'рис': '🍚', 'макарон': '🍝',
  'мука': '🌾', 'чай': '🍵', 'вода': '💧', 'сок': '🍊', 'молоко': '🥛',
  'шампунь': '🧴', 'гель': '🚿', 'мыло': '🧼', 'зубн': '🪥', 'дезодорант': '✨',
  'бумаг': '🧻', 'посуд': '🍽️', 'стирал': '👕', 'пол': '🧹', 'стёкол': '🪟',
  'мусор': '🗑️', 'губк': '🧽', 'перчатк': '🧤', 'смесител': '🚰', 'подводк': '🔧',
  'выключател': '⚡', 'ламп': '💡',
};

function getProductEmoji(name: string, categoryId: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(PRODUCT_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return CATEGORY_ICONS[categoryId] || '📦';
}

const ProductCardPlaceholder = memo(function ProductCardPlaceholder({ name, categoryId, size = 'md' }: { name: string; categoryId: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  const gradient = CATEGORY_GRADIENTS[categoryId] || 'from-gray-400 to-gray-500';
  const emoji = getProductEmoji(name, categoryId);
  const emojiSize = { xs: 'text-xl', sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', xl: 'text-7xl' }[size];
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} flex flex-col items-end justify-end relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(ellipse at 20% 20%, white 0%, transparent 60%)' }} />
      <span className={`${emojiSize} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg`}>{emoji}</span>
      {size !== 'xs' && (
        <div className="relative z-10 w-full px-2 pb-2 pt-6 bg-gradient-to-t from-black/40 to-transparent">
          <span className={`text-white font-semibold leading-tight line-clamp-2 drop-shadow ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-xs' : size === 'lg' ? 'text-xs' : 'text-[13px]'}`}>{name}</span>
        </div>
      )}
    </div>
  );
});

function ProductPhoto({ src, name, size = 'md' }: { src: string; name: string; categoryId: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50">
      <img src={src} alt={name} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      {size !== 'xs' && size !== 'sm' && (
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-6 bg-gradient-to-t from-black/50 to-transparent">
          <span className={`text-white font-semibold leading-tight line-clamp-1 drop-shadow ${size === 'lg' ? 'text-xs' : 'text-[13px]'}`}>{name}</span>
        </div>
      )}
    </div>
  );
}

// Deterministic pseudo-random rating based on product ID
function getProductRating(id: string): { rating: number; count: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  const rating = 4.0 + (Math.abs(hash % 10) / 10);
  const count = 10 + Math.abs((hash >> 4) % 90);
  return { rating: parseFloat(rating.toFixed(1)), count };
}

export function MarketplacePage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  useTenantStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'shop' | 'favorites' | 'cart' | 'orders'>('shop');
  const [categories, setCategories] = useState<MarketplaceCategoryAPI[]>([]);
  const [products, setProducts] = useState<MarketplaceProductAPI[]>([]);
  const [cart, setCart] = useState<MarketplaceCartItemAPI[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderAPI[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProductAPI | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [showDeliveryRatingModal, setShowDeliveryRatingModal] = useState(false);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [deliveryReview, setDeliveryReview] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrderAPI | null>(null);
  const [banners, setBanners] = useState<{ id: string; title: string; description?: string; image_url?: string; link_url?: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesRes, productsRes] = await Promise.all([
        apiRequest<{ categories: MarketplaceCategoryAPI[] }>('/api/marketplace/categories'),
        apiRequest<{ products: MarketplaceProductAPI[]; total: number }>('/api/marketplace/products'),
      ]);
      setCategories(categoriesRes?.categories || []);
      setProducts(productsRes?.products || []);
      if (user) {
        try {
          const [cartRes, ordersRes, favoritesRes] = await Promise.all([
            apiRequest<{ cart: MarketplaceCartItemAPI[]; total: number; itemsCount: number }>('/api/marketplace/cart'),
            apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders'),
            apiRequest<{ favorites: { id: string }[] }>('/api/marketplace/favorites'),
          ]);
          setCart(cartRes?.cart || []);
          setOrders(ordersRes?.orders || []);
          setFavorites((favoritesRes?.favorites || []).map(f => f.id));
        } catch { /* user data fetch failed */ }
      }
    } catch { /* fetch failed */ }
    finally { setLoading(false); }
    // Fetch banners
    try {
      const bannersRes = await apiRequest<{ banners: { id: string; title: string; description?: string; image_url?: string; link_url?: string }[] }>('/api/banners?placement=marketplace');
      setBanners(bannersRes?.banners || []);
    } catch { /* banner fetch failed */ }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasActiveOrders = useMemo(
    () => orders.some(o => !['delivered', 'cancelled'].includes(o.status)),
    [orders]
  );
  useEffect(() => {
    if (!user) return;
    if (!hasActiveOrders) return;
    const interval = setInterval(async () => {
      try {
        const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
        if (r?.orders) setOrders(r.orders);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [user, hasActiveOrders]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ orderId: string }>) => {
      const order = orders.find(o => o.id === e.detail.orderId);
      if (order?.status === 'delivered') { setRatingOrderId(e.detail.orderId); setShowDeliveryRatingModal(true); sessionStorage.removeItem('open_delivery_rating_for_order'); }
    };
    window.addEventListener('openDeliveryRatingModal', handler as EventListener);
    return () => window.removeEventListener('openDeliveryRatingModal', handler as EventListener);
  }, [orders]);

  useEffect(() => {
    if (!orders.length) return;
    const id = sessionStorage.getItem('open_delivery_rating_for_order');
    if (id) { const o = orders.find(x => x.id === id); if (o?.status === 'delivered') { setRatingOrderId(id); setShowDeliveryRatingModal(true); sessionStorage.removeItem('open_delivery_rating_for_order'); } }
  }, [orders]);

  const removeFromCart = useCallback(async (productId: string) => {
    try { await apiRequest(`/api/marketplace/cart/${productId}`, { method: 'DELETE' }); const r = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'); setCart(r?.cart || []); } catch { /* */ }
  }, []);
  const addToCart = useCallback(async (productId: string) => {
    try { await apiRequest('/api/marketplace/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 }) }); const r = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'); setCart(r?.cart || []); } catch { /* */ }
  }, []);
  const updateCartQuantity = useCallback(async (productId: string, qty: number) => {
    if (qty <= 0) { await removeFromCart(productId); return; }
    try { await apiRequest('/api/marketplace/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: qty }) }); const r = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'); setCart(r?.cart || []); } catch { /* */ }
  }, [removeFromCart]);
  const toggleFavorite = useCallback(async (productId: string) => {
    setFavorites(prev => {
      const was = prev.includes(productId);
      return was ? prev.filter(id => id !== productId) : [...prev, productId];
    });
    try {
      await apiRequest(`/api/marketplace/favorites/${productId}`, { method: 'POST' });
    } catch {
      setFavorites(prev => {
        const was = prev.includes(productId);
        return was ? prev.filter(id => id !== productId) : [...prev, productId];
      });
    }
  }, []);
  const createOrder = async () => {
    try {
      await apiRequest('/api/marketplace/orders', { method: 'POST', body: JSON.stringify({ delivery_notes: deliveryNote }) });
      setOrderSuccess(true); setShowOrderModal(false); setDeliveryNote('');
      const [c, o] = await Promise.all([apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'), apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders')]);
      setCart(c?.cart || []); setOrders(o?.orders || []);
      setTimeout(() => { setOrderSuccess(false); setActiveTab('orders'); }, 2000);
    } catch { /* */ }
  };
  const submitDeliveryRating = async () => {
    if (!ratingOrderId) return;
    try {
      setIsSubmittingRating(true);
      await apiRequest(`/api/marketplace/orders/${ratingOrderId}/rate`, { method: 'POST', body: JSON.stringify({ rating: deliveryRating, review: deliveryReview || undefined }) });
      const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders'); setOrders(r?.orders || []);
      setShowDeliveryRatingModal(false); setRatingOrderId(null); setDeliveryRating(5); setDeliveryReview('');
    } catch { /* */ } finally { setIsSubmittingRating(false); }
  };
  const cancelOrder = async (orderId: string) => {
    if (!confirm(language === 'ru' ? 'Отменить заказ?' : 'Bekor qilish?')) return;
    try { setCancellingOrderId(orderId); await apiRequest(`/api/marketplace/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: language === 'ru' ? 'Отменено' : 'Bekor qilindi' }) }); const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders'); setOrders(r?.orders || []); } catch { addToast('error', language === 'ru' ? 'Ошибка' : 'Xato'); } finally { setCancellingOrderId(null); }
  };

  const filteredProducts = useMemo(
    () => products.filter(p =>
      (!selectedCategory || p.category_id === selectedCategory) &&
      (!searchQuery || (language === 'ru' ? p.name_ru : p.name_uz).toLowerCase().includes(searchQuery.toLowerCase()))
    ),
    [products, selectedCategory, searchQuery, language]
  );
  const getCartQty = useCallback(
    (id: string) => cart.find(c => c.product_id === id)?.quantity || 0,
    [cart]
  );
  const cartTotal = useMemo(
    () => cart.reduce((s, i) => { const p = products.find(x => x.id === i.product_id); return s + (p?.price || 0) * i.quantity; }, 0),
    [cart, products]
  );
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const fmt = useCallback(
    (p: number) => new Intl.NumberFormat('ru-RU').format(p) + (language === 'ru' ? ' сум' : ' so\'m'),
    [language]
  );
  const activeOrders = useMemo(
    () => orders.filter(o => !['delivered', 'cancelled'].includes(o.status)),
    [orders]
  );
  const historyOrders = useMemo(
    () => orders.filter(o => ['delivered', 'cancelled'].includes(o.status)),
    [orders]
  );
  const featured = useMemo(() => products.filter(p => p.is_featured), [products]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" /></div>;

  return (
    <div className="pb-24 md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA]">
      {orderSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] bg-green-500 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />{language === 'ru' ? 'Заказ создан!' : 'Buyurtma yaratildi!'}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-2xl border-b border-gray-100/60 md:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="px-4 pt-1.5 pb-2 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90 transition-transform touch-manipulation" aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}>
            <ArrowLeft className="w-[18px] h-[18px] text-gray-700" />
          </button>
          <div className="text-center">
            <h1 className="text-[16px] font-bold text-gray-900">{language === 'ru' ? 'Магазин' : 'Do\'kon'}</h1>
            <p className="text-xs font-medium text-primary-500">{language === 'ru' ? 'Доставка в квартиру' : 'Kvartirangizga yetkazamiz'}</p>
          </div>
          <div className="flex gap-2">
            {activeOrders.length > 0 && (
              <button onClick={() => setActiveTab('orders')} className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center relative active:scale-90 transition-transform touch-manipulation" aria-label={language === 'ru' ? `Активные заказы, ${activeOrders.length}` : `Faol buyurtmalar, ${activeOrders.length}`}>
                <Package className="w-[18px] h-[18px] text-gray-700" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full text-xs font-bold text-white flex items-center justify-center border-2 border-white">{activeOrders.length}</span>
              </button>
            )}
            <button onClick={() => setActiveTab('cart')} className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center relative active:scale-90 transition-transform touch-manipulation" aria-label={language === 'ru' ? `Корзина, ${cartCount} товаров` : `Savat, ${cartCount} mahsulot`}>
              <ShoppingCart className="w-[18px] h-[18px] text-gray-700" />
              {cartCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center border-2 border-white">{cartCount > 9 ? '9+' : cartCount}</span>}
            </button>
          </div>
        </div>
        {activeTab !== 'shop' && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {([
              { id: 'shop' as const, label: language === 'ru' ? 'Магазин' : 'Do\'kon' },
              { id: 'favorites' as const, label: `${language === 'ru' ? 'Избранное' : 'Sevimli'}${favorites.length > 0 ? ` (${favorites.length})` : ''}` },
              { id: 'cart' as const, label: `${language === 'ru' ? 'Корзина' : 'Savat'}${cartCount > 0 ? ` (${cartCount})` : ''}` },
              { id: 'orders' as const, label: `${language === 'ru' ? 'Заказы' : 'Buyurtma'}${orders.length > 0 ? ` (${orders.length})` : ''}` },
            ]).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-3.5 py-1.5 rounded-[12px] text-[13px] font-semibold transition-all whitespace-nowrap shrink-0 ${activeTab === t.id ? 'bg-primary-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}>{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop tabs */}
      <div className="hidden md:block sticky top-0 z-40 glass-card">
        <div className="flex">
          {([
            { id: 'shop' as const, label: language === 'ru' ? 'Магазин' : 'Do\'kon', icon: ShoppingBag, count: undefined },
            { id: 'favorites' as const, label: language === 'ru' ? 'Избранное' : 'Sevimli', icon: Heart, count: favorites.length },
            { id: 'cart' as const, label: language === 'ru' ? 'Корзина' : 'Savat', icon: ShoppingCart, count: cartCount },
            { id: 'orders' as const, label: language === 'ru' ? 'Заказы' : 'Buyurtma', icon: Package, count: orders.length },
          ]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === t.id ? 'border-primary-500 text-primary-600 bg-primary-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-5 h-5" /><span className="text-sm font-medium">{t.label}</span>
              {t.count !== undefined && t.count > 0 && <span className="bg-primary-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* SHOP */}
      {activeTab === 'shop' && (
        <div className="px-4 pt-3 pb-4">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-[18px] h-[18px]" />
            <input type="text" placeholder={language === 'ru' ? 'Поиск товаров...' : 'Mahsulot qidirish...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-[14px] bg-white border border-gray-100 text-[14px] placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={language === 'ru' ? 'Поиск товаров' : 'Mahsulot qidirish'} />
          </div>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <button onClick={() => setSelectedCategory(null)} className={`flex items-center gap-1.5 px-3 py-[7px] rounded-[12px] text-[13px] font-semibold whitespace-nowrap shrink-0 ${!selectedCategory ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.3)]' : 'bg-white text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'}`}>
              <span>🏪</span><span>{language === 'ru' ? 'Все' : 'Hammasi'}</span>
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} className={`flex items-center gap-1.5 px-3 py-[7px] rounded-[12px] text-[13px] font-semibold whitespace-nowrap shrink-0 ${selectedCategory === cat.id ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.3)]' : 'bg-white text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'}`}>
                <span>{CATEGORY_ICONS[cat.id] || '📦'}</span><span>{language === 'ru' ? cat.name_ru : cat.name_uz}</span>
              </button>
            ))}
          </div>

          {/* Banners */}
          {!selectedCategory && !searchQuery && banners.length > 0 && (
            <div className="mb-4 space-y-3">
              {banners.map((banner) => (
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

          {!selectedCategory && !searchQuery && featured.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2.5 px-0.5">
                <span className="text-[16px] font-bold text-gray-900 flex items-center gap-1.5">🔥 {language === 'ru' ? 'Популярное' : 'Mashhur'}</span>
                <button onClick={() => setSelectedCategory(null)} className="text-[13px] font-semibold text-primary-500">{language === 'ru' ? 'Все →' : 'Hammasi →'}</button>
              </div>
              {/* Large featured card */}
              {featured[0] && (
                <div className="mb-3 bg-white rounded-[20px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)] cursor-pointer active:scale-[0.99] transition-transform" onClick={() => setSelectedProduct(featured[0])}>
                  <div className="relative aspect-[2/1] bg-gradient-to-br from-primary-50 to-primary-100/50 flex items-center justify-center">
                    {featured[0].image_url ? <ProductPhoto src={featured[0].image_url} name={language === 'ru' ? featured[0].name_ru : featured[0].name_uz} categoryId={featured[0].category_id} size="xl" /> : <ProductCardPlaceholder name={language === 'ru' ? featured[0].name_ru : featured[0].name_uz} categoryId={featured[0].category_id} size="xl" />}
                    {featured[0].old_price && <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-[10px]">-{Math.round((1 - featured[0].price / featured[0].old_price) * 100)}%</div>}
                    {!featured[0].old_price && <div className="absolute top-3 left-3 bg-primary-500 text-white text-xs font-bold px-2.5 py-1 rounded-[10px]">ХИТ</div>}
                  </div>
                  <div className="p-3.5">
                    <h3 className="font-bold text-[15px] text-gray-900 line-clamp-1">{language === 'ru' ? featured[0].name_ru : featured[0].name_uz}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-[12px] font-semibold text-gray-700">{getProductRating(featured[0].id).rating}</span>
                      <span className="text-[12px] text-gray-400">({getProductRating(featured[0].id).count})</span>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <span className="font-extrabold text-[18px] text-gray-900">{fmt(featured[0].price)}</span>
                        {featured[0].old_price && <p className="text-[12px] text-gray-400 line-through">{fmt(featured[0].old_price)}</p>}
                      </div>
                      {getCartQty(featured[0].id) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={e => { e.stopPropagation(); updateCartQuantity(featured[0].id, getCartQty(featured[0].id) - 1); }} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-gray-100 flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'Уменьшить количество' : 'Sonni kamaytirish'}><Minus className="w-3.5 h-3.5 text-gray-600" /></button>
                          <span className="text-[14px] font-bold text-gray-900 w-5 text-center">{getCartQty(featured[0].id)}</span>
                          <button onClick={e => { e.stopPropagation(); updateCartQuantity(featured[0].id, getCartQty(featured[0].id) + 1); }} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-primary-500 flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'Увеличить количество' : 'Sonni oshirish'}><Plus className="w-3.5 h-3.5 text-white" /></button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); addToCart(featured[0].id); }} className="px-4 py-2 rounded-[12px] bg-primary-500 text-white text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform shadow-[0_2px_8px_rgba(var(--brand-rgb),0.3)]"><Plus className="w-4 h-4" />{language === 'ru' ? 'В корзину' : 'Savatga'}</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Horizontal scroll of smaller featured */}
              {featured.length > 1 && (
                <div className="relative">
                <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                  {featured.slice(1, 7).map(p => (
                    <div key={p.id} className="w-[140px] shrink-0 bg-white rounded-[16px] overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
                      <div className="aspect-square bg-gray-50 flex items-center justify-center cursor-pointer relative" onClick={() => setSelectedProduct(p)}>
                        {p.image_url ? <ProductPhoto src={p.image_url} name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="sm" /> : <ProductCardPlaceholder name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="sm" />}
                        {p.old_price && <div className="absolute top-1.5 left-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">-{Math.round((1 - p.price / p.old_price) * 100)}%</div>}
                      </div>
                      <div className="p-2">
                        <h3 className="font-medium text-[12px] text-gray-900 line-clamp-2 min-h-[30px] leading-tight">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                        <div className="flex items-end justify-between mt-1.5">
                          <span className="font-bold text-[13px] text-gray-900">{fmt(p.price)}</span>
                          {getCartQty(p.id) > 0 ? <span className="text-xs font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">{getCartQty(p.id)}</span> : (
                            <button onClick={e => { e.stopPropagation(); addToCart(p.id); }} className="w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'В корзину' : 'Savatga'}><Plus className="w-3.5 h-3.5 text-white" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
                </div>
              )}
            </div>
          )}

          {filteredProducts.length > 0 && (
            <>
              {!selectedCategory && !searchQuery && featured.length > 0 && <div className="text-[15px] font-bold text-gray-900 mb-2 px-0.5">{language === 'ru' ? 'Все товары' : 'Barcha mahsulotlar'} <span className="text-[13px] font-normal text-gray-400">{filteredProducts.length} {language === 'ru' ? 'шт.' : 'dona'}</span></div>}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map(p => {
                  const qty = getCartQty(p.id);
                  const fav = favorites.includes(p.id);
                  const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
                  return (
                    <div key={p.id} className="bg-white rounded-[18px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform">
                      <div className="relative aspect-square bg-gray-50 flex items-center justify-center cursor-pointer" onClick={() => setSelectedProduct(p)}>
                        {p.image_url ? <ProductPhoto src={p.image_url} name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="lg" /> : <ProductCardPlaceholder name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="lg" />}
                        <button onClick={e => { e.stopPropagation(); toggleFavorite(p.id); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform" aria-label={language === 'ru' ? 'В избранное' : 'Sevimlilarga'}>
                          <Heart className={`w-[15px] h-[15px] ${fav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} strokeWidth={1.8} />
                        </button>
                        {p.is_featured && disc === 0 && <div className="absolute top-2 left-2 bg-primary-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">ХИТ</div>}
                        {disc > 0 && <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">-{disc}%</div>}
                        {p.stock_quantity === 0 && <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center"><span className="text-white text-[12px] font-bold bg-gray-900/60 px-3 py-1 rounded-full">{language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}</span></div>}
                      </div>
                      <div className="p-3">
                        <h3 className="font-semibold text-[13px] text-gray-900 line-clamp-2 min-h-[36px] leading-snug">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs font-semibold text-gray-700">{getProductRating(p.id).rating}</span>
                          <span className="text-xs text-gray-400">({getProductRating(p.id).count})</span>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-baseline gap-1.5">
                            <p className="font-extrabold text-[15px] text-gray-900">{fmt(p.price)}</p>
                            {p.old_price && <p className="text-xs text-gray-400 line-through">{fmt(p.old_price)}</p>}
                          </div>
                          <div className="mt-2">
                            {qty > 0 ? (
                              <div className="flex items-center justify-between bg-gray-50 rounded-[12px] p-1">
                                <button onClick={() => updateCartQuantity(p.id, qty - 1)} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-white flex items-center justify-center active:scale-90 transition-transform shadow-sm" aria-label={language === 'ru' ? 'Уменьшить количество' : 'Sonni kamaytirish'}><Minus className="w-3.5 h-3.5 text-gray-600" /></button>
                                <span className="text-[14px] font-bold text-gray-900">{qty}</span>
                                <button onClick={() => updateCartQuantity(p.id, qty + 1)} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-primary-500 flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'Увеличить количество' : 'Sonni oshirish'}><Plus className="w-3.5 h-3.5 text-white" /></button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(p.id)} disabled={p.stock_quantity === 0} className={`w-full py-2 rounded-[12px] flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-[0.97] transition-transform ${p.stock_quantity === 0 ? 'bg-gray-100 text-gray-400' : 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.25)]'}`}>
                                <Plus className="w-4 h-4" />
                                <span>{language === 'ru' ? 'В корзину' : 'Savatga'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {filteredProducts.length === 0 && (
            <EmptyState
              icon={<ShoppingBag className="w-12 h-12" />}
              title={language === 'ru' ? 'Нет товаров' : 'Mahsulotlar yo\'q'}
              description={language === 'ru' ? 'Товары не найдены' : 'Topilmadi'}
            />
          )}
        </div>
      )}

      {/* FAVORITES */}
      {activeTab === 'favorites' && (
        <div className="px-4 pt-3 pb-24 md:pb-4">
          {favorites.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Heart className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium mb-2">{language === 'ru' ? 'Нет избранных товаров' : 'Sevimli mahsulotlar yo\'q'}</p>
              <button onClick={() => setActiveTab('shop')} className="text-primary-600 font-medium text-sm">{language === 'ru' ? 'К покупкам' : 'Xaridga'}</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.filter(p => favorites.includes(p.id)).map(p => {
                const qty = getCartQty(p.id);
                const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
                return (
                  <div key={p.id} className="bg-white rounded-[18px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform">
                    <div className="relative aspect-square bg-gray-50 flex items-center justify-center cursor-pointer" onClick={() => setSelectedProduct(p)}>
                      {p.image_url ? <ProductPhoto src={p.image_url} name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="lg" /> : <ProductCardPlaceholder name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="lg" />}
                      <button onClick={e => { e.stopPropagation(); toggleFavorite(p.id); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform">
                        <Heart className="w-[15px] h-[15px] fill-red-500 text-red-500" strokeWidth={1.8} />
                      </button>
                      {disc > 0 && <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">-{disc}%</div>}
                      {p.stock_quantity === 0 && <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center"><span className="text-white text-[12px] font-bold bg-gray-900/60 px-3 py-1 rounded-full">{language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}</span></div>}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-[13px] text-gray-900 line-clamp-2 min-h-[36px] leading-snug">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-semibold text-gray-700">{getProductRating(p.id).rating}</span>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-baseline gap-1.5">
                          <p className="font-extrabold text-[15px] text-gray-900">{fmt(p.price)}</p>
                          {p.old_price && <p className="text-xs text-gray-400 line-through">{fmt(p.old_price)}</p>}
                        </div>
                        <div className="mt-2">
                          {qty > 0 ? (
                            <div className="flex items-center justify-between bg-gray-50 rounded-[12px] p-1">
                              <button onClick={() => updateCartQuantity(p.id, qty - 1)} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-white flex items-center justify-center active:scale-90 transition-transform shadow-sm"><Minus className="w-3.5 h-3.5 text-gray-600" /></button>
                              <span className="text-[14px] font-bold text-gray-900">{qty}</span>
                              <button onClick={() => updateCartQuantity(p.id, qty + 1)} className="min-w-[44px] min-h-[44px] rounded-[10px] bg-primary-500 flex items-center justify-center active:scale-90 transition-transform"><Plus className="w-3.5 h-3.5 text-white" /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(p.id)} disabled={p.stock_quantity === 0} className={`w-full py-2 rounded-[12px] flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-[0.97] transition-transform ${p.stock_quantity === 0 ? 'bg-gray-100 text-gray-400' : 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.25)]'}`}>
                              <Plus className="w-4 h-4" />
                              <span>{language === 'ru' ? 'В корзину' : 'Savatga'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CART */}
      {activeTab === 'cart' && (
        <div className="px-4 pt-3 pb-24 md:pb-4">
          {cart.length === 0 ? (
            <div className="text-center py-16"><div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><ShoppingCart className="min-w-[44px] min-h-[44px] text-gray-300" /></div><p className="text-gray-500 font-medium mb-2">{language === 'ru' ? 'Корзина пуста' : 'Savat bo\'sh'}</p><button onClick={() => setActiveTab('shop')} className="text-primary-600 font-medium text-sm">{language === 'ru' ? 'К покупкам' : 'Xaridga'}</button></div>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {cart.map(item => {
                  const p = products.find(x => x.id === item.product_id);
                  if (!p) return null;
                  return (
                    <div key={item.id} className="bg-white rounded-[16px] p-3 flex gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="w-16 h-16 bg-gray-50 rounded-[12px] flex items-center justify-center shrink-0 overflow-hidden">
                        {p.image_url ? <ProductPhoto src={p.image_url} name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="xs" /> : <ProductCardPlaceholder name={language === 'ru' ? p.name_ru : p.name_uz} categoryId={p.category_id} size="xs" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[13px] text-gray-900 line-clamp-1">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{p.unit}</p>
                        <p className="font-bold text-[14px] text-primary-600 mt-1">{fmt(p.price * item.quantity)}</p>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <button onClick={() => removeFromCart(p.id)} className="p-1 text-gray-300 active:text-red-500" aria-label={language === 'ru' ? 'Удалить из корзины' : 'Savatdan olib tashlash'}><X className="w-4 h-4" /></button>
                        <div className="flex items-center gap-1.5 bg-gray-50 rounded-[10px] p-0.5">
                          <button onClick={() => updateCartQuantity(p.id, item.quantity - 1)} className="w-6 h-6 rounded-[8px] bg-white shadow-sm flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'Уменьшить количество' : 'Sonni kamaytirish'}><Minus className="w-3 h-3 text-gray-600" /></button>
                          <span className="w-5 text-center text-[13px] font-bold">{item.quantity}</span>
                          <button onClick={() => updateCartQuantity(p.id, item.quantity + 1)} className="w-6 h-6 rounded-[8px] bg-white shadow-sm flex items-center justify-center active:scale-90 transition-transform" aria-label={language === 'ru' ? 'Увеличить количество' : 'Sonni oshirish'}><Plus className="w-3 h-3 text-gray-600" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-1 text-[13px] text-gray-500"><span>{language === 'ru' ? 'Товаров:' : 'Mahsulotlar:'}</span><span className="font-medium">{cartCount} {language === 'ru' ? 'шт' : 'dona'}</span></div>
                <div className="flex items-center justify-between mb-3"><span className="text-[16px] font-bold text-gray-900">{language === 'ru' ? 'Итого' : 'Jami'}</span><span className="text-[18px] font-extrabold text-primary-600">{fmt(cartTotal)}</span></div>
                <button onClick={() => setShowOrderModal(true)} className="w-full py-3 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]">{language === 'ru' ? 'Оформить заказ' : 'Buyurtma berish'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ORDERS */}
      {activeTab === 'orders' && (
        <div className="px-4 pt-3 pb-24 md:pb-4 space-y-3">
          {activeOrders.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px] px-0.5">{language === 'ru' ? 'Активные' : 'Faol'}</div>
              {activeOrders.map(order => {
                const si = getOrderStageIndex(order.status);
                const sm = getOrderStatusMessage(order.status, language);
                return (
                  <div key={order.id} className="glass-card p-4 hover:shadow-lg transition-shadow cursor-pointer active:scale-[0.99]" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">#{order.order_number}</span>
                          <span className="text-xs font-medium text-primary-700 bg-primary-100 px-2.5 py-0.5 rounded-full">{sm.title}</span>
                        </div>
                        {sm.subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{sm.subtitle}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                          <span className="flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" />
                            {(order.items || []).reduce((s, i) => s + i.quantity, 0)} {language === 'ru' ? 'товаров' : 'mahsulot'}
                          </span>
                          <span>{new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <span className="text-[15px] font-bold text-gray-900 shrink-0">{fmt(order.total_amount)}</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-1">{ORDER_STAGES.map((s, i) => <div key={s.id} className="flex-1"><div className={`w-full h-[3px] rounded-full transition-colors ${si >= i ? 'bg-primary-500' : 'bg-gray-200'}`} /></div>)}</div>
                      <div className="flex justify-between mt-1"><span className="text-xs text-gray-400">{language === 'ru' ? 'Новый' : 'Yangi'}</span><span className="text-xs text-gray-400">{language === 'ru' ? 'Получен' : 'Qabul'}</span></div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {(order.items || []).slice(0, 4).map((it, i) => <div key={it.id || i} className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">{it.product_image ? <img src={it.product_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-xs text-white">{getProductEmoji(it.product_name || '', '')}</span></div>}</div>)}
                      {(order.items || []).length > 4 && <span className="text-xs text-gray-400 ml-1">+{(order.items || []).length - 4}</span>}
                      <div className="flex-1" />
                      {['new', 'confirmed'].includes(order.status) && <button onClick={(e) => { e.stopPropagation(); cancelOrder(order.id); }} disabled={cancellingOrderId === order.id} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[12px] font-medium disabled:opacity-50 hover:bg-red-100 transition-colors">{language === 'ru' ? 'Отменить' : 'Bekor'}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {historyOrders.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.8px] px-0.5">{language === 'ru' ? 'История' : 'Tarix'}</div>
              {historyOrders.map(order => (
                <div key={order.id} className="glass-card p-4 hover:shadow-lg transition-shadow cursor-pointer active:scale-[0.99]" onClick={() => setSelectedOrder(order)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">#{order.order_number}</span>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{order.status === 'cancelled' ? (language === 'ru' ? 'Отменён' : 'Bekor') : (language === 'ru' ? 'Доставлен' : 'Yetkazildi')}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1.5">
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          {(order.items || []).reduce((s, i) => s + i.quantity, 0)} {language === 'ru' ? 'товаров' : 'mahsulot'}
                        </span>
                        <span>{new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <span className="text-[14px] font-bold text-gray-700 shrink-0">{fmt(order.total_amount)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    {(order.items || []).slice(0, 4).map((it, i) => <div key={it.id || i} className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">{it.product_image ? <img src={it.product_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-xs text-white">{getProductEmoji(it.product_name || '', '')}</span></div>}</div>)}
                    {(order.items || []).length > 4 && <span className="text-xs text-gray-400 ml-1">+{(order.items || []).length - 4}</span>}
                  </div>
                  {order.status === 'delivered' && !order.rating && (
                    <button onClick={(e) => { e.stopPropagation(); setRatingOrderId(order.id); setShowDeliveryRatingModal(true); }} className="mt-3 w-full py-2 bg-primary-50 text-primary-600 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 active:bg-primary-100 transition-colors">
                      <Star className="w-3.5 h-3.5" />{language === 'ru' ? 'Оценить доставку' : 'Baholash'}
                    </button>
                  )}
                  {order.status === 'delivered' && order.rating && (
                    <div className="flex items-center gap-0.5 mt-3">{[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= (order.rating||0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />)}<span className="text-xs text-gray-400 ml-1.5">{language === 'ru' ? 'Ваша оценка' : 'Baho'}</span></div>
                  )}
                </div>
              ))}
            </div>
          )}
          {orders.length === 0 && <div className="text-center py-16"><div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><Package className="min-w-[44px] min-h-[44px] text-gray-300" /></div><p className="text-gray-500 font-medium mb-2">{language === 'ru' ? 'Нет заказов' : 'Buyurtmalar yo\'q'}</p><button onClick={() => setActiveTab('shop')} className="text-primary-600 font-medium text-sm">{language === 'ru' ? 'К покупкам' : 'Xaridga'}</button></div>}
        </div>
      )}

      {/* FLOATING CART */}
      {activeTab === 'shop' && cartCount > 0 && (
        <div className="fixed left-4 right-4 z-40 md:hidden" style={{ bottom: 'calc(var(--bottom-bar-h, 64px) + 8px)' }}>
          <button onClick={() => setActiveTab('cart')} className="w-full bg-primary-500 text-white rounded-[16px] p-3.5 flex items-center justify-between shadow-[0_4px_20px_rgba(var(--brand-rgb),0.35)] active:scale-[0.98] transition-transform touch-manipulation">
            <div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-white/20 rounded-[10px] flex items-center justify-center"><ShoppingCart className="w-[18px] h-[18px]" /></div><span className="font-semibold text-[14px]">{cartCount} {language === 'ru' ? 'товаров' : 'mahsulot'}</span></div>
            <span className="font-bold text-[15px]">{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* PRODUCT DETAIL */}
      {/* TODO: Refactor to use <Modal> component */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[85dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            <div className="relative">
              <div className="aspect-square bg-gray-50 flex items-center justify-center">{selectedProduct.image_url ? <ProductPhoto src={selectedProduct.image_url} name={language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz} categoryId={selectedProduct.category_id} size="xl" /> : <ProductCardPlaceholder name={language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz} categoryId={selectedProduct.category_id} size="xl" />}</div>
              <button onClick={() => setSelectedProduct(null)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-sm" aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}><X className="w-4 h-4 text-gray-600" /></button>
              <button onClick={() => toggleFavorite(selectedProduct.id)} className="absolute top-3 left-3 min-w-[44px] min-h-[44px] bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-sm" aria-label={language === 'ru' ? 'В избранное' : 'Sevimlilarga'}><Heart className={`w-4 h-4 ${favorites.includes(selectedProduct.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} /></button>
            </div>
            <div className="p-4">
              <h2 className="text-[18px] font-bold text-gray-900">{language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz}</h2>
              {(language === 'ru' ? selectedProduct.description_ru : selectedProduct.description_uz) && <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{language === 'ru' ? selectedProduct.description_ru : selectedProduct.description_uz}</p>}
              <div className="flex items-end justify-between mt-3 mb-4">
                <div><p className="text-[22px] font-extrabold text-primary-600">{fmt(selectedProduct.price)}</p>{selectedProduct.old_price && <p className="text-[13px] text-gray-400 line-through">{fmt(selectedProduct.old_price)}</p>}</div>
                <div className="text-right"><p className="text-[12px] text-gray-400">{selectedProduct.unit}</p><p className={`text-[12px] font-medium ${selectedProduct.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{selectedProduct.stock_quantity > 0 ? (language === 'ru' ? 'В наличии' : 'Mavjud') : (language === 'ru' ? 'Нет в наличии' : 'Mavjud emas')}</p></div>
              </div>
              <button onClick={() => { addToCart(selectedProduct.id); setSelectedProduct(null); }} disabled={selectedProduct.stock_quantity === 0} className="w-full py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400 shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"><ShoppingCart className="w-5 h-5" />{language === 'ru' ? 'В корзину' : 'Savatga'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center" onClick={() => setShowOrderModal(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            <div className="p-4">
              <h2 className="text-[17px] font-bold text-gray-900 mb-4">{language === 'ru' ? 'Оформление' : 'Rasmiylashtirish'}</h2>
              <div className="bg-gray-50 rounded-[14px] p-3.5 mb-3"><p className="text-[12px] text-gray-400 mb-1">{language === 'ru' ? 'Адрес' : 'Manzil'}</p><p className="text-[14px] font-semibold text-gray-900">{user?.address || '—'}, {language === 'ru' ? 'кв.' : 'xon.'} {user?.apartment || '—'}</p></div>
              <textarea value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} placeholder={language === 'ru' ? 'Комментарий...' : 'Izoh...'} className="w-full p-3 border border-gray-200 rounded-[14px] resize-none text-[14px] mb-3" rows={2} />
              <div className="flex items-center justify-between p-3.5 bg-primary-50 rounded-[14px] mb-4"><span className="text-[14px] font-medium text-gray-700">{language === 'ru' ? 'Итого' : 'Jami'}</span><span className="text-[18px] font-extrabold text-primary-600">{fmt(cartTotal)}</span></div>
              <button onClick={createOrder} className="w-full py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]">{language === 'ru' ? 'Подтвердить' : 'Tasdiqlash'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER DETAIL MODAL */}
      {selectedOrder && (() => {
        const si = getOrderStageIndex(selectedOrder.status);
        const sm = getOrderStatusMessage(selectedOrder.status, language as 'ru' | 'uz');
        const items = selectedOrder.items || [];
        const totalQty = items.reduce((s, i) => s + i.quantity, 0);
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>

              {/* Header */}
              <div className="px-5 pt-3 pb-4 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-[18px] font-bold text-gray-900">#{selectedOrder.order_number}</h2>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {new Date(selectedOrder.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="min-w-[44px] min-h-[44px] bg-gray-100 rounded-full flex items-center justify-center" aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}><X className="w-4 h-4 text-gray-500" /></button>
                </div>
              </div>

              {/* Status progress */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[12px] font-semibold px-3 py-1 rounded-full ${
                    selectedOrder.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    selectedOrder.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    'bg-primary-100 text-primary-700'
                  }`}>{sm.title}</span>
                  {sm.subtitle && <span className="text-[12px] text-gray-500">{sm.subtitle}</span>}
                </div>
                {selectedOrder.status !== 'cancelled' && (
                  <div className="space-y-2">
                    {ORDER_STAGES.map((stage, i) => {
                      const isActive = si >= i;
                      const isCurrent = si === i;
                      const StageIcon = stage.icon;
                      return (
                        <div key={stage.id} className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isCurrent ? 'bg-primary-500 text-white shadow-md' :
                            isActive ? 'bg-primary-100 text-primary-600' :
                            'bg-gray-100 text-gray-300'
                          }`}>
                            <StageIcon className="w-3.5 h-3.5" />
                          </div>
                          <span className={`text-[13px] ${isCurrent ? 'font-bold text-gray-900' : isActive ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
                            {language === 'ru' ? stage.labelRu : stage.labelUz}
                          </span>
                          {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Items list */}
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                  {language === 'ru' ? `Товары (${totalQty})` : `Mahsulotlar (${totalQty})`}
                </h3>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">
                        {item.product_image ? <img src={item.product_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-lg text-white">{getProductEmoji(item.product_name || '', '')}</span></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{item.product_name || (language === 'ru' ? 'Товар' : 'Mahsulot')}</p>
                        <p className="text-[12px] text-gray-500">{item.quantity} × {fmt(item.unit_price || item.price || 0)}</p>
                      </div>
                      <span className="text-[13px] font-bold text-gray-900 shrink-0">{fmt(item.total_price || (item.unit_price || item.price || 0) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & delivery info */}
              <div className="px-5 py-4">
                {selectedOrder.delivery_note && (
                  <div className="flex items-start gap-2 mb-3 p-3 bg-gray-50 rounded-xl">
                    <Truck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-gray-600">{selectedOrder.delivery_note}</p>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[15px] font-medium text-gray-600">{language === 'ru' ? 'Итого' : 'Jami'}</span>
                  <span className="text-[20px] font-extrabold text-primary-600">{fmt(selectedOrder.total_amount)}</span>
                </div>

                {/* Rating */}
                {selectedOrder.status === 'delivered' && selectedOrder.rating && (
                  <div className="flex items-center gap-1 mb-4 p-3 bg-yellow-50 rounded-xl">
                    {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= (selectedOrder.rating||0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />)}
                    <span className="text-[12px] text-gray-500 ml-2">{language === 'ru' ? 'Ваша оценка' : 'Sizning bahoyingiz'}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  {selectedOrder.status === 'delivered' && !selectedOrder.rating && (
                    <button onClick={() => { setSelectedOrder(null); setRatingOrderId(selectedOrder.id); setShowDeliveryRatingModal(true); }}
                      className="w-full py-3 bg-primary-50 text-primary-600 rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-2">
                      <Star className="w-4 h-4" />{language === 'ru' ? 'Оценить доставку' : 'Baholash'}
                    </button>
                  )}
                  {['new', 'confirmed'].includes(selectedOrder.status) && (
                    <button onClick={() => { cancelOrder(selectedOrder.id); setSelectedOrder(null); }}
                      className="w-full py-3 bg-red-50 text-red-600 rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-2">
                      <X className="w-4 h-4" />{language === 'ru' ? 'Отменить заказ' : 'Buyurtmani bekor qilish'}
                    </button>
                  )}
                  <button onClick={() => setSelectedOrder(null)}
                    className="w-full py-3 border border-gray-200 text-gray-600 rounded-[14px] text-[14px] font-medium">
                    {language === 'ru' ? 'Закрыть' : 'Yopish'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RATING MODAL */}
      {showDeliveryRatingModal && ratingOrderId && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center" onClick={() => { setShowDeliveryRatingModal(false); setRatingOrderId(null); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            <div className="p-5">
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-3"><Package className="w-7 h-7 text-primary-500" /></div>
                <h2 className="text-[17px] font-bold text-gray-900">{language === 'ru' ? 'Оцените доставку' : 'Baholang'}</h2>
                <p className="text-[13px] text-gray-500 mt-1">#{orders.find(o => o.id === ratingOrderId)?.order_number}</p>
              </div>
              <div className="flex justify-center gap-2 mb-2">{[1,2,3,4,5].map(s => <button key={s} onClick={() => setDeliveryRating(s)} className="p-1 active:scale-90 transition-transform" aria-label={language === 'ru' ? `Оценка ${s} из 5` : `${s} dan 5 baho`}><Star className={`w-9 h-9 ${s <= deliveryRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} /></button>)}</div>
              <p className="text-center text-[13px] font-medium text-gray-600 mb-4">{deliveryRating >= 4 ? (language === 'ru' ? 'Отлично!' : 'Ajoyib!') : deliveryRating >= 3 ? (language === 'ru' ? 'Нормально' : 'O\'rtacha') : (language === 'ru' ? 'Плохо' : 'Yomon')}</p>
              <textarea value={deliveryReview} onChange={e => setDeliveryReview(e.target.value)} placeholder={language === 'ru' ? 'Отзыв...' : 'Sharh...'} className="w-full px-3.5 py-3 border border-gray-200 rounded-[14px] resize-none text-[14px] mb-4" rows={2} />
              <button onClick={submitDeliveryRating} disabled={isSubmittingRating} className="w-full py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
                {isSubmittingRating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (language === 'ru' ? 'Отправить' : 'Yuborish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
