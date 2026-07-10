// Marketplace order item interface
export interface MarketplaceOrderItem {
  id: string;
  product_id: string;
  product_name?: string;
  product_image?: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
}

// Marketplace order interface
export interface MarketplaceOrder {
  id: string;
  order_number: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  status:
    // ── Stock lifecycle ─────────────────────────────────────────
    | 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered'
    // ── On-demand lifecycle, migration 054 ──────────────────────
    // NB: 'cancelled' intentionally omitted from THIS literal — pre-
    // existing bug carried over from stock section; fix in a separate
    // commit alongside the on-demand rollout, not here.
    | 'awaiting_price' | 'price_pending' | 'price_offered'
    | 'price_accepted' | 'price_declined' | 'unavailable';
  total_amount: number;
  delivery_address: string;
  delivery_notes?: string;
  items_count: number;
  items?: MarketplaceOrderItem[];
  created_at: string;
  assigned_at?: string;
  delivering_at?: string;
  rating?: number;
  review?: string;
}

// Stats interface for API response
export interface ExecutorStats {
  totalCompleted: number;
  thisWeek: number;
  thisMonth: number;
  rating: number;
  avgCompletionTime: number;
  // Courier-specific stats
  totalDelivered?: number;
  deliveredThisWeek?: number;
  avgDeliveryTime?: number;
}
