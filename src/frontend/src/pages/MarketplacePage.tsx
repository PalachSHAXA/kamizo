import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  ShoppingCart, Search, Heart, Package, Plus, Minus, X,
  CheckCircle, ShoppingBag, Star, ArrowLeft, Truck
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useTenantStore } from '../stores/tenantStore';
import { useToastStore } from '../stores/toastStore';
import { useModalPresence } from '../stores/modalStore';
// Единая правда о жизненном цикле заказа — импортируем канонический
// union (все 13 статусов включая on-demand — Этап 2, миграция 054).
// Раньше локальный `type` в этом файле знал только 7 stock-статусов,
// поэтому on-demand-заявки после Этапа 3 показывались как «Заказ
// оформлен / 0 сум» (fallback m[status] || m.new в getOrderStatusMessage).
import type { MarketplaceOrderStatus } from '../types/marketplace';

interface MarketplaceCategoryAPI { id: string; name_ru: string; name_uz: string; icon?: string; sort_order: number; is_active: boolean; created_at: string; }
interface MarketplaceProductAPI { id: string; category_id: string; name_ru: string; name_uz: string; description_ru?: string; description_uz?: string; price: number; old_price?: number; unit: string; stock_quantity: number; image_url?: string; is_active: boolean; is_featured: boolean; is_on_demand?: boolean; created_at: string; }
interface MarketplaceCartItemAPI { id: string; product_id: string; quantity: number; added_at: string; }
interface MarketplaceOrderAPI {
  id: string;
  order_number: string;
  resident_id: string;
  resident_name?: string;
  resident_phone?: string;
  resident_address?: string;
  resident_apartment?: string;
  status: MarketplaceOrderStatus;
  items: MarketplaceOrderItemAPI[];
  total_amount: number;
  items_count: number;
  delivery_note?: string;
  created_at: string;
  rating?: number;
  review?: string;
  // On-demand fields (migration 054). `order_type` gates all
  // negotiation UI; `delivery_fee` + `final_amount` split the offered
  // price for the resident; `price_offered_expires_at` powers the
  // 24-h deadline; `cancellation_reason` shows the manager's note
  // for terminal statuses (price_declined / unavailable / cancelled).
  order_type?: 'stock' | 'on_demand';
  delivery_fee?: number;
  final_amount?: number;
  price_offered_at?: string | null;
  price_offered_expires_at?: string | null;
  cancellation_reason?: string | null;
}
interface MarketplaceOrderItemAPI { id: string; order_id?: string; product_id: string; product_name?: string; product_image?: string; quantity: number; price?: number; unit_price?: number; total_price?: number; }

const ORDER_STAGES = [
  { id: 'created', statuses: ['new'], labelRu: 'Новый', labelUz: 'Yangi', icon: ShoppingBag },
  { id: 'confirmed', statuses: ['confirmed'], labelRu: 'Принят', labelUz: 'Qabul', icon: CheckCircle },
  { id: 'preparing', statuses: ['preparing'], labelRu: 'Сборка', labelUz: 'Yig\'ish', icon: Package },
  { id: 'ready', statuses: ['ready'], labelRu: 'Готов', labelUz: 'Tayyor', icon: CheckCircle },
  { id: 'delivering', statuses: ['delivering'], labelRu: 'В пути', labelUz: 'Yo\'lda', icon: Truck },
  { id: 'delivered', statuses: ['delivered'], labelRu: 'Получен', labelUz: 'Qabul', icon: CheckCircle },
];

// Returns -1 for statuses that don't belong on the stock progress bar
// (cancelled + all on-demand states). Callers check `si < 0` and skip
// rendering the bar. Previous version returned 0 for unknown statuses,
// which highlighted «Новый» for on-demand заявок in negotiation.
function getOrderStageIndex(status: MarketplaceOrderStatus): number {
  if (status === 'cancelled') return -1;
  for (let i = 0; i < ORDER_STAGES.length; i++) {
    if (ORDER_STAGES[i].statuses.includes(status)) return i;
  }
  return -1;
}

// Resident-view labels — cover BOTH stock and on-demand lifecycles.
// On-demand phrasing is deliberately жителе-центричное ("ждём УК" vs
// generic "Ожидает обработки" из types/marketplace.ts) — этот словарь
// живёт в компоненте потому что дефолтный резидент-словарь-Record из
// types/marketplace.ts используется другими view'ами тоже.
function getOrderStatusMessage(status: MarketplaceOrderStatus, lang: 'ru' | 'uz'): { title: string; subtitle: string } {
  const m: Record<MarketplaceOrderStatus, { ru: [string, string]; uz: [string, string] }> = {
    // Stock lifecycle
    new: { ru: ['Заказ оформлен', 'Ожидаем подтверждения'], uz: ['Buyurtma yaratildi', 'Tasdiqlanishini kutmoqdamiz'] },
    confirmed: { ru: ['Заказ принят', 'Начинаем сборку'], uz: ['Buyurtma qabul qilindi', 'Yig\'ishni boshlaymiz'] },
    preparing: { ru: ['Собираем заказ', 'Скоро будет готов'], uz: ['Buyurtma yig\'ilmoqda', 'Tez orada tayyor bo\'ladi'] },
    ready: { ru: ['Заказ готов', 'Передаём курьеру'], uz: ['Buyurtma tayyor', 'Kuryerga topshirilmoqda'] },
    delivering: { ru: ['Курьер в пути', 'Скоро будет у вас'], uz: ['Kuryer yo\'lda', 'Tez orada sizda bo\'ladi'] },
    delivered: { ru: ['Доставлен', 'Приятного аппетита!'], uz: ['Yetkazildi', 'Yoqimli ishtaha!'] },
    cancelled: { ru: ['Отменён', ''], uz: ['Bekor qilindi', ''] },
    // On-demand lifecycle (Этап 4b) — резидент-центричные фразы
    awaiting_price: { ru: ['Заявка отправлена', 'Ждём УК'],           uz: ['Ariza yuborildi',       'Boshqaruvni kutmoqdamiz'] },
    price_pending:  { ru: ['УК уточняет цену', 'Скоро назовут стоимость'], uz: ['Boshqaruv narxni aniqlamoqda', 'Tez orada narx aytiladi'] },
    price_offered:  { ru: ['Цена предложена', 'Ответьте — согласны или нет'], uz: ['Narx taklif qilindi', 'Rozimisiz yoki yo\'q — javob bering'] },
    price_accepted: { ru: ['Цена принята', 'УК начала обработку'],    uz: ['Narx qabul qilindi',   'Boshqaruv ishga tushdi'] },
    price_declined: { ru: ['Вы отказались', 'Заявка закрыта'],        uz: ['Siz rad etdingiz',     'Ariza yopildi'] },
    unavailable:    { ru: ['УК не смогла достать', 'Товар недоступен'], uz: ["Boshqaruv topib bo'lmadi", 'Mahsulot mavjud emas'] },
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
      <img src={src} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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

  // Нормализация булевых полей: SQLite отдаёт integer 0/1 для is_on_demand,
  // is_featured, is_active. TypeScript интерфейс объявляет их boolean,
  // но реальные значения на runtime — числа. В JSX это ломается на
  // паттерне `{p.is_on_demand && <badge>}`: если поле = 0, React рендерит
  // `0` как отдельный text-node прямо в родителе (photoWrap div). Два
  // таких `0` рядом = визуальные "00" справа от фото + flex-контейнер
  // сжимает картинку, освобождая место под эти "0"-ноды (~17px). Один
  // раз каст в fetchData — весь класс бага закрыт для всех точек рендера
  // (grid / featured / favorites / detail-modal / mini-scroll).
  //
  // stock_quantity, price, old_price сравниваются как числа — оставляем.
  const normalizeProduct = (p: MarketplaceProductAPI): MarketplaceProductAPI => ({
    ...p,
    is_on_demand: !!p.is_on_demand,
    is_featured: !!p.is_featured,
    is_active: !!p.is_active,
  });
  const [cart, setCart] = useState<MarketplaceCartItemAPI[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrderAPI[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProductAPI | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  // Bug fix 2026-07-11: раньше заказы уходили в БД с пустым
  // delivery_address/phone, если у резидента профиль был не заполнен —
  // orders.ts брал user.address/phone напрямую, менеджер получал
  // «Адрес не указан». Теперь принимаем адрес и телефон из формы
  // (pre-fill из профиля если что-то есть) — по тому же паттерну, что
  // on-demand-модалка (Stage 4a) уже использует.
  const [orderForm, setOrderForm] = useState({
    delivery_address: '',
    delivery_apartment: '',
    delivery_phone: '',
    delivery_notes: '',
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [showDeliveryRatingModal, setShowDeliveryRatingModal] = useState(false);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [deliveryReview, setDeliveryReview] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrderAPI | null>(null);
  const [banners, setBanners] = useState<{ id: string; title: string; description?: string; image_url?: string; link_url?: string }[]>([]);

  // On-demand order request modal (Stage 4a). Opened when the resident
  // taps «Заказать под привоз» on an is_on_demand=1 product. The form
  // demands delivery_address + delivery_phone (backend rejects empty —
  // resident profile fields may be null) and posts to
  // /api/marketplace/orders/on-demand.
  const [onDemandProduct, setOnDemandProduct] = useState<MarketplaceProductAPI | null>(null);
  const [onDemandForm, setOnDemandForm] = useState({
    quantity: '1',
    delivery_address: '',
    delivery_apartment: '',
    delivery_phone: '',
    delivery_notes: '',
  });
  const [onDemandSubmitting, setOnDemandSubmitting] = useState(false);

  // BottomBar hidden for the entire /marketplace route (2026-07-11).
  // Marketplace is a self-contained context-screen: it has its own
  // sub-navigation (Магазин / Избранное / Корзина / Заказы), its own
  // «Назад» button up top, and — in the shop tab — a floating cart
  // pill anchored to the bottom. Rendering the global resident
  // BottomBar underneath duplicates navigation and visually competes
  // with the cart pill for attention. Hiding it unconditionally is
  // simpler than juggling per-tab / per-modal flags (previous version
  // did that and still left the shop-with-cart case looking crowded).
  //
  // Cart pill offset (`bottom: calc(var(--bottom-bar-h,64px)+8px)`)
  // is intentionally kept — the CSS var already includes
  // env(safe-area-inset-bottom), which gives a comfortable margin
  // above the iOS home indicator whether the bar is present or not.
  useModalPresence(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesRes, productsRes] = await Promise.all([
        apiRequest<{ categories: MarketplaceCategoryAPI[] }>('/api/marketplace/categories'),
        apiRequest<{ products: MarketplaceProductAPI[]; total: number }>('/api/marketplace/products'),
      ]);
      setCategories(categoriesRes?.categories || []);
      setProducts((productsRes?.products || []).map(normalizeProduct));
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

  // Bug A deeplink (Этап 4b, 2026-07-11): push-нотификации
  // marketplace_order приходят с data.url = `/marketplace?orderId=…`.
  // Раньше sw.js открывал `/`, и житель попадал в магазин без
  // контекста. Теперь SW уводит сюда — а мы читаем query, включаем
  // таб «Заказы» и открываем карточку. history.replaceState стирает
  // ?orderId=, чтобы кнопка «Назад» не гоняла между тем же экраном.
  const location = useLocation();
  useEffect(() => {
    if (!orders.length || !location.search) return;
    const params = new URLSearchParams(location.search);
    const oid = params.get('orderId');
    if (!oid) return;
    const target = orders.find(o => o.id === oid);
    if (target) {
      setActiveTab('orders');
      setSelectedOrder(target);
    }
    // Чистим query в любом случае — orphan-параметр в адресе только
    // мешает: рефреш экрана снова триггернёт открытие.
    window.history.replaceState({}, '', location.pathname);
  }, [orders, location.search, location.pathname]);

  const removeFromCart = useCallback(async (productId: string) => {
    try { await apiRequest(`/api/marketplace/cart/${productId}`, { method: 'DELETE' }); const r = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'); setCart(r?.cart || []); } catch { /* */ }
  }, []);
  // On-demand order: open the request modal instead of cart-adding.
  // Pre-fills quantity=1 and any address/phone fields the user already
  // has on file (they may be empty — the backend enforces address/phone
  // as required, the modal marks them accordingly).
  const requestOnDemand = useCallback((product: MarketplaceProductAPI) => {
    setOnDemandForm({
      quantity: '1',
      delivery_address: user?.address || '',
      delivery_apartment: user?.apartment || '',
      delivery_phone: user?.phone || '',
      delivery_notes: '',
    });
    setOnDemandProduct(product);
  }, [user]);

  const addToCart = useCallback(async (productId: string) => {
    // Route on-demand products to the request modal — cart flow can't
    // handle them (backend rejects cart-add for is_on_demand=1). Users
    // that hit this via mini quick-add / featured banner / selected-
    // product modal get the same modal experience as the main grid.
    const product = products.find(p => p.id === productId);
    if (product?.is_on_demand) {
      requestOnDemand(product);
      return;
    }
    try { await apiRequest('/api/marketplace/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 }) }); const r = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'); setCart(r?.cart || []); } catch { /* */ }
  }, [products, requestOnDemand]);

  // Submit the on-demand form → POST /api/marketplace/orders/on-demand.
  // Address + phone are required; empty submission would 400 on the
  // server, but we short-circuit with a toast for a nicer UX.
  const submitOnDemand = useCallback(async () => {
    if (!onDemandProduct) return;
    const address = onDemandForm.delivery_address.trim();
    const phone = onDemandForm.delivery_phone.trim();
    const qty = parseInt(onDemandForm.quantity, 10);
    if (!address) { addToast('warning', language === 'ru' ? 'Укажите адрес доставки' : 'Yetkazish manzilini kiriting'); return; }
    if (!phone)   { addToast('warning', language === 'ru' ? 'Укажите телефон' : 'Telefon raqamini kiriting'); return; }
    if (!qty || qty < 1) { addToast('warning', language === 'ru' ? 'Количество должно быть больше 0' : "Miqdor 0 dan katta bo'lishi kerak"); return; }

    setOnDemandSubmitting(true);
    try {
      await apiRequest('/api/marketplace/orders/on-demand', {
        method: 'POST',
        body: JSON.stringify({
          product_id: onDemandProduct.id,
          quantity: qty,
          delivery_address: address,
          delivery_apartment: onDemandForm.delivery_apartment.trim() || undefined,
          delivery_phone: phone,
          delivery_notes: onDemandForm.delivery_notes.trim() || undefined,
        }),
      });
      // Refetch orders so the resident sees the new awaiting_price entry
      // when they switch to the «Заказы» tab.
      const o = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
      setOrders(o?.orders || []);
      setOnDemandProduct(null);
      addToast('success', language === 'ru'
        ? 'Заявка отправлена, УК свяжется по цене'
        : "Ariza yuborildi, boshqaruv narx haqida bog'lanadi");
    } catch {
      addToast('error', language === 'ru'
        ? 'Не удалось отправить заявку'
        : "Arizani yuborib bo'lmadi");
    } finally {
      setOnDemandSubmitting(false);
    }
  }, [onDemandProduct, onDemandForm, addToast, language]);
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
  // Открытие checkout-модалки: pre-fill формы из user-профиля.
  // У большинства жителей поля пусты — тогда форма ожидает ручного
  // ввода. Раньше эту функцию заменял inline `setShowOrderModal(true)`
  // без сброса — форма могла удержать заметку прошлого заказа.
  const openOrderModal = useCallback(() => {
    setOrderForm({
      delivery_address:   user?.address   || '',
      delivery_apartment: user?.apartment || '',
      delivery_phone:     user?.phone     || '',
      delivery_notes:     '',
    });
    setShowOrderModal(true);
  }, [user]);

  const createOrder = async () => {
    const address = orderForm.delivery_address.trim();
    const phone   = orderForm.delivery_phone.trim();
    // Клиентская валидация — то же, что on-demand-модалка (Stage 4a).
    // Бэк тоже валидирует (400) — этот guard просто чтобы не гонять
    // сеть впустую и дать понятный warning жителю.
    if (!address) { addToast('warning', language === 'ru' ? 'Укажите адрес доставки' : 'Yetkazish manzilini kiriting'); return; }
    if (!phone)   { addToast('warning', language === 'ru' ? 'Укажите телефон' : 'Telefon raqamini kiriting'); return; }

    setOrderSubmitting(true);
    try {
      await apiRequest('/api/marketplace/orders', {
        method: 'POST',
        body: JSON.stringify({
          delivery_address:   address,
          delivery_apartment: orderForm.delivery_apartment.trim() || undefined,
          delivery_phone:     phone,
          delivery_notes:     orderForm.delivery_notes.trim() || undefined,
        }),
      });
      setShowOrderModal(false);
      // Success toast goes through the global <Toast/> which is anchored
      // above the BottomBar (never behind the dynamic island). Replaces
      // the previous inline `fixed top-4` green pill that landed under
      // the notch on iPhones with Dynamic Island.
      addToast('success', language === 'ru' ? 'Заказ создан!' : 'Buyurtma yaratildi!');
      const [c, o] = await Promise.all([apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'), apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders')]);
      setCart(c?.cart || []); setOrders(o?.orders || []);
      setTimeout(() => setActiveTab('orders'), 800);
    } catch {
      addToast('error', language === 'ru' ? 'Не удалось создать заказ' : "Buyurtma yaratilmadi");
    } finally {
      setOrderSubmitting(false);
    }
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

  // Этап 4b: on-demand-цена — accept/decline.
  // Backend: POST /orders/:id/accept-price делает price_offered →
  // price_accepted → confirmed (batched), заказ вливается в обычный
  // fulfillment. POST /orders/:id/decline-price: price_offered →
  // price_declined, cancellation_reason опционален.
  const [priceActionOrderId, setPriceActionOrderId] = useState<string | null>(null);
  // После accept/decline закрываем модалку — житель попадает обратно
  // в список, где карточка уже с новым статусом (confirmed после моста
  // price_accepted→confirmed или price_declined). Toast остаётся видимым
  // и служит подтверждением действия. Refetch выполняется ДО закрытия,
  // чтобы список успел обновиться и открытый ранее прогресс-бар исчез.
  const acceptPriceOffer = useCallback(async (orderId: string) => {
    setPriceActionOrderId(orderId);
    try {
      await apiRequest(`/api/marketplace/orders/${orderId}/accept-price`, { method: 'POST' });
      const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
      setOrders(r?.orders || []);
      setSelectedOrder(null);
      addToast('success', language === 'ru' ? 'Заказ подтверждён, УК везёт' : "Buyurtma tasdiqlandi, boshqaruv olib keladi");
    } catch {
      addToast('error', language === 'ru' ? 'Не удалось подтвердить' : "Tasdiqlab bo'lmadi");
    } finally {
      setPriceActionOrderId(null);
    }
  }, [addToast, language]);
  const declinePriceOffer = useCallback(async (orderId: string) => {
    if (!confirm(language === 'ru' ? 'Отказаться от цены?' : 'Narxdan voz kechish?')) return;
    setPriceActionOrderId(orderId);
    try {
      await apiRequest(`/api/marketplace/orders/${orderId}/decline-price`, { method: 'POST', body: JSON.stringify({}) });
      const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
      setOrders(r?.orders || []);
      setSelectedOrder(null);
      addToast('info', language === 'ru' ? 'Вы отказались' : 'Siz rad etdingiz');
    } catch {
      addToast('error', language === 'ru' ? 'Не удалось отправить отказ' : "Rad etib bo'lmadi");
    } finally {
      setPriceActionOrderId(null);
    }
  }, [addToast, language]);

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
      {/* HEADER — sticky, "остаётся на месте" при скролле карточек товаров.
          bg-white (не /95): полупрозрачный фон + backdrop-blur на iOS
          WKWebView иногда воспринимался как «уплывает» — визуально
          сквозь заголовок просвечивают карточки. Полная непрозрачность
          убирает эту иллюзию.
          willChange: 'transform' форсирует создание composite-слоя —
          лекарство от известного sticky-глюка Safari, когда прилипание
          «отваливается» после первого overscroll. */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', willChange: 'transform' }}
      >
        <div className="px-4 pt-1.5 pb-2 flex items-center justify-between">
          <button
            onClick={() => {
              // Иерархичный возврат (2026-07-11): из под-таба (Избранное /
              // Корзина / Заказы) отходим сначала на корневой таб магазина
              // «Магазин», а не сразу на Главную. Так житель не «вылетает»
              // из магазина случайным нажатием ←, если он глубоко залез
              // внутрь. Со shop-таба ← уводит на /.
              if (activeTab !== 'shop') {
                setActiveTab('shop');
              } else {
                navigate('/');
              }
            }}
            className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
            aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
          >
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
              {/* Sprint 36: red badge replaced with brand-orange to
                  match the rest of the resident UI. Red was reading as
                  "warning" when really it just meant "count". */}
              {cartCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-gradient-to-br from-[#E8621A] to-[#F59E0B] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1 border-2 border-white">{cartCount > 9 ? '9+' : cartCount}</span>}
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
            <input type="search" inputMode="search" autoComplete="off" placeholder={language === 'ru' ? 'Поиск товаров...' : 'Mahsulot qidirish...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-[14px] bg-white border border-gray-100 text-[14px] placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={language === 'ru' ? 'Поиск товаров' : 'Mahsulot qidirish'} />
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
                    <img src={banner.image_url} alt={banner.title} loading="lazy" decoding="async" className="w-full h-36 object-cover" />
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
              <div key={selectedCategory || searchQuery || 'all'} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 stagger-children">
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
                        {/* On-demand badge takes priority over ХИТ / discount:
                            the product isn't a regular stock item, so the
                            "special delivery" hint is more relevant. */}
                        {p.is_on_demand && <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">{language === 'ru' ? 'Под заказ' : 'Buyurtma'}</div>}
                        {!p.is_on_demand && p.is_featured && disc === 0 && <div className="absolute top-2 left-2 bg-primary-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">ХИТ</div>}
                        {!p.is_on_demand && disc > 0 && <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">-{disc}%</div>}
                        {/* "Out of stock" overlay only for real stock items —
                            an on-demand product has stock_quantity=0 by design,
                            not because it ran out. */}
                        {!p.is_on_demand && p.stock_quantity === 0 && <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center"><span className="text-white text-[12px] font-bold bg-gray-900/60 px-3 py-1 rounded-full">{language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}</span></div>}
                      </div>
                      <div className="p-3">
                        <h3 className="font-semibold text-[13px] text-gray-900 line-clamp-2 min-h-[36px] leading-snug">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs font-semibold text-gray-700">{getProductRating(p.id).rating}</span>
                          <span className="text-xs text-gray-400">({getProductRating(p.id).count})</span>
                        </div>
                        <div className="mt-2">
                          {p.is_on_demand ? (
                            <p className="font-extrabold text-[15px] text-amber-600">{language === 'ru' ? 'Цена по запросу' : "So'rov bo'yicha"}</p>
                          ) : (
                            <div className="flex items-baseline gap-1.5">
                              <p className="font-extrabold text-[15px] text-gray-900">{fmt(p.price)}</p>
                              {p.old_price && <p className="text-xs text-gray-400 line-through">{fmt(p.old_price)}</p>}
                            </div>
                          )}
                          <div className="mt-2">
                            {p.is_on_demand ? (
                              <button onClick={() => requestOnDemand(p)} className="w-full py-2 rounded-[12px] flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-[0.97] transition-transform bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)]">
                                <ShoppingBag className="w-4 h-4" />
                                <span>{language === 'ru' ? 'Заказать под привоз' : 'Buyurtma qilish'}</span>
                              </button>
                            ) : qty > 0 ? (
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
                      {p.is_on_demand && <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">{language === 'ru' ? 'Под заказ' : 'Buyurtma'}</div>}
                      {!p.is_on_demand && disc > 0 && <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-[8px]">-{disc}%</div>}
                      {!p.is_on_demand && p.stock_quantity === 0 && <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center"><span className="text-white text-[12px] font-bold bg-gray-900/60 px-3 py-1 rounded-full">{language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}</span></div>}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-[13px] text-gray-900 line-clamp-2 min-h-[36px] leading-snug">{language === 'ru' ? p.name_ru : p.name_uz}</h3>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-semibold text-gray-700">{getProductRating(p.id).rating}</span>
                      </div>
                      <div className="mt-2">
                        {p.is_on_demand ? (
                          <p className="font-extrabold text-[15px] text-amber-600">{language === 'ru' ? 'Цена по запросу' : "So'rov bo'yicha"}</p>
                        ) : (
                          <div className="flex items-baseline gap-1.5">
                            <p className="font-extrabold text-[15px] text-gray-900">{fmt(p.price)}</p>
                            {p.old_price && <p className="text-xs text-gray-400 line-through">{fmt(p.old_price)}</p>}
                          </div>
                        )}
                        <div className="mt-2">
                          {p.is_on_demand ? (
                            <button onClick={() => requestOnDemand(p)} className="w-full py-2 rounded-[12px] flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-[0.97] transition-transform bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)]">
                              <ShoppingBag className="w-4 h-4" />
                              <span>{language === 'ru' ? 'Заказать под привоз' : 'Buyurtma qilish'}</span>
                            </button>
                          ) : qty > 0 ? (
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
                        <button onClick={() => removeFromCart(p.id)} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-gray-300 active:text-red-500 hover:bg-red-50 rounded-md transition-colors" aria-label={language === 'ru' ? 'Удалить из корзины' : 'Savatdan olib tashlash'}><X className="w-4 h-4" /></button>
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
                <button onClick={openOrderModal} className="w-full py-3 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]">{language === 'ru' ? 'Оформить заказ' : 'Buyurtma berish'}</button>
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
                const cardOnDemand = order.order_type === 'on_demand';
                const cardPreOffer = cardOnDemand && (order.status === 'awaiting_price' || order.status === 'price_pending');
                const cardOffered = cardOnDemand && order.status === 'price_offered';
                const cardAmount = order.final_amount ?? order.total_amount;
                return (
                  <div key={order.id} className="glass-card p-4 hover:shadow-lg transition-shadow cursor-pointer active:scale-[0.99]" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">#{order.order_number}</span>
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cardOffered ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-700'}`}>{sm.title}</span>
                          {cardOnDemand && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {language === 'ru' ? 'Под привоз' : 'Buyurtma'}
                            </span>
                          )}
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
                      {!cardPreOffer && (
                        <span className={`text-[15px] font-bold shrink-0 ${cardOffered ? 'text-amber-700' : 'text-gray-900'}`}>{fmt(cardAmount)}</span>
                      )}
                    </div>
                    {/* stock-progress-бар рисуем только когда заказ действительно
                        в stock-жизненном цикле. Для on-demand до price_accepted
                        цикл про сборку и доставку неприменим. */}
                    {si >= 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1">{ORDER_STAGES.map((s, i) => <div key={s.id} className="flex-1"><div className={`w-full h-[3px] rounded-full transition-colors ${si >= i ? 'bg-primary-500' : 'bg-gray-200'}`} /></div>)}</div>
                        <div className="flex justify-between mt-1"><span className="text-xs text-gray-400">{language === 'ru' ? 'Новый' : 'Yangi'}</span><span className="text-xs text-gray-400">{language === 'ru' ? 'Получен' : 'Qabul'}</span></div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-1.5">
                      {(order.items || []).slice(0, 4).map((it, i) => <div key={it.id || i} className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">{it.product_image ? <img src={it.product_image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-xs text-white">{getProductEmoji(it.product_name || '', '')}</span></div>}</div>)}
                      {(order.items || []).length > 4 && <span className="text-xs text-gray-400 ml-1">+{(order.items || []).length - 4}</span>}
                      <div className="flex-1" />
                      {cardOffered && (
                        <span className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[11px] font-semibold">
                          {language === 'ru' ? 'Ответьте на цену' : 'Narxga javob bering'}
                        </span>
                      )}
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
                    {(order.items || []).slice(0, 4).map((it, i) => <div key={it.id || i} className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">{it.product_image ? <img src={it.product_image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-xs text-white">{getProductEmoji(it.product_name || '', '')}</span></div>}</div>)}
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
                {selectedProduct.is_on_demand ? (
                  <div>
                    <p className="text-[22px] font-extrabold text-amber-600">{language === 'ru' ? 'Цена по запросу' : "So'rov bo'yicha"}</p>
                    <p className="text-[12px] text-gray-500">{language === 'ru' ? 'УК свяжется и назовёт цену' : "Boshqaruv bog'lanib narxni aytadi"}</p>
                  </div>
                ) : (
                  <>
                    <div><p className="text-[22px] font-extrabold text-primary-600">{fmt(selectedProduct.price)}</p>{selectedProduct.old_price && <p className="text-[13px] text-gray-400 line-through">{fmt(selectedProduct.old_price)}</p>}</div>
                    <div className="text-right"><p className="text-[12px] text-gray-400">{selectedProduct.unit}</p><p className={`text-[12px] font-medium ${selectedProduct.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{selectedProduct.stock_quantity > 0 ? (language === 'ru' ? 'В наличии' : 'Mavjud') : (language === 'ru' ? 'Нет в наличии' : 'Mavjud emas')}</p></div>
                  </>
                )}
              </div>
              {selectedProduct.is_on_demand ? (
                <button onClick={() => { const p = selectedProduct; setSelectedProduct(null); requestOnDemand(p); }} className="w-full py-3.5 bg-amber-500 text-white rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(245,158,11,0.3)]"><ShoppingBag className="w-5 h-5" />{language === 'ru' ? 'Заказать под привоз' : 'Buyurtma qilish'}</button>
              ) : (
                <button onClick={() => { addToCart(selectedProduct.id); setSelectedProduct(null); }} disabled={selectedProduct.stock_quantity === 0} className="w-full py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400 shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"><ShoppingCart className="w-5 h-5" />{language === 'ru' ? 'В корзину' : 'Savatga'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ON-DEMAND REQUEST MODAL (Stage 4a) */}
      {onDemandProduct && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center" onClick={() => !onDemandSubmitting && setOnDemandProduct(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-[17px] font-bold text-gray-900">{language === 'ru' ? 'Заказать под привоз' : 'Buyurtma qilish'}</h2>
                  <p className="text-[13px] text-gray-500 mt-0.5">{language === 'ru' ? onDemandProduct.name_ru : onDemandProduct.name_uz}</p>
                </div>
                <button onClick={() => !onDemandSubmitting && setOnDemandProduct(null)} className="p-1 -mr-1" aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-[14px] p-3 mb-4">
                <p className="text-[13px] text-amber-900 leading-snug">{language === 'ru' ? 'УК свяжется с вами по цене товара и доставки. После вашего согласия — привезём.' : "Boshqaruv siz bilan mahsulot va yetkazish narxi bo'yicha bog'lanadi. Roziligingizdan keyin keltiramiz."}</p>
              </div>

              {/* Quantity */}
              <div className="mb-3">
                <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{language === 'ru' ? 'Количество' : 'Miqdor'}</label>
                <input
                  type="number"
                  min="1"
                  value={onDemandForm.quantity}
                  onChange={e => setOnDemandForm({ ...onDemandForm, quantity: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                />
              </div>

              {/* Address (required) */}
              <div className="mb-3">
                <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{language === 'ru' ? 'Адрес доставки *' : "Yetkazish manzili *"}</label>
                <input
                  type="text"
                  value={onDemandForm.delivery_address}
                  onChange={e => setOnDemandForm({ ...onDemandForm, delivery_address: e.target.value })}
                  placeholder={language === 'ru' ? 'Улица, дом' : "Ko'cha, uy"}
                  className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                />
              </div>

              {/* Apartment (optional) */}
              <div className="mb-3">
                <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{language === 'ru' ? 'Квартира' : 'Xonadon'}</label>
                <input
                  type="text"
                  value={onDemandForm.delivery_apartment}
                  onChange={e => setOnDemandForm({ ...onDemandForm, delivery_apartment: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                />
              </div>

              {/* Phone (required) */}
              <div className="mb-3">
                <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{language === 'ru' ? 'Телефон *' : "Telefon *"}</label>
                <input
                  type="tel"
                  value={onDemandForm.delivery_phone}
                  onChange={e => setOnDemandForm({ ...onDemandForm, delivery_phone: e.target.value })}
                  placeholder="+998 90 123 45 67"
                  className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                />
              </div>

              {/* Notes (optional) */}
              <div className="mb-4">
                <label className="text-[12px] font-semibold text-gray-700 mb-1 block">{language === 'ru' ? 'Уточнения (модель, цвет, размер…)' : "Qo'shimcha (model, rang, o'lcham…)"}</label>
                <textarea
                  rows={2}
                  value={onDemandForm.delivery_notes}
                  onChange={e => setOnDemandForm({ ...onDemandForm, delivery_notes: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-[14px] resize-none text-[14px]"
                />
              </div>

              <button
                onClick={submitOnDemand}
                disabled={onDemandSubmitting}
                className="w-full py-3.5 bg-amber-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform shadow-[0_4px_12px_rgba(245,158,11,0.3)] disabled:bg-gray-300 disabled:shadow-none"
              >
                {onDemandSubmitting
                  ? (language === 'ru' ? 'Отправка…' : "Yuborilmoqda…")
                  : (language === 'ru' ? 'Отправить заявку' : 'Arizani yuborish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL — checkout with address + phone form (Bug fix 2026-07-11) */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center" onClick={() => !orderSubmitting && setShowOrderModal(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            <div className="p-4">
              <h2 className="text-[17px] font-bold text-gray-900 mb-3">{language === 'ru' ? 'Оформление' : 'Rasmiylashtirish'}</h2>

              <div className="space-y-3 mb-3">
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">
                    {language === 'ru' ? 'Адрес доставки' : 'Yetkazish manzili'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orderForm.delivery_address}
                    onChange={e => setOrderForm({ ...orderForm, delivery_address: e.target.value })}
                    placeholder={language === 'ru' ? 'ул. Название, д. 12' : "Ko'cha nomi, uy raqami"}
                    className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">
                    {language === 'ru' ? 'Квартира' : 'Xonadon'}
                  </label>
                  <input
                    type="text"
                    value={orderForm.delivery_apartment}
                    onChange={e => setOrderForm({ ...orderForm, delivery_apartment: e.target.value })}
                    placeholder={language === 'ru' ? 'номер квартиры' : 'xonadon raqami'}
                    className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">
                    {language === 'ru' ? 'Телефон' : 'Telefon'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={orderForm.delivery_phone}
                    onChange={e => setOrderForm({ ...orderForm, delivery_phone: e.target.value })}
                    placeholder="+998 90 123-45-67"
                    className="w-full p-3 border border-gray-200 rounded-[14px] text-[14px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-gray-700 mb-1 block">
                    {language === 'ru' ? 'Комментарий' : 'Izoh'}
                  </label>
                  <textarea
                    value={orderForm.delivery_notes}
                    onChange={e => setOrderForm({ ...orderForm, delivery_notes: e.target.value })}
                    placeholder={language === 'ru' ? 'Например: домофон, этаж, время...' : "Masalan: domofon, qavat, vaqt..."}
                    className="w-full p-3 border border-gray-200 rounded-[14px] resize-none text-[14px]"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-primary-50 rounded-[14px] mb-4">
                <span className="text-[14px] font-medium text-gray-700">{language === 'ru' ? 'Итого' : 'Jami'}</span>
                <span className="text-[18px] font-extrabold text-primary-600">{fmt(cartTotal)}</span>
              </div>
              <button
                onClick={createOrder}
                disabled={orderSubmitting}
                className="w-full py-3.5 bg-primary-500 text-white rounded-[14px] font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60 shadow-[0_4px_12px_rgba(var(--brand-rgb),0.3)]"
              >
                {orderSubmitting
                  ? (language === 'ru' ? 'Отправка…' : 'Yuborilmoqda…')
                  : (language === 'ru' ? 'Подтвердить' : 'Tasdiqlash')}
              </button>
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
        // Этап 4b: on-demand — своя ветка UX. На awaiting_price/price_pending
        // прайса ещё нет, `total_amount` = 0 — прячем сумму. На price_offered
        // показываем разбивку и кнопки согласия/отказа.
        const isOnDemand = selectedOrder.order_type === 'on_demand';
        const isPriceOffered = isOnDemand && selectedOrder.status === 'price_offered';
        const isPricePreOffer =
          isOnDemand && (selectedOrder.status === 'awaiting_price' || selectedOrder.status === 'price_pending');
        const priceActionPending = priceActionOrderId === selectedOrder.id;
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
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`text-[12px] font-semibold px-3 py-1 rounded-full ${
                    selectedOrder.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    selectedOrder.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    'bg-primary-100 text-primary-700'
                  }`}>{sm.title}</span>
                  {isOnDemand && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {language === 'ru' ? 'Под привоз' : 'Buyurtma'}
                    </span>
                  )}
                  {sm.subtitle && <span className="text-[12px] text-gray-500 w-full">{sm.subtitle}</span>}
                </div>
                {/* Прогресс-бар со сборкой/доставкой имеет смысл только
                    для stock-заказа и для on-demand, доехавшего до
                    confirmed+ (price_accepted → confirmed мост). До этого
                    (awaiting_price / price_pending / price_offered) —
                    крупный текстовый статус, без «Новый → Получен». */}
                {selectedOrder.status !== 'cancelled' && si >= 0 && (
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
                {/* Причина отказа — на unavailable / price_declined /
                    cancelled менеджер мог оставить пояснение. */}
                {selectedOrder.cancellation_reason && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-[12px] text-red-800">
                    <span className="font-semibold">{language === 'ru' ? 'Причина:' : 'Sabab:'}</span> {selectedOrder.cancellation_reason}
                  </div>
                )}
              </div>

              {/* Items list */}
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                  {language === 'ru' ? `Товары (${totalQty})` : `Mahsulotlar (${totalQty})`}
                </h3>
                <div className="space-y-3">
                  {items.map((item, idx) => {
                    const unit = item.unit_price ?? item.price ?? 0;
                    // На awaiting_price / price_pending прайса ещё нет —
                    // и на бэке item.unit_price = 0 как плейсхолдер.
                    // Показывать «1 × 0 сум» жителю бессмысленно.
                    const priceUnknown = isPricePreOffer && !unit;
                    return (
                      <div key={item.id || idx} className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">
                          {item.product_image ? <img src={item.product_image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"><span className="text-lg text-white">{getProductEmoji(item.product_name || '', '')}</span></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{item.product_name || (language === 'ru' ? 'Товар' : 'Mahsulot')}</p>
                          <p className="text-[12px] text-gray-500">
                            {priceUnknown
                              ? `${item.quantity} × ${language === 'ru' ? 'цена уточняется' : 'narx aniqlanmoqda'}`
                              : `${item.quantity} × ${fmt(unit)}`}
                          </p>
                        </div>
                        {!priceUnknown && (
                          <span className="text-[13px] font-bold text-gray-900 shrink-0">{fmt(item.total_price || unit * item.quantity)}</span>
                        )}
                      </div>
                    );
                  })}
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

                {/* Этап 4b: price-offer negotiation. Разбивка (товар +
                    доставка = итого), 24-часовой дедлайн и две кнопки:
                    accept (→ POST /accept-price, заказ станет confirmed)
                    и decline (→ POST /decline-price, price_declined). */}
                {isPriceOffered && (
                  <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <div className="text-[12px] font-bold text-amber-900 uppercase tracking-wide mb-3">
                      {language === 'ru' ? 'УК назвала цену' : 'Boshqaruv narx aytdi'}
                    </div>
                    <div className="space-y-1.5 text-[13px]">
                      <div className="flex justify-between text-amber-900">
                        <span>{language === 'ru' ? 'Товар' : 'Mahsulot'}</span>
                        <span className="font-medium">{fmt(selectedOrder.total_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-amber-900">
                        <span>{language === 'ru' ? 'Доставка' : 'Yetkazish'}</span>
                        <span className="font-medium">{fmt(selectedOrder.delivery_fee || 0)}</span>
                      </div>
                      <div className="flex justify-between pt-2 mt-2 border-t border-amber-200">
                        <span className="text-[14px] font-semibold text-amber-900">{language === 'ru' ? 'Итого' : 'Jami'}</span>
                        <span className="text-[18px] font-extrabold text-amber-700">{fmt(selectedOrder.final_amount ?? (selectedOrder.total_amount || 0) + (selectedOrder.delivery_fee || 0))}</span>
                      </div>
                    </div>
                    {selectedOrder.price_offered_expires_at && (
                      <p className="mt-3 text-[12px] text-amber-800">
                        <span className="font-semibold">{language === 'ru' ? 'Ответьте до' : 'Javob bering'}</span>{' '}
                        {new Date(selectedOrder.price_offered_expires_at).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button
                        onClick={() => acceptPriceOffer(selectedOrder.id)}
                        disabled={priceActionPending}
                        className="py-3 bg-primary-600 text-white rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {priceActionPending
                          ? (language === 'ru' ? 'Отправляем…' : 'Yuborilmoqda…')
                          : (language === 'ru' ? 'Согласен' : 'Roziman')}
                      </button>
                      <button
                        onClick={() => declinePriceOffer(selectedOrder.id)}
                        disabled={priceActionPending}
                        className="py-3 bg-white text-amber-800 border border-amber-300 rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <X className="w-4 h-4" />
                        {language === 'ru' ? 'Отказаться' : 'Rad etish'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Итого прячем в pre-offer (цена ещё 0) и когда мы уже
                    показали разбивку в блоке согласования выше. */}
                {!isPricePreOffer && !isPriceOffered && (
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[15px] font-medium text-gray-600">{language === 'ru' ? 'Итого' : 'Jami'}</span>
                    <span className="text-[20px] font-extrabold text-primary-600">{fmt(selectedOrder.final_amount ?? selectedOrder.total_amount)}</span>
                  </div>
                )}

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
