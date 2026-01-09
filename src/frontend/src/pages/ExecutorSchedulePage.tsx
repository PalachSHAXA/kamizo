import { useState, useMemo } from 'react';
import {
  CalendarDays, Clock, MapPin, ChevronLeft, ChevronRight, Calendar, X,
  User, Phone, Check, FileText, Wrench
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { PRIORITY_LABELS, SPECIALIZATION_LABELS, STATUS_LABELS } from '../types';
import type { Request } from '../types';

export function ExecutorSchedulePage() {
  const { user } = useAuthStore();
  const { requests, executors } = useDataStore();
  const { language } = useLanguageStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'all'>('schedule');

  // Find current executor
  const currentExecutor = executors.find(e => e.login === user?.login);

  // Filter requests for this executor
  const myRequests = requests.filter(r => r.executorId === currentExecutor?.id);

  // Active requests (not completed/cancelled)
  const activeRequests = useMemo(() => {
    return myRequests
      .filter(r => ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(r.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myRequests]);

  // Scheduled requests for agenda view (requests with scheduledDate)
  const scheduledRequests = useMemo(() => {
    return myRequests
      .filter(r => r.scheduledDate && ['assigned', 'accepted', 'in_progress'].includes(r.status))
      .sort((a, b) => {
        const dateA = new Date(a.scheduledDate!).getTime();
        const dateB = new Date(b.scheduledDate!).getTime();
        return dateA - dateB;
      });
  }, [myRequests]);

  // Group scheduled requests by date for calendar
  const requestsByDate = useMemo(() => {
    const grouped: Record<string, Request[]> = {};
    scheduledRequests.forEach(req => {
      if (req.scheduledDate) {
        const dateKey = req.scheduledDate;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(req);
      }
    });
    return grouped;
  }, [scheduledRequests]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const tabs = [
    {
      id: 'schedule' as const,
      label: language === 'ru' ? 'Расписание' : 'Jadval',
      icon: CalendarDays,
      count: scheduledRequests.length
    },
    {
      id: 'all' as const,
      label: language === 'ru' ? 'Все заявки' : 'Barcha arizalar',
      icon: FileText,
      count: activeRequests.length
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <CalendarDays className="w-7 h-7 text-blue-500" />
          {language === 'ru' ? 'Расписание' : 'Jadval'}
        </h1>
        <div className="flex items-center gap-2">
          {activeRequests.length > 0 && (
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
              {activeRequests.length} {language === 'ru' ? 'активных' : 'faol'}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white/50 text-gray-600 hover:bg-white/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-white/20'
                    : 'bg-gray-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mini Calendar */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-500" />
              {language === 'ru' ? 'Календарь заявок' : 'Arizalar kalendari'}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setSelectedDate(newDate);
                }}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium min-w-[140px] text-center">
                {selectedDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setSelectedDate(newDate);
                }}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
              <div key={day} className="text-xs font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const year = selectedDate.getFullYear();
              const month = selectedDate.getMonth();
              const firstDay = new Date(year, month, 1);
              const lastDay = new Date(year, month + 1, 0);
              const startPadding = (firstDay.getDay() + 6) % 7;
              const days = [];

              // Padding for start
              for (let i = 0; i < startPadding; i++) {
                days.push(<div key={`pad-${i}`} className="h-16 md:h-14" />);
              }

              // Days of month
              for (let day = 1; day <= lastDay.getDate(); day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayRequests = requestsByDate[dateStr] || [];
                const hasRequests = dayRequests.length > 0;
                const requestCount = dayRequests.length;
                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                const isSelected = selectedCalendarDate === dateStr;
                const isPast = new Date(dateStr) < new Date(new Date().toISOString().split('T')[0]);

                // Get priority breakdown for booking-style indicators
                const urgentCount = dayRequests.filter(r => r.priority === 'urgent').length;
                const highCount = dayRequests.filter(r => r.priority === 'high').length;
                const normalCount = dayRequests.filter(r => r.priority !== 'urgent' && r.priority !== 'high').length;

                days.push(
                  <div
                    key={day}
                    onClick={() => setSelectedCalendarDate(dateStr)}
                    className={`h-16 md:h-14 flex flex-col items-center justify-start pt-1 rounded-xl relative cursor-pointer transition-all border-2 ${
                      isSelected ? 'bg-blue-500 text-white shadow-lg scale-[1.02] border-blue-600' :
                      isToday ? 'bg-blue-50 border-blue-300 font-bold' :
                      hasRequests ? 'bg-white/70 border-transparent hover:border-blue-300 hover:shadow-md' :
                      isPast ? 'bg-gray-50/50 border-transparent text-gray-400' :
                      'hover:bg-gray-100/50 border-transparent'
                    }`}
                  >
                    <span className={`text-sm ${isToday && !isSelected ? 'text-blue-600' : ''}`}>{day}</span>

                    {/* Booking-style indicators */}
                    {hasRequests && (
                      <div className="flex flex-col items-center gap-0.5 mt-0.5">
                        {/* Priority dots row */}
                        <div className="flex gap-0.5 flex-wrap justify-center max-w-[40px]">
                          {urgentCount > 0 && (
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-red-300' : 'bg-red-500'}`} title={`${urgentCount} urgent`} />
                          )}
                          {highCount > 0 && (
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-orange-300' : 'bg-orange-500'}`} title={`${highCount} high`} />
                          )}
                          {normalCount > 0 && (
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-blue-500'}`} title={`${normalCount} normal`} />
                          )}
                        </div>
                        {/* Total count badge */}
                        {requestCount > 1 && (
                          <span className={`text-[10px] font-bold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                            {requestCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              return days;
            })()}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-50 border-2 border-blue-300 rounded" />
              <span>{language === 'ru' ? 'Сегодня' : 'Bugun'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span>{language === 'ru' ? 'Срочно' : 'Shoshilinch'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-orange-500 rounded-full" />
              <span>{language === 'ru' ? 'Высокий' : 'Yuqori'}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span>{language === 'ru' ? 'Обычный' : 'Oddiy'}</span>
            </div>
          </div>
        </div>

        {/* Agenda / Upcoming Requests */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-amber-500" />
            {selectedCalendarDate
              ? `${language === 'ru' ? 'Заявки на' : 'Arizalar'} ${new Date(selectedCalendarDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
              : (language === 'ru' ? 'Предстоящие заявки' : 'Kelayotgan arizalar')
            }
            {selectedCalendarDate && (
              <button
                onClick={() => setSelectedCalendarDate(null)}
                className="ml-auto text-sm text-blue-600 hover:text-blue-800 font-normal"
              >
                {language === 'ru' ? 'Показать все' : 'Hammasini ko\'rsatish'}
              </button>
            )}
          </h3>

          {(() => {
            // Filter requests based on selected date or show all upcoming
            const displayRequests = selectedCalendarDate
              ? scheduledRequests.filter(r => r.scheduledDate === selectedCalendarDate)
              : scheduledRequests;

            if (displayRequests.length === 0) {
              return (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {selectedCalendarDate
                      ? (language === 'ru' ? 'Нет заявок на выбранную дату' : 'Tanlangan sanada arizalar yo\'q')
                      : (language === 'ru' ? 'Нет запланированных заявок' : 'Rejalashtirilgan arizalar yo\'q')
                    }
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    {selectedCalendarDate
                      ? (language === 'ru' ? 'Выберите другой день в календаре' : 'Kalendarda boshqa kunni tanlang')
                      : (language === 'ru' ? 'Заявки с указанной датой появятся здесь' : 'Sanasi ko\'rsatilgan arizalar bu yerda paydo bo\'ladi')
                    }
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {displayRequests.map((request) => {
                  const scheduleDate = new Date(request.scheduledDate!);
                  const isToday = new Date().toISOString().split('T')[0] === request.scheduledDate;
                  const isTomorrow = (() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return tomorrow.toISOString().split('T')[0] === request.scheduledDate;
                  })();

                  return (
                    <div
                      key={request.id}
                      className={`p-4 rounded-xl border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                        isToday ? 'bg-amber-50 border-amber-500' :
                        isTomorrow ? 'bg-blue-50 border-blue-500' :
                        'bg-white/50 border-gray-300'
                      }`}
                      onClick={() => setSelectedRequest(request)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isToday && (
                              <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                                {language === 'ru' ? 'Сегодня' : 'Bugun'}
                              </span>
                            )}
                            {isTomorrow && (
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                                {language === 'ru' ? 'Завтра' : 'Ertaga'}
                              </span>
                            )}
                            <span className="text-sm text-gray-500">#{request.number}</span>
                          </div>
                          <h4 className="font-semibold">{request.title}</h4>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                            {request.scheduledTime && (
                              <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">
                                <Clock className="w-4 h-4" />
                                {request.scheduledTime}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {request.address}, кв. {request.apartment}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col gap-2">
                          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                            request.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                            request.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            request.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {PRIORITY_LABELS[request.priority]}
                          </span>
                          {!selectedCalendarDate && (
                            <span className="text-xs text-gray-400">
                              {scheduleDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* All Requests Tab */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {activeRequests.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {language === 'ru' ? 'Нет активных заявок' : 'Faol arizalar yo\'q'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {language === 'ru' ? 'Ваши назначенные заявки появятся здесь' : 'Sizga tayinlangan arizalar bu yerda paydo bo\'ladi'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRequests.map((request) => (
                <div
                  key={request.id}
                  className="glass-card p-4 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-500">#{request.number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        request.status === 'assigned' ? 'bg-indigo-100 text-indigo-700' :
                        request.status === 'accepted' ? 'bg-cyan-100 text-cyan-700' :
                        request.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                        request.status === 'pending_approval' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {STATUS_LABELS[request.status]}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      request.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      request.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      request.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {PRIORITY_LABELS[request.priority]}
                    </span>
                  </div>
                  <h4 className="font-semibold mb-2">{request.title}</h4>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{request.description}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {request.address}, кв. {request.apartment}
                    </span>
                    {request.scheduledDate && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(request.scheduledDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        {request.scheduledTime && ` ${request.scheduledTime}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
                    <User className="w-3.5 h-3.5" />
                    <span>{request.residentName}</span>
                    <span className="text-gray-300">•</span>
                    <Phone className="w-3.5 h-3.5" />
                    <a href={`tel:${request.residentPhone}`} className="text-primary-600 hover:underline" onClick={e => e.stopPropagation()}>
                      {request.residentPhone}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <div className="modal-backdrop" onClick={() => setSelectedRequest(null)}>
          <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-sm text-gray-500">{language === 'ru' ? 'Заявка' : 'Ariza'} #{selectedRequest.number}</div>
                <h2 className="text-xl font-bold">{selectedRequest.title}</h2>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-white/30 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Scheduled Date/Time */}
              {selectedRequest.scheduledDate && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-medium text-blue-800 flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4" />
                    {language === 'ru' ? 'Желаемое время выполнения' : 'Kerakli vaqt'}
                  </h3>
                  <div className="flex items-center gap-4 text-blue-700">
                    <span>{new Date(selectedRequest.scheduledDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    {selectedRequest.scheduledTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {selectedRequest.scheduledTime}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Priority & Category */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  selectedRequest.priority === 'urgent' ? 'text-red-600 bg-red-50' :
                  selectedRequest.priority === 'high' ? 'text-orange-600 bg-orange-50' :
                  selectedRequest.priority === 'medium' ? 'text-amber-600 bg-amber-50' :
                  'text-gray-600 bg-gray-50'
                }`}>
                  {PRIORITY_LABELS[selectedRequest.priority]}
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                  {SPECIALIZATION_LABELS[selectedRequest.category]}
                </span>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">{language === 'ru' ? 'Описание' : 'Tavsif'}</h3>
                <p className="text-gray-900">{selectedRequest.description}</p>
              </div>

              {/* Resident Info */}
              <div className="bg-white/30 rounded-xl p-4 space-y-3">
                <h3 className="font-medium">{language === 'ru' ? 'Информация о жителе' : 'Yashlovchi haqida'}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>{selectedRequest.residentName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <a href={`tel:${selectedRequest.residentPhone}`} className="text-primary-600 hover:underline">
                      {selectedRequest.residentPhone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{selectedRequest.address}, кв. {selectedRequest.apartment}</span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white/30 rounded-xl p-4 space-y-3">
                <h3 className="font-medium">{language === 'ru' ? 'История' : 'Tarix'}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{language === 'ru' ? 'Создана' : 'Yaratilgan'}</span>
                    <span>{formatDate(selectedRequest.createdAt)}</span>
                  </div>
                  {selectedRequest.assignedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{language === 'ru' ? 'Назначена' : 'Tayinlangan'}</span>
                      <span>{formatDate(selectedRequest.assignedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <a
                href={`tel:${selectedRequest.residentPhone}`}
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                {language === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq'}
              </a>
              <button
                onClick={() => setSelectedRequest(null)}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {language === 'ru' ? 'Закрыть' : 'Yopish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
