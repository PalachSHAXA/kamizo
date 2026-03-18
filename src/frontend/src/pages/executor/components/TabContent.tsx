import {
  FileText, CheckCircle, ShoppingBag
} from 'lucide-react';
import type { Request } from '../../../types';
import type { MarketplaceOrder } from './types';
import { RequestCard } from './RequestCard';
import { MarketplaceOrderCard } from './MarketplaceOrderCard';
import { AvailableMarketplaceOrderCard } from './AvailableMarketplaceOrderCard';
import { CompletedMarketplaceOrderCard } from './CompletedMarketplaceOrderCard';

interface TabContentProps {
  activeTab: string;
  language: 'ru' | 'uz';
  isCourier: boolean;
  // Marketplace
  isLoadingOrders: boolean;
  activeMarketplaceOrders: MarketplaceOrder[];
  completedMarketplaceOrders: MarketplaceOrder[];
  availableMarketplaceOrders: MarketplaceOrder[];
  assignedMarketplaceOrders: MarketplaceOrder[];
  onViewMarketplaceOrder: (order: MarketplaceOrder) => void;
  onUpdateMarketplaceStatus: (orderId: string, status: string) => void;
  onTakeMarketplaceOrder: (orderId: string) => void;
  deliveryTimers: Record<string, number>;
  formatTime: (seconds: number) => string;
  // Requests
  currentRequests: Request[];
  activeTimers: Record<string, number>;
  inProgressCount: number;
  onViewRequest: (request: Request) => void;
  onTakeRequest: (requestId: string) => void;
  onAccept: (requestId: string) => void;
  onStartWork: (requestId: string) => void;
  onPauseWork: (requestId: string) => void;
  onResumeWork: (requestId: string) => void;
  onComplete: (requestId: string) => void;
  onDecline: (request: Request) => void;
  onReschedule: (request: Request) => void;
}

export function TabContent({
  activeTab,
  language,
  isCourier,
  isLoadingOrders,
  activeMarketplaceOrders,
  completedMarketplaceOrders,
  availableMarketplaceOrders,
  assignedMarketplaceOrders,
  onViewMarketplaceOrder,
  onUpdateMarketplaceStatus,
  onTakeMarketplaceOrder,
  deliveryTimers,
  formatTime,
  currentRequests,
  activeTimers,
  inProgressCount,
  onViewRequest,
  onTakeRequest,
  onAccept,
  onStartWork,
  onPauseWork,
  onResumeWork,
  onComplete,
  onDecline,
  onReschedule,
}: TabContentProps) {
  if (activeTab === 'marketplace') {
    return (
      <div className="space-y-4">
        {isLoadingOrders ? (
          <div className="glass-card p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">{language === 'ru' ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432...' : 'Buyurtmalar yuklanmoqda...'}</p>
          </div>
        ) : activeMarketplaceOrders.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-primary-400" />
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-500">
              {language === 'ru' ? '\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0434\u043e\u0441\u0442\u0430\u0432\u043e\u043a' : 'Faol yetkazishlar yo\'q'}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {language === 'ru' ? '\u0412\u043e\u0437\u044c\u043c\u0438\u0442\u0435 \u0437\u0430\u043a\u0430\u0437 \u0438\u0437 \u0432\u043a\u043b\u0430\u0434\u043a\u0438 "\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435"' : '"Mavjud" bo\'limidan buyurtma oling'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeMarketplaceOrders.map((order) => (
              <MarketplaceOrderCard
                key={order.id}
                order={order}
                onView={() => onViewMarketplaceOrder(order)}
                onUpdateStatus={onUpdateMarketplaceStatus}
                language={language}
                deliveryTimer={deliveryTimers[order.id]}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'delivered') {
    return (
      <div className="space-y-4">
        {isLoadingOrders ? (
          <div className="glass-card p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">{language === 'ru' ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0437\u0430\u043a\u0430\u0437\u043e\u0432...' : 'Buyurtmalar yuklanmoqda...'}</p>
          </div>
        ) : completedMarketplaceOrders.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base sm:text-lg font-medium text-gray-500">
              {language === 'ru' ? '\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432' : 'Yetkazilgan buyurtmalar yo\'q'}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {language === 'ru' ? '\u0417\u0434\u0435\u0441\u044c \u0431\u0443\u0434\u0443\u0442 \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0442\u044c\u0441\u044f \u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b' : 'Bu yerda yetkazilgan buyurtmalar ko\'rsatiladi'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {completedMarketplaceOrders.map((order) => (
              <CompletedMarketplaceOrderCard
                key={order.id}
                order={order}
                onView={() => onViewMarketplaceOrder(order)}
                language={language}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: available, assigned, in_progress, completed tabs
  return (
    <div className="space-y-4">
      {/* For couriers on "available" tab - show marketplace orders first */}
      {activeTab === 'available' && isCourier && availableMarketplaceOrders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold text-gray-700 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500" />
            {language === 'ru' ? '\u0417\u0430\u043a\u0430\u0437\u044b \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430' : 'Do\'kon buyurtmalari'}
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-xs">
              {availableMarketplaceOrders.length}
            </span>
          </h3>
          {availableMarketplaceOrders.map((order) => (
            <AvailableMarketplaceOrderCard
              key={order.id}
              order={order}
              onTake={() => onTakeMarketplaceOrder(order.id)}
              language={language}
            />
          ))}
        </div>
      )}

      {/* For couriers on "assigned" tab - show assigned marketplace orders */}
      {activeTab === 'assigned' && isCourier && assignedMarketplaceOrders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold text-gray-700 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500" />
            {language === 'ru' ? '\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b' : 'Tayinlangan buyurtmalar'}
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-xs">
              {assignedMarketplaceOrders.length}
            </span>
          </h3>
          {assignedMarketplaceOrders.map((order) => (
            <MarketplaceOrderCard
              key={order.id}
              order={order}
              onView={() => onViewMarketplaceOrder(order)}
              onUpdateStatus={onUpdateMarketplaceStatus}
              language={language}
            />
          ))}
        </div>
      )}

      {/* Regular service requests */}
      {currentRequests.length > 0 && (
        <div className="space-y-3">
          {/* Show section header if there are also marketplace orders in the same tab */}
          {((activeTab === 'available' && isCourier && availableMarketplaceOrders.length > 0) ||
            (activeTab === 'assigned' && isCourier && assignedMarketplaceOrders.length > 0)) && (
            <h3 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold text-gray-700 flex items-center gap-2">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
              {language === 'ru' ? '\u0417\u0430\u044f\u0432\u043a\u0438 \u043d\u0430 \u0443\u0441\u043b\u0443\u0433\u0438' : 'Xizmat so\'rovlari'}
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">
                {currentRequests.length}
              </span>
            </h3>
          )}
          {currentRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              timerSeconds={activeTimers[request.id]}
              hasActiveWork={inProgressCount > 0}
              onView={() => onViewRequest(request)}
              onTakeRequest={() => onTakeRequest(request.id)}
              onAccept={() => onAccept(request.id)}
              onStartWork={() => onStartWork(request.id)}
              onPauseWork={() => onPauseWork(request.id)}
              onResumeWork={() => onResumeWork(request.id)}
              onComplete={() => onComplete(request.id)}
              onDecline={() => onDecline(request)}
              onReschedule={() => onReschedule(request)}
              formatTime={formatTime}
            />
          ))}
        </div>
      )}

      {/* Empty state - only show if both lists are empty */}
      {currentRequests.length === 0 &&
       !(activeTab === 'available' && isCourier && availableMarketplaceOrders.length > 0) &&
       !(activeTab === 'assigned' && isCourier && assignedMarketplaceOrders.length > 0) && (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-500">
            {isCourier
              ? (language === 'ru' ? '\u041d\u0435\u0442 \u0437\u0430\u043a\u0430\u0437\u043e\u0432' : 'Buyurtmalar yo\'q')
              : (language === 'ru' ? '\u041d\u0435\u0442 \u0437\u0430\u044f\u0432\u043e\u043a' : 'Arizalar yo\'q')}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {activeTab === 'available' && (isCourier
              ? (language === 'ru' ? '\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e \u0432\u0430\u0448\u0435\u0439 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438' : 'Sizning mutaxassisligingiz bo\'yicha mavjud buyurtmalar yo\'q')
              : (language === 'ru' ? '\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a \u043f\u043e \u0432\u0430\u0448\u0435\u0439 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438' : 'Sizning mutaxassisligingiz bo\'yicha mavjud arizalar yo\'q'))}
            {activeTab === 'assigned' && (isCourier
              ? (language === 'ru' ? '\u041d\u0435\u0442 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432' : 'Tayinlangan buyurtmalar yo\'q')
              : (language === 'ru' ? '\u041d\u0435\u0442 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a' : 'Tayinlangan arizalar yo\'q'))}
            {activeTab === 'in_progress' && (language === 'ru' ? '\u041d\u0435\u0442 \u0437\u0430\u044f\u0432\u043e\u043a \u0432 \u0440\u0430\u0431\u043e\u0442\u0435' : 'Ishda arizalar yo\'q')}
            {activeTab === 'completed' && (language === 'ru' ? '\u041d\u0435\u0442 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a' : 'Bajarilgan arizalar yo\'q')}
          </p>
        </div>
      )}
    </div>
  );
}
