import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { branchesApi, buildingsApi, entrancesApi, apartmentsApi } from '../../../../services/api';
import type { BuildingFull } from './types';

interface ManualForm {
  fullName: string;
  phone: string;
  address: string;
  personalAccount: string;
}

interface AddResidentModalProps {
  manualForm: ManualForm;
  setManualForm: (form: ManualForm) => void;
  selectedBuilding: BuildingFull | null;
  defaultPassword: string;
  onClose: () => void;
  onSubmit: () => void;
  language: string;
}

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

export function AddResidentModal({
  manualForm,
  setManualForm,
  selectedBuilding,
  defaultPassword,
  onClose,
  onSubmit,
  language,
}: AddResidentModalProps) {
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

  // Compose address from selections
  const composeAddress = useCallback((branchId: string, buildingId: string, entranceId: string, apartmentId: string) => {
    const branch = branches.find(b => b.id === branchId);
    const building = buildings.find(b => b.id === buildingId);
    const entrance = entrances.find(e => e.id === entranceId);
    const apartment = apartments.find(a => a.id === apartmentId);

    const parts: string[] = [];
    if (branch) parts.push(branch.name);
    if (building) parts.push(`${language === 'ru' ? 'Дом' : 'Uy'} ${building.building_number}`);
    if (entrance) parts.push(`${language === 'ru' ? 'Подъезд' : 'Podyezd'} ${entrance.number}`);
    if (apartment) parts.push(`${language === 'ru' ? 'Кв.' : 'Kv.'} ${apartment.number}`);

    return parts.join(', ');
  }, [branches, buildings, entrances, apartments, language]);

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

  // Update address when apartment is selected
  useEffect(() => {
    if (selectedApartmentId) {
      const address = composeAddress(selectedBranchId, selectedBuildingId, selectedEntranceId, selectedApartmentId);
      setManualForm({ ...manualForm, address });
    }
  }, [selectedApartmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBranchChange = useCallback((value: string) => {
    setSelectedBranchId(value);
    setSelectedBuildingId('');
    setSelectedEntranceId('');
    setSelectedApartmentId('');
    setBuildings([]);
    setEntrances([]);
    setApartments([]);
    setManualForm({ ...manualForm, address: '' });
  }, [manualForm, setManualForm]);

  const handleBuildingChange = useCallback((value: string) => {
    setSelectedBuildingId(value);
    setSelectedEntranceId('');
    setSelectedApartmentId('');
    setEntrances([]);
    setApartments([]);
    setManualForm({ ...manualForm, address: '' });
  }, [manualForm, setManualForm]);

  const handleEntranceChange = useCallback((value: string) => {
    setSelectedEntranceId(value);
    setSelectedApartmentId('');
    setApartments([]);
    setManualForm({ ...manualForm, address: '' });
  }, [manualForm, setManualForm]);

  const handleApartmentChange = useCallback((value: string) => {
    setSelectedApartmentId(value);
  }, []);

  // Derive password from selections
  const getPasswordDisplay = () => {
    const branch = branches.find(b => b.id === selectedBranchId);
    const building = buildings.find(b => b.id === selectedBuildingId);
    if (branch && building) {
      const apt = apartments.find(a => a.id === selectedApartmentId);
      return `${branch.code}/${building.building_number}/${apt ? apt.number : (language === 'ru' ? '[кв]' : '[xon]')}`;
    }
    if (selectedBuilding?.branchCode && selectedBuilding?.buildingNumber) {
      return `${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/${language === 'ru' ? '[кв]' : '[xon]'}`;
    }
    return defaultPassword;
  };

  return (
    <div className="modal-backdrop items-end sm:items-center">
      <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/30 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Cascading dropdowns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Комплекс *' : 'Kompleks *'}
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="input-field"
              disabled={loadingBranches}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Дом *' : 'Uy *'}
            </label>
            <select
              value={selectedBuildingId}
              onChange={(e) => handleBuildingChange(e.target.value)}
              className="input-field"
              disabled={!selectedBranchId || loadingBuildings}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Подъезд *' : 'Podyezd *'}
            </label>
            <select
              value={selectedEntranceId}
              onChange={(e) => handleEntranceChange(e.target.value)}
              className="input-field"
              disabled={!selectedBuildingId || loadingEntrances}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Квартира *' : 'Kvartira *'}
            </label>
            <select
              value={selectedApartmentId}
              onChange={(e) => handleApartmentChange(e.target.value)}
              className="input-field"
              disabled={!selectedEntranceId || loadingApartments}
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

          {/* Personal account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Л/С (Лицевой счет)' : 'Sh/H (Shaxsiy hisob)'}</label>
            <input
              type="text"
              value={manualForm.personalAccount}
              onChange={(e) => setManualForm({...manualForm, personalAccount: e.target.value})}
              className="input-field"
              placeholder="12345678"
            />
          </div>

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО абонента *' : 'Abonent F.I.O. *'}</label>
            <input
              type="text"
              value={manualForm.fullName}
              onChange={(e) => setManualForm({...manualForm, fullName: e.target.value})}
              className="input-field"
              placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ivanov Ivan Ivanovich'}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
            <input
              type="tel"
              value={manualForm.phone}
              onChange={(e) => setManualForm({...manualForm, phone: e.target.value})}
              className="input-field"
              placeholder="+998 90 123 45 67"
              maxLength={13}
            />
          </div>

          {/* Password info */}
          <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
            <strong>{language === 'ru' ? 'Пароль' : 'Parol'}:</strong> {getPasswordDisplay()}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={onSubmit}
            disabled={!manualForm.fullName || !selectedApartmentId}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {language === 'ru' ? 'Создать аккаунт' : 'Akkaunt yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}
