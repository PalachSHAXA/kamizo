import { useState } from 'react';
import {
  Users, Search, Plus, Edit, X, Phone, Mail, Home,
  AlertTriangle, CheckCircle, User, MapPin,
  FileText, CreditCard, Trash2
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Owner } from '../types';

export function OwnersPage() {
  const { language } = useLanguageStore();
  const {
    owners,
    apartments,
    buildings,
    personalAccounts,
    addOwner,
    updateOwner,
    deleteOwner,
  } = useCRMStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);

  // Filter owners
  const filteredOwners = owners.filter(owner => {
    const matchesSearch = searchQuery === '' ||
      owner.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      owner.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      owner.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'all' || owner.type === filterType;

    // Building filter requires checking apartments
    let matchesBuilding = filterBuilding === 'all';
    if (filterBuilding !== 'all') {
      const ownerApartments = apartments.filter(a => owner.apartmentIds.includes(a.id));
      matchesBuilding = ownerApartments.some(a => a.buildingId === filterBuilding);
    }

    return matchesSearch && matchesType && matchesBuilding;
  });

  // Stats
  const totalOwners = owners.length;
  const individualOwners = owners.filter(o => o.type === 'individual').length;
  const legalOwners = owners.filter(o => o.type === 'legal_entity').length;
  const ownersWithDebt = owners.filter(o => {
    const account = personalAccounts.find(p => p.primaryOwnerId === o.id);
    return account && account.currentDebt > 0;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {language === 'ru' ? 'Собственники' : 'Mulkdorlar'}
          </h1>
          <p className="text-gray-500 mt-1">
            {language === 'ru' ? 'Управление собственниками и нанимателями' : 'Mulkdorlar va ijarachilarni boshqarish'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {language === 'ru' ? 'Новый собственник' : 'Yangi mulkdor'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'Всего' : 'Jami'}
              </p>
              <p className="text-xl font-bold text-gray-900">{totalOwners}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'Физ. лица' : 'Jismoniy shaxslar'}
              </p>
              <p className="text-xl font-bold text-gray-900">{individualOwners}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'Юр. лица' : 'Yuridik shaxslar'}
              </p>
              <p className="text-xl font-bold text-gray-900">{legalOwners}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                {language === 'ru' ? 'С долгом' : 'Qarzdorlar'}
              </p>
              <p className="text-xl font-bold text-red-600">{ownersWithDebt}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={language === 'ru' ? 'Поиск по имени, телефону, email...' : 'Ism, telefon, email bo\'yicha qidirish...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">
              {language === 'ru' ? 'Все дома' : 'Barcha uylar'}
            </option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">
              {language === 'ru' ? 'Все типы' : 'Barcha turlar'}
            </option>
            <option value="individual">
              {language === 'ru' ? 'Физ. лица' : 'Jismoniy shaxslar'}
            </option>
            <option value="legal_entity">
              {language === 'ru' ? 'Юр. лица' : 'Yuridik shaxslar'}
            </option>
          </select>
        </div>
      </div>

      {/* Owners List */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Собственник' : 'Mulkdor'}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Тип' : 'Tur'}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Квартиры' : 'Kvartiralar'}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Доля' : 'Ulush'}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Контакты' : 'Aloqa'}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Статус' : 'Holat'}
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  {language === 'ru' ? 'Действия' : 'Amallar'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOwners.map((owner) => {
                const ownerApartments = apartments.filter(a => owner.apartmentIds.includes(a.id));
                const account = personalAccounts.find(p => p.primaryOwnerId === owner.id);
                const hasDebt = account && account.currentDebt > 0;

                return (
                  <tr
                    key={owner.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedOwner(owner)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-medium">
                          {owner.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{owner.fullName}</p>
                          {owner.passportSeries && (
                            <p className="text-xs text-gray-500">
                              {language === 'ru' ? 'Паспорт' : 'Pasport'}: {owner.passportSeries} {owner.passportNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        owner.type === 'individual'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {owner.type === 'individual'
                          ? (language === 'ru' ? 'Физ. лицо' : 'Jismoniy shaxs')
                          : (language === 'ru' ? 'Юр. лицо' : 'Yuridik shaxs')
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {ownerApartments.length > 0 ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Home className="w-4 h-4 text-gray-400" />
                          <span>
                            {ownerApartments.map(apt => {
                              const building = buildings.find(b => b.id === apt.buildingId);
                              return `${building?.name || ''}, ${language === 'ru' ? 'кв.' : 'kv.'} ${apt.number}`;
                            }).join('; ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{(owner.ownershipShare || 0) * 100}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {owner.phone && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Phone className="w-3 h-3" />
                            {owner.phone}
                          </div>
                        )}
                        {owner.email && (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Mail className="w-3 h-3" />
                            {owner.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {hasDebt ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertTriangle className="w-3 h-3" />
                          {language === 'ru' ? 'Есть долг' : 'Qarz bor'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" />
                          {language === 'ru' ? 'Нет долга' : 'Qarz yo\'q'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingOwner(owner)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(language === 'ru' ? 'Удалить собственника?' : 'Mulkdorni o\'chirish?')) {
                              deleteOwner(owner.id);
                            }
                          }}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOwners.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>{language === 'ru' ? 'Собственники не найдены' : 'Mulkdorlar topilmadi'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner Detail Modal */}
      {selectedOwner && (
        <OwnerDetailModal
          owner={selectedOwner}
          onClose={() => setSelectedOwner(null)}
          onEdit={() => {
            setEditingOwner(selectedOwner);
            setSelectedOwner(null);
          }}
        />
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingOwner) && (
        <OwnerFormModal
          owner={editingOwner}
          onClose={() => {
            setShowAddModal(false);
            setEditingOwner(null);
          }}
          onSave={(data) => {
            if (editingOwner) {
              updateOwner(editingOwner.id, data);
            } else {
              addOwner(data);
            }
            setShowAddModal(false);
            setEditingOwner(null);
          }}
        />
      )}
    </div>
  );
}

function OwnerDetailModal({
  owner,
  onClose,
  onEdit
}: {
  owner: Owner;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { language } = useLanguageStore();
  const { apartments, buildings, personalAccounts, getResidentsByApartment } = useCRMStore();

  const ownerApartments = apartments.filter(a => owner.apartmentIds.includes(a.id));
  const account = personalAccounts.find(p => p.primaryOwnerId === owner.id);
  const ownerResidents = owner.apartmentIds.length > 0 ? getResidentsByApartment(owner.apartmentIds[0]) : [];

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center text-white text-xl font-bold">
                {owner.fullName.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{owner.fullName}</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  owner.type === 'individual'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {owner.type === 'individual'
                    ? (language === 'ru' ? 'Физическое лицо' : 'Jismoniy shaxs')
                    : (language === 'ru' ? 'Юридическое лицо' : 'Yuridik shaxs')
                  }
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">
              {language === 'ru' ? 'Контактная информация' : 'Aloqa ma\'lumotlari'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {owner.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{owner.phone}</span>
                </div>
              )}
              {owner.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{owner.email}</span>
                </div>
              )}
              {owner.registrationAddress && (
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{owner.registrationAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Passport Data */}
          {owner.passportSeries && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">
                {language === 'ru' ? 'Паспортные данные' : 'Pasport ma\'lumotlari'}
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">
                    {language === 'ru' ? 'Серия и номер:' : 'Seriya va raqam:'}
                  </span>
                  <p className="font-medium">{owner.passportSeries} {owner.passportNumber}</p>
                </div>
                <div>
                  <span className="text-gray-500">
                    {language === 'ru' ? 'Дата выдачи:' : 'Berilgan sana:'}
                  </span>
                  <p className="font-medium">{formatDate(owner.passportIssuedDate)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">
                    {language === 'ru' ? 'Кем выдан:' : 'Kim tomonidan berilgan:'}
                  </span>
                  <p className="font-medium">{owner.passportIssuedBy}</p>
                </div>
              </div>
            </div>
          )}

          {/* Property Info */}
          {ownerApartments.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">
                {language === 'ru' ? `Объекты недвижимости (${ownerApartments.length})` : `Ko'chmas mulk ob'ektlari (${ownerApartments.length})`}
              </h3>
              <div className="space-y-3">
                {ownerApartments.map(apartment => {
                  const building = buildings.find(b => b.id === apartment.buildingId);
                  return (
                    <div key={apartment.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Home className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="font-medium">
                            {building?.name}, {language === 'ru' ? 'кв.' : 'kv.'} {apartment.number}
                          </p>
                          <p className="text-sm text-gray-500">{building?.address}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">
                            {language === 'ru' ? 'Площадь:' : 'Maydoni:'}
                          </span>
                          <p className="font-medium">{apartment.totalArea} м²</p>
                        </div>
                        <div>
                          <span className="text-gray-500">
                            {language === 'ru' ? 'Комнат:' : 'Xonalar:'}
                          </span>
                          <p className="font-medium">{apartment.rooms}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">
                            {language === 'ru' ? 'Доля:' : 'Ulush:'}
                          </span>
                          <p className="font-medium">{(owner.ownershipShare || 0) * 100}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Account Info */}
          {account && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">
                {language === 'ru' ? 'Лицевой счет' : 'Shaxsiy hisob'}
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-500" />
                    <span className="font-mono font-medium">{account.number}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    account.currentDebt > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {account.currentDebt > 0
                      ? (language === 'ru' ? 'Есть задолженность' : 'Qarz mavjud')
                      : (language === 'ru' ? 'Нет задолженности' : 'Qarz yo\'q')
                    }
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">
                      {language === 'ru' ? 'Текущий баланс:' : 'Joriy balans:'}
                    </span>
                    <p className={`font-medium ${account.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatMoney(account.balance)} ₽
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">
                      {language === 'ru' ? 'Задолженность:' : 'Qarz:'}
                    </span>
                    <p className={`font-medium ${account.currentDebt > 0 ? 'text-red-600' : ''}`}>
                      {formatMoney(account.currentDebt)} ₽
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Residents */}
          {ownerResidents.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">
                {language === 'ru' ? `Проживающие (${ownerResidents.length})` : `Yashovchilar (${ownerResidents.length})`}
              </h3>
              <div className="space-y-2">
                {ownerResidents.map(resident => (
                  <div key={resident.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{resident.fullName}</p>
                        <p className="text-xs text-gray-500">
                          {resident.relationToOwner === 'self' && (language === 'ru' ? 'Собственник' : 'Mulkdor')}
                          {resident.relationToOwner === 'spouse' && (language === 'ru' ? 'Супруг(а)' : 'Turmush o\'rtog\'i')}
                          {resident.relationToOwner === 'child' && (language === 'ru' ? 'Ребенок' : 'Bola')}
                          {resident.relationToOwner === 'parent' && (language === 'ru' ? 'Родитель' : 'Ota-ona')}
                          {resident.relationToOwner === 'other' && (language === 'ru' ? 'Другое' : 'Boshqa')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>
                        {language === 'ru' ? 'Зарег.' : 'Ro\'yxatga olingan'}: {formatDate(resident.registrationDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerFormModal({
  owner,
  onClose,
  onSave
}: {
  owner: Owner | null;
  onClose: () => void;
  onSave: (data: Omit<Owner, 'id'>) => void;
}) {
  const { language } = useLanguageStore();
  const { apartments, buildings } = useCRMStore();

  const [formData, setFormData] = useState({
    fullName: owner?.fullName || '',
    lastName: owner?.lastName || '',
    firstName: owner?.firstName || '',
    middleName: owner?.middleName || '',
    type: owner?.type || 'individual' as 'individual' | 'legal_entity',
    phone: owner?.phone || '',
    email: owner?.email || '',
    apartmentIds: owner?.apartmentIds || [] as string[],
    ownershipType: owner?.ownershipType || 'owner' as 'owner' | 'co_owner' | 'tenant' | 'representative',
    ownershipShare: owner?.ownershipShare || 1,
    registrationAddress: owner?.registrationAddress || '',
    passportSeries: owner?.passportSeries || '',
    passportNumber: owner?.passportNumber || '',
    passportIssuedBy: owner?.passportIssuedBy || '',
    passportIssuedDate: owner?.passportIssuedDate || '',
    inn: owner?.inn || '',
    snils: owner?.snils || '',
    preferredContact: owner?.preferredContact || 'phone' as 'phone' | 'sms' | 'email' | 'whatsapp' | 'telegram',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const now = new Date().toISOString();
    const ownerData: Omit<Owner, 'id'> = {
      fullName: formData.fullName || `${formData.lastName} ${formData.firstName} ${formData.middleName}`.trim(),
      lastName: formData.lastName,
      firstName: formData.firstName,
      middleName: formData.middleName || undefined,
      type: formData.type,
      phone: formData.phone,
      email: formData.email || undefined,
      apartmentIds: formData.apartmentIds,
      personalAccountIds: [],
      ownershipType: formData.ownershipType,
      ownershipShare: formData.ownershipShare,
      registrationAddress: formData.registrationAddress || undefined,
      passportSeries: formData.passportSeries || undefined,
      passportNumber: formData.passportNumber || undefined,
      passportIssuedBy: formData.passportIssuedBy || undefined,
      passportIssuedDate: formData.passportIssuedDate || undefined,
      inn: formData.inn || undefined,
      snils: formData.snils || undefined,
      preferredContact: formData.preferredContact,
      isActive: true,
      isVerified: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    onSave(ownerData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {owner
                ? (language === 'ru' ? 'Редактировать собственника' : 'Mulkdorni tahrirlash')
                : (language === 'ru' ? 'Новый собственник' : 'Yangi mulkdor')
              }
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Фамилия *' : 'Familiya *'}
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Имя *' : 'Ism *'}
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Отчество' : 'Otasining ismi'}
              </label>
              <input
                type="text"
                value={formData.middleName}
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Тип' : 'Tur'}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'individual' | 'legal_entity' })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="individual">
                  {language === 'ru' ? 'Физическое лицо' : 'Jismoniy shaxs'}
                </option>
                <option value="legal_entity">
                  {language === 'ru' ? 'Юридическое лицо' : 'Yuridik shaxs'}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Тип права' : 'Huquq turi'}
              </label>
              <select
                value={formData.ownershipType}
                onChange={(e) => setFormData({ ...formData, ownershipType: e.target.value as 'owner' | 'co_owner' | 'tenant' | 'representative' })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="owner">
                  {language === 'ru' ? 'Собственник' : 'Mulkdor'}
                </option>
                <option value="co_owner">
                  {language === 'ru' ? 'Совладелец' : 'Hammulkdor'}
                </option>
                <option value="tenant">
                  {language === 'ru' ? 'Наниматель' : 'Ijarachi'}
                </option>
                <option value="representative">
                  {language === 'ru' ? 'Представитель' : 'Vakil'}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Квартиры' : 'Kvartiralar'}
            </label>
            <select
              multiple
              value={formData.apartmentIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setFormData({ ...formData, apartmentIds: selected });
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            >
              {apartments.map(apt => {
                const building = buildings.find(b => b.id === apt.buildingId);
                return (
                  <option key={apt.id} value={apt.id}>
                    {building?.name}, {language === 'ru' ? 'кв.' : 'kv.'} {apt.number}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {language === 'ru' ? 'Удерживайте Ctrl/Cmd для выбора нескольких' : 'Bir nechtasini tanlash uchun Ctrl/Cmd tugmasini bosib turing'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Доля собственности (%)' : 'Mulkchilik ulushi (%)'}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.ownershipShare * 100}
              onChange={(e) => setFormData({ ...formData, ownershipShare: parseFloat(e.target.value) / 100 })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Телефон *' : 'Telefon *'}
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Адрес регистрации' : 'Ro\'yxatga olish manzili'}
            </label>
            <input
              type="text"
              value={formData.registrationAddress}
              onChange={(e) => setFormData({ ...formData, registrationAddress: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Passport Data */}
          {formData.type === 'individual' && (
            <>
              <div className="pt-4 border-t border-gray-100">
                <h4 className="font-medium text-gray-900 mb-3">
                  {language === 'ru' ? 'Паспортные данные' : 'Pasport ma\'lumotlari'}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Серия' : 'Seriya'}
                    </label>
                    <input
                      type="text"
                      value={formData.passportSeries}
                      onChange={(e) => setFormData({ ...formData, passportSeries: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Номер' : 'Raqam'}
                    </label>
                    <input
                      type="text"
                      value={formData.passportNumber}
                      onChange={(e) => setFormData({ ...formData, passportNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Кем выдан' : 'Kim tomonidan berilgan'}
                  </label>
                  <input
                    type="text"
                    value={formData.passportIssuedBy}
                    onChange={(e) => setFormData({ ...formData, passportIssuedBy: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Дата выдачи' : 'Berilgan sana'}
                  </label>
                  <input
                    type="date"
                    value={formData.passportIssuedDate}
                    onChange={(e) => setFormData({ ...formData, passportIssuedDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'ИНН' : 'STIR'}
                  </label>
                  <input
                    type="text"
                    value={formData.inn}
                    onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'СНИЛС' : 'JSHSHIR'}
                  </label>
                  <input
                    type="text"
                    value={formData.snils}
                    onChange={(e) => setFormData({ ...formData, snils: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {owner
                ? (language === 'ru' ? 'Сохранить' : 'Saqlash')
                : (language === 'ru' ? 'Создать' : 'Yaratish')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
