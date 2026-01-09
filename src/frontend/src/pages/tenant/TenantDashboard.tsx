import { useState, useEffect } from 'react';
import { Key, Calendar, ChevronLeft, ChevronRight, Users, Home, DollarSign, TrendingUp, Clock, MapPin, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';

export function TenantDashboard() {
  const { user } = useAuthStore();
  const { rentalApartments, rentalRecords, fetchMyRentals } = useDataStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedApartment, setSelectedApartment] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch my apartments on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await fetchMyRentals();
      } catch (error) {
        console.error('Failed to fetch my rentals:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [fetchMyRentals]);

  // Get apartments owned by this tenant (now filtered by ownerId = user.id from backend)
  const myApartments = rentalApartments;

  // Get all records for all my apartments (already filtered from backend)
  const allMyRecords = rentalRecords;

  const getApartmentRecords = (apartmentId: string) => {
    return rentalRecords.filter(r => r.apartmentId === apartmentId).sort((a, b) =>
      new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatAmount = (amount: number, currency: string) => {
    if (currency === 'UZS') {
      return amount.toLocaleString('ru-RU') + ' сум';
    }
    return '$' + amount.toLocaleString('en-US');
  };

  const totalEarnings = myApartments.reduce((sum, apt) => {
    const aptRecords = getApartmentRecords(apt.id);
    return sum + aptRecords.reduce((s, r) => s + (r.currency === 'UZS' ? r.amount : r.amount * 12500), 0);
  }, 0);


  // Count total guests
  const totalGuests = allMyRecords.reduce((count, record) => {
    const guestCount = record.guestNames.split(',').length;
    return count + guestCount;
  }, 0);

  // Get active bookings count
  const activeBookings = allMyRecords.filter(r => {
    const now = new Date();
    return new Date(r.checkInDate) <= now && new Date(r.checkOutDate) >= now;
  }).length;

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay() || 7;

    return { daysInMonth, startingDay, year, month };
  };

  const getRecordsForDate = (date: Date) => {
    const filteredRecords = selectedApartment
      ? allMyRecords.filter(r => r.apartmentId === selectedApartment)
      : allMyRecords;

    return filteredRecords.filter(record => {
      const checkIn = new Date(record.checkInDate);
      const checkOut = new Date(record.checkOutDate);
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(23, 59, 59, 999);
      const compareDate = new Date(date);
      compareDate.setHours(12, 0, 0, 0);
      return compareDate >= checkIn && compareDate <= checkOut;
    });
  };

  const { daysInMonth, startingDay, year, month } = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const isCommercialOwner = user?.role === 'commercial_owner';

  // Get records for selected date
  const selectedDateRecords = selectedDate ? getRecordsForDate(selectedDate) : [];

  // Get upcoming check-ins (next 7 days)
  const upcomingCheckIns = allMyRecords.filter(r => {
    const checkIn = new Date(r.checkInDate);
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);
    return checkIn >= now && checkIn <= weekLater;
  }).slice(0, 3);

  // Get current guests
  const currentGuests = allMyRecords.filter(r => {
    const now = new Date();
    return new Date(r.checkInDate) <= now && new Date(r.checkOutDate) >= now;
  });

  const renderCalendar = () => {
    const days = [];
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    for (let i = 1; i < startingDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-12 md:h-16" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const records = getRecordsForDate(date);
      const isToday = date.toDateString() === new Date().toDateString();
      const isSelected = selectedDate?.toDateString() === date.toDateString();
      const hasCheckIn = (selectedApartment
        ? allMyRecords.filter(r => r.apartmentId === selectedApartment)
        : allMyRecords
      ).some(r => new Date(r.checkInDate).toDateString() === date.toDateString());
      const hasCheckOut = (selectedApartment
        ? allMyRecords.filter(r => r.apartmentId === selectedApartment)
        : allMyRecords
      ).some(r => new Date(r.checkOutDate).toDateString() === date.toDateString());

      days.push(
        <button
          key={day}
          onClick={() => setSelectedDate(date)}
          className={`h-12 md:h-16 p-1 rounded-xl border-2 transition-all relative ${
            isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200' :
            isToday ? 'border-primary-300 bg-primary-50/50' :
            records.length > 0 ? 'border-green-200 bg-green-50 hover:border-green-300' :
            'border-transparent hover:bg-gray-50'
          }`}
        >
          <div className="flex flex-col items-center justify-center h-full">
            <span className={`text-sm font-medium ${
              isSelected ? 'text-primary-700' :
              isToday ? 'text-primary-600' :
              records.length > 0 ? 'text-green-700' : 'text-gray-700'
            }`}>
              {day}
            </span>
            <div className="flex gap-0.5 mt-0.5">
              {hasCheckIn && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              {hasCheckOut && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
              {records.length > 0 && !hasCheckIn && !hasCheckOut && (
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </div>
          </div>
        </button>
      );
    }

    return (
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="font-semibold capitalize text-lg">{monthName}</h3>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Apartment filter */}
        {myApartments.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedApartment(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                !selectedApartment ? 'bg-primary-500 text-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Все квартиры
            </button>
            {myApartments.map(apt => (
              <button
                key={apt.id}
                onClick={() => setSelectedApartment(apt.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedApartment === apt.id ? 'bg-primary-500 text-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {apt.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Заезд</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>Выезд</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Занято</span>
          </div>
        </div>
      </div>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои квартиры</h1>
          <p className="text-gray-500">Добро пожаловать, {user?.name}</p>
        </div>
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-12 h-12 text-primary-500 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Загрузка данных...</h3>
        </div>
      </div>
    );
  }

  if (myApartments.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isCommercialOwner ? 'Моя недвижимость' : 'Мои квартиры'}
          </h1>
          <p className="text-gray-500">Добро пожаловать, {user?.name}</p>
        </div>
        <div className="glass-card p-8 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Нет назначенных квартир</h3>
          <p className="text-gray-500">Обратитесь к менеджеру для добавления квартиры</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isCommercialOwner ? 'Моя недвижимость' : 'Мои квартиры'}
        </h1>
        <p className="text-gray-500">
          Добро пожаловать, {user?.name}
          {isCommercialOwner && (
            <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              Коммерческий владелец
            </span>
          )}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-xl">
              <Home className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{myApartments.length}</div>
              <div className="text-xs text-gray-500">Квартир</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-xl">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{activeBookings}</div>
              <div className="text-xs text-gray-500">Проживают сейчас</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalGuests}</div>
              <div className="text-xs text-gray-500">Гостей всего</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">{(totalEarnings / 1000000).toFixed(1)}М</div>
              <div className="text-xs text-gray-500">Доход (сум)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar - Takes 2 columns */}
        <div className="lg:col-span-2">
          {renderCalendar()}

          {/* Selected Date Details */}
          {selectedDate && (
            <div className="mt-4 glass-card p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {selectedDate.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </h4>
              {selectedDateRecords.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">Нет бронирований на эту дату</p>
              ) : (
                <div className="space-y-2">
                  {selectedDateRecords.map(record => {
                    const apartment = myApartments.find(a => a.id === record.apartmentId);
                    const isCheckIn = new Date(record.checkInDate).toDateString() === selectedDate.toDateString();
                    const isCheckOut = new Date(record.checkOutDate).toDateString() === selectedDate.toDateString();

                    return (
                      <div key={record.id} className="p-3 bg-white/60 rounded-xl border border-gray-100">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">{record.guestNames}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3" />
                              {apartment?.name}
                            </div>
                          </div>
                          <div className="text-right">
                            {isCheckIn && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                Заезд
                              </span>
                            )}
                            {isCheckOut && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                Выезд
                              </span>
                            )}
                            {!isCheckIn && !isCheckOut && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                Проживание
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                          <span>{formatDate(record.checkInDate)} - {formatDate(record.checkOutDate)}</span>
                          <span className="font-semibold text-green-600">
                            {formatAmount(record.amount, record.currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Current Guests */}
          <div className="glass-card p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              Текущие гости
            </h4>
            {currentGuests.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Нет активных бронирований</p>
            ) : (
              <div className="space-y-2">
                {currentGuests.map(record => {
                  const apartment = myApartments.find(a => a.id === record.apartmentId);
                  const daysLeft = Math.ceil(
                    (new Date(record.checkOutDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );

                  return (
                    <div key={record.id} className="p-3 bg-green-50 rounded-xl border border-green-100">
                      <div className="font-medium text-sm">{record.guestNames}</div>
                      <div className="text-xs text-gray-500 mt-1">{apartment?.name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'} до выезда
                        </span>
                        <span className="text-xs font-semibold text-green-700">
                          {formatAmount(record.amount, record.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Check-ins */}
          <div className="glass-card p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Ближайшие заезды
            </h4>
            {upcomingCheckIns.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Нет запланированных заездов</p>
            ) : (
              <div className="space-y-2">
                {upcomingCheckIns.map(record => {
                  const apartment = myApartments.find(a => a.id === record.apartmentId);
                  const checkInDate = new Date(record.checkInDate);
                  const isToday = checkInDate.toDateString() === new Date().toDateString();
                  const isTomorrow = checkInDate.toDateString() ===
                    new Date(Date.now() + 86400000).toDateString();

                  return (
                    <div key={record.id} className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{record.guestNames}</div>
                          <div className="text-xs text-gray-500 mt-1">{apartment?.name}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isToday ? 'bg-red-100 text-red-700' :
                          isTomorrow ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : formatDate(record.checkInDate)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Apartments Quick View */}
          <div className="glass-card p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Home className="w-4 h-4 text-primary-600" />
              Мои квартиры
            </h4>
            <div className="space-y-2">
              {myApartments.map(apartment => {
                const records = getApartmentRecords(apartment.id);
                const activeRecord = records.find(r =>
                  new Date(r.checkOutDate) >= new Date() && new Date(r.checkInDate) <= new Date()
                );

                return (
                  <div
                    key={apartment.id}
                    className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                      activeRecord
                        ? 'bg-green-50 border-green-200 hover:bg-green-100'
                        : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedApartment(
                      selectedApartment === apartment.id ? null : apartment.id
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{apartment.name}</div>
                        <div className="text-xs text-gray-500">{apartment.address}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        activeRecord ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {activeRecord ? 'Занята' : 'Свободна'}
                      </span>
                    </div>
                    {activeRecord && (
                      <div className="mt-2 text-xs text-green-700">
                        {activeRecord.guestNames} • до {formatDate(activeRecord.checkOutDate)}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>{records.length} бронирований</span>
                      <span>•</span>
                      <span>{records.reduce((s, r) => s + r.guestNames.split(',').length, 0)} гостей</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
