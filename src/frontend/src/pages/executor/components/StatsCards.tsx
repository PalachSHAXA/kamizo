import {
  CheckCircle, User, Star, TrendingUp, Timer
} from 'lucide-react';
import type { ExecutorStats } from './types';

interface StatsCardsProps {
  liveStats: ExecutorStats | null;
  isLoadingStats: boolean;
  isCourier: boolean;
  language: 'ru' | 'uz';
}

export function StatsCards({
  liveStats,
  isLoadingStats,
  isCourier,
  language,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 xl:gap-5">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold">
              {isLoadingStats ? '...' : (liveStats?.rating || 5.0)}
            </div>
            <div className="text-xs md:text-sm text-gray-500">
              {language === 'ru' ? '\u0420\u0435\u0439\u0442\u0438\u043d\u0433' : 'Reyting'}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
            {isCourier ? (
              <User className="w-5 h-5 md:w-6 md:h-6 text-white" />
            ) : (
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold">
              {isLoadingStats ? '...' : (
                isCourier
                  ? (liveStats?.totalDelivered || 0)
                  : (liveStats?.totalCompleted || 0)
              )}
            </div>
            <div className="text-xs md:text-sm text-gray-500">
              {isCourier
                ? (language === 'ru' ? '\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e' : 'Yetkazildi')
                : (language === 'ru' ? '\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043e' : 'Bajarildi')
              }
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold">
              {isLoadingStats ? '...' : (
                isCourier
                  ? (liveStats?.deliveredThisWeek || 0)
                  : (liveStats?.thisWeek || 0)
              )}
            </div>
            <div className="text-xs md:text-sm text-gray-500">
              {language === 'ru' ? '\u0417\u0430 \u043d\u0435\u0434\u0435\u043b\u044e' : 'Hafta'}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Timer className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl md:text-3xl font-bold">
              {isLoadingStats ? '...' : (
                isCourier
                  ? (liveStats?.avgDeliveryTime || 0)
                  : (liveStats?.avgCompletionTime || 0)
              )}
            </div>
            <div className="text-xs md:text-sm text-gray-500 leading-tight">
              {language === 'ru' ? '\u0421\u0440\u0435\u0434. \u043c\u0438\u043d' : 'O\'rt. daq'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
