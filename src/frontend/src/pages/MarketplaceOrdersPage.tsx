import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart, Search, ChevronRight, X, CheckCircle, Package, Phone, MapPin, UserPlus, User, Star, ShoppingBag
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { formatName } from '../utils/formatName';
import { useLanguageStore } from '../stores/languageStore';
import { useExecutorStore } from '../stores/dataStore';
import { apiRequest } from '../services/api';

// Types for API responses
interface MarketplaceOrderAPI {
  id: string;
  order_number: string;
  user_id: string;
  user_name?: string;
  user_phone?: string;
  delivery_address?: string;
  apartment?: string;
  status: MarketplaceOrderStatus;
  executor_id?: string;
  executor_name?: string;
  executor_phone?: string;
  items: MarketplaceOrderItemAPI[];
  total_amount: number;
  final_amount: number;
  items_count: number;
  delivery_notes?: string;
  created_at: string;
  rating?: number;
  review?: string;
}

interface MarketplaceOrderItemAPI {
  id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  product_image?: string;
  quantity: number;
  unit_price: number;
}

type MarketplaceOrderStatus =
  // Stock lifecycle
  | 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled'
  // On-demand lifecycle, migration 054
  | 'awaiting_price' | 'price_pending' | 'price_offered'
  | 'price_accepted' | 'price_declined' | 'unavailable';

// Staff-view labels — deliberately different wording from the
// resident-view MARKETPLACE_ORDER_STATUS_LABELS in types/marketplace.ts
// (e.g. confirmed = «Назначен» here vs «Подтверждён» there).
// Kept as a duplicate rather than deduped; see plan Section "Дедуп-техдолг".
const ORDER_STATUS_LABELS: Record<MarketplaceOrderStatus, { label: string; labelUz: string; color: string }> = {
  // Stock lifecycle
  new: { label: 'Новый', labelUz: 'Yangi', color: 'blue' },
  confirmed: { label: 'Назначен', labelUz: 'Tayinlangan', color: 'indigo' },
  preparing: { label: 'Собирается', labelUz: 'Yig\'ilmoqda', color: 'yellow' },
  ready: { label: 'Готов', labelUz: 'Tayyor', color: 'orange' },
  delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'purple' },
  delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'green' },
  cancelled: { label: 'Отменён', labelUz: 'Bekor qilindi', color: 'red' },
  // On-demand lifecycle — staff-focused labels
  awaiting_price: { label: 'Новая заявка на товар', labelUz: 'Yangi mahsulot arizasi',   color: 'gray' },
  price_pending:  { label: 'Узнаю цену',            labelUz: 'Narxni aniqlamoqda',       color: 'amber' },
  price_offered:  { label: 'Ждём ответ клиента',    labelUz: 'Mijoz javobini kutmoqda',  color: 'blue' },
  price_accepted: { label: 'Клиент согласился',     labelUz: "Mijoz rozi bo'ldi",        color: 'green' },
  price_declined: { label: 'Клиент отказался',      labelUz: 'Mijoz rad etdi',           color: 'red' },
  unavailable:    { label: 'Не смогли достать',     labelUz: "Topib bo'lmadi",           color: 'gray' },
};

const ORDER_STATUS_FLOW: MarketplaceOrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered'];

const STATUS_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  // Added for on-demand badges (awaiting_price / unavailable → gray,
  // price_pending → amber). Without these two, new badges would fall
  // through Record<string,string>'s implicit undefined and render as
  // an unstyled span.
  gray:  'bg-gray-100 text-gray-700',
  amber: 'bg-amber-100 text-amber-700',
};

export function MarketplaceOrdersPage() {
  const { language } = useLanguageStore();
  const executors = useExecutorStore(s => s.executors);
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);

  const [orders, setOrders] = useState<MarketplaceOrderAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MarketplaceOrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrderAPI | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<MarketplaceOrderAPI | null>(null);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest<{ orders: MarketplaceOrderAPI[] }>('/api/marketplace/admin/orders');
      setOrders(response?.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchExecutors(true); // Fetch all executors including couriers
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchExecutors]);

  // Assign executor (backend automatically sets status to 'confirmed')
  const assignExecutor = async (orderId: string, executorId: string) => {
    try {
      await apiRequest(`/api/marketplace/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ executor_id: executorId }),
      });
      await fetchOrders();
      setShowAssignModal(null);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error assigning executor:', error);
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId: string, newStatus: MarketplaceOrderStatus) => {
    try {
      await apiRequest(`/api/marketplace/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch = !searchQuery ||
      order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'uz-UZ').format(price) + (language === 'ru' ? ' сум' : ' so\'m');
  };

  // Count orders by status
  const newOrdersCount = orders.filter(o => o.status === 'new').length;
  const inProgressCount = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length;
  const deliveringCount = orders.filter(o => o.status === 'delivering').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — Sprint 44: brand-orange avatar */}
      <div className="bg-white border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {language === 'ru' ? 'Заказы магазина' : "Do'kon buyurtmalari"}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {language === 'ru' ? 'Назначение и отслеживание' : 'Tayinlash va kuzatish'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {/* Quick Stats — три в ряд на всех устройствах (было стопкой на
          мобилке). Икона сверху / число крупно / подпись — как на
          дашборде marketplace_manager для консистентности. */}
      <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-lg border border-white/60 cursor-pointer hover:border-white transition-all flex flex-col items-start gap-1.5"
          onClick={() => setStatusFilter('new')}
        >
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{newOrdersCount}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{language === 'ru' ? 'Новых' : 'Yangi'}</p>
        </div>
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-lg border border-white/60 cursor-pointer hover:border-white transition-all flex flex-col items-start gap-1.5"
          onClick={() => setStatusFilter('confirmed')}
        >
          <div className="p-1.5 bg-yellow-100 rounded-lg">
            <Package className="w-3.5 h-3.5 text-yellow-600" />
          </div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{inProgressCount}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{language === 'ru' ? 'В работе' : 'Ishda'}</p>
        </div>
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-lg border border-white/60 cursor-pointer hover:border-white transition-all flex flex-col items-start gap-1.5"
          onClick={() => setStatusFilter('delivering')}
        >
          <div className="p-1.5 bg-purple-100 rounded-lg">
            <User className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{deliveringCount}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{language === 'ru' ? 'Доставка' : 'Yetkazish'}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 pb-4">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={language === 'ru' ? 'Поиск заказов...' : 'Buyurtma qidirish...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {language === 'ru' ? 'Все' : 'Hammasi'} ({orders.length})
          </button>
          {Object.entries(ORDER_STATUS_LABELS).map(([key, val]) => {
            const count = orders.filter(o => o.status === key).length;
            if (count === 0 && key !== statusFilter) return null;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key as MarketplaceOrderStatus)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {language === 'ru' ? val.label : val.labelUz} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List */}
      <div className="px-4 pb-24 space-y-3">
        {filteredOrders.map(order => {
          const statusInfo = ORDER_STATUS_LABELS[order.status];

          return (
            <div key={order.id} className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-white/60 overflow-hidden">
              <div
                className="p-4 cursor-pointer"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">#{order.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusInfo?.color] || 'bg-gray-100 text-gray-700'}`}>
                      {language === 'ru' ? statusInfo?.label : statusInfo?.labelUz}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Phone className="w-4 h-4" />
                  <span>{order.user_name || 'Клиент'}</span>
                  {order.user_phone && <span className="text-gray-400">• {order.user_phone}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="w-4 h-4" />
                  <span>{order.delivery_address || 'Адрес не указан'}{order.apartment ? `, кв. ${order.apartment}` : ''}</span>
                </div>

                {/* Executor info */}
                {order.executor_name && (
                  <div className="flex items-center gap-2 text-sm text-indigo-600 mt-2">
                    <User className="w-4 h-4" />
                    <span>{language === 'ru' ? 'Исполнитель:' : 'Ijrochi:'} {formatName(order.executor_name)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{order.items_count || order.items?.length || 0} товаров</span>
                    <span className="font-bold text-primary-600">{formatPrice(order.final_amount || order.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Action button - assign if new, otherwise no quick action */}
              {order.status === 'new' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAssignModal(order);
                  }}
                  className="w-full py-3 bg-primary-50 text-primary-600 font-medium border-t hover:bg-primary-100 transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}
                </button>
              )}
            </div>
          );
        })}

        {filteredOrders.length === 0 && (
          <EmptyState
            icon={<ShoppingBag className="w-12 h-12" />}
            title={language === 'ru' ? 'Заказов нет' : 'Buyurtmalar yo\'q'}
            description={language === 'ru' ? 'Новые заказы появятся здесь' : 'Yangi buyurtmalar bu yerda paydo bo\'ladi'}
          />
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 border-b flex items-center justify-between z-10">
              <h2 className="font-bold text-lg">
                {language === 'ru' ? 'Заказ' : 'Buyurtma'} #{selectedOrder.order_number}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {/* Status Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  {ORDER_STATUS_FLOW.slice(0, 5).map((status, index) => {
                    const currentIndex = ORDER_STATUS_FLOW.indexOf(selectedOrder.status);
                    const isCompleted = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    const StatusIcon = index === 0 ? ShoppingCart : index === 1 ? UserPlus : index === 2 ? Package : index === 3 ? User : CheckCircle;

                    return (
                      <div key={status} className="flex flex-col items-center flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'
                        } ${isCurrent ? 'ring-2 ring-primary-300 ring-offset-2' : ''}`}>
                          <StatusIcon className="w-4 h-4" />
                        </div>
                        <span className={`text-xs mt-1 text-center ${isCompleted ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                          {language === 'ru' ? ORDER_STATUS_LABELS[status].label : ORDER_STATUS_LABELS[status].labelUz}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center mt-2">
                  {ORDER_STATUS_FLOW.slice(0, 4).map((status, index) => {
                    const currentIndex = ORDER_STATUS_FLOW.indexOf(selectedOrder.status);
                    const isCompleted = index < currentIndex;
                    return (
                      <div key={status} className={`flex-1 h-1 ${isCompleted ? 'bg-primary-600' : 'bg-gray-200'} ${index === 0 ? 'rounded-l-full' : ''} ${index === 3 ? 'rounded-r-full' : ''}`} />
                    );
                  })}
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                  {language === 'ru' ? 'Клиент' : 'Mijoz'}
                </h4>
                <h3 className="font-medium text-gray-900 mb-1">{selectedOrder.user_name || 'Клиент'}</h3>
                {selectedOrder.user_phone && (
                  <a href={`tel:${selectedOrder.user_phone}`} className="flex items-center gap-2 text-sm text-blue-600 mb-1">
                    <Phone className="w-4 h-4" />
                    {selectedOrder.user_phone}
                  </a>
                )}
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {selectedOrder.delivery_address || 'Адрес не указан'}{selectedOrder.apartment ? `, кв. ${selectedOrder.apartment}` : ''}
                </p>
                {selectedOrder.delivery_notes && (
                  <p className="text-sm text-gray-500 mt-2 italic">
                    "{selectedOrder.delivery_notes}"
                  </p>
                )}
              </div>

              {/* Executor Info */}
              {selectedOrder.executor_name ? (
                <div className="bg-indigo-50 rounded-2xl p-4 mb-4">
                  <h4 className="text-xs font-medium text-indigo-600 uppercase mb-2">
                    {language === 'ru' ? 'Исполнитель' : 'Ijrochi'}
                  </h4>
                  <h3 className="font-medium text-gray-900 mb-1" title={selectedOrder.executor_name}>{formatName(selectedOrder.executor_name)}</h3>
                  {selectedOrder.executor_phone && (
                    <a href={`tel:${selectedOrder.executor_phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                      <Phone className="w-4 h-4" />
                      {selectedOrder.executor_phone}
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 rounded-2xl p-4 mb-4">
                  <p className="text-sm text-yellow-700 text-center">
                    {language === 'ru' ? 'Исполнитель не назначен' : 'Ijrochi tayinlanmagan'}
                  </p>
                </div>
              )}

              {/* Order Items */}
              <h3 className="font-medium text-gray-900 mb-3">
                {language === 'ru' ? 'Товары' : 'Mahsulotlar'}
              </h3>
              <div className="space-y-3 mb-4">
                {(selectedOrder.items || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-white rounded-2xl p-3 border">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {item.product_image ? (
                        <img src={item.product_image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {item.product_name || 'Товар'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.quantity} x {formatPrice(item.unit_price)}
                      </p>
                    </div>
                    <span className="font-bold text-gray-900">
                      {formatPrice(item.quantity * item.unit_price)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-primary-50 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    {language === 'ru' ? 'Итого:' : 'Jami:'}
                  </span>
                  <span className="text-xl font-bold text-primary-600">
                    {formatPrice(selectedOrder.final_amount || selectedOrder.total_amount)}
                  </span>
                </div>
              </div>

              {/* Rating and Review */}
              {selectedOrder.status === 'delivered' && selectedOrder.rating && (
                <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-200">
                  <h3 className="font-medium text-yellow-800 mb-2">
                    {language === 'ru' ? 'Оценка клиента' : 'Mijoz bahosi'}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${star <= selectedOrder.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                    <span className="text-lg font-semibold text-yellow-700">{selectedOrder.rating}/5</span>
                  </div>
                  {selectedOrder.review && (
                    <p className="text-sm text-yellow-700">
                      <span className="font-medium">{language === 'ru' ? 'Отзыв: ' : 'Sharh: '}</span>
                      {selectedOrder.review}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {selectedOrder.status === 'new' && (
                  <button
                    onClick={() => setShowAssignModal(selectedOrder)}
                    className="flex-1 py-3 bg-primary-600 text-white rounded-2xl font-medium flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-5 h-5" />
                    {language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}
                  </button>
                )}
                {selectedOrder.status === 'new' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'cancelled')}
                    className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-medium"
                  >
                    {language === 'ru' ? 'Отменить' : 'Bekor'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Executor Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 border-b flex items-center justify-between z-10">
              <h2 className="font-bold text-lg">
                {language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}
              </h2>
              <button
                onClick={() => setShowAssignModal(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                {language === 'ru'
                  ? `Выберите исполнителя для заказа #${showAssignModal.order_number}`
                  : `#${showAssignModal.order_number} buyurtmasi uchun ijrochi tanlang`}
              </p>

              <div className="space-y-2">
                {executors.filter(e => e.status !== 'offline' && e.specialization === 'courier').map(executor => (
                  <button
                    key={executor.id}
                    onClick={() => assignExecutor(showAssignModal.id, executor.id)}
                    className="w-full p-4 bg-gray-50 rounded-2xl flex items-center gap-3 hover:bg-primary-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{executor.name}</p>
                      {executor.phone && (
                        <a
                          href={`tel:${executor.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-gray-500 hover:text-primary-600 active:text-primary-700 touch-manipulation"
                        >
                          {executor.phone}
                        </a>
                      )}
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-xs ${executor.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {executor.status === 'available' ? (language === 'ru' ? 'Доступен' : 'Bo\'sh') : (language === 'ru' ? 'Занят' : 'Band')}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                ))}

                {executors.filter(e => e.status !== 'offline' && e.specialization === 'courier').length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    {language === 'ru' ? 'Нет доступных исполнителей' : 'Mavjud ijrochilar yo\'q'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
