import { useState, useCallback } from 'react';
import { apiRequest } from '../../../services/api';
import { useToastStore } from '../../../stores/toastStore';
import { useLanguageStore } from '../../../stores/languageStore';
import type { MarketplaceOrder } from './types';

export function useMarketplaceOrders() {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

  // Marketplace orders (assigned to me - active only)
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  // Available marketplace orders (not assigned)
  const [availableMarketplaceOrders, setAvailableMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  // Delivered marketplace orders
  const [deliveredMarketplaceOrders, setDeliveredMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedMarketplaceOrder, setSelectedMarketplaceOrder] = useState<MarketplaceOrder | null>(null);

  // Split marketplace orders into assigned (confirmed) and active (preparing, ready, delivering)
  const assignedMarketplaceOrders = marketplaceOrders.filter(o => o.status === 'confirmed');
  const activeMarketplaceOrders = marketplaceOrders.filter(o => ['preparing', 'ready', 'delivering'].includes(o.status));
  // Completed orders are from separate deliveredMarketplaceOrders state
  const completedMarketplaceOrders = deliveredMarketplaceOrders;

  // Fetch marketplace orders (my orders)
  const fetchMarketplaceOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const response = await apiRequest('/api/marketplace/executor/orders') as { orders: MarketplaceOrder[] };
      setMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch marketplace orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  // Fetch available marketplace orders
  const fetchAvailableMarketplaceOrders = useCallback(async () => {
    try {
      const response = await apiRequest('/api/marketplace/executor/available') as { orders: MarketplaceOrder[] };
      setAvailableMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch available marketplace orders:', error);
    }
  }, []);

  // Fetch delivered marketplace orders
  const fetchDeliveredMarketplaceOrders = useCallback(async () => {
    try {
      const response = await apiRequest('/api/marketplace/executor/delivered') as { orders: MarketplaceOrder[] };
      setDeliveredMarketplaceOrders(response.orders || []);
    } catch (error) {
      console.error('Failed to fetch delivered marketplace orders:', error);
    }
  }, []);

  // Take a marketplace order
  const takeMarketplaceOrder = async (orderId: string) => {
    try {
      await apiRequest(`/api/marketplace/executor/orders/${orderId}/take`, {
        method: 'POST',
      });
      // Refresh both lists
      await Promise.all([fetchMarketplaceOrders(), fetchAvailableMarketplaceOrders()]);
    } catch (error: unknown) {
      console.error('Failed to take order:', error);
      addToast('error', language === 'ru' ? ((error instanceof Error ? error.message : '') || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0432\u0437\u044f\u0442\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430') : 'Buyurtmani olishda xatolik');
      // Refresh to get current state
      fetchAvailableMarketplaceOrders();
    }
  };

  // Update marketplace order status
  const updateMarketplaceOrderStatus = async (orderId: string, status: string) => {
    try {
      await apiRequest(`/api/marketplace/executor/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      // Update local state immediately for responsive UI
      if (status === 'delivered') {
        // Remove from active orders
        setMarketplaceOrders(prev => prev.filter(order => order.id !== orderId));
      } else {
        setMarketplaceOrders(prev => prev.map(order =>
          order.id === orderId ? { ...order, status: status as MarketplaceOrder['status'] } : order
        ));
      }
      setSelectedMarketplaceOrder(null);
      // Also fetch fresh data from server
      await Promise.all([fetchMarketplaceOrders(), fetchDeliveredMarketplaceOrders()]);
    } catch (error: unknown) {
      console.error('Failed to update order status:', error);
      // Refresh orders to get current state
      await Promise.all([fetchMarketplaceOrders(), fetchDeliveredMarketplaceOrders()]);
      const errorMsg = (error instanceof Error ? error.message : '') || (language === 'ru' ? '\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0430' : 'Status yangilashda xatolik');
      addToast('error', errorMsg);
    }
  };

  return {
    marketplaceOrders,
    availableMarketplaceOrders,
    assignedMarketplaceOrders,
    activeMarketplaceOrders,
    completedMarketplaceOrders,
    isLoadingOrders,
    selectedMarketplaceOrder,
    setSelectedMarketplaceOrder,
    fetchMarketplaceOrders,
    fetchAvailableMarketplaceOrders,
    fetchDeliveredMarketplaceOrders,
    takeMarketplaceOrder,
    updateMarketplaceOrderStatus,
  };
}
