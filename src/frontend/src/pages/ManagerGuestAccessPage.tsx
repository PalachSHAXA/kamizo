import { useState } from 'react';
import {
  QrCode, Search, Filter, X, Clock, CheckCircle, Ban, Package, Users, Car, User,
  AlertTriangle, Calendar, Phone, MapPin, Eye, History
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import {
  VISITOR_TYPE_LABELS, GUEST_ACCESS_STATUS_LABELS,
  type GuestAccessCode, type VisitorType, type GuestAccessStatus
} from '../types';

export function ManagerGuestAccessPage() {
  const { user } = useAuthStore();
  const { getAllGuestAccessCodes, revokeGuestAccessCode, getGuestAccessStats, getGuestAccessLogs } = useDataStore();
  const { language } = useLanguageStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuestAccessStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<VisitorType | 'all'>('all');
  const [selectedCode, setSelectedCode] = useState<GuestAccessCode | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState<GuestAccessCode | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const allCodes = getAllGuestAccessCodes();
  const stats = getGuestAccessStats();
  const recentLogs = getGuestAccessLogs().slice(0, 10);

  // Filter codes
  const filteredCodes = allCodes.filter(code => {
    // Status filter
    if (statusFilter !== 'all' && code.status !== statusFilter) return false;

    // Type filter
    if (typeFilter !== 'all' && code.visitorType !== typeFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesResident = code.residentName.toLowerCase().includes(query) ||
                              code.residentApartment.toLowerCase().includes(query);
      const matchesVisitor = (code.visitorName?.toLowerCase().includes(query)) ||
                             (code.visitorPhone?.toLowerCase().includes(query));
      if (!matchesResident && !matchesVisitor) return false;
    }

    return true;
  });

  const handleRevoke = () => {
    if (!showRevokeModal || !user || !revokeReason.trim()) return;
    revokeGuestAccessCode(
      showRevokeModal.id,
      user.id,
      user.name,
      user.role,
      revokeReason.trim()
    );
    setShowRevokeModal(null);
    setRevokeReason('');
  };

  const getVisitorIcon = (type: VisitorType) => {
    switch (type) {
      case 'courier': return <Package className="w-5 h-5" />;
      case 'guest': return <Users className="w-5 h-5" />;
      case 'taxi': return <Car className="w-5 h-5" />;
      default: return <User className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
          {language === 'ru' ? 'Гостевые пропуска' : 'Mehmon ruxsatnomalari'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {language === 'ru'
            ? 'Мониторинг и управление пропусками посетителей'
            : 'Tashrif buyuruvchilar ruxsatnomalarini monitoring va boshqarish'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{stats.totalActive}</div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <QrCode className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{stats.totalUsedToday}</div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Сегодня' : 'Bugun'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{stats.totalCreatedToday}</div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Создано' : 'Yaratilgan'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              <History className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{allCodes.length}</div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Всего' : 'Jami'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* By visitor type */}
      <div className="grid grid-cols-4 gap-2">
        {(['courier', 'guest', 'taxi', 'other'] as VisitorType[]).map((type) => {
          const label = VISITOR_TYPE_LABELS[type];
          const count = stats.byVisitorType[type];
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`glass-card p-3 text-center transition-all ${
                typeFilter === type ? 'ring-2 ring-primary-500' : ''
              }`}
            >
              <div className="text-2xl mb-1">{label.icon}</div>
              <div className="font-bold">{count}</div>
              <div className="text-xs text-gray-500 truncate">
                {language === 'ru' ? label.label : label.labelUz}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ru' ? 'Поиск по жителю или гостю...' : 'Turar joy egasi yoki mehmon bo\'yicha qidirish...'}
            className="w-full pl-10 pr-4 py-3 bg-white/50 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors ${
            showFilters || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'bg-primary-500 text-gray-900'
              : 'bg-white/50 text-gray-600 hover:bg-white'
          }`}
        >
          <Filter className="w-5 h-5" />
          <span className="hidden sm:inline">{language === 'ru' ? 'Фильтры' : 'Filtrlar'}</span>
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <span className="w-5 h-5 bg-white/30 rounded-full text-xs flex items-center justify-center">
              {(statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{language === 'ru' ? 'Фильтры' : 'Filtrlar'}</h3>
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
              className="text-sm text-primary-600 hover:underline"
            >
              {language === 'ru' ? 'Сбросить' : 'Tozalash'}
            </button>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">
              {language === 'ru' ? 'Статус' : 'Status'}
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all' as const, label: language === 'ru' ? 'Все' : 'Barchasi' },
                { value: 'active' as const, label: language === 'ru' ? 'Активные' : 'Faol' },
                { value: 'used' as const, label: language === 'ru' ? 'Использованные' : 'Ishlatilgan' },
                { value: 'expired' as const, label: language === 'ru' ? 'Истекшие' : 'Muddati tugagan' },
                { value: 'revoked' as const, label: language === 'ru' ? 'Отменённые' : 'Bekor qilingan' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === value
                      ? 'bg-primary-500 text-gray-900'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">
              {language === 'ru' ? 'Тип посетителя' : 'Tashrif buyuruvchi turi'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-primary-500 text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {language === 'ru' ? 'Все' : 'Barchasi'}
              </button>
              {(['courier', 'guest', 'taxi', 'other'] as VisitorType[]).map((type) => {
                const label = VISITOR_TYPE_LABELS[type];
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                      typeFilter === type
                        ? 'bg-primary-500 text-gray-900'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{label.icon}</span>
                    {language === 'ru' ? label.label : label.labelUz}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Codes list */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">
            {language === 'ru' ? 'Пропуска' : 'Ruxsatnomalar'} ({filteredCodes.length})
          </h3>
        </div>

        {filteredCodes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {language === 'ru' ? 'Пропуска не найдены' : 'Ruxsatnomalar topilmadi'}
          </div>
        ) : (
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {filteredCodes.map((code) => {
              const visitorLabel = VISITOR_TYPE_LABELS[code.visitorType];
              const statusLabel = GUEST_ACCESS_STATUS_LABELS[code.status];
              const isActive = code.status === 'active';

              return (
                <div key={code.id} className="p-4 hover:bg-gray-50/50">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'bg-green-100 text-green-600' :
                      code.status === 'used' ? 'bg-blue-100 text-blue-600' :
                      code.status === 'revoked' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {getVisitorIcon(code.visitorType)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{code.residentName}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          isActive ? 'bg-green-100 text-green-700' :
                          code.status === 'used' ? 'bg-blue-100 text-blue-700' :
                          code.status === 'revoked' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {language === 'ru' ? statusLabel.label : statusLabel.labelUz}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {code.residentAddress}, {language === 'ru' ? 'кв.' : 'xona'} {code.residentApartment}
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="text-base">{visitorLabel.icon}</span>
                          {code.visitorName || (language === 'ru' ? visitorLabel.label : visitorLabel.labelUz)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(code.validUntil).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                        </span>
                      </div>

                      {code.revocationReason && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded inline-block">
                          {language === 'ru' ? 'Причина' : 'Sabab'}: {code.revocationReason}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedCode(code)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        title={language === 'ru' ? 'Подробнее' : 'Batafsil'}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isActive && (
                        <button
                          onClick={() => setShowRevokeModal(code)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={language === 'ru' ? 'Отменить' : 'Bekor qilish'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentLogs.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-bold">{language === 'ru' ? 'Последняя активность' : 'So\'nggi faoliyat'}</h3>
          </div>
          <div className="divide-y">
            {recentLogs.slice(0, 5).map((log) => {
              const isAllowed = log.action === 'entry_allowed';
              const isDenied = log.action === 'entry_denied';

              return (
                <div key={log.id} className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isAllowed ? 'bg-green-100 text-green-600' :
                    isDenied ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {isAllowed ? <CheckCircle className="w-4 h-4" /> :
                     isDenied ? <Ban className="w-4 h-4" /> :
                     <AlertTriangle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{log.residentName}</span>
                      <span className="text-gray-500"> - {language === 'ru' ? 'кв.' : 'xona'} {log.residentApartment}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(log.timestamp).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                    </div>
                  </div>
                  <span className="text-lg">{VISITOR_TYPE_LABELS[log.visitorType].icon}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {language === 'ru' ? 'Детали пропуска' : 'Ruxsatnoma tafsilotlari'}
              </h2>
              <button onClick={() => setSelectedCode(null)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status */}
              <div className={`p-4 rounded-xl ${
                selectedCode.status === 'active' ? 'bg-green-50' :
                selectedCode.status === 'used' ? 'bg-blue-50' :
                selectedCode.status === 'revoked' ? 'bg-red-50' :
                'bg-gray-50'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedCode.status === 'active' ? 'bg-green-200 text-green-700' :
                    selectedCode.status === 'used' ? 'bg-blue-200 text-blue-700' :
                    selectedCode.status === 'revoked' ? 'bg-red-200 text-red-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {getVisitorIcon(selectedCode.visitorType)}
                  </div>
                  <div>
                    <div className="font-bold">
                      {language === 'ru'
                        ? VISITOR_TYPE_LABELS[selectedCode.visitorType].label
                        : VISITOR_TYPE_LABELS[selectedCode.visitorType].labelUz}
                    </div>
                    <div className={`text-sm ${
                      selectedCode.status === 'active' ? 'text-green-600' :
                      selectedCode.status === 'used' ? 'text-blue-600' :
                      selectedCode.status === 'revoked' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {language === 'ru'
                        ? GUEST_ACCESS_STATUS_LABELS[selectedCode.status].label
                        : GUEST_ACCESS_STATUS_LABELS[selectedCode.status].labelUz}
                    </div>
                  </div>
                </div>
              </div>

              {/* Resident */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">
                  {language === 'ru' ? 'Житель' : 'Turar joy egasi'}
                </h4>
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <div className="font-medium">{selectedCode.residentName}</div>
                  <div className="text-sm text-gray-600 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {selectedCode.residentAddress}, {language === 'ru' ? 'кв.' : 'xona'} {selectedCode.residentApartment}
                  </div>
                  <div className="text-sm text-gray-600 flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {selectedCode.residentPhone}
                  </div>
                </div>
              </div>

              {/* Visitor */}
              {(selectedCode.visitorName || selectedCode.visitorPhone || selectedCode.visitorVehiclePlate) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    {language === 'ru' ? 'Посетитель' : 'Tashrif buyuruvchi'}
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    {selectedCode.visitorName && (
                      <div className="font-medium">{selectedCode.visitorName}</div>
                    )}
                    {selectedCode.visitorPhone && (
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {selectedCode.visitorPhone}
                      </div>
                    )}
                    {selectedCode.visitorVehiclePlate && (
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Car className="w-4 h-4" />
                        {selectedCode.visitorVehiclePlate}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Создан' : 'Yaratilgan'}</div>
                  <div className="font-medium text-sm">
                    {new Date(selectedCode.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Действует до' : 'Gacha amal qiladi'}</div>
                  <div className="font-medium text-sm">
                    {new Date(selectedCode.validUntil).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                  </div>
                </div>
              </div>

              {/* Usage */}
              {selectedCode.accessType !== 'single_use' && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Использований' : 'Ishlatilgan'}</div>
                  <div className="font-medium">
                    {selectedCode.currentUses} / {selectedCode.maxUses === 999 ? '∞' : selectedCode.maxUses}
                  </div>
                </div>
              )}

              {/* Revocation info */}
              {selectedCode.status === 'revoked' && (
                <div className="bg-red-50 rounded-xl p-3 space-y-1">
                  <div className="text-xs text-red-500">{language === 'ru' ? 'Отменено' : 'Bekor qilingan'}</div>
                  <div className="font-medium text-red-700">{selectedCode.revokedByName}</div>
                  <div className="text-sm text-red-600">{selectedCode.revocationReason}</div>
                  {selectedCode.revokedAt && (
                    <div className="text-xs text-red-400">
                      {new Date(selectedCode.revokedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedCode.notes && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="text-xs text-blue-500">{language === 'ru' ? 'Примечание' : 'Izoh'}</div>
                  <div className="text-sm text-blue-700">{selectedCode.notes}</div>
                </div>
              )}

              {/* Actions */}
              {selectedCode.status === 'active' && (
                <button
                  onClick={() => {
                    setSelectedCode(null);
                    setShowRevokeModal(selectedCode);
                  }}
                  className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <Ban className="w-5 h-5" />
                  {language === 'ru' ? 'Отменить пропуск' : 'Ruxsatnomani bekor qilish'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revoke modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">
                {language === 'ru' ? 'Отменить пропуск?' : 'Ruxsatnomani bekor qilasizmi?'}
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                {language === 'ru'
                  ? `Пропуск для ${showRevokeModal.residentName} (кв. ${showRevokeModal.residentApartment})`
                  : `${showRevokeModal.residentName} (${showRevokeModal.residentApartment}-xona) uchun ruxsatnoma`}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Причина отмены *' : 'Bekor qilish sababi *'}
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder={language === 'ru' ? 'Укажите причину...' : 'Sababni kiriting...'}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:ring-0 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRevokeModal(null);
                  setRevokeReason('');
                }}
                className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={handleRevoke}
                disabled={!revokeReason.trim()}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded-xl font-bold"
              >
                {language === 'ru' ? 'Отменить пропуск' : 'Bekor qilish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
