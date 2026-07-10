// ============================================
// MARKETPLACE TYPES
// ============================================

export type MarketplaceOrderStatus =
  // ── Stock-order lifecycle (existing) ────────────────────────
  | 'new'              // Новый заказ
  | 'confirmed'        // Подтверждён
  | 'preparing'        // Готовится
  | 'ready'            // Готов к выдаче
  | 'delivering'       // Доставляется
  | 'delivered'        // Доставлен
  | 'cancelled'        // Отменён
  // ── On-demand (special-delivery) lifecycle, migration 054 ──
  | 'awaiting_price'   // Житель отправил заявку, УК ещё не взяла в работу
  | 'price_pending'    // УК уточняет цену на базаре
  | 'price_offered'    // УК назвала цену, ждём ответ жителя (24 ч)
  | 'price_accepted'   // Житель согласен — вливается в обычный fulfillment (→ confirmed)
  | 'price_declined'   // Житель отказался — терминал
  | 'unavailable';     // УК не смогла достать — терминал

export interface MarketplaceCategory {
  id: string;
  name: string;
  nameUz: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface MarketplaceProduct {
  id: string;
  categoryId: string;
  categoryName?: string;
  categoryNameUz?: string;
  name: string;
  nameUz: string;
  description?: string;
  descriptionUz?: string;
  price: number;
  unit: string;        // шт, кг, литр, упаковка
  unitUz: string;
  image?: string;
  images?: string[];   // дополнительные фото
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCartItem {
  id: string;
  productId: string;
  product?: MarketplaceProduct;
  quantity: number;
  addedAt: string;
}

export interface MarketplaceOrder {
  id: string;
  orderNumber: string;  // MKT-2024-00001
  residentId: string;
  residentName?: string;
  residentPhone?: string;
  residentAddress?: string;
  residentApartment?: string;
  status: MarketplaceOrderStatus;
  items: MarketplaceOrderItem[];
  totalAmount: number;
  itemsCount: number;
  deliveryNote?: string;
  rating?: number;
  feedback?: string;
  createdAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveringAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface MarketplaceOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  productNameUz?: string;
  productImage?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface MarketplaceFavorite {
  id: string;
  productId: string;
  product?: MarketplaceProduct;
  addedAt: string;
}

export interface MarketplaceReview {
  id: string;
  productId: string;
  residentId: string;
  residentName?: string;
  orderId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export const MARKETPLACE_ORDER_STATUS_LABELS: Record<MarketplaceOrderStatus, { label: string; labelUz: string; color: string }> = {
  // ── Stock lifecycle (existing) ──────────────────────────────
  new: { label: 'Новый', labelUz: 'Yangi', color: 'blue' },
  confirmed: { label: 'Подтверждён', labelUz: 'Tasdiqlandi', color: 'indigo' },
  preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'yellow' },
  ready: { label: 'Готов к выдаче', labelUz: 'Berishga tayyor', color: 'orange' },
  delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'purple' },
  delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'green' },
  cancelled: { label: 'Отменён', labelUz: 'Bekor qilindi', color: 'red' },
  // ── On-demand (special-delivery) lifecycle, resident-view ──
  awaiting_price: { label: 'Ожидает обработки', labelUz: "Ko'rib chiqilishi kutilmoqda", color: 'gray' },
  price_pending:  { label: 'УК уточняет цену',   labelUz: 'Boshqaruv narxni aniqlamoqda', color: 'amber' },
  price_offered:  { label: 'Цена предложена',    labelUz: 'Narx taklif qilindi',          color: 'blue' },
  price_accepted: { label: 'Цена принята',       labelUz: 'Narx qabul qilindi',           color: 'green' },
  price_declined: { label: 'Отклонён клиентом',  labelUz: 'Mijoz tomonidan rad etildi',   color: 'red' },
  unavailable:    { label: 'Товар недоступен',   labelUz: 'Mahsulot mavjud emas',         color: 'gray' },
};

export const MARKETPLACE_CATEGORY_ICONS: Record<string, string> = {
  groceries: '🛒',
  dairy: '🥛',
  meat: '🥩',
  bakery: '🍞',
  fruits: '🍎',
  vegetables: '🥬',
  beverages: '🥤',
  household: '🧹',
  personal: '🧴',
  baby: '👶',
  pets: '🐾',
  frozen: '❄️',
  snacks: '🍿',
};
