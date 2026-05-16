import { X } from 'lucide-react';

// Sprint 30: extracted from MarketplaceManagerDashboard. Tiny modal
// for updating one product's stock quantity. Parent owns the
// stockProduct + stockQuantity state and the update handler.

interface StockProduct {
  id: string;
  name_ru: string;
  name_uz: string;
  unit: string;
  stock_quantity: number;
  category_id: string;
}

interface StockModalProps {
  product: StockProduct;
  quantity: string;
  setQuantity: (q: string) => void;
  language: string;
  categoryIcon: string;
  onClose: () => void;
  onSubmit: () => void;
}

export function StockModal({
  product,
  quantity,
  setQuantity,
  language,
  categoryIcon,
  onClose,
  onSubmit,
}: StockModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">{language === 'ru' ? 'Обновить склад' : 'Omborni yangilash'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            <span className="text-2xl">{categoryIcon}</span>
            <div>
              <p className="font-medium text-gray-900">
                {language === 'ru' ? product.name_ru : product.name_uz}
              </p>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'Текущий остаток:' : 'Joriy qoldiq:'} {product.stock_quantity} {product.unit}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Новое количество' : 'Yangi miqdor'}
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full p-3 border rounded-xl text-center text-xl font-bold"
              min="0"
            />
          </div>

          <button onClick={onSubmit} className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium">
            {language === 'ru' ? 'Сохранить' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
