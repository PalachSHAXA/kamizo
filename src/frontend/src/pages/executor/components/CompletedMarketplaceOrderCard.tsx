import {
  Clock, CheckCircle, MapPin, User, Star
} from 'lucide-react';
import type { MarketplaceOrder } from './types';

interface CompletedMarketplaceOrderCardProps {
  order: MarketplaceOrder;
  onView: () => void;
  language: 'ru' | 'uz';
}

// Completed Marketplace Order Card Component (for delivered orders in Completed tab)
export function CompletedMarketplaceOrderCard({
  order,
  onView,
  language,
}: CompletedMarketplaceOrderCardProps) {
  return (
    <div
      className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation border-2 border-green-200 bg-green-50/30"
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700">
              {language === 'ru' ? '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d' : 'Yetkazildi'}
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
        <div className="mt-3 p-2.5 bg-white/60 border border-green-200 rounded-lg">
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

      {/* Rating and Review */}
      {order.rating && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= order.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-yellow-700">{order.rating}/5</span>
          </div>
          {order.review && (
            <p className="text-xs text-yellow-700 mt-1">
              <span className="font-medium">{language === 'ru' ? '\u041e\u0442\u0437\u044b\u0432: ' : 'Sharh: '}</span>
              {order.review}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
