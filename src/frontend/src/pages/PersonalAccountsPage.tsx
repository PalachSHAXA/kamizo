import { useState } from 'react';
import {
  CreditCard, Search, Plus, Edit, X, Home,
  Phone, Mail, AlertTriangle, CheckCircle,
  DollarSign, User
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useLanguageStore } from '../stores/languageStore';
import type { PersonalAccount } from '../types';

export function PersonalAccountsPage() {
  const {
    personalAccounts,
    owners,
    buildings,
    updatePersonalAccount,
  } = useCRMStore();
  const { language } = useLanguageStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDebt, setFilterDebt] = useState<string>('all');
  const [editingAccount, setEditingAccount] = useState<PersonalAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<PersonalAccount | null>(null);

  // Filter accounts
  const filteredAccounts = personalAccounts.filter(account => {
    const matchesSearch = searchQuery === '' ||
      account.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.apartmentNumber.includes(searchQuery);

    const matchesBuilding = filterBuilding === 'all' || account.buildingId === filterBuilding;
    const matchesStatus = filterStatus === 'all' || account.status === filterStatus;
    const matchesDebt = filterDebt === 'all' ||
      (filterDebt === 'with_debt' && account.currentDebt > 0) ||
      (filterDebt === 'no_debt' && account.currentDebt <= 0);

    return matchesSearch && matchesBuilding && matchesStatus && matchesDebt;
  });

  // Stats
  const totalAccounts = personalAccounts.length;
  const activeAccounts = personalAccounts.filter(a => a.status === 'active').length;
  const totalDebt = personalAccounts.reduce((sum, a) => sum + a.currentDebt, 0);
  const debtorsCount = personalAccounts.filter(a => a.currentDebt > 0).length;

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  const getStatusBadge = (status: PersonalAccount['status']) => {
    const styles = {
      active: 'bg-green-100 text-green-700',
      closed: 'bg-gray-100 text-gray-700',
      blocked: 'bg-red-100 text-red-700',
      archived: 'bg-yellow-100 text-yellow-700',
    };
    const labels = {
      active: language === 'ru' ? 'Активен' : 'Faol',
      closed: language === 'ru' ? 'Закрыт' : 'Yopiq',
      blocked: language === 'ru' ? 'Заблокирован' : 'Bloklangan',
      archived: language === 'ru' ? 'Архив' : 'Arxiv',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'ru' ? 'Лицевые счета' : 'Shaxsiy hisoblar'}
          </h1>
          <p className="text-gray-500 mt-1">
            {language === 'ru' ? 'Управление лицевыми счетами жильцов' : 'Yashovchilarning shaxsiy hisoblarini boshqarish'}
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2 opacity-50 cursor-not-allowed"
          title={language === 'ru' ? 'Создание через страницу квартир' : 'Kvartiralar sahifasidan yaratish'}
        >
          <Plus className="w-4 h-4" />
          {language === 'ru' ? 'Новый ЛС' : 'Yangi SH'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalAccounts}</div>
              <div className="text-xs text-gray-500">
                {language === 'ru' ? 'Всего ЛС' : 'Jami SH'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold">{activeAccounts}</div>
              <div className="text-xs text-gray-500">
                {language === 'ru' ? 'Активных' : 'Faollar'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-400 to-rose-500 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">{formatMoney(totalDebt)}</div>
              <div className="text-xs text-gray-500">
                {language === 'ru' ? 'Общий долг' : 'Umumiy qarz'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold">{debtorsCount}</div>
              <div className="text-xs text-gray-500">
                {language === 'ru' ? 'Должников' : 'Qarzdorlar'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={language === 'ru' ? 'Поиск по номеру ЛС, ФИО или квартире...' : 'SH raqami, F.I.O. yoki kvartira bo\'yicha qidirish...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className="input-field w-full md:w-48"
          >
            <option value="all">{language === 'ru' ? 'Все дома' : 'Barcha uylar'}</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field w-full md:w-36"
          >
            <option value="all">{language === 'ru' ? 'Все статусы' : 'Barcha statuslar'}</option>
            <option value="active">{language === 'ru' ? 'Активные' : 'Faollar'}</option>
            <option value="closed">{language === 'ru' ? 'Закрытые' : 'Yopiqlar'}</option>
            <option value="blocked">{language === 'ru' ? 'Заблокированные' : 'Bloklangan'}</option>
          </select>

          <select
            value={filterDebt}
            onChange={(e) => setFilterDebt(e.target.value)}
            className="input-field w-full md:w-36"
          >
            <option value="all">{language === 'ru' ? 'Все' : 'Hammasi'}</option>
            <option value="with_debt">{language === 'ru' ? 'С долгом' : 'Qarzli'}</option>
            <option value="no_debt">{language === 'ru' ? 'Без долга' : 'Qarzsiz'}</option>
          </select>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Номер ЛС' : 'SH raqami'}
                </th>
                <th className="text-left p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Владелец' : 'Egasi'}
                </th>
                <th className="text-left p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Адрес' : 'Manzil'}
                </th>
                <th className="text-right p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Площадь' : 'Maydoni'}
                </th>
                <th className="text-right p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Жителей' : 'Yashovchilar'}
                </th>
                <th className="text-right p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Баланс' : 'Balans'}
                </th>
                <th className="text-center p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Статус' : 'Status'}
                </th>
                <th className="text-right p-4 font-medium text-gray-600">
                  {language === 'ru' ? 'Действия' : 'Amallar'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const owner = owners.find(o => o.id === account.primaryOwnerId);
                const building = buildings.find(b => b.id === account.buildingId);

                return (
                  <tr
                    key={account.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedAccount(account)}
                  >
                    <td className="p-4">
                      <div className="font-medium text-blue-600">{account.number}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium">{account.ownerName}</div>
                      {owner?.phone && (
                        <div className="text-xs text-gray-500">{owner.phone}</div>
                      )}
                    </td>
                    <td className="p-4">
                      <div>{building?.name}</div>
                      <div className="text-xs text-gray-500">
                        {language === 'ru' ? 'кв.' : 'kv.'} {account.apartmentNumber}
                      </div>
                    </td>
                    <td className="p-4 text-right">{account.totalArea} м²</td>
                    <td className="p-4 text-right">{account.residentsCount}</td>
                    <td className="p-4 text-right">
                      <div className={`font-medium ${account.currentDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {account.currentDebt > 0 ? '-' : '+'}{formatMoney(Math.abs(account.balance))} сум
                      </div>
                      {account.penaltyAmount > 0 && (
                        <div className="text-xs text-red-500">
                          + {formatMoney(account.penaltyAmount)} {language === 'ru' ? 'пени' : 'jarima'}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">{getStatusBadge(account.status)}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingAccount(account)}
                          className="p-2 hover:bg-white/50 rounded-lg"
                          title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                        >
                          <Edit className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAccounts.length === 0 && (
            <div className="p-8 text-center">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">
                {language === 'ru' ? 'Счета не найдены' : 'Hisoblar topilmadi'}
              </h3>
              <p className="text-gray-400 mt-1">
                {language === 'ru' ? 'Попробуйте изменить параметры поиска' : 'Qidiruv parametrlarini o\'zgartirib ko\'ring'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedAccount && (
        <AccountDetailModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
        />
      )}

      {/* Edit Modal */}
      {editingAccount && (
        <AccountEditModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={(data) => {
            updatePersonalAccount(editingAccount.id, data);
            setEditingAccount(null);
          }}
        />
      )}
    </div>
  );
}

// Account Detail Modal
function AccountDetailModal({
  account,
  onClose
}: {
  account: PersonalAccount;
  onClose: () => void;
}) {
  const { owners, buildings, meters, getResidentsByApartment } = useCRMStore();
  const { language } = useLanguageStore();

  const owner = owners.find(o => o.id === account.primaryOwnerId);
  const building = buildings.find(b => b.id === account.buildingId);
  const apartmentMeters = meters.filter(m => m.apartmentId === account.apartmentId);
  const residents = getResidentsByApartment(account.apartmentId);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">
              {language === 'ru' ? 'Лицевой счет' : 'Shaxsiy hisob'} {account.number}
            </h2>
            <p className="text-gray-500">{account.address}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <div className={`p-6 rounded-xl mb-6 ${account.currentDebt > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">
                {language === 'ru' ? 'Текущий баланс' : 'Joriy balans'}
              </div>
              <div className={`text-3xl font-bold ${account.currentDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {account.currentDebt > 0 ? '-' : '+'}{formatMoney(Math.abs(account.balance))} сум
              </div>
              {account.penaltyAmount > 0 && (
                <div className="text-sm text-red-500 mt-1">
                  {language === 'ru' ? 'Пени' : 'Jarima'}: {formatMoney(account.penaltyAmount)} сум
                </div>
              )}
            </div>
            {account.lastPaymentDate && (
              <div className="text-right">
                <div className="text-sm text-gray-600">
                  {language === 'ru' ? 'Последний платеж' : 'Oxirgi to\'lov'}
                </div>
                <div className="font-medium">{formatMoney(account.lastPaymentAmount || 0)} сум</div>
                <div className="text-sm text-gray-500">{formatDate(account.lastPaymentDate)}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Owner Info */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              {language === 'ru' ? 'Владелец' : 'Egasi'}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="font-medium">{owner?.fullName || account.ownerName}</div>
              {owner?.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-3 h-3" />
                  {owner.phone}
                </div>
              )}
              {owner?.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-3 h-3" />
                  {owner.email}
                </div>
              )}
              {owner?.ownershipType && (
                <div className="text-sm text-gray-500">
                  {language === 'ru' ? 'Тип' : 'Turi'}: {
                    owner.ownershipType === 'owner'
                      ? (language === 'ru' ? 'Собственник' : 'Egasi')
                      : owner.ownershipType === 'tenant'
                      ? (language === 'ru' ? 'Арендатор' : 'Ijarachi')
                      : (language === 'ru' ? 'Совладелец' : 'Sherik egasi')
                  }
                </div>
              )}
            </div>
          </div>

          {/* Apartment Info */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Home className="w-4 h-4" />
              {language === 'ru' ? 'Квартира' : 'Kvartira'}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Дом:' : 'Uy:'}</span>
                <span>{building?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Квартира:' : 'Kvartira:'}</span>
                <span>№ {account.apartmentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Площадь:' : 'Maydoni:'}</span>
                <span>{account.totalArea} м²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Жителей:' : 'Yashovchilar:'}</span>
                <span>{account.residentsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{language === 'ru' ? 'Зарегистрировано:' : 'Ro\'yxatga olingan:'}</span>
                <span>{account.registeredCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Subsidies & Discounts */}
        {(account.hasSubsidy || account.hasDiscount) && (
          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              {language === 'ru' ? 'Льготы' : 'Imtiyozlar'}
            </h3>
            <div className="flex gap-3">
              {account.hasSubsidy && (
                <div className="bg-blue-50 rounded-lg p-3 flex-1">
                  <div className="text-sm text-blue-600 font-medium">
                    {language === 'ru' ? 'Субсидия' : 'Subsidiya'}
                  </div>
                  <div className="text-lg font-bold">{formatMoney(account.subsidyAmount || 0)} сум</div>
                  {account.subsidyEndDate && (
                    <div className="text-xs text-gray-500">
                      {language === 'ru' ? 'до' : 'gacha'} {formatDate(account.subsidyEndDate)}
                    </div>
                  )}
                </div>
              )}
              {account.hasDiscount && (
                <div className="bg-green-50 rounded-lg p-3 flex-1">
                  <div className="text-sm text-green-600 font-medium">
                    {language === 'ru' ? 'Скидка' : 'Chegirma'}
                  </div>
                  <div className="text-lg font-bold">{account.discountPercent}%</div>
                  {account.discountReason && (
                    <div className="text-xs text-gray-500">{account.discountReason}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Residents List */}
        {residents.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              {language === 'ru' ? 'Проживающие' : 'Yashovchilar'} ({residents.length})
            </h3>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-3">
                      {language === 'ru' ? 'ФИО' : 'F.I.O.'}
                    </th>
                    <th className="text-left p-3">
                      {language === 'ru' ? 'Тип' : 'Turi'}
                    </th>
                    <th className="text-left p-3">
                      {language === 'ru' ? 'Регистрация' : 'Ro\'yxat'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map((resident) => (
                    <tr key={resident.id} className="border-t border-gray-200">
                      <td className="p-3">{resident.fullName}</td>
                      <td className="p-3">
                        {resident.residentType === 'owner' && (language === 'ru' ? 'Собственник' : 'Egasi')}
                        {resident.residentType === 'family_member' && (language === 'ru' ? 'Член семьи' : 'Oila a\'zosi')}
                        {resident.residentType === 'tenant' && (language === 'ru' ? 'Арендатор' : 'Ijarachi')}
                        {resident.residentType === 'registered' && (language === 'ru' ? 'Зарегистрирован' : 'Ro\'yxatga olingan')}
                        {resident.residentType === 'temporary' && (language === 'ru' ? 'Временно' : 'Vaqtinchalik')}
                      </td>
                      <td className="p-3">
                        {resident.registrationType === 'permanent' && (language === 'ru' ? 'Постоянная' : 'Doimiy')}
                        {resident.registrationType === 'temporary' && (language === 'ru' ? 'Временная' : 'Vaqtinchalik')}
                        {resident.registrationType === 'none' && (language === 'ru' ? 'Нет' : 'Yo\'q')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Meters */}
        {apartmentMeters.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              {language === 'ru' ? 'Счетчики' : 'Hisoblagichlar'} ({apartmentMeters.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {apartmentMeters.map((meter) => (
                <div key={meter.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {meter.type === 'cold_water' && (language === 'ru' ? 'ХВС' : 'SIV')}
                      {meter.type === 'hot_water' && (language === 'ru' ? 'ГВС' : 'IIV')}
                      {meter.type === 'electricity' && (language === 'ru' ? 'Электричество' : 'Elektr')}
                      {meter.type === 'gas' && (language === 'ru' ? 'Газ' : 'Gaz')}
                      {meter.type === 'heat' && (language === 'ru' ? 'Отопление' : 'Isitish')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${meter.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {meter.isActive ? (language === 'ru' ? 'Активен' : 'Faol') : (language === 'ru' ? 'Неактивен' : 'Nofaol')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <div>{language === 'ru' ? 'Номер' : 'Raqam'}: {meter.serialNumber}</div>
                    <div>{language === 'ru' ? 'Показание' : 'Ko\'rsatkich'}: {meter.currentValue}</div>
                    <div>{language === 'ru' ? 'Поверка до' : 'Tekshirish muddati'}: {formatDate(meter.nextVerificationDate)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="btn-primary">
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Account Edit Modal
function AccountEditModal({
  account,
  onClose,
  onSave
}: {
  account: PersonalAccount;
  onClose: () => void;
  onSave: (data: Partial<PersonalAccount>) => void;
}) {
  const { language } = useLanguageStore();
  const [formData, setFormData] = useState({
    residentsCount: account.residentsCount,
    registeredCount: account.registeredCount,
    hasSubsidy: account.hasSubsidy,
    subsidyAmount: account.subsidyAmount || 0,
    subsidyEndDate: account.subsidyEndDate || '',
    hasDiscount: account.hasDiscount,
    discountPercent: account.discountPercent || 0,
    discountReason: account.discountReason || '',
    status: account.status,
    blockReason: account.blockReason || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {language === 'ru' ? 'Редактировать ЛС' : 'SH tahrirlash'} {account.number}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Количество жителей' : 'Yashovchilar soni'}
              </label>
              <input
                type="number"
                value={formData.residentsCount}
                onChange={(e) => setFormData({ ...formData, residentsCount: parseInt(e.target.value) || 0 })}
                className="input-field"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Зарегистрировано' : 'Ro\'yxatga olingan'}
              </label>
              <input
                type="number"
                value={formData.registeredCount}
                onChange={(e) => setFormData({ ...formData, registeredCount: parseInt(e.target.value) || 0 })}
                className="input-field"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Статус' : 'Status'}
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="input-field"
            >
              <option value="active">{language === 'ru' ? 'Активен' : 'Faol'}</option>
              <option value="blocked">{language === 'ru' ? 'Заблокирован' : 'Bloklangan'}</option>
              <option value="closed">{language === 'ru' ? 'Закрыт' : 'Yopiq'}</option>
              <option value="archived">{language === 'ru' ? 'Архив' : 'Arxiv'}</option>
            </select>
          </div>

          {formData.status === 'blocked' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Причина блокировки' : 'Bloklash sababi'}
              </label>
              <input
                type="text"
                value={formData.blockReason}
                onChange={(e) => setFormData({ ...formData, blockReason: e.target.value })}
                className="input-field"
                placeholder={language === 'ru' ? 'Укажите причину' : 'Sababni ko\'rsating'}
              />
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={formData.hasSubsidy}
                onChange={(e) => setFormData({ ...formData, hasSubsidy: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-medium">
                {language === 'ru' ? 'Субсидия' : 'Subsidiya'}
              </span>
            </div>
            {formData.hasSubsidy && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Сумма (сум)' : 'Summa (so\'m)'}
                  </label>
                  <input
                    type="number"
                    value={formData.subsidyAmount}
                    onChange={(e) => setFormData({ ...formData, subsidyAmount: parseInt(e.target.value) || 0 })}
                    className="input-field"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Действует до' : 'Amal qilish muddati'}
                  </label>
                  <input
                    type="date"
                    value={formData.subsidyEndDate}
                    onChange={(e) => setFormData({ ...formData, subsidyEndDate: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={formData.hasDiscount}
                onChange={(e) => setFormData({ ...formData, hasDiscount: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-medium">
                {language === 'ru' ? 'Скидка' : 'Chegirma'}
              </span>
            </div>
            {formData.hasDiscount && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Процент' : 'Foiz'}
                  </label>
                  <input
                    type="number"
                    value={formData.discountPercent}
                    onChange={(e) => setFormData({ ...formData, discountPercent: parseInt(e.target.value) || 0 })}
                    className="input-field"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Причина' : 'Sabab'}
                  </label>
                  <input
                    type="text"
                    value={formData.discountReason}
                    onChange={(e) => setFormData({ ...formData, discountReason: e.target.value })}
                    className="input-field"
                    placeholder={language === 'ru' ? 'Основание' : 'Asos'}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {language === 'ru' ? 'Сохранить' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
