import { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff, AlertCircle, MapPin, Car } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { useToastStore } from '../../../stores/toastStore';
import { branchesApi, buildingsApi, entrancesApi, apartmentsApi, vehiclesApi } from '../../../services/api';
import type { AddResidentModalProps } from './types';

interface BranchItem {
  id: string;
  code: string;
  name: string;
  district?: string;
  buildings_count?: number;
  residents_count?: number;
}

interface BuildingItem {
  id: string;
  name: string;
  branch_code: string;
  building_number: string;
  [key: string]: any;
}

interface EntranceItem {
  id: string;
  building_id: string;
  number: number;
  [key: string]: any;
}

interface ApartmentItem {
  id: string;
  number: string;
  status: string;
  entrance_id: string;
  [key: string]: any;
}

// Add Resident Modal
export function AddResidentModal({ onClose }: AddResidentModalProps) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { addMockUser } = useAuthStore.getState();

  // Vehicle form (optional)
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  // Cascading dropdown state
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedEntranceId, setSelectedEntranceId] = useState('');
  const [selectedApartmentId, setSelectedApartmentId] = useState('');

  // Data arrays
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [entrances, setEntrances] = useState<EntranceItem[]>([]);
  const [apartments, setApartments] = useState<ApartmentItem[]>([]);

  // Loading states
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingEntrances, setLoadingEntrances] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(false);

  // Load branches on mount
  useEffect(() => {
    setLoadingBranches(true);
    branchesApi.getAll()
      .then(res => setBranches(res.branches || []))
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, []);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranchId) {
      setBuildings([]);
      return;
    }
    const branch = branches.find(b => b.id === selectedBranchId);
    if (!branch) return;

    setLoadingBuildings(true);
    buildingsApi.getAll()
      .then(res => {
        const filtered = (res.buildings || []).filter(
          (b: BuildingItem) => b.branch_code === branch.code
        );
        setBuildings(filtered);
      })
      .catch(() => setBuildings([]))
      .finally(() => setLoadingBuildings(false));
  }, [selectedBranchId, branches]);

  // Load entrances when building changes
  useEffect(() => {
    if (!selectedBuildingId) {
      setEntrances([]);
      return;
    }
    setLoadingEntrances(true);
    entrancesApi.getByBuilding(selectedBuildingId)
      .then(res => setEntrances(res.entrances || []))
      .catch(() => setEntrances([]))
      .finally(() => setLoadingEntrances(false));
  }, [selectedBuildingId]);

  // Load apartments when entrance changes
  useEffect(() => {
    if (!selectedEntranceId || !selectedBuildingId) {
      setApartments([]);
      return;
    }
    setLoadingApartments(true);
    apartmentsApi.getByBuilding(selectedBuildingId, { entranceId: selectedEntranceId, limit: 500 })
      .then(res => setApartments(res.apartments || []))
      .catch(() => setApartments([]))
      .finally(() => setLoadingApartments(false));
  }, [selectedEntranceId, selectedBuildingId]);

  // Auto-generate credentials when all 4 cascading fields are selected
  useEffect(() => {
    if (selectedBranchId && selectedBuildingId && selectedEntranceId && selectedApartmentId) {
      const branch = branches.find(b => b.id === selectedBranchId);
      const building = buildings.find(b => b.id === selectedBuildingId);
      const apartment = apartments.find(a => a.id === selectedApartmentId);

      if (branch && building && apartment) {
        const generatedLogin = `${branch.code}_${building.building_number}_${apartment.number}`.toUpperCase();
        const generatedPassword = `${branch.code}/${building.building_number}/${apartment.number}`.toUpperCase();
        setLogin(generatedLogin);
        setPassword(generatedPassword);
        setShowPassword(true);
      }
    } else {
      setLogin('');
      setPassword('');
    }
  }, [selectedBranchId, selectedBuildingId, selectedEntranceId, selectedApartmentId, branches, buildings, apartments]);

  // Compose address from selections
  const getAddress = useCallback(() => {
    const branch = branches.find(b => b.id === selectedBranchId);
    const building = buildings.find(b => b.id === selectedBuildingId);
    if (!branch || !building) return '';
    return `${branch.name}, ${language === 'ru' ? 'дом' : 'uy'} ${building.building_number}`;
  }, [selectedBranchId, selectedBuildingId, branches, buildings, language]);

  const handleBranchChange = useCallback((value: string) => {
    setSelectedBranchId(value);
    setSelectedBuildingId('');
    setSelectedEntranceId('');
    setSelectedApartmentId('');
    setBuildings([]);
    setEntrances([]);
    setApartments([]);
    setError('');
  }, []);

  const handleBuildingChange = useCallback((value: string) => {
    setSelectedBuildingId(value);
    setSelectedEntranceId('');
    setSelectedApartmentId('');
    setEntrances([]);
    setApartments([]);
    setError('');
  }, []);

  const handleEntranceChange = useCallback((value: string) => {
    setSelectedEntranceId(value);
    setSelectedApartmentId('');
    setApartments([]);
    setError('');
  }, []);

  const handleApartmentChange = useCallback((value: string) => {
    setSelectedApartmentId(value);
    setError('');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone || !selectedBranchId || !selectedBuildingId || !selectedEntranceId || !selectedApartmentId || !login || !password) {
      setError(language === 'ru' ? 'Заполните все обязательные поля' : 'Barcha majburiy maydonlarni to\'ldiring');
      return;
    }

    const address = getAddress();
    const apartment = apartments.find(a => a.id === selectedApartmentId);
    const branch = branches.find(b => b.id === selectedBranchId);
    const building = buildings.find(b => b.id === selectedBuildingId);

    addMockUser(login, password, {
      id: `resident_${Date.now()}`,
      phone,
      name,
      login,
      role: 'resident',
      address,
      apartment: apartment?.number || '',
      branch: branch?.code || '',
      building: building?.building_number || ''
    });

    // Create vehicle if plate number provided
    if (vehiclePlate.trim()) {
      const [brand, ...modelParts] = vehicleBrand.trim().split(' ');
      vehiclesApi.create({
        plate_number: vehiclePlate.trim(),
        brand: brand || undefined,
        model: modelParts.join(' ') || undefined,
        color: vehicleColor.trim() || undefined,
      }).catch(() => {}); // Don't block resident creation
    }

    addToast('success', language === 'ru'
      ? `Житель добавлен! Логин: ${login}, Пароль: ${password}`
      : `Yashovchi qo'shildi! Login: ${login}, Parol: ${password}`
    );
    onClose();
  };

  // Derive selected items for display
  const selectedBranch = branches.find(b => b.id === selectedBranchId);
  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const selectedApartment = apartments.find(a => a.id === selectedApartmentId);
  const selectedEntrance = entrances.find(e => e.id === selectedEntranceId);

  return (
    <div className="modal-backdrop">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-md mx-3 md:mx-4 max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          {/* Cascading dropdowns */}
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Комплекс *' : 'Kompleks *'}
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="glass-input text-sm md:text-base"
              disabled={loadingBranches}
              required
            >
              <option value="">{loadingBranches
                ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                : (language === 'ru' ? 'Выберите комплекс' : 'Kompleksni tanlang')
              }</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Дом *' : 'Uy *'}
            </label>
            <select
              value={selectedBuildingId}
              onChange={(e) => handleBuildingChange(e.target.value)}
              className="glass-input text-sm md:text-base"
              disabled={!selectedBranchId || loadingBuildings}
              required
            >
              <option value="">{loadingBuildings
                ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                : (language === 'ru' ? 'Выберите дом' : 'Uyni tanlang')
              }</option>
              {buildings.map(b => (
                <option key={b.id} value={b.id}>{b.name || b.building_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Подъезд *' : 'Podyezd *'}
            </label>
            <select
              value={selectedEntranceId}
              onChange={(e) => handleEntranceChange(e.target.value)}
              className="glass-input text-sm md:text-base"
              disabled={!selectedBuildingId || loadingEntrances}
              required
            >
              <option value="">{loadingEntrances
                ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                : (language === 'ru' ? 'Выберите подъезд' : 'Podyezdni tanlang')
              }</option>
              {entrances.map(e => (
                <option key={e.id} value={e.id}>{language === 'ru' ? 'Подъезд' : 'Podyezd'} {e.number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Квартира *' : 'Kvartira *'}
            </label>
            <select
              value={selectedApartmentId}
              onChange={(e) => handleApartmentChange(e.target.value)}
              className="glass-input text-sm md:text-base"
              disabled={!selectedEntranceId || loadingApartments}
              required
            >
              <option value="">{loadingApartments
                ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                : (language === 'ru' ? 'Выберите квартиру' : 'Kvartirani tanlang')
              }</option>
              {apartments.map(a => (
                <option key={a.id} value={a.id}>
                  {language === 'ru' ? 'Кв.' : 'Kv.'} {a.number}
                  {a.status === 'vacant' ? ` (${language === 'ru' ? 'свободна' : 'bo\'sh'})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Address preview */}
          {selectedBuilding && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {getAddress()}{selectedApartment ? `, ${language === 'ru' ? 'кв.' : 'kv.'} ${selectedApartment.number}` : ''}
              {selectedEntrance ? `, ${language === 'ru' ? 'подъезд' : 'podyezd'} ${selectedEntrance.number}` : ''}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО *' : 'F.I.O. *'}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ismingizni kiriting'}
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон *' : 'Telefon *'}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 XXX XX XX"
              className="glass-input text-sm md:text-base"
              required
            />
          </div>

          {/* Vehicle (optional) */}
          <div className="border-t pt-3 md:pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Car className="w-4 h-4 text-gray-400" />
              <span className="text-xs md:text-sm font-medium text-gray-700">
                {language === 'ru' ? 'Автомобиль (если есть)' : 'Avtomobil (agar bo\'lsa)'}
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                className="glass-input text-sm md:text-base"
                placeholder={language === 'ru' ? 'Госномер: 01 A 123 BC' : 'Davlat raqami: 01 A 123 BC'}
              />
              <input
                type="text"
                value={vehicleBrand}
                onChange={(e) => setVehicleBrand(e.target.value)}
                className="glass-input text-sm md:text-base"
                placeholder={language === 'ru' ? 'Марка/модель: Chevrolet Malibu' : 'Marka/model: Chevrolet Malibu'}
              />
              <input
                type="text"
                value={vehicleColor}
                onChange={(e) => setVehicleColor(e.target.value)}
                className="glass-input text-sm md:text-base"
                placeholder={language === 'ru' ? 'Цвет: Белый' : 'Rangi: Oq'}
              />
            </div>
          </div>

          {/* Login credentials */}
          <div className="border-t pt-3 md:pt-4">
            <span className="block text-xs md:text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}
            </span>

            {/* Hint about password format */}
            <div className="mb-2 p-2 bg-primary-50 border border-primary-100 rounded-lg text-xs text-primary-600">
              {language === 'ru' ? 'Логин и пароль генерируются автоматически при выборе всех полей.' : 'Login va parol barcha maydonlar tanlanganda avtomatik yaratiladi.'}
              <br />
              {language === 'ru' ? 'Формат:' : 'Format:'} <span className="font-mono font-bold">{language === 'ru' ? 'КОМПЛЕКС_ДОМ_КВАРТИРА' : 'KOMPLEKS_UY_KVARTIRA'}</span>
              <br />
              {language === 'ru' ? 'Например:' : 'Masalan:'} <span className="font-mono">YS_8A_23</span>
            </div>

            <div className="space-y-2 md:space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="YS_8A_23"
                  className="glass-input text-sm md:text-base font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="YS/8A/23"
                    className="glass-input pr-10 text-sm md:text-base font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 touch-manipulation"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 md:p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs md:text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 md:gap-3 pt-3 md:pt-4 sticky bottom-0 bg-white -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-5 md:px-5 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
