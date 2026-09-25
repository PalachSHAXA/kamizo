import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Search, Heart, Package, Plus, Minus, X,
  CheckCircle, ShoppingBag, Star, ArrowLeft, ChevronLeft, Truck,
  MessageCircle, Phone,
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { CardSkeleton } from '../components/CardSkeleton';
import { SuccessScreen } from '../components/SuccessScreen';
import { PullToRefresh } from '../components/PullToRefresh';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useTenantStore } from '../stores/tenantStore';
import { useToastStore } from '../stores/toastStore';
import { useModalPresence } from '../stores/modalStore';
import { MarketplaceBottomBar } from './marketplace/MarketplaceBottomBar';
import { IS_MOCK, MOCK_CATEGORIES, MOCK_PRODUCTS } from './marketplace/__devMock';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
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

// Overlay-имя товара удалено 2026-07-11 — тот же дубликат <h3> под
// фото, что и в ProductPhoto. Оставляем только градиентный фон +
// emoji по центру.
const ProductCardPlaceholder = memo(function ProductCardPlaceholder({ name, categoryId, size = 'md' }: { name: string; categoryId: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  const gradient = CATEGORY_GRADIENTS[categoryId] || 'from-gray-400 to-gray-500';
  const emoji = getProductEmoji(name, categoryId);
  const emojiSize = { xs: 'text-xl', sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl', xl: 'text-7xl' }[size];
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(ellipse at 20% 20%, white 0%, transparent 60%)' }} />
      <span className={`${emojiSize} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg`}>{emoji}</span>
    </div>
  );
});

// `size` and `categoryId` остаются в сигнатуре для совместимости с
// call-sites'ами (все места передают их) — фактически ProductPhoto
// сейчас использует только src и name (alt). Раньше `size` управлял
// overlay-именем поверх фото (удалён 2026-07-11 как дубликат <h3>
// под фото — он затемнял картинку и на длинных названиях давал
// торчащий справа «хвост» вида «…00» через сбойный line-clamp-1
// в WKWebView).
function ProductPhoto({ src, name }: { src: string; name: string; categoryId: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  // object-contain (было object-cover) — некоторые товары раньше приходили
  // с крупными «квадратными» изображениями (типа сплэш-баннера УК), которые
  // при object-cover обрезались по краям и превращались в набор бессмысленных
  // фрагментов надписей («…mizo», «…ение домом»). Contain показывает
  // картинку целиком, центрированно, с прозрачными полями по краям
  // (bg-gray-50 их подсвечивает мягким серым фоном). Для настоящих квадратных
  // product-фото это визуально идентично object-cover.
  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-50">
      <img src={src} alt={name} loading="lazy" decoding="async" className="w-full h-full object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
  // Three-state gating (Sprint 87 v4). Route no longer carries
  // requiredFeature="marketplace" — this page decides what to render:
  //  • !hasMarketplace                       → resident-facing stub
  //  • hasMarketplace && products.length===0 → educational empty
  //  • hasMarketplace && products.length>0   → normal shop
  //
  // Selecting the DERIVED boolean via s.hasFeature('marketplace') (not
  // the hasFeature function reference) so the component re-renders
  // when tenant.config.features flips mid-session. Selecting a stable
  // function reference alone would miss the change.
  const hasMarketplace = useTenantStore(s => s.hasFeature('marketplace'));
  const tenantName = useTenantStore(s => s.config?.tenant?.name) || 'УК';
  const tenantPhone = useTenantStore(s => s.config?.tenant?.admin_phone) || null;
  const hasChatFeature = useTenantStore(s => s.hasFeature('chat'));
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'shop' | 'favorites' | 'cart' | 'orders'>('shop');
  const [categories, setCategories] = useState<MarketplaceCategoryAPI[]>([]);
  const [products, setProducts] = useState<MarketplaceProductAPI[]>([]);

  // Sticky-хедер маркета на WKWebView (Capacitor iOS) при rubber-band
  // overscroll «отклеивался» от верха. Прошли через 3 итерации:
  //   1. position:sticky — двигался при bounce.
  //   2. position:fixed + inline в MarketplacePage — тоже двигался.
  //      Причина: на iOS position:fixed внутри `overflow: auto` container'а
  //      с `-webkit-overflow-scrolling: touch` привязан к нативному
  //      scroller'у (.main-content), а не к viewport. При overscroll iOS
  //      анимирует весь scroll-контент вместе с fixed-элементом.
  //      Покадровый анализ recordVideo подтвердил: chevron_y=78 в нормале,
  //      chevron_y=138 в момент rubber-band bounce → сдвиг на 60px.
  //   3. **portal в document.body + position:fixed** — фикс работает,
  //      потому что header больше не находится внутри .main-content
  //      scroller'а. Fixed теперь относится к viewport (initial containing
  //      block), и iOS не двигает его при bounce.
  // Spacer-div остаётся внутри marketplace-page — компенсирует, что
  // header из flow вырезан (иначе product-grid начинается с top viewport).
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // Portal node — DIV прикреплённый к document.body. Он существует всё
  // время жизни компонента, что даёт header стабильный DOM-anchor вне
  // scroller'а. При unmount MarketplacePage — удаляем node из body.
  const [headerPortal, setHeaderPortal] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = document.createElement('div');
    node.setAttribute('data-marketplace-header-portal', '');
    document.body.appendChild(node);
    setHeaderPortal(node);
    return () => { document.body.removeChild(node); };
  }, []);
  // Header height measure — dependency `headerPortal`, потому что header
  // портируется в document.body ТОЛЬКО после того, как useEffect выше
  // создаст node и `setHeaderPortal` триггернёт ре-рендер. Без dependency
  // useLayoutEffect срабатывал на первом рендере (когда headerPortal=null
  // и header ещё не отрендерен) — headerRef.current был null, measure
  // не выполнялся, spacer оставался 0px, и весь контент оказывался под
  // шапкой. Теперь эффект перезапускается на 2-м рендере, когда header
  // уже присутствует в DOM (через portal), и ResizeObserver корректно
  // ставит headerHeight = реальная высота.
  useLayoutEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [headerPortal]);

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

  // Post-submit success overlay. `null` → normal render. `'on-demand'`
  // → success screen with «Заявка отправлена» copy. `'checkout'` →
  // success screen with «Заказ создан» copy. Dismissing routes the
  // user to Orders or back to Shop, replacing the prior toast+auto-
  // switch pattern for a full editorial confirmation.
  const [successKind, setSuccessKind] = useState<'on-demand' | 'checkout' | null>(null);

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
  // Cart pill (shop tab) sits on `calc(env(safe-area-inset-bottom)+12px)` —
  // just above the iOS home-indicator, no dependency on --bottom-bar-h
  // anymore (the bar is hidden here).
  useModalPresence(true);

  // Sprint 87 v11 — Android keyboard: reserve bottom space equal to
  // the reported keyboardHeight so the sheet's scrollable container
  // gains overflow, THEN scroll the focused input into view.
  //
  // Why the v10 fix didn't work: capacitor.config.ts sets
  // `Keyboard.resize:'native'`, which USED to shrink the Android
  // WebView so `100dvh` reflected the keyboard-shrunken viewport.
  // Chromium ≥ 118 changed the edge-to-edge WindowInsets behavior:
  // the plugin's setDecorFitsSystemWindows(false) no longer causes a
  // WebView resize; the keyboard is now drawn over the WebView and
  // 100dvh/100vh/100svh all keep reporting the pre-keyboard height.
  // Result: `max-h-[90dvh] overflow-y-auto` on the sheet has nothing
  // to overflow, and `scrollIntoView` from the v10 handler is a
  // silent no-op. Confirmed empirically on the emulator: the sheet's
  // top edge and top form fields are pixel-identical with and
  // without the keyboard open.
  //
  // iOS WKWebView still resizes cleanly, so this v11 fix is guarded
  // by `isNativePlatform() && getPlatform()==='android'` for the
  // padding half — no-op on iOS/web/dev. The focusin scroll runs
  // on all platforms; behavior:'auto' rather than 'smooth' because
  // a smooth scroll can be interrupted by the browser's own delayed
  // scroll adjustments and leave the caret partway.
  //
  // Strategy: use Keyboard.addListener('keyboardDidShow') to read
  // the actual keyboardHeight, write it to a CSS custom property on
  // <html> (--kz-kb-h), and consume it as `padding-bottom` on the
  // three sheet scrollers via inline style. That creates real
  // overflow. On keyboardDidHide the custom property is cleared,
  // padding collapses, sheet returns to its natural height.
  //
  // Guards: only runs while a form-bearing sheet is open (same
  // OR-chain as v10). If a NEW form-bearing sheet is added, add
  // its state to `hasFormSheetOpen` below AND add the
  // paddingBottom-consuming style to its scrollable container.
  useEffect(() => {
    const hasFormSheetOpen = showOrderModal || !!onDemandProduct || showDeliveryRatingModal;
    if (!hasFormSheetOpen) return;

    const isAndroidNative =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    // ── focusin scroll-into-view (native + web) ─────────────────
    // 300 ms because on Android keyboardDidShow can fire up to
    // ~250 ms after focusin (the OS keyboard animation), and we
    // want padding-bottom in place before we scroll. behavior:'auto'
    // is atomic — 'smooth' can be cancelled mid-flight by the
    // WebView's own scroll adjustments and lose the target.
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
      setTimeout(() => {
        try {
          target.scrollIntoView({ block: 'center', behavior: 'auto' });
        } catch {
          try { target.scrollIntoView(); } catch { /* give up */ }
        }
      }, 300);
    };
    window.addEventListener('focusin', onFocus);

    // ── native keyboard listeners (Android only) ────────────────
    // iOS's WKWebView resize path still works and dvh shrinks
    // correctly. Reserving padding on top would double-shrink the
    // sheet. So iOS skips this branch and only the focusin handler
    // above runs (matching v10 for iOS).
    //
    // Subscription race: Keyboard.addListener() returns a Promise
    // that resolves to a PluginListenerHandle. If the effect
    // cleanup runs BEFORE that promise resolves — e.g. the user
    // dismisses the sheet in <1 tick — the listener still gets
    // registered by Capacitor, but cleanup already saw a null
    // handle and did nothing. On every sheet open/close the effect
    // re-runs and stacks a new stray listener. `cancelled` flag
    // guards this: if the promise resolves after cleanup already
    // set cancelled=true, we immediately remove the just-attached
    // handle instead of storing it.
    let cancelled = false;
    let showSub: { remove: () => Promise<void> } | null = null;
    let hideSub: { remove: () => Promise<void> } | null = null;
    if (isAndroidNative) {
      const setKbHeight = (px: number) => {
        document.documentElement.style.setProperty('--kz-kb-h', `${px}px`);
      };
      // Set to 0 on start so the CSS var always has a defined value
      // (initial paint before the first keyboardDidShow fires).
      setKbHeight(0);

      Keyboard.addListener('keyboardDidShow', (info) => {
        setKbHeight(info.keyboardHeight || 0);
      })
        .then((sub) => {
          if (cancelled) {
            // Effect cleaned up before addListener resolved — remove
            // the freshly-registered handle to prevent leaks across
            // sheet open/close cycles.
            sub.remove().catch(() => {});
          } else {
            showSub = sub;
          }
        })
        .catch(() => { /* plugin unavailable / permission — no-op */ });

      Keyboard.addListener('keyboardDidHide', () => {
        setKbHeight(0);
      })
        .then((sub) => {
          if (cancelled) {
            sub.remove().catch(() => {});
          } else {
            hideSub = sub;
          }
        })
        .catch(() => { /* no-op */ });
    }

    return () => {
      // Mark first so any in-flight addListener promises that
      // resolve AFTER unmount clean themselves up (see above).
      cancelled = true;
      window.removeEventListener('focusin', onFocus);
      if (isAndroidNative) {
        document.documentElement.style.removeProperty('--kz-kb-h');
        showSub?.remove().catch(() => {});
        hideSub?.remove().catch(() => {});
      }
    };
  }, [showOrderModal, onDemandProduct, showDeliveryRatingModal]);

  const fetchData = useCallback(async () => {
    // STATE 1 gate — do NOT hit /api/marketplace/* endpoints when the
    // tenant doesn't have the feature. Every marketplace route on the
    // backend starts with requireFeature('marketplace') → 403 → error
    // toast racing the stub render. Bail before the fetch cascade.
    // setLoading(false) so the stub isn't hidden behind a spinner.
    if (!hasMarketplace) { setLoading(false); return; }
    if (IS_MOCK) {
      setCategories(MOCK_CATEGORIES);
      setProducts(MOCK_PRODUCTS.map(normalizeProduct));
      setLoading(false); return;
    }
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
  }, [user, hasMarketplace]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasActiveOrders = useMemo(
    () => orders.some(o => !['delivered', 'cancelled'].includes(o.status)),
    [orders]
  );
  useEffect(() => {
    // STATE 1 gate — no /api/marketplace/orders polling for tenants
    // without the feature (would 403 every 10s).
    if (!hasMarketplace) return;
    if (!user) return;
    if (!hasActiveOrders) return;
    const interval = setInterval(async () => {
      try {
        const r = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
        if (r?.orders) setOrders(r.orders);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [user, hasActiveOrders, hasMarketplace]);

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
      // Success feedback: full-screen <SuccessScreen> overlay instead
      // of the previous toast. Error path unchanged.
      setSuccessKind('on-demand');
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
      // Full-screen success confirmation via <SuccessScreen> — replaces
      // the toast + delayed auto-switch to Orders. The success screen's
      // primary CTA takes the resident to Orders explicitly; secondary
      // returns to the shop. Error path (toast) unchanged so failures
      // are still surfaced loudly.
      const [c, o] = await Promise.all([apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'), apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders')]);
      setCart(c?.cart || []); setOrders(o?.orders || []);
      setSuccessKind('checkout');
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

  // Sprint 87 v7 — editorial redesign helpers.
  //
  // featuredProduct — deterministic pick when 0..N products are flagged.
  //   • 0 featured (most common — no УК sets the flag today) → null →
  //     the whole featured section is skipped without collapsing layout.
  //   • ≥1 featured → newest first (created_at desc). Newest is most
  //     likely the "current promo". No sort_order column exists on
  //     marketplace_products (only on marketplace_categories), so
  //     created_at desc is the deterministic tiebreaker.
  const featuredProduct = useMemo(() => {
    if (featured.length === 0) return null;
    return [...featured].sort(
      (a, b) => (b.created_at || '').localeCompare(a.created_at || '')
    )[0];
  }, [featured]);

  // categoryMap — id → localized category name, used to derive the
  // per-card "kicker" eyebrow ("Клининг", "Для дома") from a product's
  // category_id without a backend change. Products with null
  // category_id OR a category_id that points at a deleted/inactive
  // category resolve to undefined here — the render check `{kicker &&
  // ...}` then omits the eyebrow entirely (no empty span, no gap).
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) {
      m.set(c.id, language === 'ru' ? c.name_ru : c.name_uz);
    }
    return m;
  }, [categories, language]);

  // 2026-07-11: раньше здесь стоял early-return со спиннером на пустом
  // экране пока грузились данные. Пользователи видели «бежевый экран
  // с крутилкой» — плохой UX. Теперь header/поиск/категории рендерятся
  // сразу, а вместо product-grid показывается skeleton (см. shop-таб
  // ниже). Данные пришли — skeleton заменяется реальным контентом.

  // STATE 1 branch — render the resident-facing stub instead of the
  // shop when the tenant doesn't have the marketplace feature. Placed
  // AFTER all hooks (Rules of Hooks), BEFORE the JSX so the shop-
  // specific derived state below never gets referenced. fetchData and
  // the polling effect already skipped their /api calls above, so no
  // 403 error toasts race the stub render.
  if (!hasMarketplace) {
    return (
      <MarketplaceUnavailableStub
        language={language === 'ru' ? 'ru' : 'uz'}
        tenantName={tenantName}
        tenantPhone={tenantPhone}
        hasChatFeature={hasChatFeature}
        navigate={navigate}
      />
    );
  }

  // BUG 1 (Sprint 87 v9) — hide MarketplaceBottomBar while any inline
  // sheet on this page is open. The bar sits at zIndex:1000; sheets
  // use z-[110]; without this the bar covers the sheet's primary
  // action row. `cart`/`activeTab==='cart'` is NOT a modal — it's an
  // in-page tab view — so it's intentionally excluded.
  //
  // ⚠️ MAINTENANCE: any NEW full-screen modal added to this page MUST
  // be added to this OR-chain, or the bar will start covering it again.
  // Grep for `useState.*null` + `showXxxModal` when adding modals.
  const anyModalOpen = !!(
    selectedProduct ||
    onDemandProduct ||
    showOrderModal ||
    selectedOrder ||
    showDeliveryRatingModal ||
    successKind
  );

  return (
    // marketplace-page scope class — enables dark-theme overrides in
    // index.css (bg-white → --marketplace-surface, text-gray-* →
    // --marketplace-text-*, status backdrops → dark composites).
    // Scoped so we don't bleed on other pages that use the same
    // Tailwind classes. See index.css "MarketplacePage — dark theme
    // overrides" block for the full override list.
    // Bottom padding via arbitrary Tailwind value so md:pb-0 can still
    // override it on desktop (the bar is mobile-only). ~96px covers the
    // pill height + breathing room; env(safe-area-inset-bottom) covers
    // the iOS home indicator.
    <PullToRefresh onRefresh={fetchData} disabled={anyModalOpen}>
    {/* Marketplace v10 (утверждённый макет): тёплый оранжевый градиент фона
        сверху → плоский светлый #FAF8F6 внизу. Скроллер страницы =
        родительский .main-content, поэтому градиент кладём на сам marketplace-
        page (min-h-screen гарантирует, что нижняя точка градиента ниже fold'а).
        Переменные --mp-* в index.css. */}
    <div
      className="marketplace-page pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen"
      style={{
        // Верх — тёплая оранжевая ступень градиента (под шапкой и баннером);
        // низ — гарантированно чистый #FFFFFF. Переход завершается на 55%
        // высоты (double stop #FFFFFF 55% + 100%), чтобы вся нижняя половина
        // страницы — от area после product-grid и до BottomBar — была
        // чисто белой без бежевого перехода mid2→flat. Раньше конечный
        // stop лежал на 100% и на длинных списках виднелась warmth почти
        // до самого низа.
        background:
          'linear-gradient(180deg, var(--mp-gradient-top) 0%, var(--mp-gradient-mid1) 20%, var(--mp-gradient-mid2) 35%, #FFFFFF 55%, #FFFFFF 100%)',
      }}
    >
      {/* HEADER — портируется через createPortal в document.body (см. useEffect
          с headerPortal выше). Position:fixed внутри `.main-content`
          (overflow:auto + -webkit-overflow-scrolling:touch) на iOS WKWebView
          двигается вместе со scroll-контентом при rubber-band overscroll
          (подтверждено покадрово — сдвиг ~60px в момент bounce). Портирование
          в document.body вытаскивает header из scroller'а — fixed теперь
          реально относится к viewport, а не к внутреннему нативному scroller'у. */}
      {headerPortal && createPortal((
      <div
        ref={headerRef}
        className="fixed top-0 z-40 md:hidden"
        style={{
          // left/right: -8px — safety-overhang за пределы viewport, чтобы
          // накрыть sub-pixel щели по краям, где просвечивал layout-root
          // (marketplace-bg=#FFFFFF) в местах, куда не дотягивал paint
          // marketplace-page (-mx-4 → overhang 2-8px, clip'ится
          // overflow-x:hidden на .main-content — на WKWebView sub-pixel
          // границы иногда «пилят» и оставляют светлые полосы). Fixed
          // element может быть шире viewport безопасно — браузер сам
          // clip'ит по viewport. inset-x-[-8px] не сработает в
          // arbitrary-value tailwind, поэтому через inline style.
          left: '-8px',
          right: '-8px',
          background:
            'linear-gradient(180deg, var(--mp-gradient-top) 0%, var(--mp-gradient-mid1) 55%, var(--mp-gradient-mid2) 100%)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)',
          boxShadow: '0 10px 20px -18px rgba(28,25,23,0.35)',
        }}
      >
        {/* Sprint 87 v9 — editorial header from screens/10-marketplace.html.
            Title row + Search-with-Favorites row + sliding-underline
            category tabs. Categories moved OUT of the SHOP block into
            this sticky header so they follow the design's layered
            surface; they still only render in shop mode (the favorites
            grid intentionally does not filter by category — that's the
            approved current behaviour and left untouched). */}

        {/* Title row — chevron-back + «Маркет УК.» with the period as a
            brand-orange accent, per the design. Oversized editorial
            typography (27px / 800 / -0.03em) so the marketplace has a
            hero-name feel distinct from the plain «Заявки»/«Дом»
            headers. Back-button дублирует нижний тулбар (navigate('/'))
            — «Назад» в BottomBar был единственным способом уйти
            отсюда, и это неочевидно; здесь та же логика, но в шапке. */}
        <div className="px-5 pt-3 pb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
            className="flex-shrink-0 w-[34px] h-[34px] rounded-full grid place-items-center border border-white/50 cursor-pointer transition-transform active:scale-95"
            style={{ background: 'rgba(255,255,255,0.75)', boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
          >
            <ChevronLeft className="w-[20px] h-[20px] text-gray-800" strokeWidth={2.4} />
          </button>
          <h1 className="text-[27px] font-extrabold text-gray-900" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
            {language === 'ru' ? 'Маркет УК' : 'BK marketi'}
            <span className="text-primary-500">.</span>
          </h1>
        </div>

        {/* Search + Favorites row — both are "card-material chips" per
            the design. Search input is the primary chip that filters
            products live via `searchQuery`. Избранное chip is the
            mode toggle: tap once → activeTab='favorites' (orange
            gradient bg); tap again → back to 'shop'. Count badge is
            always rendered (design shows 0 in dim state). */}
        {/* Мы больше не даём этой строке горизонтально скроллиться:
            search-input должен занять всё оставшееся место (flex:1) и не
            обрезать плейсхолдер. Fade-mask с snap-x применяем ко всем
            остальным горизонтальным табам (см. ниже), но не к этой строке
            — тут именно row-layout с двумя элементами, а не список. */}
        <div className="px-5 pb-3 flex items-center gap-2.5">
          {/* Search input styled as chip — real <input>, live filter.
              min-w-0 позволяет flex-1 контейнеру реально сжиматься на
              375px (иначе flex-child по-умолчанию min-width: auto =
              intrinsic-size input'а, и на узком экране placeholder режется
              с правого края). Раньше был min-w-[180px] — на 375
              контейнер в паре с pill «Избранное» суммарно не помещался. */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 pointer-events-none" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder={language === 'ru' ? 'Поиск товаров…' : 'Mahsulot qidirish…'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-[14px] border border-white/50 text-[13.5px] font-semibold text-gray-700 placeholder:text-gray-500 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20"
              style={{ background: 'rgba(255,255,255,0.75)', boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)', textOverflow: 'ellipsis' }}
              aria-label={language === 'ru' ? 'Поиск товаров' : 'Mahsulot qidirish'}
            />
          </div>

          {/* Favorites toggle chip. Inline gradient/shadow for the
              active state — Tailwind can't embed the exact
              `linear-gradient(150deg,...)` inline colour stops the
              design specifies. Neutral state uses the same
              card-material treatment as the search chip so the row
              reads as a matching pair. Count badge uses the same
              gradient family in inactive state; goes to 28%-opacity
              white on the orange chip when active. */}
          <button
            onClick={() => setActiveTab(activeTab === 'favorites' ? 'shop' : 'favorites')}
            className={`flex-shrink-0 h-11 px-4 rounded-[14px] flex items-center gap-2 text-[13.5px] font-bold cursor-pointer transition-all ${
              activeTab === 'favorites'
                ? 'text-white border-0'
                : 'text-gray-700 border border-white/50'
            }`}
            style={
              activeTab === 'favorites'
                ? { background: 'var(--mp-orange)', boxShadow: '0 6px 14px -6px rgba(242,98,31,0.55)' }
                : { background: 'rgba(255,255,255,0.75)', boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }
            }
            aria-label={language === 'ru' ? 'Избранное' : 'Sevimli'}
            aria-pressed={activeTab === 'favorites'}
          >
            <Heart className="w-4 h-4" fill="currentColor" />
            <span>{language === 'ru' ? 'Избранное' : 'Sevimli'}</span>
            {/* Badge с числом показываем только когда действительно есть избранное.
                Пустой "0" отнимал ширину у search-input на 375px и не нёс информации. */}
            {favorites.length > 0 && (
              <span
                className="min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-extrabold grid place-items-center text-white"
                style={{
                  background:
                    activeTab === 'favorites' ? 'rgba(255,255,255,0.28)' : 'var(--brand, #F97316)',
                }}
              >
                {favorites.length}
              </span>
            )}
          </button>
        </div>

        {/* Category text-tabs with sliding underline (design v9).
            Rendered only in shop mode — the favorites grid renders
            without category-filter semantics today and that's out of
            scope for the header rewrite. Moved here from the old
            SHOP block so the header contains all of title + search +
            categories in one sticky surface. */}
        {activeTab === 'shop' && (
          // Row-layout: пилюля «Всё» вынесена ИЗ скролл-контейнера и
          // сидит статично слева (pl-5 = 20px, как заголовок/поиск).
          // Скролл-контейнер справа держит остальные категории — fade-mask
          // и snap-scroll остаются только у него. Такое разделение —
          // надёжнее position:sticky внутри overflow-x:auto на native
          // WebKit (Capacitor iOS): sticky-элемент внутри masked scroll'а
          // на iOS Simulator иногда «мигает» и попадает под fade-градиент.
          <div className="flex items-stretch gap-2 pl-5 pb-3">
            {/* v10-макет: пилюли вместо text-tabs с underline.
                Неактивная: rgba(255,255,255,0.7) + оранжевый текст.
                Активная: сплошная var(--mp-orange) + белый текст + brand-shadow. */}
            <button
              onClick={() => setSelectedCategory(null)}
              className="flex-shrink-0 h-9 px-4 rounded-full border-0 cursor-pointer text-[13px] font-bold whitespace-nowrap transition-all"
              style={
                !selectedCategory
                  ? {
                      background: 'var(--mp-orange)',
                      color: '#FFFFFF',
                      boxShadow: '0 6px 14px -6px rgba(242,98,31,0.55)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.7)',
                      color: 'var(--mp-orange-deep)',
                    }
              }
            >
              {language === 'ru' ? 'Всё' : 'Hammasi'}
            </button>
            <div
              className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-5 min-w-0 flex-1"
              style={{
                // Fade-mask справа + snap-scroll. Левый край не маскируем:
                // «Всё» теперь снаружи и должно читаться на 100% opacity.
                WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)',
                maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)',
              }}
            >
              {categories.map(cat => {
                const on = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(on ? null : cat.id)}
                    className="flex-shrink-0 snap-start h-9 px-4 rounded-full border-0 cursor-pointer text-[13px] font-bold whitespace-nowrap transition-all"
                    style={
                      on
                        ? {
                            background: 'var(--mp-orange)',
                            color: '#FFFFFF',
                            boxShadow: '0 6px 14px -6px rgba(242,98,31,0.55)',
                          }
                        : {
                            background: 'rgba(255,255,255,0.7)',
                            color: 'var(--mp-orange-deep)',
                          }
                    }
                  >
                    {language === 'ru' ? cat.name_ru : cat.name_uz}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      ), headerPortal)}

      {/* Spacer — компенсирует высоту портированной fixed-шапки, чтобы контент
          начинался сразу под ней, а не под status bar'ом (header портирован
          в document.body → вне DOM flow marketplace-page). Высоту берём из
          ResizeObserver — она меняется от роли/safe-area/наличия ряда
          категорий. Только на мобилке (md:hidden); desktop-шапка ниже — своя,
          sticky. */}
      <div className="md:hidden" style={{ height: headerHeight, flexShrink: 0 }} aria-hidden="true" />

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

      {/* SHOP — search + categories moved to the mobile sticky header
          (design v9, md:hidden). Desktop (≥ md) does NOT render the
          mobile header, so search + categories are restored here for
          the desktop path only, using the pre-session pill-style
          markup verbatim from HEAD. Mobile hides this block (`hidden
          md:block`), desktop hides the mobile header — no overlap,
          no duplication. */}
      {activeTab === 'shop' && (
        <div className="hidden md:block px-4 pt-3 pb-4">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-[18px] h-[18px]" />
            <input type="search" inputMode="search" autoComplete="off" placeholder={language === 'ru' ? 'Поиск товаров...' : 'Mahsulot qidirish...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-[14px] bg-white border border-gray-100 text-[14px] placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={language === 'ru' ? 'Поиск товаров' : 'Mahsulot qidirish'} />
          </div>
          {/* Fade-mask + snap — тот же паттерн, что у main-header категорий выше. */}
          <div
            className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory"
            style={{
              WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)',
              maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)',
            }}
          >
            <button onClick={() => setSelectedCategory(null)} className={`flex items-center gap-1.5 px-3 py-[7px] rounded-[12px] text-[13px] font-semibold whitespace-nowrap shrink-0 snap-start ${!selectedCategory ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.3)]' : 'bg-white text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'}`}>
              <span>🏪</span><span>{language === 'ru' ? 'Все' : 'Hammasi'}</span>
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} className={`flex items-center gap-1.5 px-3 py-[7px] rounded-[12px] text-[13px] font-semibold whitespace-nowrap shrink-0 snap-start ${selectedCategory === cat.id ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(var(--brand-rgb),0.3)]' : 'bg-white text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]'}`}>
                <span>{CATEGORY_ICONS[cat.id] || '📦'}</span><span>{language === 'ru' ? cat.name_ru : cat.name_uz}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {activeTab === 'shop' && (
        // v10-макет: плавный transparent → #FFFFFF переход в первые ~90px
        // (высота под баннеры/первый ряд карточек), чтобы карточки товаров
        // лежали на однотонной белой поверхности, а не на бренд-градиенте
        // выше. Раньше был --mp-gradient-flat (#FAF8F6) — давал бежевый
        // оттенок в низу списка; теперь чистый #FFFFFF.
        <div
          className="px-4 pt-3 pb-4"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, #FFFFFF 90px, #FFFFFF 100%)',
          }}
        >
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

          {/* Sprint 87 v7 — editorial featured story. Replaces the
              old "Популярное" section (big-card + horizontal-scroll
              fallback for 2..N featured). Now: ONE deterministic
              featured product (see featuredProduct memo — newest
              is_featured product), rendered as a 260px full-bleed
              editorial card. Skipped entirely when featuredProduct
              is null — no empty card, no layout collapse. Also
              gated by !selectedCategory && !searchQuery (same as
              before) so filtered views focus on the filter result. */}
          {!selectedCategory && !searchQuery && featuredProduct && (
            <button
              onClick={() => setSelectedProduct(featuredProduct)}
              className="block w-full text-left border-none p-0 mb-5 relative overflow-hidden active:scale-[0.99] transition-transform"
              style={{
                height: 260,
                borderRadius: 28,
                background: 'linear-gradient(125deg, #EA580C 0%, #F97316 55%, #FDBA74 100%)',
                boxShadow: '0 20px 40px -18px rgba(234,88,12,0.6)',
                cursor: 'pointer',
              }}
            >
              {/* Product image OR gradient-only fallback. When
                  image_url is null, the brand gradient background
                  above is what shows — no "no image" placeholder. */}
              {featuredProduct.image_url && (
                <img
                  src={featuredProduct.image_url}
                  alt={language === 'ru' ? featuredProduct.name_ru : featuredProduct.name_uz}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ opacity: 0.85 }}
                />
              )}
              {/* Sprint 87 v8 — dark scrim so white text/kicker stay
                  legible over ANY photo, including bright/light ones
                  (e.g. clean-carpet photos on Химчистка). Darkens
                  top-left where the kicker sits AND bottom where the
                  title + price live, leaves the middle-right showcase
                  area clean. Only applied when there's actually an
                  image — the gradient-only fallback already contrasts
                  against white. */}
              {featuredProduct.image_url && (
                <div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.60) 100%)',
                  }}
                />
              )}
              <div className="absolute inset-0 box-border p-6 flex flex-col">
                {/* Kicker eyebrow — derived from category name.
                    If the product has no category, the pill is
                    just "Акция" (a generic promo label) so the
                    top-left isn't empty. Show discount only if
                    old_price is present. */}
                <div className="flex gap-2 self-start flex-wrap">
                  <span
                    className="text-[12px] font-extrabold tracking-[0.03em] text-white px-3.5 py-1.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.24)' }}
                  >
                    {(featuredProduct.category_id && categoryMap.get(featuredProduct.category_id)) ||
                      (language === 'ru' ? 'Акция' : 'Aksiya')}
                  </span>
                  {featuredProduct.old_price && (
                    <span
                      className="text-[12px] font-extrabold text-white px-3.5 py-1.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.24)' }}
                    >
                      −{Math.round((1 - featuredProduct.price / featuredProduct.old_price) * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-auto">
                  <div
                    className="text-[34px] font-extrabold text-white"
                    style={{ letterSpacing: '-0.03em', lineHeight: 1 }}
                  >
                    {language === 'ru' ? featuredProduct.name_ru : featuredProduct.name_uz}
                  </div>
                  {(featuredProduct.description_ru || featuredProduct.description_uz) && (
                    <div
                      className="text-[14.5px] font-semibold mt-2 max-w-[260px]"
                      style={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.35 }}
                    >
                      {language === 'ru'
                        ? (featuredProduct.description_ru || '')
                        : (featuredProduct.description_uz || '')}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-4">
                    <span
                      className="text-[15px] font-extrabold whitespace-nowrap px-[18px] py-2.5 rounded-full bg-white"
                      style={{ color: '#C2410C' }}
                    >
                      {featuredProduct.price === 0
                        ? (language === 'ru' ? 'Бесплатно' : 'Bepul')
                        // fmt() already appends " сум" / " so'm" (line
                        // 587) — appending it again produced «от 250 000
                        // сум сум». Just prefix «от » in ru.
                        : `${language === 'ru' ? 'от ' : ''}${fmt(featuredProduct.price)}`}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Section label + count */}
          {(filteredProducts.length > 0 || (!loading && products.length > 0)) && (
            <div className="flex items-baseline justify-between mb-3 px-0.5">
              <span className="text-[13px] font-extrabold tracking-[0.14em] uppercase text-gray-500">
                {selectedCategory
                  ? (categoryMap.get(selectedCategory) || (language === 'ru' ? 'Категория' : 'Kategoriya'))
                  : (language === 'ru' ? 'Предложения' : 'Takliflar')}
              </span>
              <span className="text-[13px] font-bold text-gray-400">
                {String(filteredProducts.length).padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Skeleton grid — показывается пока грузятся товары.
              Повторяет структуру реальной карточки (фото + 2 строки
              имени + рейтинг + цена + кнопка), 6 плейсхолдеров в той
              же сетке (2/3/4/5 колонок по breakpoint'ам). Использует
              tailwind animate-pulse, ничего экзотического.
              Условие: loading=true И грид ещё пуст (после первой
              загрузки products уже заполнены, skeleton не нужен —
              обновления идут сзади). */}
          {loading && products.length === 0 && (
            <CardSkeleton variant="marketplace-product" count={6} />
          )}

          {/* Sprint 87 v7 — editorial landscape product feed. Replaces
              the 2/3/4/5-col grid with vertical stacks of large
              landscape cards (122px cover left / body right).
              Preserves all functional behaviour:
                • Add-to-cart / quantity-stepper for stock items
                • "Заказать под привоз" for on-demand (is_on_demand=1)
                • "Нет в наличии" overlay for out-of-stock stock items
                • Discount % badge on cover when old_price is set
                • Favorite toggle in top-right of body area
                • Kicker eyebrow from category name — omitted when
                  product has no category_id or the id references a
                  deleted/inactive category (categoryMap.get returns
                  undefined → {kicker && ...} skips)
              OMITTED per Sprint 87 v7 design decision:
                • Rating (4.9 stars) — no aggregated avg_rating in
                  the /api/marketplace/products list response.
                  Adding it needs 5 lines on backend: LEFT JOIN
                  (SELECT product_id, AVG(rating) FROM marketplace_
                  reviews WHERE is_visible=1 GROUP BY product_id).
                • Sold count ("128 заказов") — no sold_count field.
                  Adding it needs LEFT JOIN (SELECT product_id, SUM
                  (quantity) FROM marketplace_order_items WHERE
                  status='delivered' GROUP BY product_id).
                Both live in a comment near the render so future
                add-back is a small task, not a rediscovery. */}
          {filteredProducts.length > 0 && (
            <div
              key={selectedCategory || searchQuery || 'all'}
              className="flex flex-col gap-4 stagger-children"
            >
              {filteredProducts.map(p => {
                const qty = getCartQty(p.id);
                const fav = favorites.includes(p.id);
                const disc = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
                // Kicker from category name — undefined if product has
                // no category_id or points at a deleted/inactive one.
                const kicker = p.category_id ? categoryMap.get(p.category_id) : undefined;
                return (
                  <div
                    key={p.id}
                    className="relative flex bg-white rounded-[24px] border border-gray-200 overflow-hidden active:scale-[0.99] transition-transform"
                    style={{
                      minHeight: 150,
                      boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)',
                    }}
                  >
                    {/* Cover — 122px landscape strip. Real image_url
                        when present, brand-orange gradient fallback
                        otherwise. Same button surface as tap-target
                        to open detail. */}
                    <button
                      onClick={() => setSelectedProduct(p)}
                      className="border-none p-0 cursor-pointer relative"
                      style={{
                        flex: '0 0 122px',
                        // Нейтральный фон, чтобы поля вокруг object-contain
                        // не резали глаз оранжевым (гpадиент оставлен только
                        // как placeholder-фон, когда image_url отсутствует).
                        background: p.image_url
                          ? '#F5F5F5'
                          : 'linear-gradient(145deg, #FDBA74, #EA580C)',
                      }}
                      aria-label={language === 'ru' ? p.name_ru : p.name_uz}
                    >
                      {p.image_url && (
                        <img
                          src={p.image_url}
                          alt={language === 'ru' ? p.name_ru : p.name_uz}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                      )}
                      {/* Priority: on-demand > discount > out-of-stock. */}
                      {p.is_on_demand && (
                        <span
                          className="absolute top-2.5 left-2.5 text-[11px] font-extrabold text-white px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(0,0,0,0.28)' }}
                        >
                          {language === 'ru' ? 'Под заказ' : 'Buyurtma'}
                        </span>
                      )}
                      {!p.is_on_demand && disc > 0 && (
                        <span
                          className="absolute top-2.5 left-2.5 text-[11px] font-extrabold text-white px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(0,0,0,0.28)' }}
                        >
                          −{disc}%
                        </span>
                      )}
                      {!p.is_on_demand && p.stock_quantity === 0 && (
                        <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center">
                          <span className="text-white text-[11px] font-bold bg-gray-900/60 px-2.5 py-1 rounded-full">
                            {language === 'ru' ? 'Нет' : "Yo'q"}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Body — kicker / title / description / price / CTA */}
                    <div className="flex-1 min-w-0 flex flex-col" style={{ padding: '14px 14px 14px 16px' }}>
                      <div className="flex items-start justify-between gap-2">
                        {/* Kicker or empty span (self-align) so the
                            heart icon stays right-flush even without
                            a category. Empty span takes 0 width. */}
                        {kicker ? (
                          <span
                            className="text-[10.5px] font-extrabold uppercase text-primary-700"
                            style={{ letterSpacing: '0.12em' }}
                          >
                            {kicker}
                          </span>
                        ) : (
                          <span aria-hidden />
                        )}
                        <button
                          onClick={() => toggleFavorite(p.id)}
                          className="bg-transparent border-none cursor-pointer p-0 -mt-0.5"
                          aria-label={language === 'ru' ? 'В избранное' : 'Sevimlilarga'}
                        >
                          <Heart
                            className={`w-[19px] h-[19px] ${fav ? 'fill-primary-500 text-primary-500' : 'text-gray-400'}`}
                            strokeWidth={1.9}
                          />
                        </button>
                      </div>
                      <div
                        className="text-[18px] font-extrabold text-gray-900 mt-1.5"
                        style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}
                      >
                        {language === 'ru' ? p.name_ru : p.name_uz}
                      </div>
                      {(p.description_ru || p.description_uz) && (
                        <div className="text-[13px] text-gray-600 mt-1 line-clamp-1">
                          {language === 'ru' ? p.description_ru : p.description_uz}
                        </div>
                      )}
                      {/* Rating + sold count would go here. See block
                          comment above the grid for the backend work
                          (~10 lines total) that lights this up. */}
                      <div className="flex items-end justify-between mt-auto pt-3">
                        <div className="flex flex-col" style={{ lineHeight: 1.05 }}>
                          {p.old_price && (
                            <span className="text-[12px] text-gray-400 line-through">
                              {fmt(p.old_price)}
                            </span>
                          )}
                          {p.is_on_demand ? (
                            <span
                              className="text-[15px] font-extrabold text-amber-600"
                              style={{ letterSpacing: '-0.01em' }}
                            >
                              {language === 'ru' ? 'По запросу' : "So'rov"}
                            </span>
                          ) : (
                            <span
                              className={`text-[19px] font-extrabold ${p.price === 0 ? 'text-green-700' : 'text-gray-900'}`}
                              style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
                            >
                              {p.price === 0
                                ? (language === 'ru' ? 'Бесплатно' : 'Bepul')
                                : fmt(p.price)}
                            </span>
                          )}
                        </div>
                        {/* CTA — priority: on-demand button > qty
                            stepper > add-to-cart button > disabled
                            (out-of-stock).
                            NOTE: gradient CTA white text on
                            from-#FB923C to-#EA580C computes to
                            ~2.85:1 contrast — fails AA-Normal but
                            matches the mockup + the pre-existing
                            bg-primary-500 pattern used across the
                            app. Palette-wide brand-contrast fix is
                            a separate ticket. */}
                        {p.is_on_demand ? (
                          <button
                            onClick={() => requestOnDemand(p)}
                            className="flex items-center gap-1.5 rounded-full text-white border-none cursor-pointer text-[13.5px] font-semibold flex-shrink-0"
                            style={{
                              height: 40,
                              padding: '0 16px 0 14px',
                              background: 'linear-gradient(150deg, #EA580C, #9A3412)',
                              boxShadow: '0 8px 16px -8px rgba(249,115,22,0.7)',
                            }}
                          >
                            <ShoppingBag className="w-4 h-4" strokeWidth={2.6} />
                            <span>{language === 'ru' ? 'Заказать' : 'Buyurtma'}</span>
                          </button>
                        ) : qty > 0 ? (
                          <div className="flex items-center gap-1.5 bg-gray-50 rounded-full p-1">
                            <button
                              onClick={() => updateCartQuantity(p.id, qty - 1)}
                              className="w-9 h-9 rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform shadow-sm border-none cursor-pointer"
                              aria-label={language === 'ru' ? 'Уменьшить количество' : 'Sonni kamaytirish'}
                            >
                              <Minus className="w-3.5 h-3.5 text-gray-600" />
                            </button>
                            <span className="text-[14px] font-bold text-gray-900 min-w-[16px] text-center">{qty}</span>
                            <button
                              onClick={() => updateCartQuantity(p.id, qty + 1)}
                              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform border-none cursor-pointer"
                              style={{ background: 'linear-gradient(150deg, #EA580C, #9A3412)' }}
                              aria-label={language === 'ru' ? 'Увеличить количество' : 'Sonni oshirish'}
                            >
                              <Plus className="w-3.5 h-3.5 text-white" strokeWidth={2.6} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(p.id)}
                            disabled={p.stock_quantity === 0}
                            className={`flex items-center gap-1.5 rounded-full border-none cursor-pointer text-[13.5px] font-semibold flex-shrink-0 ${p.stock_quantity === 0 ? 'bg-gray-100 text-gray-400' : 'text-white'}`}
                            style={{
                              height: 40,
                              padding: '0 16px 0 14px',
                              background: p.stock_quantity === 0
                                ? undefined
                                : 'linear-gradient(150deg, #FB923C, #EA580C)',
                              boxShadow: p.stock_quantity === 0
                                ? undefined
                                : '0 8px 16px -8px rgba(249,115,22,0.7)',
                            }}
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.6} />
                            <span>{language === 'ru' ? 'В корзину' : 'Savatga'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Разбор пустого состояния:
              • Если каталог пуст И user НЕ вводил ничего в поиск и не выбирал
                категорию → это реально «Каталог пока пуст» (первое посещение,
                УК ещё не завела товары).
              • Если filteredProducts=0, но user активно фильтрует (searchQuery
                или selectedCategory) → это «Ничего не найдено», даже если
                исходный каталог пуст (тогда фактически «нет товаров под ваш
                запрос»). Иначе user вводит поиск и видит бессмысленный текст
                про пустой каталог, не понимая что это связано с его запросом. */}
          {!loading && filteredProducts.length === 0 && (
            (products.length === 0 && !searchQuery && !selectedCategory) ? (
              // STATE 2 — feature enabled, catalog empty. Copy merges
              // the product pitch (previously stacked in the header as
              // a marketing tagline) with the empty-state message —
              // one coherent paragraph: what the section is → how it
              // works (delivery + payment) → current state (empty).
              // Only claims capabilities that actually ship today:
              // cash on receipt + УК-courier delivery. The ~15 min
              // figure is expectation-setting, not a contractual SLA.
              <EmptyState
                icon={<ShoppingBag className="w-12 h-12" />}
                title={language === 'ru'
                  ? 'Каталог пока пуст'
                  : "Katalog hozircha bo'sh"}
                description={language === 'ru'
                  ? 'Отборные товары по хорошим ценам для жителей ЖК. Курьер УК привозит до двери примерно за 15 минут, оплата — при получении. Как только УК добавит товары, они появятся здесь.'
                  : "JK aholisi uchun yaxshi narxlarda saralangan mahsulotlar. BK kuryeri eshikkacha taxminan 15 daqiqada olib keladi, to'lov — olgan paytda. BK tovarlar qo'shgach, ular shu yerda paydo bo'ladi."}
              />
            ) : (
              // Filter/search returned nothing — different case, so
              // different copy. Products exist in the catalog, they're
              // just hidden by current filter/search.
              <EmptyState
                icon={<ShoppingBag className="w-12 h-12" />}
                title={language === 'ru' ? 'Ничего не найдено' : 'Topilmadi'}
                description={language === 'ru'
                  ? 'Попробуйте изменить фильтр или поиск'
                  : "Filtr yoki qidiruvni o'zgartirib ko'ring"}
              />
            )
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
                        <Heart
                          className={`w-[15px] h-[15px] ${favorites.includes(p.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
                          strokeWidth={1.8}
                        />
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

      {/* Sprint 87 v8 — floating cart pill dropped. Corresponding
          shortcut lives permanently in MarketplaceBottomBar (Корзина
          tab has always-visible label + orange-gradient count badge),
          so this pill would sit right on top of it and duplicate the
          shortcut. */}

      {/* Post-submit success overlay — full-viewport confirmation for
          either on-demand or checkout submission. Fixed-position layer
          sits above every marketplace UI (bottom bar z-1000, sheets
          z-[110]) at z-[1100]. Dismisses to Orders (primary) or Shop
          (secondary). Copy differs per kind. Error paths still surface
          via toast — this only replaces the SUCCESS toast. */}
      {successKind !== null && (
        <div className="fixed inset-0 z-[1100]">
          <SuccessScreen
            variant="confirmation"
            title={successKind === 'on-demand'
              ? (language === 'ru' ? 'Заявка отправлена' : 'Ariza yuborildi')
              : (language === 'ru' ? 'Заказ создан' : 'Buyurtma yaratildi')}
            subtitle={successKind === 'on-demand'
              ? (language === 'ru'
                  ? 'УК свяжется с вами по цене и доставке.'
                  : "Boshqaruv narx va yetkazish bo'yicha siz bilan bog'lanadi.")
              : (language === 'ru'
                  ? 'Мы уже собираем ваш заказ. Отслеживайте статус в разделе «Заказы».'
                  : "Buyurtmangizni yig'a boshladik. Holatni «Buyurtmalar» bo'limida kuzatib boring.")}
            primary={{
              label: successKind === 'on-demand'
                ? (language === 'ru' ? 'Вернуться в магазин' : "Do'konga qaytish")
                : (language === 'ru' ? 'К моим заказам' : 'Buyurtmalarim'),
              onClick: () => {
                const kind = successKind;
                setSuccessKind(null);
                // On-demand → back to shop (order sits at awaiting_price
                // in Orders; feed is the natural return). Checkout →
                // Orders tab (immediately actionable status).
                setActiveTab(kind === 'on-demand' ? 'shop' : 'orders');
              },
            }}
          />
        </div>
      )}

      {/* MarketplaceBottomBar — /marketplace-scoped nav. Mounted here
          rather than in Layout because it needs the sub-tab state
          (Корзина/Заказы) that lives on this component. */}
      <MarketplaceBottomBar
        activeTab={activeTab}
        cartCount={cartCount}
        activeOrdersCount={activeOrders.length}
        language={language === 'ru' ? 'ru' : 'uz'}
        hidden={anyModalOpen}
        // Товары = shop landing = ALL products. Clear filter + search so
        // stale state from a previous session doesn't hide the storefront.
        onShop={() => { setSelectedCategory(null); setSearchQuery(''); setActiveTab('shop'); }}
        onOrders={() => setActiveTab('orders')}
        onCart={() => setActiveTab('cart')}
        onBack={() => navigate('/')}
      />

      {/* PRODUCT DETAIL */}
      {/* TODO: Refactor to use <Modal> component */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[85dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
            {/* Sticky action-bar — раньше кнопки ♥ и × были absolute поверх
                фото-контейнера и уезжали вверх вместе со скроллом. Теперь
                они в отдельном sticky top-0 ряду внутри scroll-контейнера
                модалки. bg-white/95 + backdrop-blur делает bar непрозрачным
                чтобы контент чётко уходил под него. z-10 гарантирует, что
                фото/цена не перекроют кнопки. */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-3 pt-1 pb-2"
              style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
              <button
                onClick={() => toggleFavorite(selectedProduct.id)}
                className="min-w-[44px] min-h-[44px] bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100"
                aria-label={language === 'ru' ? 'В избранное' : 'Sevimlilarga'}
              >
                <Heart className={`w-4 h-4 ${favorites.includes(selectedProduct.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
              </button>
              <button
                onClick={() => setSelectedProduct(null)}
                className="min-w-[44px] min-h-[44px] bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100"
                aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <div className="aspect-square bg-gray-50 flex items-center justify-center">
              {selectedProduct.image_url
                ? <ProductPhoto src={selectedProduct.image_url} name={language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz} categoryId={selectedProduct.category_id} size="xl" />
                : <ProductCardPlaceholder name={language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz} categoryId={selectedProduct.category_id} size="xl" />}
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
          <div
            className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto"
            style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
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
          <div
            className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto"
            style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
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
          <div
            // v11 — added max-h + overflow-y-auto to match the other
            // two sheets. Without an overflow container, the review
            // textarea at the bottom would sit behind the keyboard
            // even after we reserve padding, because a fixed-position
            // sheet with no scroll cannot expose the padded region.
            // Content is short (5 stars + label + textarea + 2
            // buttons) so 90dvh is never actually consumed.
            className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto"
            style={{ paddingBottom: 'var(--kz-kb-h, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
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
    </PullToRefresh>
  );
}

// STATE 1 stub — resident-facing full-page screen shown when the
// tenant does NOT have the marketplace feature. Deliberately does NOT
// reuse FeatureLockedModal for two reasons:
//   (a) FeatureLockedModal is `fixed inset-0 bg-black/40` — as page
//       content that renders as a dim overlay on a blank page, not as
//       a proper screen.
//   (b) FeatureLockedModal's registry copy says «Доступно на плане Pro»
//       + «Попросите УК повысить план» — that's admin-oriented plan-
//       upsell language. Residents cannot buy plans and shouldn't see
//       pricing.
//
// Copy claims only what actually works today: courier delivery by
// УК, cash on receipt. No online-payment, no delivery-time promises.
// CTA mirrors FeatureLockedModal's residentCta ladder: chat if the
// tenant has the chat feature, tel: to admin_phone otherwise, silent
// omission if neither (better than a dead link).
function MarketplaceUnavailableStub({
  language, tenantName, tenantPhone, hasChatFeature, navigate,
}: {
  language: 'ru' | 'uz';
  tenantName: string;
  tenantPhone: string | null;
  hasChatFeature: boolean;
  navigate: (to: string) => void;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const cta: 'chat' | 'phone' | null =
    hasChatFeature ? 'chat' : (tenantPhone ? 'phone' : null);

  return (
    // marketplace-page scope class — same rationale as the shop root:
    // bg-white / text-gray-* / border-gray-* here get overridden in
    // dark theme via the .marketplace-page selectors in index.css.
    <div className="marketplace-page min-h-screen bg-white">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-2">
        {/* navigate('/') not navigate(-1): if the user arrived via a
            typed URL, history is empty and navigate(-1) leaves the
            app. Always land on home. */}
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          aria-label={t('Назад', 'Orqaga')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-[16px] font-bold text-gray-900">
          {t('Маркет УК', 'BK marketi')}
        </h1>
      </div>

      <div className="px-4 pt-6 pb-24 max-w-[560px] mx-auto">
        <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8 text-primary-500" />
        </div>
        <h2 className="text-[18px] font-bold text-gray-900 text-center mb-2">
          {t(
            `${tenantName} пока не подключила маркет`,
            `${tenantName} hozircha marketni ulamagan`
          )}
        </h2>
        <p className="text-[14px] text-gray-600 leading-relaxed text-center mb-6">
          {t(
            'Когда УК подключит раздел, вы сможете заказывать товары для дома прямо в приложении. Курьер УК привозит заказ, оплата принимается при получении.',
            "BK bo'limni ulaganda, siz uy uchun tovarlarni to'g'ridan-to'g'ri ilovada buyurtma qila olasiz. BK kuryeri buyurtmani olib keladi, to'lov olgan paytda qabul qilinadi."
          )}
        </p>

        {cta === 'chat' && (
          <button
            onClick={() => navigate('/chat')}
            className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 active:scale-[0.97] transition-all touch-manipulation"
          >
            <MessageCircle className="w-4 h-4" />
            {t('Написать в УК', 'UKga yozish')}
          </button>
        )}

        {cta === 'phone' && tenantPhone && (
          <a
            href={`tel:${tenantPhone}`}
            className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] flex items-center justify-center gap-2 active:scale-[0.97] transition-all touch-manipulation"
          >
            <Phone className="w-4 h-4" />
            {t('Позвонить в УК', 'UKga qoʼngʼiroq qilish')}
          </a>
        )}

        {cta === null && (
          <p className="text-[13px] text-gray-500 text-center">
            {t(
              `Чтобы обсудить подключение — обратитесь в ${tenantName}.`,
              `Ulanishni muhokama qilish uchun — ${tenantName}ga murojaat qiling.`
            )}
          </p>
        )}
      </div>
    </div>
  );
}
