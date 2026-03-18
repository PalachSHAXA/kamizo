import {
  Clock, CheckCircle, MapPin, Phone, User,
  Timer, ShoppingBag, Package
} from 'lucide-react';
import type { MarketplaceOrder } from './types';

interface MarketplaceOrderCardProps {
  order: MarketplaceOrder;
  onView: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  language: 'ru' | 'uz';
  deliveryTimer?: number;
  formatTime?: (seconds: number) => string;
}

// Marketplace Order Card Component
export function MarketplaceOrderCard({
  order,
  onView,
  onUpdateStatus,
  language,
  deliveryTimer,
  formatTime,
}: MarketplaceOrderCardProps) {
  const MARKETPLACE_ORDER_STATUS_LABELS: Record<string, { label: string; labelUz: string; color: string; icon: typeof Package }> = {
    confirmed: { label: '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d', labelUz: 'Tayinlangan', color: 'bg-orange-100 text-orange-700', icon: Package },
    preparing: { label: '\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044f', labelUz: 'Yig\'ilmoqda', color: 'bg-amber-100 text-amber-700', icon: Package },
    delivering: { label: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u0442\u0441\u044f', labelUz: 'Yetkazilmoqda', color: 'bg-blue-100 text-blue-700', icon: User },
    ready: { label: '\u0413\u043e\u0442\u043e\u0432', labelUz: 'Tayyor', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    delivered: { label: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d', labelUz: 'Yetkazildi', color: 'bg-gray-100 text-gray-700', icon: CheckCircle },
  };

  const statusInfo = MARKETPLACE_ORDER_STATUS_LABELS[order.status] || MARKETPLACE_ORDER_STATUS_LABELS.confirmed;
  const StatusIcon = statusInfo.icon;

  const getNextStatus = () => {
    const transitions: Record<string, string> = {
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'delivering',
      delivering: 'delivered',
    };
    return transitions[order.status];
  };

  const getNextStatusLabel = () => {
    const labels: Record<string, { ru: string; uz: string }> = {
      preparing: { ru: '\u041d\u0430\u0447\u0430\u0442\u044c \u0441\u0431\u043e\u0440\u043a\u0443', uz: 'Yig\'ishni boshlash' },
      ready: { ru: '\u0413\u043e\u0442\u043e\u0432 \u043a \u0432\u044b\u0434\u0430\u0447\u0435', uz: 'Topshirishga tayyor' },
      delivering: { ru: '\u041d\u0430\u0447\u0430\u0442\u044c \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443', uz: 'Yetkazishni boshlash' },
      delivered: { ru: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e', uz: 'Yetkazildi' },
    };
    const next = getNextStatus();
    return next ? labels[next] : null;
  };

  const nextStatusLabel = getNextStatusLabel();

  return (
    <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 cursor-pointer hover:bg-white/40 active:bg-white/60 active:scale-[0.99] transition-all touch-manipulation" onClick={onView}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">#{order.order_number}</span>
            <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${statusInfo.color}`}>
              <StatusIcon className="w-3 h-3" />
              {language === 'ru' ? statusInfo.label : statusInfo.labelUz}
            </span>
            {/* Delivery Timer */}
            {order.status === 'delivering' && formatTime && (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold flex items-center gap-1 bg-primary-500 text-white animate-pulse">
                <Timer className="w-3 h-3" />
                {formatTime(deliveryTimer ?? 0)}
              </span>
            )}
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
            <a
              href={`tel:${order.user_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-primary-600 active:text-primary-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{language === 'ru' ? '\u041f\u043e\u0437\u0432\u043e\u043d\u0438\u0442\u044c' : 'Qo\'ng\'iroq'}</span>
            </a>
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
        <div className="mt-3 p-2.5 bg-white/60 border border-primary-200 rounded-lg">
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

      {/* Action Button */}
      {nextStatusLabel && (
        <div className="mt-4 pt-3 border-t border-gray-200/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onUpdateStatus(order.id, getNextStatus())}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
            style={{
              background: order.status === 'confirmed' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                order.status === 'preparing' ? 'linear-gradient(135deg, #10b981, #059669)' :
                order.status === 'ready' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                'linear-gradient(135deg, #10b981, #059669)'
            }}
          >
            {order.status === 'confirmed' && <Package className="w-5 h-5" />}
            {order.status === 'preparing' && <User className="w-5 h-5" />}
            {order.status === 'delivering' && <CheckCircle className="w-5 h-5" />}
            {order.status === 'ready' && <CheckCircle className="w-5 h-5" />}
            {language === 'ru' ? nextStatusLabel.ru : nextStatusLabel.uz}
          </button>
        </div>
      )}
    </div>
  );
}
