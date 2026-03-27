import {
  Clock, CheckCircle, MapPin, Phone, User,
  X, ShoppingBag, Package
} from 'lucide-react';
import type { MarketplaceOrder } from './types';

interface MarketplaceOrderDetailsModalProps {
  order: MarketplaceOrder;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  language: 'ru' | 'uz';
}

// Marketplace Order Details Modal
export function MarketplaceOrderDetailsModal({
  order,
  onClose,
  onUpdateStatus,
  language,
}: MarketplaceOrderDetailsModalProps) {
  const MARKETPLACE_ORDER_STATUS_LABELS: Record<string, { label: string; labelUz: string; color: string }> = {
    confirmed: { label: '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d', labelUz: 'Tayinlangan', color: 'bg-orange-100 text-orange-700' },
    preparing: { label: '\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044f', labelUz: 'Yig\'ilmoqda', color: 'bg-amber-100 text-amber-700' },
    delivering: { label: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u0442\u0441\u044f', labelUz: 'Yetkazilmoqda', color: 'bg-blue-100 text-blue-700' },
    ready: { label: '\u0413\u043e\u0442\u043e\u0432', labelUz: 'Tayyor', color: 'bg-green-100 text-green-700' },
    delivered: { label: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d', labelUz: 'Yetkazildi', color: 'bg-gray-100 text-gray-700' },
  };

  const statusInfo = MARKETPLACE_ORDER_STATUS_LABELS[order.status] || MARKETPLACE_ORDER_STATUS_LABELS.confirmed;

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
    const labels: Record<string, { ru: string; uz: string; icon: typeof Package }> = {
      preparing: { ru: '\u041d\u0430\u0447\u0430\u0442\u044c \u0441\u0431\u043e\u0440\u043a\u0443', uz: 'Yig\'ishni boshlash', icon: Package },
      ready: { ru: '\u0413\u043e\u0442\u043e\u0432 \u043a \u0432\u044b\u0434\u0430\u0447\u0435', uz: 'Topshirishga tayyor', icon: Package },
      delivering: { ru: '\u041d\u0430\u0447\u0430\u0442\u044c \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443', uz: 'Yetkazishni boshlash', icon: User },
      delivered: { ru: '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e', uz: 'Yetkazildi', icon: CheckCircle },
    };
    const next = getNextStatus();
    return next ? labels[next] : null;
  };

  const nextStatusInfo = getNextStatusLabel();
  const NextIcon = nextStatusInfo?.icon || Package;

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto rounded-t-[20px] sm:rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-500">
              {language === 'ru' ? '\u0417\u0430\u043a\u0430\u0437 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430' : 'Do\'kon buyurtmasi'} #{order.order_number}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-sm font-medium ${statusInfo.color}`}>
                {language === 'ru' ? statusInfo.label : statusInfo.labelUz}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg touch-manipulation" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Order Info */}
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">
                  {order.items_count} {language === 'ru' ? '\u0442\u043e\u0432\u0430\u0440(\u043e\u0432)' : 'mahsulot'}
                </div>
                <div className="text-lg font-bold text-primary-600">
                  {order.total_amount.toLocaleString()} \u0441\u0443\u043c
                </div>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? '\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0435' : 'Mijoz haqida'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{order.user_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <a href={`tel:${order.user_phone}`} className="text-primary-600 hover:underline">
                  {order.user_phone}
                </a>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span>{order.delivery_address}</span>
              </div>
            </div>
          </div>

          {/* Delivery Notes */}
          {order.delivery_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-medium text-amber-800 mb-2">
                {language === 'ru' ? '\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435 \u043a \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0435' : 'Yetkazish uchun eslatma'}
              </h3>
              <p className="text-sm text-amber-700">{order.delivery_notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white/30 rounded-xl p-4 space-y-3">
            <h3 className="font-medium">{language === 'ru' ? '\u0418\u0441\u0442\u043e\u0440\u0438\u044f' : 'Tarix'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{language === 'ru' ? '\u0421\u043e\u0437\u0434\u0430\u043d' : 'Yaratildi'}</span>
                <span>{new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {order.assigned_at && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{language === 'ru' ? '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d' : 'Tayinlandi'}</span>
                  <span>{new Date(order.assigned_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-3">
            <a
              href={`tel:${order.user_phone}`}
              className="btn-secondary flex-1 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation"
            >
              <Phone className="w-4 h-4" />
              {language === 'ru' ? '\u041f\u043e\u0437\u0432\u043e\u043d\u0438\u0442\u044c' : 'Qo\'ng\'iroq'}
            </a>
          </div>

          {nextStatusInfo && (
            <button
              onClick={() => {
                onUpdateStatus(order.id, getNextStatus());
              }}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation"
              style={{
                background: order.status === 'confirmed' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                  order.status === 'preparing' ? 'linear-gradient(135deg, #10b981, #059669)' :
                  order.status === 'ready' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                  'linear-gradient(135deg, #10b981, #059669)'
              }}
            >
              <NextIcon className="w-5 h-5" />
              {language === 'ru' ? nextStatusInfo.ru : nextStatusInfo.uz}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
