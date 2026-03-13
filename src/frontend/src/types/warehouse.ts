// ============================================
// СКЛАД И МАТЕРИАЛЫ
// ============================================

// Склад
export interface Warehouse {
  id: string;
  name: string;
  address: string;
  type: 'main' | 'building' | 'mobile';
  buildingId?: string;
  responsibleId: string;
  responsibleName: string;
  isActive: boolean;
}

// Материал
export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;

  // Цены
  averageCost: number;
  lastPurchasePrice: number;

  // Остатки
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minQuantity: number;             // Минимальный остаток

  // Характеристики
  manufacturer?: string;
  specifications?: string;
  shelfLife?: number;              // Срок годности в днях

  isActive: boolean;
}

// Остаток материала на складе
export interface StockItem {
  id: string;
  warehouseId: string;
  materialId: string;
  quantity: number;
  reservedQuantity: number;
  lotNumber?: string;
  expirationDate?: string;
  location?: string;               // Ячейка/полка
  lastMovementAt: string;
}

// Движение материала
export interface StockMovement {
  id: string;
  warehouseId: string;
  materialId: string;

  type: 'receipt' | 'issue' | 'transfer' | 'write_off' | 'inventory' | 'return';
  quantity: number;

  // Связи
  workOrderId?: string;
  purchaseOrderId?: string;
  transferFromWarehouseId?: string;

  // Данные
  unitCost: number;
  totalCost: number;
  lotNumber?: string;

  // Подтверждение
  performedBy: string;
  performedAt: string;
  approvedBy?: string;
  approvedAt?: string;

  notes?: string;
}
