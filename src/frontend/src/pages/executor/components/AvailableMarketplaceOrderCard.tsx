import {
  Clock, MapPin, User, Hand, Package
} from 'lucide-react';
import type { MarketplaceOrder } from './types';

interface AvailableMarketplaceOrderCardProps {
  order: MarketplaceOrder;
  onTake: () => void;
  language: 'ru' | 'uz';
}

// Available Marketplace Order Card Component (for taking orders)
export function AvailableMarketplaceOrderCard({
  order,
  onTake,
  language,
}: AvailableMarketplaceOrderCardProps) {
  return (
    <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 border-2 border-purple-200 bg-purple-50/30">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Package className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium bg-purple-100 text-purple-700">
              {language === 'ru' ? '\u041d\u043e\u0432\u044b\u0439' : 'Yangi'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {order.items_count} {language === 'ru' ? '\u0442\u043e\u0432\u0430\u0440(\u043e\u0432)' : 'mahsulot'} • {order.total_amount.toLocaleString()} \u0441\u0443\u043c
          </div>

          {/* Customer Info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{order.user_name}</span>
            </span>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{order.delivery_address}</span>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Product List */}
      {order.items && order.items.length > 0 && (
        <div className="mt-3 p-2.5 bg-white/60 border border-purple-200 rounded-lg">
          <p className="text-xs font-medium text-gray-700 mb-2">{language === 'ru' ? '\u0422\u043e\u0432\u0430\u0440\u044b:' : 'Mahsulotlar:'}</p>
          <div className="space-y-1.5">
            {order.items.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate flex-1">
                  {item.product_name || (language === 'ru' ? '\u0422\u043e\u0432\u0430\u0440' : 'Mahsulot')}
                </span>
                <span className="text-gray-500 ml-2 whitespace-nowrap">
                  {item.quantity} × {item.unit_price?.toLocaleString()} \u0441\u0443\u043c
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery Notes */}
      {order.delivery_notes && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            <span className="font-medium">{language === 'ru' ? '\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439: ' : 'Izoh: '}</span>
            {order.delivery_notes}
          </p>
        </div>
      )}

      {/* Take Button */}
      <div className="mt-4 pt-3 border-t border-purple-200/50">
        <button
          onClick={onTake}
          className="w-full min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
        >
          <Hand className="w-5 h-5" />
          {language === 'ru' ? '\u0412\u0437\u044f\u0442\u044c \u0437\u0430\u043a\u0430\u0437' : 'Buyurtmani olish'}
        </button>
      </div>
    </div>
  );
}
