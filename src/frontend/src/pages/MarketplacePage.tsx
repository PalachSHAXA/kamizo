import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart, Search, Heart, Package, Plus, Minus, X,
  CheckCircle, ShoppingBag, Trash2, User, Star, History, XCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest } from '../services/api';

// Types for API responses (snake_case from backend)
interface MarketplaceCategoryAPI {
  id: string;
  name_ru: string;
  name_uz: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface MarketplaceProductAPI {
  id: string;
  category_id: string;
  name_ru: string;
  name_uz: string;
  description_ru?: string;
  description_uz?: string;
  price: number;
  old_price?: number;
  unit: string;
  stock_quantity: number;
  image_url?: string;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
}

interface MarketplaceCartItemAPI {
  id: string;
  product_id: string;
  quantity: number;
  added_at: string;
}

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
}

interface MarketplaceOrderItemAPI {
  id: string;
  order_id?: string;
  product_id: string;
  product_name?: string;
  product_image?: string;
  quantity: number;
  price?: number;
  unit_price?: number;
  total_price?: number;
}

type MarketplaceOrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';

// Этапы заказа для визуального трекера
const ORDER_STAGES = [
  {
    id: 'created',
    statuses: ['new'],
    labelRu: 'Новый',
    labelUz: 'Yangi',
    icon: ShoppingBag,
    descRu: 'Заказ оформлен',
    descUz: 'Buyurtma yaratildi',
  },
  {
    id: 'confirmed',
    statuses: ['confirmed'],
    labelRu: 'Назначен',
    labelUz: 'Tayinlangan',
    icon: CheckCircle,
    descRu: 'Заказ подтверждён',
    descUz: 'Buyurtma tasdiqlandi',
  },
  {
    id: 'preparing',
    statuses: ['preparing'],
    labelRu: 'Собирается',
    labelUz: 'Yig\'ilmoqda',
    icon: Package,
    descRu: 'Собираем заказ',
    descUz: 'Buyurtma yig\'ilmoqda',
  },
  {
    id: 'delivering',
    statuses: ['delivering'],
    labelRu: 'Доставляется',
    labelUz: 'Yetkazilmoqda',
    icon: User,
    descRu: 'В пути к вам',
    descUz: 'Sizga yo\'lda',
  },
  {
    id: 'ready',
    statuses: ['ready'],
    labelRu: 'Готов',
    labelUz: 'Tayyor',
    icon: CheckCircle,
    descRu: 'Готов к получению',
    descUz: 'Qabul qilishga tayyor',
  },
  {
    id: 'delivered',
    statuses: ['delivered'],
    labelRu: 'Получен',
    labelUz: 'Qabul qilindi',
    icon: CheckCircle,
    descRu: 'Заказ доставлен',
    descUz: 'Buyurtma yetkazildi',
  },
];

function getOrderStageIndex(status: MarketplaceOrderStatus): number {
  if (status === 'cancelled') return -1;
  for (let i = 0; i < ORDER_STAGES.length; i++) {
    if (ORDER_STAGES[i].statuses.includes(status)) {
      return i;
    }
  }
  return 0;
}

function getOrderStatusMessage(status: MarketplaceOrderStatus, language: 'ru' | 'uz'): { title: string; subtitle: string } {
  switch (status) {
    case 'new':
      return {
        title: language === 'ru' ? 'Заказ оформлен' : 'Buyurtma yaratildi',
        subtitle: language === 'ru' ? 'Ожидаем подтверждения' : 'Tasdiqlanishini kutmoqdamiz'
      };
    case 'confirmed':
      return {
        title: language === 'ru' ? 'Заказ принят' : 'Buyurtma qabul qilindi',
        subtitle: language === 'ru' ? 'Начинаем сборку' : 'Yig\'ishni boshlaymiz'
      };
    case 'preparing':
      return {
        title: language === 'ru' ? 'Собираем заказ' : 'Buyurtma yig\'ilmoqda',
        subtitle: language === 'ru' ? 'Скоро будет готов' : 'Tez orada tayyor bo\'ladi'
      };
    case 'ready':
      return {
        title: language === 'ru' ? 'Заказ готов' : 'Buyurtma tayyor',
        subtitle: language === 'ru' ? 'Передаём курьеру' : 'Kuryerga topshirilmoqda'
      };
    case 'delivering':
      return {
        title: language === 'ru' ? 'Курьер в пути' : 'Kuryer yo\'lda',
        subtitle: language === 'ru' ? 'Скоро будет у вас' : 'Tez orada sizda bo\'ladi'
      };
    case 'delivered':
      return {
        title: language === 'ru' ? 'Заказ доставлен' : 'Buyurtma yetkazildi',
        subtitle: language === 'ru' ? 'Приятного аппетита!' : 'Yoqimli ishtaha!'
      };
    case 'cancelled':
      return {
        title: language === 'ru' ? 'Заказ отменён' : 'Buyurtma bekor qilindi',
        subtitle: language === 'ru' ? '' : ''
      };
    default:
      return { title: '', subtitle: '' };
  }
}

const CATEGORY_ICONS: Record<string, string> = {
  cat_groceries: '🛒',
  cat_dairy: '🥛',
  cat_meat: '🥩',
  cat_bakery: '🍞',
  cat_fruits: '🍎',
  cat_beverages: '🥤',
  cat_household: '🧹',
  cat_personal: '🧴',
  cat_baby: '👶',
  cat_pets: '🐾',
  cat_frozen: '❄️',
  cat_snacks: '🍿',
};

export function MarketplacePage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  const [activeTab, setActiveTab] = useState<'shop' | 'cart' | 'orders' | 'history' | 'favorites'>('shop');
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

  // Pagination state
  const [productsPage, setProductsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Delivery rating modal state
  const [showDeliveryRatingModal, setShowDeliveryRatingModal] = useState(false);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [deliveryReview, setDeliveryReview] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch public data first (no auth required)
      const [categoriesRes, productsRes] = await Promise.all([
        apiRequest<{ categories: MarketplaceCategoryAPI[] }>('/api/marketplace/categories'),
        apiRequest<{ products: MarketplaceProductAPI[], total: number }>('/api/marketplace/products'),
      ]);

      setCategories(categoriesRes?.categories || []);
      setProducts(productsRes?.products || []);

      // Fetch user-specific data only if logged in
      if (user) {
        try {
          const [cartRes, ordersRes, favoritesRes] = await Promise.all([
            apiRequest<{ cart: MarketplaceCartItemAPI[], total: number, itemsCount: number }>('/api/marketplace/cart'),
            apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders'),
            apiRequest<{ favorites: { id: string }[] }>('/api/marketplace/favorites'),
          ]);
          setCart(cartRes?.cart || []);
          setOrders(ordersRes?.orders || []);
          setFavorites((favoritesRes?.favorites || []).map(f => f.id));
        } catch (err) {
          console.error('Error fetching user marketplace data:', err);
        }
      }
    } catch (error) {
      console.error('Error fetching marketplace data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for order status updates every 10 seconds (only if user has active orders)
  useEffect(() => {
    if (!user) return;

    const hasActiveOrders = orders.some(o => !['delivered', 'cancelled'].includes(o.status));
    if (!hasActiveOrders) return;

    const pollOrderUpdates = async () => {
      try {
        const ordersRes = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
        if (ordersRes?.orders) {
          setOrders(ordersRes.orders);
        }
      } catch (err) {
        console.error('Error polling order updates:', err);
      }
    };

    // Poll every 10 seconds for order status updates
    const interval = setInterval(pollOrderUpdates, 10000);

    return () => clearInterval(interval);
  }, [user, orders.length > 0 && orders.some(o => !['delivered', 'cancelled'].includes(o.status))]);

  // Listen for openDeliveryRatingModal event from popup notifications
  useEffect(() => {
    const handleOpenDeliveryRatingModal = (event: CustomEvent<{ orderId: string }>) => {
      const { orderId } = event.detail;
      const order = orders.find(o => o.id === orderId);
      if (order && order.status === 'delivered') {
        setRatingOrderId(orderId);
        setShowDeliveryRatingModal(true);
        sessionStorage.removeItem('open_delivery_rating_for_order');
      }
    };

    window.addEventListener('openDeliveryRatingModal', handleOpenDeliveryRatingModal as EventListener);
    return () => {
      window.removeEventListener('openDeliveryRatingModal', handleOpenDeliveryRatingModal as EventListener);
    };
  }, [orders]);

  // Check sessionStorage for pending delivery rating modal (after navigation or page load)
  useEffect(() => {
    if (orders.length === 0) return;

    const pendingOrderId = sessionStorage.getItem('open_delivery_rating_for_order');
    if (pendingOrderId) {
      const order = orders.find(o => o.id === pendingOrderId);
      if (order && order.status === 'delivered') {
        setRatingOrderId(pendingOrderId);
        setShowDeliveryRatingModal(true);
        sessionStorage.removeItem('open_delivery_rating_for_order');
      }
    }
  }, [orders]);

  // Add to cart
  const addToCart = async (productId: string, quantity: number = 1) => {
    try {
      await apiRequest('/api/marketplace/cart', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      const cartRes = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart');
      setCart(cartRes?.cart || []);
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  // Update cart quantity
  const updateCartQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(productId);
      return;
    }
    try {
      await apiRequest('/api/marketplace/cart', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      const cartRes = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart');
      setCart(cartRes?.cart || []);
    } catch (error) {
      console.error('Error updating cart:', error);
    }
  };

  // Remove from cart
  const removeFromCart = async (productId: string) => {
    try {
      await apiRequest(`/api/marketplace/cart/${productId}`, { method: 'DELETE' });
      const cartRes = await apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart');
      setCart(cartRes?.cart || []);
    } catch (error) {
      console.error('Error removing from cart:', error);
    }
  };

  // Toggle favorite
  const toggleFavorite = async (productId: string) => {
    // Optimistic update for instant UI feedback
    const isFavorite = favorites.includes(productId);
    if (isFavorite) {
      setFavorites(favorites.filter(id => id !== productId));
    } else {
      setFavorites([...favorites, productId]);
    }

    try {
      await apiRequest(`/api/marketplace/favorites/${productId}`, { method: 'POST' });
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert on error
      if (isFavorite) {
        setFavorites([...favorites, productId]);
      } else {
        setFavorites(favorites.filter(id => id !== productId));
      }
    }
  };

  // Create order
  const createOrder = async () => {
    try {
      await apiRequest('/api/marketplace/orders', {
        method: 'POST',
        body: JSON.stringify({ delivery_notes: deliveryNote }),
      });
      setOrderSuccess(true);
      setShowOrderModal(false);
      setDeliveryNote('');
      // Refresh cart and orders
      const [cartRes, ordersRes] = await Promise.all([
        apiRequest<{ cart: MarketplaceCartItemAPI[] }>('/api/marketplace/cart'),
        apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders'),
      ]);
      setCart(cartRes?.cart || []);
      setOrders(ordersRes?.orders || []);
      setTimeout(() => {
        setOrderSuccess(false);
        setActiveTab('orders');
      }, 2000);
    } catch (error) {
      console.error('Error creating order:', error);
    }
  };

  // Submit delivery rating
  const submitDeliveryRating = async () => {
    if (!ratingOrderId) return;

    try {
      setIsSubmittingRating(true);
      await apiRequest(`/api/marketplace/orders/${ratingOrderId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: deliveryRating, review: deliveryReview || undefined }),
      });

      // Refresh orders to update the rating
      const ordersRes = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
      setOrders(ordersRes?.orders || []);

      // Close modal and reset state
      setShowDeliveryRatingModal(false);
      setRatingOrderId(null);
      setDeliveryRating(5);
      setDeliveryReview('');
    } catch (error) {
      console.error('Error submitting delivery rating:', error);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Cancel order
  const cancelOrder = async (orderId: string) => {
    if (!confirm(language === 'ru' ? 'Вы уверены, что хотите отменить заказ?' : 'Buyurtmani bekor qilmoqchimisiz?')) {
      return;
    }
    try {
      setCancellingOrderId(orderId);
      await apiRequest(`/api/marketplace/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Отменено пользователем' }),
      });
      // Refresh orders
      const ordersRes = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/orders');
      setOrders(ordersRes?.orders || []);
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert(language === 'ru' ? 'Ошибка отмены заказа' : 'Buyurtmani bekor qilishda xato');
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery ||
      (language === 'ru' ? p.name_ru : p.name_uz).toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Get cart item quantity for a product
  const getCartQuantity = (productId: string) => {
    const item = cart.find(c => c.product_id === productId);
    return item?.quantity || 0;
  };

  // Calculate cart total
  const cartTotal = cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.product_id);
    return sum + (product?.price || 0) * item.quantity;
  }, 0);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(price) + ' сум';
  };

  // Split orders into active and history
  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  // Paginated products
  const paginatedProducts = filteredProducts.slice((productsPage - 1) * ITEMS_PER_PAGE, productsPage * ITEMS_PER_PAGE);
  const totalProductPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

  // Paginated active orders
  const paginatedActiveOrders = activeOrders.slice((ordersPage - 1) * ITEMS_PER_PAGE, ordersPage * ITEMS_PER_PAGE);
  const totalOrderPages = Math.ceil(activeOrders.length / ITEMS_PER_PAGE);

  // Paginated history orders
  const paginatedHistoryOrders = historyOrders.slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE);
  const totalHistoryPages = Math.ceil(historyOrders.length / ITEMS_PER_PAGE);

  const tabs = [
    { id: 'shop' as const, label: language === 'ru' ? 'Магазин' : 'Do\'kon', shortLabel: language === 'ru' ? 'Товары' : 'Do\'kon', icon: ShoppingBag },
    { id: 'cart' as const, label: language === 'ru' ? 'Корзина' : 'Savat', shortLabel: language === 'ru' ? 'Корзина' : 'Savat', icon: ShoppingCart, count: cart.length },
    { id: 'orders' as const, label: language === 'ru' ? 'Активные' : 'Faol', shortLabel: language === 'ru' ? 'Актив.' : 'Faol', icon: Package, count: activeOrders.length },
    { id: 'history' as const, label: language === 'ru' ? 'История' : 'Tarix', shortLabel: language === 'ru' ? 'Истор.' : 'Tarix', icon: History },
    { id: 'favorites' as const, label: language === 'ru' ? 'Избранное' : 'Sevimlilar', shortLabel: language === 'ru' ? 'Избр.' : 'Sevim.', icon: Heart, count: favorites.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 bg-orange-50/50"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Success Toast */}
      {orderSuccess && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>{language === 'ru' ? 'Заказ успешно создан!' : 'Buyurtma muvaffaqiyatli yaratildi!'}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="glass-card sticky top-0 z-40">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-2 sm:px-4 flex items-center justify-center gap-1 sm:gap-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{tab.shortLabel || tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-orange-500 text-white text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-20">
        {/* Shop Tab */}
        {activeTab === 'shop' && (
          <div>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={language === 'ru' ? 'Поиск товаров...' : 'Mahsulot qidirish...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${
                  !selectedCategory
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'glass-card text-gray-700 hover:bg-white/60'
                }`}
              >
                <span className="text-2xl mb-1">🏪</span>
                <span className="text-xs font-medium text-center">{language === 'ru' ? 'Все' : 'Hammasi'}</span>
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'glass-card text-gray-700 hover:bg-white/60'
                  }`}
                >
                  <span className="text-2xl mb-1">{CATEGORY_ICONS[cat.id] || '📦'}</span>
                  <span className="text-xs font-medium text-center line-clamp-1">{language === 'ru' ? cat.name_ru : cat.name_uz}</span>
                </button>
              ))}
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 gap-3">
              {paginatedProducts.map(product => {
                const cartQty = getCartQuantity(product.id);
                const isFavorite = favorites.includes(product.id);

                return (
                  <div
                    key={product.id}
                    className="glass-card overflow-hidden"
                  >
                    {/* Product Image */}
                    <div
                      className="relative aspect-square bg-gray-100 flex items-center justify-center cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                    >
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={language === 'ru' ? product.name_ru : product.name_uz}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl">
                          {CATEGORY_ICONS[product.category_id] || '📦'}
                        </span>
                      )}
                      {/* Favorite Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(product.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-white shadow-sm"
                      >
                        <Heart
                          className={`w-4 h-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
                        />
                      </button>
                      {/* Featured Badge */}
                      {product.is_featured && (
                        <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {language === 'ru' ? 'Хит' : 'Hit'}
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-gray-900 line-clamp-2 min-h-[40px]">
                        {language === 'ru' ? product.name_ru : product.name_uz}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{product.unit}</p>
                      {/* Stock indicator */}
                      <p className={`text-xs mt-1 ${
                        product.stock_quantity === 0
                          ? 'text-red-500'
                          : product.stock_quantity <= 5
                            ? 'text-amber-500'
                            : 'text-green-600'
                      }`}>
                        {product.stock_quantity === 0
                          ? (language === 'ru' ? 'Нет в наличии' : 'Mavjud emas')
                          : (language === 'ru'
                              ? `В наличии: ${product.stock_quantity} ${product.unit}`
                              : `Mavjud: ${product.stock_quantity} ${product.unit}`)
                        }
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="font-bold text-orange-600">
                            {formatPrice(product.price)}
                          </p>
                          {product.old_price && (
                            <p className="text-xs text-gray-400 line-through">
                              {formatPrice(product.old_price)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add to Cart */}
                      {cartQty > 0 ? (
                        <div className="flex items-center justify-between mt-3 bg-orange-50 rounded-lg p-1">
                          <button
                            onClick={() => updateCartQuantity(product.id, cartQty - 1)}
                            className="p-1.5 rounded-md bg-white shadow-sm"
                          >
                            <Minus className="w-4 h-4 text-orange-600" />
                          </button>
                          <span className="font-medium text-orange-600">{cartQty}</span>
                          <button
                            onClick={() => updateCartQuantity(product.id, cartQty + 1)}
                            className="p-1.5 rounded-md bg-white shadow-sm"
                          >
                            <Plus className="w-4 h-4 text-orange-600" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(product.id)}
                          disabled={product.stock_quantity === 0}
                          className={`w-full mt-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                            product.stock_quantity === 0
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-orange-500 text-white hover:bg-orange-600'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>{product.stock_quantity === 0
                            ? (language === 'ru' ? 'Нет в наличии' : 'Mavjud emas')
                            : (language === 'ru' ? 'В корзину' : 'Savatga')
                          }</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  {language === 'ru' ? 'Товары не найдены' : 'Mahsulotlar topilmadi'}
                </p>
              </div>
            )}

            {/* Pagination */}
            {totalProductPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setProductsPage(p => Math.max(1, p - 1))}
                  disabled={productsPage === 1}
                  className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">
                  {productsPage} / {totalProductPages}
                </span>
                <button
                  onClick={() => setProductsPage(p => Math.min(totalProductPages, p + 1))}
                  disabled={productsPage === totalProductPages}
                  className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cart Tab */}
        {activeTab === 'cart' && (
          <div>
            {cart.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  {language === 'ru' ? 'Корзина пуста' : 'Savat bo\'sh'}
                </p>
                <button
                  onClick={() => setActiveTab('shop')}
                  className="text-orange-600 font-medium"
                >
                  {language === 'ru' ? 'Перейти к покупкам' : 'Xaridga o\'tish'}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {cart.map(item => {
                    const product = products.find(p => p.id === item.product_id);
                    if (!product) return null;

                    return (
                      <div key={item.id} className="glass-card p-4 flex gap-3">
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <span className="text-2xl">
                              {CATEGORY_ICONS[product.category_id] || '📦'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 line-clamp-2">
                            {language === 'ru' ? product.name_ru : product.name_uz}
                          </h3>
                          <p className="text-sm text-gray-500">{product.unit}</p>
                          <p className="font-bold text-orange-600 mt-1">
                            {formatPrice(product.price * item.quantity)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <button
                              onClick={() => updateCartQuantity(product.id, item.quantity - 1)}
                              className="p-1 rounded bg-white shadow-sm"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateCartQuantity(product.id, item.quantity + 1)}
                              className="p-1 rounded bg-white shadow-sm"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cart Total */}
                <div className="glass-card p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-600">
                      {language === 'ru' ? 'Товаров:' : 'Mahsulotlar:'}
                    </span>
                    <span className="font-medium">{cart.reduce((sum, i) => sum + i.quantity, 0)} шт</span>
                  </div>
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span>{language === 'ru' ? 'Итого:' : 'Jami:'}</span>
                    <span className="text-orange-600">{formatPrice(cartTotal)}</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowOrderModal(true)}
                  className="w-full py-4 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
                >
                  {language === 'ru' ? 'Оформить заказ' : 'Buyurtma berish'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Orders Tab (Active Orders) */}
        {activeTab === 'orders' && (
          <div>
            {activeOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  {language === 'ru' ? 'Нет активных заказов' : 'Faol buyurtmalar yo\'q'}
                </p>
                <button
                  onClick={() => setActiveTab('shop')}
                  className="text-orange-600 font-medium"
                >
                  {language === 'ru' ? 'Перейти к покупкам' : 'Xaridga o\'tish'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedActiveOrders.map(order => {
                  const currentStageIndex = getOrderStageIndex(order.status);
                  const statusMessage = getOrderStatusMessage(order.status, language);
                  const canCancel = ['new', 'confirmed'].includes(order.status);

                  return (
                    <div key={order.id} className="glass-card overflow-hidden">
                      {/* Header */}
                      <div className="p-4 bg-gradient-to-r from-orange-500/10 to-amber-400/10 border-b border-orange-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-900">
                              {language === 'ru' ? 'Заказ' : 'Buyurtma'} #{order.order_number}
                            </p>
                            <p className="text-sm text-gray-500">
                              {new Date(order.created_at).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'long',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <span className="font-bold text-orange-600">
                            {formatPrice(order.total_amount)}
                          </span>
                        </div>
                      </div>

                      {/* Status Message */}
                      <div className="px-4 pt-4 pb-2 text-center">
                        <h3 className="text-lg font-bold text-gray-900">
                          {statusMessage.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {statusMessage.subtitle}
                        </p>
                      </div>

                      {/* Status Progress Chain */}
                      <div className="px-4 py-4">
                        <div className="flex items-center justify-between relative">
                          {/* Progress Line Background */}
                          <div className="absolute top-4 left-4 right-4 h-1 bg-gray-200 rounded-full" />
                          {/* Progress Line Active */}
                          <div
                            className="absolute top-4 left-4 h-1 bg-orange-500 rounded-full transition-all duration-500"
                            style={{
                              width: `calc(${Math.min((currentStageIndex / (ORDER_STAGES.length - 1)) * 100, 100)}% - 32px)`
                            }}
                          />

                          {/* Stage Icons */}
                          {ORDER_STAGES.map((stage, index) => {
                            const isCompleted = currentStageIndex >= index;
                            const isCurrent = currentStageIndex === index;
                            const StageIcon = stage.icon;

                            return (
                              <div key={stage.id} className="relative z-10 flex flex-col items-center">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                                    isCompleted
                                      ? isCurrent
                                        ? 'bg-orange-500 text-white ring-4 ring-orange-200 shadow-lg'
                                        : 'bg-orange-500 text-white'
                                      : 'bg-gray-200 text-gray-400'
                                  }`}
                                >
                                  <StageIcon className="w-4 h-4" />
                                </div>
                                <span className={`text-[10px] mt-1.5 font-medium text-center max-w-[50px] leading-tight ${
                                  isCompleted ? 'text-gray-900' : 'text-gray-400'
                                }`}>
                                  {language === 'ru' ? stage.labelRu : stage.labelUz}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Order Items List */}
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                        <p className="text-xs font-medium text-gray-700 mb-2">{language === 'ru' ? 'Товары:' : 'Mahsulotlar:'}</p>
                        <div className="space-y-2">
                          {(order.items || []).map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                {item.product_image ? (
                                  <img src={item.product_image} alt="" className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                  <span className="text-xs">📦</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-700 truncate block">
                                  {item.product_name || (language === 'ru' ? 'Товар' : 'Mahsulot')}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {item.quantity} × {(item.unit_price || item.price || 0).toLocaleString()} сум
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-sm text-gray-500">
                            {(order.items || []).reduce((sum, i) => sum + i.quantity, 0)} {language === 'ru' ? 'товаров' : 'mahsulot'}
                          </span>
                          <span className="text-sm font-semibold text-orange-600">
                            {order.total_amount.toLocaleString()} сум
                          </span>
                        </div>

                        {/* Cancel Button */}
                        {canCancel && (
                          <button
                            onClick={() => cancelOrder(order.id)}
                            disabled={cancellingOrderId === order.id}
                            className="mt-3 w-full py-2 px-4 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {cancellingOrderId === order.id ? (
                              <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            {language === 'ru' ? 'Отменить заказ' : 'Bekor qilish'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                {totalOrderPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setOrdersPage(p => Math.max(1, p - 1))}
                      disabled={ordersPage === 1}
                      className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      {ordersPage} / {totalOrderPages}
                    </span>
                    <button
                      onClick={() => setOrdersPage(p => Math.min(totalOrderPages, p + 1))}
                      disabled={ordersPage === totalOrderPages}
                      className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Tab (Delivered/Cancelled Orders) */}
        {activeTab === 'history' && (
          <div>
            {historyOrders.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  {language === 'ru' ? 'История заказов пуста' : 'Buyurtmalar tarixi bo\'sh'}
                </p>
                <button
                  onClick={() => setActiveTab('shop')}
                  className="text-orange-600 font-medium"
                >
                  {language === 'ru' ? 'Перейти к покупкам' : 'Xaridga o\'tish'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedHistoryOrders.map(order => {
                  const isCancelled = order.status === 'cancelled';
                  const isDelivered = order.status === 'delivered';

                  return (
                    <div key={order.id} className="glass-card overflow-hidden">
                      {/* Header */}
                      <div className={`p-4 border-b ${isCancelled ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900">
                                {language === 'ru' ? 'Заказ' : 'Buyurtma'} #{order.order_number}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                isCancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {isCancelled
                                  ? (language === 'ru' ? 'Отменён' : 'Bekor qilindi')
                                  : (language === 'ru' ? 'Доставлен' : 'Yetkazildi')
                                }
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">
                              {new Date(order.created_at).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                          <span className="font-bold text-gray-700">
                            {formatPrice(order.total_amount)}
                          </span>
                        </div>
                      </div>

                      {/* Order Items List */}
                      <div className="px-4 py-3">
                        <div className="space-y-2">
                          {(order.items || []).slice(0, 3).map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                {item.product_image ? (
                                  <img src={item.product_image} alt="" className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                  <span className="text-xs">📦</span>
                                )}
                              </div>
                              <span className="text-sm text-gray-700 flex-1 truncate">
                                {item.product_name || (language === 'ru' ? 'Товар' : 'Mahsulot')}
                              </span>
                              <span className="text-xs text-gray-500">×{item.quantity}</span>
                            </div>
                          ))}
                          {(order.items || []).length > 3 && (
                            <p className="text-xs text-gray-400">
                              +{(order.items || []).length - 3} {language === 'ru' ? 'ещё' : 'yana'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Rate delivery button for delivered orders without rating */}
                      {isDelivered && !order.rating && (
                        <div className="px-4 pb-4">
                          <button
                            onClick={() => {
                              setRatingOrderId(order.id);
                              setShowDeliveryRatingModal(true);
                            }}
                            className="w-full py-2 px-4 bg-orange-50 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                          >
                            <Star className="w-4 h-4" />
                            {language === 'ru' ? 'Оценить доставку' : 'Yetkazishni baholash'}
                          </button>
                        </div>
                      )}

                      {/* Show rating if exists */}
                      {isDelivered && order.rating && (
                        <div className="px-4 pb-4">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${star <= (order.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                              />
                            ))}
                            <span className="text-sm text-gray-500 ml-2">
                              {language === 'ru' ? 'Ваша оценка' : 'Sizning bahongiz'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Pagination */}
                {totalHistoryPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      {historyPage} / {totalHistoryPages}
                    </span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                      disabled={historyPage === totalHistoryPages}
                      className="p-2 rounded-lg bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Favorites Tab */}
        {activeTab === 'favorites' && (
          <div>
            {favorites.length === 0 ? (
              <div className="text-center py-12">
                <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  {language === 'ru' ? 'Избранных товаров нет' : 'Sevimli mahsulotlar yo\'q'}
                </p>
                <button
                  onClick={() => setActiveTab('shop')}
                  className="text-orange-600 font-medium"
                >
                  {language === 'ru' ? 'Перейти к покупкам' : 'Xaridga o\'tish'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {products.filter(p => favorites.includes(p.id)).map(product => {
                  const cartQty = getCartQuantity(product.id);

                  return (
                    <div key={product.id} className="glass-card overflow-hidden">
                      <div className="relative aspect-square bg-gray-100 flex items-center justify-center">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={language === 'ru' ? product.name_ru : product.name_uz}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-4xl">
                            {CATEGORY_ICONS[product.category_id] || '📦'}
                          </span>
                        )}
                        <button
                          onClick={() => toggleFavorite(product.id)}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-white shadow-sm"
                        >
                          <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                        </button>
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm text-gray-900 line-clamp-2 min-h-[40px]">
                          {language === 'ru' ? product.name_ru : product.name_uz}
                        </h3>
                        <p className="font-bold text-orange-600 mt-2">
                          {formatPrice(product.price)}
                        </p>
                        {cartQty > 0 ? (
                          <div className="flex items-center justify-between mt-3 bg-orange-50 rounded-lg p-1">
                            <button
                              onClick={() => updateCartQuantity(product.id, cartQty - 1)}
                              className="p-1.5 rounded-md bg-white shadow-sm"
                            >
                              <Minus className="w-4 h-4 text-orange-600" />
                            </button>
                            <span className="font-medium text-orange-600">{cartQty}</span>
                            <button
                              onClick={() => updateCartQuantity(product.id, cartQty + 1)}
                              className="p-1.5 rounded-md bg-white shadow-sm"
                            >
                              <Plus className="w-4 h-4 text-orange-600" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product.id)}
                            className="w-full mt-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-4 h-4" />
                            <span>{language === 'ru' ? 'В корзину' : 'Savatga'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end">
          <div className="bg-white/95 backdrop-blur-md w-full rounded-t-3xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md p-4 border-b flex items-center justify-between z-10">
              <h2 className="font-bold text-lg">
                {language === 'ru' ? selectedProduct.name_ru : selectedProduct.name_uz}
              </h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt=""
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <span className="text-6xl">
                    {CATEGORY_ICONS[selectedProduct.category_id] || '📦'}
                  </span>
                )}
              </div>

              <p className="text-gray-600 mb-4">
                {language === 'ru' ? selectedProduct.description_ru : selectedProduct.description_uz}
              </p>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-2xl font-bold text-orange-600">
                    {formatPrice(selectedProduct.price)}
                  </p>
                  {selectedProduct.old_price && (
                    <p className="text-gray-400 line-through">
                      {formatPrice(selectedProduct.old_price)}
                    </p>
                  )}
                </div>
                <p className="text-gray-500">{selectedProduct.unit}</p>
              </div>

              {selectedProduct.stock_quantity > 0 ? (
                <p className="text-green-600 text-sm mb-4">
                  {language === 'ru' ? 'В наличии' : 'Mavjud'}
                </p>
              ) : (
                <p className="text-red-600 text-sm mb-4">
                  {language === 'ru' ? 'Нет в наличии' : 'Mavjud emas'}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => toggleFavorite(selectedProduct.id)}
                  className="p-3 border rounded-xl"
                >
                  <Heart
                    className={`w-6 h-6 ${
                      favorites.includes(selectedProduct.id)
                        ? 'fill-red-500 text-red-500'
                        : 'text-gray-400'
                    }`}
                  />
                </button>
                <button
                  onClick={() => {
                    addToCart(selectedProduct.id);
                    setSelectedProduct(null);
                  }}
                  disabled={selectedProduct.stock_quantity === 0}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>{language === 'ru' ? 'Добавить в корзину' : 'Savatga qo\'shish'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {language === 'ru' ? 'Оформление заказа' : 'Buyurtmani rasmiylashtirish'}
              </h2>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  {language === 'ru' ? 'Адрес доставки:' : 'Yetkazish manzili:'}
                </p>
                <p className="font-medium">
                  {user?.address || 'Адрес не указан'}, {language === 'ru' ? 'кв.' : 'xonadon'} {user?.apartment || '-'}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">
                  {language === 'ru' ? 'Комментарий к заказу:' : 'Buyurtmaga izoh:'}
                </label>
                <textarea
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder={language === 'ru' ? 'Например: позвоните за 10 минут до доставки' : 'Masalan: yetkazishdan 10 daqiqa oldin qo\'ng\'iroq qiling'}
                  className="w-full p-3 border rounded-xl resize-none"
                  rows={3}
                />
              </div>

              <div className="bg-orange-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">
                    {language === 'ru' ? 'Итого к оплате:' : 'To\'lanishi kerak:'}
                  </span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatPrice(cartTotal)}
                  </span>
                </div>
              </div>

              <button
                onClick={createOrder}
                className="w-full py-4 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
              >
                {language === 'ru' ? 'Подтвердить заказ' : 'Buyurtmani tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Rating Modal */}
      {showDeliveryRatingModal && ratingOrderId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-orange-500 to-amber-500">
              <h2 className="text-lg font-bold text-white">
                {language === 'ru' ? 'Оцените доставку' : 'Yetkazishni baholang'}
              </h2>
              <button
                onClick={() => {
                  setShowDeliveryRatingModal(false);
                  setRatingOrderId(null);
                  setDeliveryRating(5);
                  setDeliveryReview('');
                }}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6">
              {/* Order Info */}
              <div className="bg-orange-50 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">
                      {language === 'ru' ? 'Заказ' : 'Buyurtma'}
                    </div>
                    <div className="font-semibold text-gray-900">
                      #{orders.find(o => o.id === ratingOrderId)?.order_number || ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Star Rating */}
              <div className="text-center mb-6">
                <p className="text-sm text-gray-600 mb-4">
                  {language === 'ru' ? 'Как вам качество доставки?' : 'Yetkazish sifati qanday edi?'}
                </p>
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setDeliveryRating(star)}
                      className="p-1 active:scale-90 transition-transform touch-manipulation"
                    >
                      <Star
                        className={`w-10 h-10 ${
                          star <= deliveryRating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="text-sm font-medium text-gray-700">
                  {deliveryRating === 5 && (language === 'ru' ? 'Отлично!' : 'Ajoyib!')}
                  {deliveryRating === 4 && (language === 'ru' ? 'Хорошо' : 'Yaxshi')}
                  {deliveryRating === 3 && (language === 'ru' ? 'Нормально' : 'O\'rtacha')}
                  {deliveryRating === 2 && (language === 'ru' ? 'Плохо' : 'Yomon')}
                  {deliveryRating === 1 && (language === 'ru' ? 'Очень плохо' : 'Juda yomon')}
                </div>
              </div>

              {/* Review textarea */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Отзыв (необязательно)' : 'Sharh (ixtiyoriy)'}
                </label>
                <textarea
                  value={deliveryReview}
                  onChange={(e) => setDeliveryReview(e.target.value)}
                  placeholder={language === 'ru' ? 'Напишите отзыв о доставке...' : 'Yetkazish haqida sharh yozing...'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              {/* Submit button */}
              <button
                onClick={submitDeliveryRating}
                disabled={isSubmittingRating}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingRating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    {language === 'ru' ? 'Отправить оценку' : 'Bahoni yuborish'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
