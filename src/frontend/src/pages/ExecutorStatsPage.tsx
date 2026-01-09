import { useMemo } from 'react';
import {
  BarChart3, Star, CheckCircle, Timer, TrendingUp, Award, Target, FileText
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';

export function ExecutorStatsPage() {
  const { user } = useAuthStore();
  const { requests, executors, getExecutorStats } = useDataStore();
  const { language } = useLanguageStore();

  // Find current executor
  const currentExecutor = executors.find(e => e.login === user?.login);

  // Get executor stats
  const stats = currentExecutor ? getExecutorStats(currentExecutor.id) : null;

  // Filter requests for this executor
  const myRequests = requests.filter(r => r.executorId === currentExecutor?.id);
  const completedRequests = myRequests.filter(r => r.status === 'completed' || r.status === 'pending_approval');

  // Calculate executor-specific weekly performance
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const stats = [];
    const days = language === 'ru'
      ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
      : ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const completed = myRequests.filter(r => {
        if (!r.approvedAt) return false;
        const approvedAt = new Date(r.approvedAt);
        return approvedAt >= dayStart && approvedAt < dayEnd;
      }).length;

      stats.push({
        day: days[date.getDay()],
        date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        completed
      });
    }
    return stats;
  }, [myRequests, language]);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-500" />
          {language === 'ru' ? 'Статистика' : 'Statistika'}
        </h1>
      </div>

      {/* Top Row - Key Metrics with Progress */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-blue-500/20 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <FileText className="w-5 h-5" />
              <span className="text-sm font-medium">{language === 'ru' ? 'Всего заявок' : 'Jami arizalar'}</span>
            </div>
            <div className="text-4xl font-bold">{stats?.totalRequests || 0}</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-400/20 to-green-500/20 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</span>
            </div>
            <div className="text-4xl font-bold">{stats?.completedRequests || 0}</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${((stats?.completedRequests || 0) / Math.max(stats?.totalRequests || 1, 1)) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {Math.round(((stats?.completedRequests || 0) / Math.max(stats?.totalRequests || 1, 1)) * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-400/20 to-amber-500/20 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <Star className="w-5 h-5" />
              <span className="text-sm font-medium">{language === 'ru' ? 'Средний рейтинг' : 'O\'rtacha reyting'}</span>
            </div>
            <div className="text-4xl font-bold">{(currentExecutor?.rating || 5.0).toFixed(1)}</div>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= Math.round(currentExecutor?.rating || 5) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-400/20 to-violet-500/20 rounded-full -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 text-purple-600 mb-2">
              <Timer className="w-5 h-5" />
              <span className="text-sm font-medium">{language === 'ru' ? 'Сред. время' : 'O\'rtacha vaqt'}</span>
            </div>
            <div className="text-4xl font-bold">{currentExecutor?.avgCompletionTime || 0}<span className="text-lg text-gray-400 ml-1">{language === 'ru' ? 'мин' : 'min'}</span></div>
            <div className="mt-2 text-xs text-gray-500">
              {language === 'ru' ? 'На выполнение заявки' : 'Arizani bajarish uchun'}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row - Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Performance Chart */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              {language === 'ru' ? 'Активность за неделю' : 'Haftalik faollik'}
            </h3>
            <div className="text-sm text-gray-500">
              {language === 'ru' ? 'Всего:' : 'Jami:'} <span className="font-semibold text-blue-600">{weeklyStats.reduce((sum, d) => sum + d.completed, 0)}</span>
            </div>
          </div>
          <div className="h-52 flex items-end gap-3">
            {weeklyStats.map((day, index) => {
              const maxCompleted = Math.max(...weeklyStats.map(d => d.completed), 1);
              const height = (day.completed / maxCompleted) * 100;
              const isToday = index === weeklyStats.length - 1;
              return (
                <div key={index} className="flex-1 flex flex-col items-center group">
                  <div className={`relative w-full transition-all duration-300 ${isToday ? 'scale-105' : 'group-hover:scale-105'}`}>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs py-1 px-2 rounded">
                      {day.completed} {language === 'ru' ? 'заявок' : 'ariza'}
                    </div>
                    <div
                      className={`w-full rounded-t-xl transition-all duration-500 ${
                        isToday
                          ? 'bg-gradient-to-t from-primary-500 to-orange-400'
                          : 'bg-gradient-to-t from-blue-500 to-blue-400'
                      }`}
                      style={{ height: `${Math.max(height, 8)}%`, minHeight: '16px' }}
                    />
                  </div>
                  <div className={`text-xs mt-2 font-medium ${isToday ? 'text-primary-600' : 'text-gray-500'}`}>
                    {day.day}
                  </div>
                  <div className="text-xs text-gray-400">{day.date}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance Progress */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-green-500" />
            {language === 'ru' ? 'Цели и достижения' : 'Maqsadlar va yutuqlar'}
          </h3>
          <div className="space-y-5">
            {/* Weekly Goal */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{language === 'ru' ? 'Недельная цель' : 'Haftalik maqsad'}</span>
                <span className="text-sm font-bold text-blue-600">{stats?.thisWeek || 0}/10 {language === 'ru' ? 'заявок' : 'ariza'}</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 relative"
                  style={{ width: `${Math.min(((stats?.thisWeek || 0) / 10) * 100, 100)}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>

            {/* Monthly Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{language === 'ru' ? 'Месячный прогресс' : 'Oylik natija'}</span>
                <span className="text-sm font-bold text-green-600">{stats?.thisMonth || 0}/30 {language === 'ru' ? 'заявок' : 'ariza'}</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(((stats?.thisMonth || 0) / 30) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Rating Goal */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</span>
                <span className="text-sm font-bold text-amber-600">{(currentExecutor?.rating || 5.0).toFixed(1)}/5.0</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                  style={{ width: `${((currentExecutor?.rating || 5) / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Achievements */}
            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-600 mb-3">{language === 'ru' ? 'Достижения' : 'Yutuqlar'}</div>
              <div className="flex flex-wrap gap-2">
                {(currentExecutor?.completedCount || 0) >= 10 && (
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Award className="w-3 h-3" /> 10+ {language === 'ru' ? 'заявок' : 'ariza'}
                  </span>
                )}
                {(currentExecutor?.rating || 0) >= 4.5 && (
                  <span className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Star className="w-3 h-3" /> {language === 'ru' ? 'Высокий рейтинг' : 'Yuqori reyting'}
                  </span>
                )}
                {(currentExecutor?.avgCompletionTime || 0) < 60 && (currentExecutor?.avgCompletionTime || 0) > 0 && (
                  <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Timer className="w-3 h-3" /> {language === 'ru' ? 'Быстрый исполнитель' : 'Tez ijrochi'}
                  </span>
                )}
                {(currentExecutor?.completedCount || 0) >= 50 && (
                  <span className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> {language === 'ru' ? 'Эксперт' : 'Ekspert'}
                  </span>
                )}
                {(currentExecutor?.completedCount || 0) === 0 && (
                  <span className="text-gray-400 text-sm">
                    {language === 'ru' ? 'Выполняйте заявки чтобы получить достижения' : 'Yutuqlarni olish uchun arizalarni bajaring'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - Recent Ratings */}
      <div className="glass-card p-5">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-yellow-500" />
          {language === 'ru' ? 'Последние отзывы' : 'Oxirgi sharhlar'}
        </h3>
        {completedRequests.filter(r => r.status === 'completed' && r.rating).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedRequests
              .filter(r => r.status === 'completed' && r.rating)
              .slice(0, 6)
              .map(request => (
                <div key={request.id} className="bg-white/50 hover:bg-white/70 rounded-xl p-4 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">#{request.number}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${star <= (request.rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="font-medium text-sm truncate">{request.title}</div>
                  {request.feedback ? (
                    <p className="text-sm text-gray-500 mt-2 italic line-clamp-2">"{request.feedback}"</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-2">{language === 'ru' ? 'Без комментария' : 'Izohlarsiz'}</p>
                  )}
                  <div className="text-xs text-gray-400 mt-2">
                    {new Date(request.approvedAt || request.completedAt || '').toLocaleDateString('ru-RU')}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Star className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">{language === 'ru' ? 'Пока нет отзывов' : 'Sharhlar hali yo\'q'}</p>
            <p className="text-sm mt-1">
              {language === 'ru' ? 'Выполняйте заявки чтобы получать оценки от жителей' : 'Yashlovchilardan baholar olish uchun arizalarni bajaring'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
