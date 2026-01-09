import { useState, useEffect } from 'react';
import { Key, User, Phone, FileText, Calendar, CheckCircle, AlertCircle, Loader2, GitBranch, Building2, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { branchesApi, buildingsApi, usersApi } from '../../services/api';

interface Branch {
  code: string;
  name: string;
}

interface Building {
  id: string;
  name: string;
  address: string;
  branch_code: string;
}

interface Resident {
  id: string;
  name: string;
  phone: string;
  address: string;
  apartment: string;
  login?: string;
}

export function RentalsPage() {
  const { user } = useAuthStore();
  const { rentalApartments, rentalRecords, addRentalApartment, deleteRentalApartment, addRentalRecord, deleteRentalRecord, fetchRentals } = useDataStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRentals = async () => {
      setIsLoading(true);
      try {
        await fetchRentals();
      } catch (error) {
        console.error('Failed to fetch rentals:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadRentals();
  }, [fetchRentals]);
  const [showAddApartmentModal, setShowAddApartmentModal] = useState(false);
  const [showAddRecordModal, setShowAddRecordModal] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState<{ login: string; password: string } | null>(null);
  const [deleteConfirmApartment, setDeleteConfirmApartment] = useState<{ id: string; ownerLogin: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [newApartment, setNewApartment] = useState({
    name: '',
    address: '',
    apartment: '',
    ownerName: '',
    ownerPhone: '',
    ownerLogin: '',
    password: '',
    ownerType: 'tenant' as 'tenant' | 'commercial_owner',
  });

  // Cascading selection state for apartment modal
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);

  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingResidents, setLoadingResidents] = useState(false);

  // Load branches when modal opens
  useEffect(() => {
    if (!showAddApartmentModal) return;

    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const data = await branchesApi.getAll();
        setBranches(data.branches || []);
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [showAddApartmentModal]);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranch) {
      setBuildings([]);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadBuildings = async () => {
      setLoadingBuildings(true);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      try {
        const data = await buildingsApi.getAll();
        const filteredBuildings = (data.buildings || []).filter(
          (b: Building) => b.branch_code === selectedBranch
        );
        setBuildings(filteredBuildings);
      } catch (error) {
        console.error('Failed to load buildings:', error);
      } finally {
        setLoadingBuildings(false);
      }
    };
    loadBuildings();
  }, [selectedBranch]);

  // Load residents when building changes
  useEffect(() => {
    if (!selectedBuilding) {
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadResidents = async () => {
      setLoadingResidents(true);
      setSelectedResident(null);
      try {
        const data = await usersApi.getAll({ role: 'resident', building_id: selectedBuilding, limit: 500 });
        setResidents(data.users || []);
      } catch (error) {
        console.error('Failed to load residents:', error);
      } finally {
        setLoadingResidents(false);
      }
    };
    loadResidents();
  }, [selectedBuilding]);

  // Auto-populate apartment data when resident is selected
  const handleResidentSelect = (residentId: string) => {
    const resident = residents.find(r => r.id === residentId);
    setSelectedResident(resident || null);

    if (resident) {
      const buildingData = buildings.find(b => b.id === selectedBuilding);
      setNewApartment(prev => ({
        ...prev,
        address: buildingData?.address || resident.address || '',
        apartment: resident.apartment || '',
        ownerName: resident.name || '',
        ownerPhone: resident.phone || '',
        ownerLogin: resident.login || '',
      }));
    }
  };

  // Reset cascading selection when modal closes
  const resetCascadingSelection = () => {
    setSelectedBranch('');
    setSelectedBuilding('');
    setSelectedResident(null);
    setBranches([]);
    setBuildings([]);
    setResidents([]);
  };

  const [newRecord, setNewRecord] = useState({
    guestNames: '',
    passportInfo: '',
    checkInDate: '',
    checkOutDate: '',
    amount: '',
    currency: 'UZS',
    notes: '',
  });

  const generateCredentials = () => {
    const prefix = newApartment.ownerType === 'commercial_owner' ? 'owner' : 'tenant';
    const login = prefix + Math.floor(Math.random() * 10000);
    const password = Math.random().toString(36).slice(-8);
    setNewApartment({ ...newApartment, ownerLogin: login, password });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmApartment) return;

    // Find apartment to get stored password
    const apartment = rentalApartments.find(a => a.id === deleteConfirmApartment.id);

    if (!apartment || apartment.ownerPassword !== deletePassword) {
      setDeleteError('Неверный пароль');
      return;
    }

    try {
      await deleteRentalApartment(deleteConfirmApartment.id);
      // Also remove user from auth store
      const { removeUser } = useAuthStore.getState();
      removeUser(deleteConfirmApartment.ownerLogin);

      setDeleteConfirmApartment(null);
      setDeletePassword('');
      setDeleteError('');
    } catch (error) {
      setDeleteError('Ошибка удаления');
    }
  };

  const handleAddApartment = async () => {
    // Validate required fields - now uses cascading selection
    if (!newApartment.name || !selectedResident || !newApartment.ownerLogin || !newApartment.password) {
      alert('Пожалуйста, заполните все обязательные поля');
      return;
    }

    const prefix = newApartment.ownerType === 'commercial_owner' ? 'owner_' : 'tenant_';
    const ownerId = prefix + Math.random().toString(36).substr(2, 9);

    try {
      const result = await addRentalApartment({
        ...newApartment,
        ownerId,
        password: newApartment.password,
        ownerType: newApartment.ownerType,
      });

      if (result) {
        setShowCredentials({ login: newApartment.ownerLogin, password: newApartment.password });
        setNewApartment({ name: '', address: '', apartment: '', ownerName: '', ownerPhone: '', ownerLogin: '', password: '', ownerType: 'tenant' });
        resetCascadingSelection();
        setShowAddApartmentModal(false);
      } else {
        alert('Ошибка создания пользователя. Ответ сервера пустой.');
      }
    } catch (error: any) {
      console.error('[RentalsPage] Error creating apartment:', error);
      alert(`Ошибка создания пользователя: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleAddRecord = async () => {
    if (!selectedApartment || !newRecord.guestNames || !newRecord.passportInfo || !newRecord.checkInDate || !newRecord.checkOutDate || !newRecord.amount) return;

    const result = await addRentalRecord({
      apartmentId: selectedApartment,
      guestNames: newRecord.guestNames,
      passportInfo: newRecord.passportInfo,
      checkInDate: newRecord.checkInDate,
      checkOutDate: newRecord.checkOutDate,
      amount: parseFloat(newRecord.amount),
      currency: newRecord.currency,
      notes: newRecord.notes,
      createdBy: user?.id || '',
    });

    if (result) {
      setNewRecord({ guestNames: '', passportInfo: '', checkInDate: '', checkOutDate: '', amount: '', currency: 'UZS', notes: '' });
      setShowAddRecordModal(false);
    } else {
      alert('Ошибка сохранения записи');
    }
  };

  const getApartmentRecords = (apartmentId: string) => {
    return rentalRecords.filter(r => r.apartmentId === apartmentId).sort((a, b) =>
      new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatAmount = (amount: number, currency: string) => {
    if (currency === 'UZS') {
      return amount.toLocaleString('ru-RU') + ' сум';
    }
    return '$' + amount.toLocaleString('en-US');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Аренда квартир</h1>
        <button onClick={() => setShowAddApartmentModal(true)} className="btn-primary">
          + Добавить квартиру
        </button>
      </div>

      {isLoading ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-12 h-12 text-primary-500 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Загрузка...</h3>
        </div>
      ) : rentalApartments.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Квартир пока нет</h3>
          <p className="text-gray-500">Добавьте первую квартиру для управления арендой</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rentalApartments.map((apartment) => {
            const records = getApartmentRecords(apartment.id);
            const activeRecord = records.find(r => new Date(r.checkOutDate) >= new Date());

            return (
              <div
                key={apartment.id}
                className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedApartment(apartment.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{apartment.name}</h3>
                    <div className="text-sm text-gray-500">{apartment.address}, кв. {apartment.apartment}</div>
                  </div>
                  {activeRecord ? (
                    <span className="badge badge-progress">Занята</span>
                  ) : (
                    <span className="badge badge-done">Свободна</span>
                  )}
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {apartment.ownerName}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {apartment.ownerPhone}
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {records.length} записей
                  </div>
                </div>
                {activeRecord && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500">Текущий гость:</div>
                    <div className="text-sm font-medium">{activeRecord.guestNames}</div>
                    <div className="text-xs text-gray-500">до {formatDate(activeRecord.checkOutDate)}</div>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmApartment({ id: apartment.id, ownerLogin: apartment.ownerLogin });
                  }}
                  className="mt-3 text-xs text-red-500 hover:text-red-700"
                >
                  Удалить квартиру
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Apartment Details Modal */}
      {selectedApartment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedApartment(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {(() => {
              const apartment = rentalApartments.find(a => a.id === selectedApartment);
              const records = getApartmentRecords(selectedApartment);
              if (!apartment) return null;

              return (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold">{apartment.name}</h2>
                      <div className="text-gray-500">{apartment.address}, кв. {apartment.apartment}</div>
                    </div>
                    <button
                      onClick={() => { setShowAddRecordModal(true); }}
                      className="btn-primary text-sm"
                    >
                      + Добавить запись
                    </button>
                  </div>

                  <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                    <div className="text-sm text-gray-500 mb-2">Владелец</div>
                    <div className="font-medium">{apartment.ownerName}</div>
                    <div className="text-sm text-gray-600">{apartment.ownerPhone}</div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-400">Логин</div>
                          <div className="font-mono text-sm font-medium text-gray-700">{apartment.ownerLogin}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Пароль</div>
                          <div className="font-mono text-sm font-medium text-gray-700">{apartment.ownerPassword || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <h3 className="font-semibold mb-4">История аренды ({records.length})</h3>

                  {records.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      Записей пока нет
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {records.map(record => {
                        const isActive = new Date(record.checkOutDate) >= new Date();
                        return (
                          <div key={record.id} className={`p-4 rounded-xl border ${isActive ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-medium">{record.guestNames}</div>
                                <div className="text-sm text-gray-500">{record.passportInfo}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-green-600">{formatAmount(record.amount, record.currency)}</div>
                                {isActive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Активно</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(record.checkInDate)} - {formatDate(record.checkOutDate)}
                              </div>
                            </div>
                            {record.notes && (
                              <div className="mt-2 text-sm text-gray-500">{record.notes}</div>
                            )}
                            <button
                              onClick={async () => {
                                try {
                                  await deleteRentalRecord(record.id);
                                } catch (error) {
                                  alert('Ошибка удаления записи');
                                }
                              }}
                              className="mt-2 text-xs text-red-500 hover:text-red-700"
                            >
                              Удалить
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex justify-end mt-6">
                    <button onClick={() => setSelectedApartment(null)} className="btn-secondary">
                      Закрыть
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add Apartment Modal */}
      {showAddApartmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">Добавить квартиру</h2>
            <div className="space-y-4">
              {/* Apartment Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Название</label>
                <input
                  type="text"
                  value={newApartment.name}
                  onChange={e => setNewApartment({ ...newApartment, name: e.target.value })}
                  placeholder="Квартира у моря"
                  className="glass-input"
                />
              </div>

              {/* Cascading Selection */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Выбор квартиры и владельца
                </h3>

                {/* Branch Selection */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <GitBranch className="w-4 h-4" />
                    Филиал *
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="glass-input w-full"
                    disabled={loadingBranches}
                  >
                    <option value="">
                      {loadingBranches ? 'Загрузка...' : 'Выберите филиал'}
                    </option>
                    {branches.map(branch => (
                      <option key={branch.code} value={branch.code}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                {/* Building Selection */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    Дом *
                  </label>
                  <select
                    value={selectedBuilding}
                    onChange={(e) => setSelectedBuilding(e.target.value)}
                    className="glass-input w-full"
                    disabled={!selectedBranch || loadingBuildings}
                  >
                    <option value="">
                      {loadingBuildings ? 'Загрузка...' : !selectedBranch ? 'Сначала выберите филиал' : 'Выберите дом'}
                    </option>
                    {buildings.map(building => (
                      <option key={building.id} value={building.id}>
                        {building.name} - {building.address}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resident Selection */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    Житель (владелец) *
                  </label>
                  <select
                    value={selectedResident?.id || ''}
                    onChange={(e) => handleResidentSelect(e.target.value)}
                    className="glass-input w-full"
                    disabled={!selectedBuilding || loadingResidents}
                  >
                    <option value="">
                      {loadingResidents ? 'Загрузка...' : !selectedBuilding ? 'Сначала выберите дом' : 'Выберите жителя'}
                    </option>
                    {residents.map(resident => (
                      <option key={resident.id} value={resident.id}>
                        {resident.name} {resident.apartment ? `- кв. ${resident.apartment}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Resident Info */}
                {selectedResident && (
                  <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mt-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{selectedResident.name}</p>
                        <p className="text-sm text-gray-600">
                          {selectedResident.phone || 'Телефон не указан'}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {buildings.find(b => b.id === selectedBuilding)?.address}
                          {selectedResident.apartment && `, кв. ${selectedResident.apartment}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Selection Path Display */}
                {(selectedBranch || selectedBuilding) && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-2 flex-wrap">
                    {selectedBranch && (
                      <>
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          {branches.find(b => b.code === selectedBranch)?.name}
                        </span>
                        {selectedBuilding && <ChevronRight className="w-3 h-3" />}
                      </>
                    )}
                    {selectedBuilding && (
                      <>
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          {buildings.find(b => b.id === selectedBuilding)?.name}
                        </span>
                        {selectedResident && <ChevronRight className="w-3 h-3" />}
                      </>
                    )}
                    {selectedResident && (
                      <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded">
                        {selectedResident.name}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Owner Login/Password */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Учётные данные владельца</h3>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Логин</label>
                      <input
                        type="text"
                        value={newApartment.ownerLogin}
                        onChange={e => setNewApartment({ ...newApartment, ownerLogin: e.target.value })}
                        className="glass-input"
                        readOnly={!!selectedResident?.login}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Пароль</label>
                      <input
                        type="text"
                        value={newApartment.password}
                        onChange={e => setNewApartment({ ...newApartment, password: e.target.value })}
                        className="glass-input"
                      />
                    </div>
                  </div>
                  <button onClick={generateCredentials} className="text-sm text-primary-600 hover:text-primary-700">
                    Сгенерировать логин/пароль
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddApartmentModal(false);
                  resetCascadingSelection();
                  setNewApartment({ name: '', address: '', apartment: '', ownerName: '', ownerPhone: '', ownerLogin: '', password: '', ownerType: 'tenant' });
                }}
                className="btn-secondary flex-1"
              >
                Отмена
              </button>
              <button
                onClick={handleAddApartment}
                className="btn-primary flex-1"
                disabled={!selectedResident}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {showAddRecordModal && selectedApartment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">Добавить запись</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Имена гостей</label>
                <input
                  type="text"
                  value={newRecord.guestNames}
                  onChange={e => setNewRecord({ ...newRecord, guestNames: e.target.value })}
                  placeholder="Иванов Иван, Петрова Мария"
                  className="glass-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Паспортные данные</label>
                <input
                  type="text"
                  value={newRecord.passportInfo}
                  onChange={e => setNewRecord({ ...newRecord, passportInfo: e.target.value })}
                  placeholder="AA1234567"
                  className="glass-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Дата заезда</label>
                  <input
                    type="date"
                    value={newRecord.checkInDate}
                    onChange={e => setNewRecord({ ...newRecord, checkInDate: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Дата выезда</label>
                  <input
                    type="date"
                    value={newRecord.checkOutDate}
                    onChange={e => setNewRecord({ ...newRecord, checkOutDate: e.target.value })}
                    className="glass-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Сумма</label>
                  <input
                    type="number"
                    value={newRecord.amount}
                    onChange={e => setNewRecord({ ...newRecord, amount: e.target.value })}
                    placeholder="1000000"
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Валюта</label>
                  <select
                    value={newRecord.currency}
                    onChange={e => setNewRecord({ ...newRecord, currency: e.target.value })}
                    className="glass-input"
                  >
                    <option value="UZS">UZS (сум)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Заметки (опционально)</label>
                <textarea
                  value={newRecord.notes}
                  onChange={e => setNewRecord({ ...newRecord, notes: e.target.value })}
                  className="glass-input min-h-[80px]"
                  placeholder="Дополнительная информация..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddRecordModal(false); }} className="btn-secondary flex-1">
                Отмена
              </button>
              <button onClick={handleAddRecord} className="btn-primary flex-1">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Квартира добавлена!</h2>
            <p className="text-gray-500 mb-6">Данные для входа владельца:</p>
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500">Логин:</span>
                <span className="font-mono font-bold">{showCredentials.login}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Пароль:</span>
                <span className="font-mono font-bold">{showCredentials.password}</span>
              </div>
            </div>
            <button onClick={() => setShowCredentials(null)} className="btn-primary w-full">
              Готово
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmApartment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-center">Подтвердите удаление</h2>
            <p className="text-gray-500 mb-6 text-center">
              Введите пароль владельца квартиры для подтверждения удаления
            </p>
            <div className="mb-4">
              <input
                type="password"
                value={deletePassword}
                onChange={e => {
                  setDeletePassword(e.target.value);
                  setDeleteError('');
                }}
                placeholder="Пароль владельца"
                className="glass-input w-full"
              />
              {deleteError && (
                <p className="text-red-500 text-sm mt-2">{deleteError}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmApartment(null);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                className="btn-secondary flex-1"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-medium transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
