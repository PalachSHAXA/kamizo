// ============================================
// MARKETPLACE TYPES
// ============================================

export type MarketplaceOrderStatus =
  | 'new'           // Новый заказ
  | 'confirmed'     // Подтверждён
  | 'preparing'     // Готовится
  | 'ready'         // Готов к выдаче
  | 'delivering'    // Доставляется
  | 'delivered'     // Доставлен
  | 'cancelled';    // Отменён

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
  new: { label: 'Новый', labelUz: 'Yangi', color: 'blue' },
  confirmed: { label: 'Подтверждён', labelUz: 'Tasdiqlandi', color: 'indigo' },
  preparing: { label: 'Готовится', labelUz: 'Tayyorlanmoqda', color: 'yellow' },
  ready: { label: 'Готов к выдаче', labelUz: 'Berishga tayyor', color: 'orange' },
  delivering: { label: 'Доставляется', labelUz: 'Yetkazilmoqda', color: 'purple' },
  delivered: { label: 'Доставлен', labelUz: 'Yetkazildi', color: 'green' },
  cancelled: { label: 'Отменён', labelUz: 'Bekor qilindi', color: 'red' },
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
