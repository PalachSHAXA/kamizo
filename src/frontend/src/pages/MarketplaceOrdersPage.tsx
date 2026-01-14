import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart, Search, ChevronRight, X, CheckCircle, Truck, ChefHat, Package, Phone, MapPin, UserPlus, User
} from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
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
}

interface MarketplaceOrderItemAPI {
  id: string;
  order_id: string;
  product_id: string;
  product_name_ru?: string;
  product_name_uz?: string;
  product_image?: string;
  quantity: number;
  unit_price: number;
}

type MarketplaceOrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';

const ORDER_STATUS_LABELS: Record<MarketplaceOrderStatus, { label: string; labelUz: string; color: string }> = {
  new: { label: 'Новый', labelUz: 'Yangi', color: 'blue' },
  confirmed: { label: 'Назначен', labelUz: 'Tayinlangan', color: 'indigo' },
  preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'yellow' },
  ready: { label: 'Готов', labelUz: 'Tayyor', color: 'orange' },
  delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'purple' },
  delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'green' },
  cancelled: { label: 'Отменён', labelUz: 'Bekor qilindi', color: 'red' },
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
};

export function MarketplaceOrdersPage() {
  const { language } = useLanguageStore();
  const { executors } = useDataStore();

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

      // For each order, fetch items
      const ordersWithItems = await Promise.all(
        (response?.orders || []).map(async (order) => {
          try {
            const itemsRes = await apiRequest<{ items: MarketplaceOrderItemAPI[] }>(`/api/marketplace/orders/${order.id}/items`);
            return { ...order, items: itemsRes?.items || [] };
          } catch {
            return { ...order, items: [] };
          }
        })
      );

      setOrders(ordersWithItems);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Assign executor
  const assignExecutor = async (orderId: string, executorId: string) => {
    try {
      await apiRequest(`/api/marketplace/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ executor_id: executorId }),
      });
      // Also update status to confirmed
      await apiRequest(`/api/marketplace/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
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
    return new Intl.NumberFormat('ru-RU').format(price) + ' сум';
  };

  // Count orders by status
  const newOrdersCount = orders.filter(o => o.status === 'new').length;
  const inProgressCount = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length;
  const deliveringCount = orders.filter(o => o.status === 'delivering').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          {language === 'ru' ? 'Заказы магазина' : 'Do\'kon buyurtmalari'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {language === 'ru' ? 'Назначение и отслеживание заказов' : 'Buyurtmalarni tayinlash va kuzatish'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <div
          className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('new')}
        >
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{newOrdersCount}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'Новых' : 'Yangi'}</p>
            </div>
          </div>
        </div>
        <div
          className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('confirmed')}
        >
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ChefHat className="w-4 h-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{inProgressCount}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'В работе' : 'Ishda'}</p>
            </div>
          </div>
        </div>
        <div
          className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setStatusFilter('delivering')}
        >
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Truck className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{deliveringCount}</p>
              <p className="text-xs text-gray-500">{language === 'ru' ? 'Доставка' : 'Yetkazish'}</p>
            </div>
          </div>
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
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-orange-600 text-white'
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
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-orange-600 text-white'
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
      <div className="px-4 pb-20 space-y-3">
        {filteredOrders.map(order => {
          const statusInfo = ORDER_STATUS_LABELS[order.status];

          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
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
                    <span>{language === 'ru' ? 'Исполнитель:' : 'Ijrochi:'} {order.executor_name}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{order.items_count || order.items?.length || 0} товаров</span>
                    <span className="font-bold text-orange-600">{formatPrice(order.final_amount || order.total_amount)}</span>
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
                  className="w-full py-3 bg-orange-50 text-orange-600 font-medium border-t hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}
                </button>
              )}
            </div>
          );
        })}

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {language === 'ru' ? 'Заказов нет' : 'Buyurtmalar yo\'q'}
            </p>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
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
                    const StatusIcon = index === 0 ? ShoppingCart : index === 1 ? UserPlus : index === 2 ? ChefHat : index === 3 ? Truck : CheckCircle;

                    return (
                      <div key={status} className="flex flex-col items-center flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-400'
                        } ${isCurrent ? 'ring-2 ring-orange-300 ring-offset-2' : ''}`}>
                          <StatusIcon className="w-4 h-4" />
                        </div>
                        <span className={`text-xs mt-1 text-center ${isCompleted ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
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
                      <div key={status} className={`flex-1 h-1 ${isCompleted ? 'bg-orange-600' : 'bg-gray-200'} ${index === 0 ? 'rounded-l-full' : ''} ${index === 3 ? 'rounded-r-full' : ''}`} />
                    );
                  })}
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
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
                <div className="bg-indigo-50 rounded-xl p-4 mb-4">
                  <h4 className="text-xs font-medium text-indigo-600 uppercase mb-2">
                    {language === 'ru' ? 'Исполнитель' : 'Ijrochi'}
                  </h4>
                  <h3 className="font-medium text-gray-900 mb-1">{selectedOrder.executor_name}</h3>
                  {selectedOrder.executor_phone && (
                    <a href={`tel:${selectedOrder.executor_phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                      <Phone className="w-4 h-4" />
                      {selectedOrder.executor_phone}
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 rounded-xl p-4 mb-4">
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
                  <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-3 border">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {item.product_image ? (
                        <img src={item.product_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {language === 'ru' ? item.product_name_ru : item.product_name_uz}
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
              <div className="bg-orange-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    {language === 'ru' ? 'Итого:' : 'Jami:'}
                  </span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatPrice(selectedOrder.final_amount || selectedOrder.total_amount)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {selectedOrder.status === 'new' && (
                  <button
                    onClick={() => setShowAssignModal(selectedOrder)}
                    className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-5 h-5" />
                    {language === 'ru' ? 'Назначить исполнителя' : 'Ijrochi tayinlash'}
                  </button>
                )}
                {selectedOrder.status === 'new' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'cancelled')}
                    className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-medium"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl max-h-[80vh] overflow-y-auto">
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
                {executors.filter(e => e.status !== 'offline').map(executor => (
                  <button
                    key={executor.id}
                    onClick={() => assignExecutor(showAssignModal.id, executor.id)}
                    className="w-full p-4 bg-gray-50 rounded-xl flex items-center gap-3 hover:bg-orange-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{executor.name}</p>
                      <p className="text-sm text-gray-500">{executor.phone}</p>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-xs ${executor.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {executor.status === 'available' ? (language === 'ru' ? 'Доступен' : 'Bo\'sh') : (language === 'ru' ? 'Занят' : 'Band')}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                ))}

                {executors.filter(e => e.status !== 'offline').length === 0 && (
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
