import { useState, useEffect } from 'react';
import { Star, Users, Check, X, ThumbsUp, Send, MessageCircle, User, Briefcase, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Executor } from '../types';
import { SPECIALIZATION_LABELS } from '../types';

interface Rating {
  quality: number;
  speed: number;
  politeness: number;
  comment: string;
}

interface EmployeeRating {
  id: string;
  executorId: string;
  residentId: string;
  quality: number;
  speed: number;
  politeness: number;
  comment: string;
  createdAt: string;
}

// Храним оценки в localStorage для демо
const RATINGS_STORAGE_KEY = 'resident_employee_ratings';

const getRatingsFromStorage = (): EmployeeRating[] => {
  try {
    const stored = localStorage.getItem(RATINGS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRatingToStorage = (rating: EmployeeRating) => {
  const ratings = getRatingsFromStorage();
  // Check if already rated this executor by this resident
  const existingIndex = ratings.findIndex(r => r.executorId === rating.executorId && r.residentId === rating.residentId);
  if (existingIndex >= 0) {
    ratings[existingIndex] = rating; // Update existing rating
  } else {
    ratings.push(rating);
  }
  localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
};

const getExecutorRating = (executorId: string, residentId: string): EmployeeRating | null => {
  const ratings = getRatingsFromStorage();
  return ratings.find(r => r.executorId === executorId && r.residentId === residentId) || null;
};

export function ResidentRateEmployeesPage() {
  const { user } = useAuthStore();
  const { executors, requests, fetchExecutors, fetchRequests } = useDataStore();
  const { language } = useLanguageStore();

  const [selectedExecutor, setSelectedExecutor] = useState<Executor | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratings, setRatings] = useState<Rating>({
    quality: 0,
    speed: 0,
    politeness: 0,
    comment: ''
  });
  const [ratedExecutorIds, setRatedExecutorIds] = useState<string[]>([]);

  // Fetch executors and requests from API on mount
  useEffect(() => {
    fetchExecutors();
    fetchRequests();
  }, [fetchExecutors, fetchRequests]);

  // Load rated executors on mount
  useEffect(() => {
    if (user) {
      const allRatings = getRatingsFromStorage();
      const ratedIds = allRatings.filter(r => r.residentId === user.id).map(r => r.executorId);
      setRatedExecutorIds(ratedIds);
    }
  }, [user]);

  // Get executors who worked on user's completed requests
  const getExecutorsWhoWorkedForUser = (): string[] => {
    const userCompletedRequests = requests.filter(r =>
      r.residentId === user?.id &&
      r.status === 'completed' &&
      r.executorId
    );
    return [...new Set(userCompletedRequests.map(r => r.executorId!))];
  };

  const workedForUserIds = getExecutorsWhoWorkedForUser();

  // All executors, sorted by those who worked for user first
  const allExecutors = [...executors].sort((a: Executor, b: Executor) => {
    const aWorked = workedForUserIds.includes(a.id);
    const bWorked = workedForUserIds.includes(b.id);
    if (aWorked && !bWorked) return -1;
    if (!aWorked && bWorked) return 1;
    return a.name.localeCompare(b.name);
  });

  const unratedExecutors = allExecutors.filter(e => !ratedExecutorIds.includes(e.id));
  const ratedExecutors = allExecutors.filter(e => ratedExecutorIds.includes(e.id));

  // Get completed requests count for an executor
  const getExecutorRequestsCount = (executorId: string): number => {
    return requests.filter(r =>
      r.residentId === user?.id &&
      r.executorId === executorId &&
      r.status === 'completed'
    ).length;
  };

  const handleOpenRating = (executor: Executor) => {
    setSelectedExecutor(executor);
    // Check if already rated
    const existingRating = getExecutorRating(executor.id, user?.id || '');
    if (existingRating) {
      setRatings({
        quality: existingRating.quality,
        speed: existingRating.speed,
        politeness: existingRating.politeness,
        comment: existingRating.comment
      });
    } else {
      setRatings({ quality: 0, speed: 0, politeness: 0, comment: '' });
    }
    setShowRatingModal(true);
  };

  const handleSubmitRating = () => {
    if (!selectedExecutor || !user) return;

    // Сохраняем оценку
    const newRating: EmployeeRating = {
      id: Date.now().toString(),
      executorId: selectedExecutor.id,
      residentId: user.id,
      quality: ratings.quality,
      speed: ratings.speed,
      politeness: ratings.politeness,
      comment: ratings.comment,
      createdAt: new Date().toISOString()
    };

    saveRatingToStorage(newRating);
    setRatedExecutorIds(prev => {
      if (!prev.includes(selectedExecutor.id)) {
        return [...prev, selectedExecutor.id];
      }
      return prev;
    });
    setShowRatingModal(false);
    setSelectedExecutor(null);
  };

  const StarRatingInput = ({
    value,
    onChange,
    label
  }: {
    value: number;
    onChange: (v: number) => void;
    label: string;
  }) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 touch-manipulation"
          >
            <Star
              className={`w-7 h-7 transition-all ${
                star <= value
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300 hover:text-yellow-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  const averageRating = (r: Rating) => {
    const total = r.quality + r.speed + r.politeness;
    return total > 0 ? (total / 3).toFixed(1) : '0';
  };

  // Get average rating for a rated executor
  const getExecutorAverageRating = (executorId: string): string => {
    const rating = getExecutorRating(executorId, user?.id || '');
    if (!rating) return '0';
    const total = rating.quality + rating.speed + rating.politeness;
    return (total / 3).toFixed(1);
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Star className="w-7 h-7 text-primary-500" />
          {language === 'ru' ? 'Оценить сотрудников' : 'Xodimlarni baholash'}
        </h1>
      </div>

      {/* Info Card */}
      <div className="glass-card p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <ThumbsUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            {language === 'ru'
              ? 'Оцените качество работы сотрудников, которые выполнили ваши заявки. Ваши отзывы помогут улучшить качество обслуживания.'
              : 'Arizalaringizni bajargan xodimlarning ish sifatini baholang. Sizning fikrlaringiz xizmat sifatini yaxshilashga yordam beradi.'}
          </p>
        </div>
      </div>

      {/* Main Content - Two columns on desktop */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* Left Side - Workers List */}
        <div className="space-y-4">
          {/* Unrated Workers */}
          {unratedExecutors.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary-500" />
                {language === 'ru' ? 'Ожидают оценки' : 'Baholash kutilmoqda'}
                <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-sm">
                  {unratedExecutors.length}
                </span>
              </h2>

              {unratedExecutors.map((executor) => (
                <div
                  key={executor.id}
                  className="glass-card p-4 cursor-pointer hover:shadow-md transition-all border-2 border-yellow-200 bg-yellow-50"
                  onClick={() => handleOpenRating(executor)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{executor.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Briefcase className="w-3.5 h-3.5" />
                          <span className="truncate">
                            {SPECIALIZATION_LABELS[executor.specialization] || executor.specialization}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {language === 'ru'
                            ? `${getExecutorRequestsCount(executor.id)} выполненных заявок`
                            : `${getExecutorRequestsCount(executor.id)} ta bajarilgan ariza`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-yellow-700 font-medium hidden sm:inline">
                        {language === 'ru' ? 'Оценить' : 'Baholash'}
                      </span>
                      <ChevronRight className="w-5 h-5 text-yellow-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rated Workers */}
          {ratedExecutors.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                {language === 'ru' ? 'Уже оценены' : 'Allaqachon baholangan'}
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-sm">
                  {ratedExecutors.length}
                </span>
              </h2>

              {ratedExecutors.map((executor) => (
                <div
                  key={executor.id}
                  className="glass-card p-4 border border-green-100 bg-green-50/50 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => handleOpenRating(executor)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{executor.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Briefcase className="w-3.5 h-3.5" />
                          <span className="truncate">
                            {SPECIALIZATION_LABELS[executor.specialization] || executor.specialization}
                          </span>
                        </div>
                        {/* Show rating */}
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm font-medium text-gray-700">{getExecutorAverageRating(executor.id)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-green-600">
                      <Check className="w-5 h-5" />
                      <span className="text-sm font-medium hidden sm:inline">
                        {language === 'ru' ? 'Изменить' : 'O\'zgartirish'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {allExecutors.length === 0 && (
            <div className="glass-card p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {language === 'ru'
                  ? 'Пока нет сотрудников для оценки'
                  : 'Hali baholash uchun xodimlar yo\'q'}
              </p>
            </div>
          )}
        </div>

        {/* Right Side - Selected Worker Details (Desktop) */}
        <div className="hidden md:block">
          {selectedExecutor ? (
            <div className="glass-card p-6 sticky top-4">
              <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center mx-auto mb-3">
                  <User className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold">{selectedExecutor.name}</h2>
                <p className="text-gray-600">
                  {SPECIALIZATION_LABELS[selectedExecutor.specialization] || selectedExecutor.specialization}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {language === 'ru'
                    ? `${getExecutorRequestsCount(selectedExecutor.id)} выполненных заявок`
                    : `${getExecutorRequestsCount(selectedExecutor.id)} ta bajarilgan ariza`}
                </p>
              </div>

              {/* Rating Inputs */}
              <div className="space-y-1 mb-4">
                <StarRatingInput
                  label={language === 'ru' ? 'Качество работы' : 'Ish sifati'}
                  value={ratings.quality}
                  onChange={(v) => setRatings(prev => ({ ...prev, quality: v }))}
                />
                <StarRatingInput
                  label={language === 'ru' ? 'Скорость выполнения' : 'Bajarish tezligi'}
                  value={ratings.speed}
                  onChange={(v) => setRatings(prev => ({ ...prev, speed: v }))}
                />
                <StarRatingInput
                  label={language === 'ru' ? 'Вежливость' : 'Xushmuomalalik'}
                  value={ratings.politeness}
                  onChange={(v) => setRatings(prev => ({ ...prev, politeness: v }))}
                />
              </div>

              {/* Average Score */}
              {(ratings.quality > 0 || ratings.speed > 0 || ratings.politeness > 0) && (
                <div className="flex items-center justify-center gap-2 py-3 bg-primary-50 rounded-xl mb-4">
                  <Star className="w-6 h-6 text-primary-500 fill-primary-500" />
                  <span className="text-xl font-bold text-primary-700">{averageRating(ratings)}</span>
                  <span className="text-sm text-primary-600">/ 5</span>
                </div>
              )}

              {/* Comment */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Комментарий (необязательно)' : 'Izoh (ixtiyoriy)'}
                </label>
                <textarea
                  value={ratings.comment}
                  onChange={(e) => setRatings(prev => ({ ...prev, comment: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none resize-none"
                  rows={3}
                  placeholder={language === 'ru'
                    ? 'Поделитесь впечатлениями...'
                    : 'Taassurotlaringiz bilan o\'rtoqlashing...'}
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmitRating}
                disabled={ratings.quality === 0 || ratings.speed === 0 || ratings.politeness === 0}
                className="w-full py-4 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-5 h-5" />
                {ratedExecutorIds.includes(selectedExecutor.id)
                  ? (language === 'ru' ? 'Обновить оценку' : 'Baholashni yangilash')
                  : (language === 'ru' ? 'Отправить оценку' : 'Baholashni yuborish')
                }
              </button>
            </div>
          ) : (
            <div className="glass-card p-8 text-center sticky top-4">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {language === 'ru'
                  ? 'Выберите сотрудника слева для оценки'
                  : 'Baholash uchun chap tomondan xodimni tanlang'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Rating Modal (Mobile) */}
      {showRatingModal && selectedExecutor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:hidden justify-center">
          <div className="w-full bg-white rounded-t-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">
                {language === 'ru' ? 'Оценить сотрудника' : 'Xodimni baholash'}
              </h2>
              <button
                onClick={() => {
                  setShowRatingModal(false);
                  setSelectedExecutor(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Worker Info */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center flex-shrink-0">
                  <User className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedExecutor.name}</p>
                  <p className="text-sm text-gray-600">
                    {SPECIALIZATION_LABELS[selectedExecutor.specialization] || selectedExecutor.specialization}
                  </p>
                </div>
              </div>

              {/* Rating Inputs */}
              <div className="space-y-1">
                <StarRatingInput
                  label={language === 'ru' ? 'Качество работы' : 'Ish sifati'}
                  value={ratings.quality}
                  onChange={(v) => setRatings(prev => ({ ...prev, quality: v }))}
                />
                <StarRatingInput
                  label={language === 'ru' ? 'Скорость выполнения' : 'Bajarish tezligi'}
                  value={ratings.speed}
                  onChange={(v) => setRatings(prev => ({ ...prev, speed: v }))}
                />
                <StarRatingInput
                  label={language === 'ru' ? 'Вежливость' : 'Xushmuomalalik'}
                  value={ratings.politeness}
                  onChange={(v) => setRatings(prev => ({ ...prev, politeness: v }))}
                />
              </div>

              {/* Average Score */}
              {(ratings.quality > 0 || ratings.speed > 0 || ratings.politeness > 0) && (
                <div className="flex items-center justify-center gap-2 py-3 bg-primary-50 rounded-xl">
                  <Star className="w-6 h-6 text-primary-500 fill-primary-500" />
                  <span className="text-xl font-bold text-primary-700">{averageRating(ratings)}</span>
                  <span className="text-sm text-primary-600">/ 5</span>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Комментарий (необязательно)' : 'Izoh (ixtiyoriy)'}
                </label>
                <textarea
                  value={ratings.comment}
                  onChange={(e) => setRatings(prev => ({ ...prev, comment: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none resize-none"
                  rows={3}
                  placeholder={language === 'ru'
                    ? 'Поделитесь впечатлениями...'
                    : 'Taassurotlaringiz bilan o\'rtoqlashing...'}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-white safe-area-bottom">
              <button
                onClick={handleSubmitRating}
                disabled={ratings.quality === 0 || ratings.speed === 0 || ratings.politeness === 0}
                className="w-full py-4 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-5 h-5" />
                {ratedExecutorIds.includes(selectedExecutor.id)
                  ? (language === 'ru' ? 'Обновить оценку' : 'Baholashni yangilash')
                  : (language === 'ru' ? 'Отправить оценку' : 'Baholashni yuborish')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
