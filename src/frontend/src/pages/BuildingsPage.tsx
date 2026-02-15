import { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, MapPin,
  Trash2, Edit, X, ChevronRight,
  Layers, Thermometer, Droplets, Car, Loader2, RefreshCw,
  GitBranch, DoorOpen, ArrowLeft
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useLanguageStore } from '../stores/languageStore';
import { apiRequest } from '../services/api';
import type { BuildingFull } from '../types';
import { BUILDING_TYPE_LABELS } from '../types';

// Branch type
interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  buildings_count: number;
  residents_count: number;
}

// Entrance type
interface Entrance {
  id: string;
  building_id: string;
  number: number;
  floors_from?: number;
  floors_to?: number;
  apartments_from?: number;
  apartments_to?: number;
  has_elevator?: number;
  intercom_type?: string;
  intercom_code?: string;
}

// Navigation levels
type ViewLevel = 'branches' | 'buildings' | 'entrances';

export function BuildingsPage() {
  const {
    buildings,
    addBuilding,
    updateBuilding,
    deleteBuilding,
    fetchBuildings,
    isLoadingBuildings,
  } = useCRMStore();

  const { language } = useLanguageStore();

  // Navigation state
  const [viewLevel, setViewLevel] = useState<ViewLevel>('branches');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingFull | null>(null);

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingEntrances, setIsLoadingEntrances] = useState(false);

  // Modals
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [showQuickAddBuildingModal, setShowQuickAddBuildingModal] = useState(false);
  const [showAddEntranceModal, setShowAddEntranceModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<BuildingFull | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Load branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  // Load buildings when branch is selected
  useEffect(() => {
    if (selectedBranch) {
      fetchBuildingsForBranch(selectedBranch.id);
    }
  }, [selectedBranch]);

  // Load entrances when building is selected
  useEffect(() => {
    if (selectedBuilding) {
      fetchEntrancesForBuilding(selectedBuilding.id);
    }
  }, [selectedBuilding]);

  const fetchBranches = async () => {
    setIsLoadingBranches(true);
    try {
      const response = await apiRequest<{ branches: Branch[] }>('/api/branches');
      setBranches(response.branches || []);
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const fetchBuildingsForBranch = async (_branchId: string) => {
    await fetchBuildings();
  };

  const fetchEntrancesForBuilding = async (buildingId: string) => {
    setIsLoadingEntrances(true);
    try {
      const response = await apiRequest<{ entrances: Entrance[] }>(`/api/buildings/${buildingId}/entrances`);
      setEntrances(response.entrances || []);
    } catch (error) {
      console.error('Failed to fetch entrances:', error);
      setEntrances([]);
    } finally {
      setIsLoadingEntrances(false);
    }
  };

  // Filter buildings by selected branch
  const filteredBuildings = selectedBranch
    ? buildings.filter(b => b.branchCode === selectedBranch.code)
    : buildings;

  // Search filter
  const searchedBuildings = filteredBuildings.filter(b =>
    searchQuery === '' ||
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const searchedBranches = branches.filter(b =>
    searchQuery === '' ||
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Navigation handlers
  const handleBranchClick = (branch: Branch) => {
    setSelectedBranch(branch);
    setViewLevel('buildings');
    setSearchQuery('');
  };

  const handleBuildingClick = (building: BuildingFull) => {
    setSelectedBuilding(building);
    setViewLevel('entrances');
    setSearchQuery('');
  };

  const handleBack = () => {
    if (viewLevel === 'entrances') {
      setSelectedBuilding(null);
      setViewLevel('buildings');
    } else if (viewLevel === 'buildings') {
      setSelectedBranch(null);
      setViewLevel('branches');
    }
    setSearchQuery('');
  };

  // CRUD handlers for branches
  const handleAddBranch = async (data: { code: string; name: string; address?: string; phone?: string }) => {
    try {
      await apiRequest('/api/branches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      fetchBranches();
      setShowAddBranchModal(false);
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || (language === 'ru' ? 'Не удалось создать филиал' : 'Filial yaratib bo\'lmadi')));
    }
  };

  const handleUpdateBranch = async (id: string, data: Partial<Branch>) => {
    try {
      await apiRequest(`/api/branches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      fetchBranches();
      setEditingBranch(null);
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || (language === 'ru' ? 'Не удалось обновить филиал' : 'Filialni yangilab bo\'lmadi')));
    }
  };

  const handleDeleteBranch = async (id: string) => {
    if (!confirm(language === 'ru' ? 'Удалить этот филиал? Сначала удалите все дома в этом филиале.' : 'Bu filialni o\'chirasizmi? Avval bu filialdagi barcha uylarni o\'chiring.')) return;
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'DELETE' });
      fetchBranches();
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || (language === 'ru' ? 'Не удалось удалить филиал' : 'Filialni o\'chirib bo\'lmadi')));
    }
  };

  // CRUD handlers for buildings
  const handleAddBuilding = async (data: any) => {
    const buildingData = {
      ...data,
      branchId: selectedBranch?.id,
      branchCode: selectedBranch?.code,
    };
    await addBuilding(buildingData);
    setShowAddBuildingModal(false);
    if (selectedBranch) {
      fetchBuildingsForBranch(selectedBranch.id);
    }
    fetchBranches(); // Refresh counts
  };

  // Quick add building (simplified - just building number)
  const handleQuickAddBuilding = async (buildingNumber: string) => {
    const buildingData: any = {
      name: `${language === 'ru' ? 'Дом' : 'Uy'} ${buildingNumber}`,
      address: selectedBranch?.address || `${language === 'ru' ? 'Дом' : 'Uy'} ${buildingNumber}`,
      buildingNumber: buildingNumber.toUpperCase(),
      branchId: selectedBranch?.id,
      branchCode: selectedBranch?.code,
      floors: 9,
      entrances: 4,
      totalApartments: 144,
      yearBuilt: 2020,
      buildingType: 'monolith',
      hasElevator: true,
      hasGas: true,
      hasHotWater: true,
      hasParkingLot: false,
    };
    await addBuilding(buildingData);
    setShowQuickAddBuildingModal(false);
    if (selectedBranch) {
      fetchBuildingsForBranch(selectedBranch.id);
    }
    fetchBranches(); // Refresh counts
  };

  const handleUpdateBuilding = async (id: string, data: Partial<BuildingFull>) => {
    await updateBuilding(id, data);
    setEditingBuilding(null);
    if (selectedBranch) {
      fetchBuildingsForBranch(selectedBranch.id);
    }
  };

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm(language === 'ru' ? 'Удалить это здание? Все связанные данные также будут удалены.' : 'Bu binoni o\'chirasizmi? Barcha bog\'liq ma\'lumotlar ham o\'chiriladi.')) return;
    try {
      await deleteBuilding(id);
      if (selectedBranch) {
        fetchBuildingsForBranch(selectedBranch.id);
      }
      fetchBranches(); // Refresh counts
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || (language === 'ru' ? 'Не удалось удалить здание' : 'Binoni o\'chirib bo\'lmadi')));
    }
  };

  // CRUD handlers for entrances
  const handleAddEntrance = async (data: { number: number; floors_from?: number; floors_to?: number; apartments_from?: number; apartments_to?: number }) => {
    if (!selectedBuilding) return;
    try {
      await apiRequest(`/api/buildings/${selectedBuilding.id}/entrances`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      fetchEntrancesForBuilding(selectedBuilding.id);
      setShowAddEntranceModal(false);
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || (language === 'ru' ? 'Не удалось добавить подъезд' : 'Podyezd qo\'shib bo\'lmadi')));
    }
  };

  // Breadcrumb
  const renderBreadcrumb = () => (
    <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <button
        onClick={() => { setViewLevel('branches'); setSelectedBranch(null); setSelectedBuilding(null); }}
        className={`hover:text-primary-600 ${viewLevel === 'branches' ? 'text-gray-900 font-medium' : ''}`}
      >
        {language === 'ru' ? 'Филиалы' : 'Filiallar'}
      </button>
      {selectedBranch && (
        <>
          <ChevronRight className="w-4 h-4" />
          <button
            onClick={() => { setViewLevel('buildings'); setSelectedBuilding(null); }}
            className={`hover:text-primary-600 ${viewLevel === 'buildings' ? 'text-gray-900 font-medium' : ''}`}
          >
            {selectedBranch.name}
          </button>
        </>
      )}
      {selectedBuilding && (
        <>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 font-medium">{selectedBuilding.name}</span>
        </>
      )}
    </div>
  );

  // Loading state
  if ((isLoadingBranches && branches.length === 0) || (isLoadingBuildings && buildings.length === 0 && viewLevel === 'buildings')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <p className="text-gray-500">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {viewLevel !== 'branches' && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white/30 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {viewLevel === 'branches' && (language === 'ru' ? 'Филиалы / Объекты' : 'Filiallar / Obyektlar')}
              {viewLevel === 'buildings' && `${language === 'ru' ? 'Дома' : 'Uylar'}: ${selectedBranch?.name}`}
              {viewLevel === 'entrances' && `${language === 'ru' ? 'Подъезды' : 'Podyezdlar'}: ${selectedBuilding?.name}`}
            </h1>
            <p className="text-gray-500 mt-1">
              {viewLevel === 'branches' && (language === 'ru' ? 'Выберите филиал для просмотра домов' : 'Uylarni ko\'rish uchun filialni tanlang')}
              {viewLevel === 'buildings' && (language === 'ru' ? 'Выберите дом для просмотра подъездов' : 'Podyezdlarni ko\'rish uchun uyni tanlang')}
              {viewLevel === 'entrances' && (language === 'ru' ? 'Управление подъездами и квартирами' : 'Podyezdlar va xonadonlarni boshqarish')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (viewLevel === 'branches') fetchBranches();
              else if (viewLevel === 'buildings' && selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
              else if (viewLevel === 'entrances' && selectedBuilding) fetchEntrancesForBuilding(selectedBuilding.id);
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (viewLevel === 'branches') setShowAddBranchModal(true);
              else if (viewLevel === 'buildings') setShowAddBuildingModal(true);
              else if (viewLevel === 'entrances') setShowAddEntranceModal(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {viewLevel === 'branches' && (language === 'ru' ? 'Добавить филиал' : 'Filial qo\'shish')}
            {viewLevel === 'buildings' && (language === 'ru' ? 'Добавить ЖК' : 'TJM qo\'shish')}
            {viewLevel === 'entrances' && (language === 'ru' ? 'Добавить подъезд' : 'Podyezd qo\'shish')}
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Search */}
      {viewLevel !== 'entrances' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={viewLevel === 'branches' ? (language === 'ru' ? 'Поиск по филиалам...' : 'Filiallar bo\'yicha qidirish...') : (language === 'ru' ? 'Поиск по домам...' : 'Uylar bo\'yicha qidirish...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      )}

      {/* Branches Grid */}
      {viewLevel === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchedBranches.map((branch) => (
            <div
              key={branch.id}
              className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleBranchClick(branch)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center">
                    <GitBranch className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{branch.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-mono">
                      {branch.code}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditingBranch(branch)}
                    className="p-2 hover:bg-white/30 rounded-lg"
                    title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                  >
                    <Edit className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDeleteBranch(branch.id)}
                    className="p-2 hover:bg-red-50 rounded-lg"
                    title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>

              {branch.address && (
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                  <MapPin className="w-3 h-3" />
                  {branch.address}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{branch.buildings_count}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Домов' : 'Uylar'}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{branch.residents_count}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Жителей' : 'Yashovchilar'}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center text-sm text-primary-600">
                <span>{language === 'ru' ? 'Открыть' : 'Ochish'}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}

          {searchedBranches.length === 0 && (
            <div className="col-span-full glass-card p-8 text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Филиалы не найдены' : 'Filiallar topilmadi'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'Добавьте первый филиал' : 'Birinchi filialni qo\'shing'}</p>
            </div>
          )}
        </div>
      )}

      {/* Buildings Grid */}
      {viewLevel === 'buildings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {searchedBuildings.map((building) => (
            <div
              key={building.id}
              className="glass-card p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleBuildingClick(building)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{building.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3 h-3" />
                      {building.address}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {BUILDING_TYPE_LABELS[building.buildingType]}
                      </span>
                      {building.buildingNumber && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-mono">
                          {language === 'ru' ? 'Дом' : 'Uy'} {building.buildingNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditingBuilding(building)}
                    className="p-2 hover:bg-white/30 rounded-lg"
                    title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                  >
                    <Edit className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDeleteBuilding(building.id)}
                    className="p-2 hover:bg-red-50 rounded-lg"
                    title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-white/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold">{building.floors}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Этажей' : 'Qavatlar'}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold">{building.entrances}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Подъездов' : 'Podyezdlar'}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold">{building.totalApartments}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Квартир' : 'Xonadonlar'}</div>
                </div>
                <div className="bg-white/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold">{building.residentsCount}</div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Жителей' : 'Yashovchilar'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {building.hasElevator && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-full">
                    <Layers className="w-3 h-3" /> {language === 'ru' ? 'Лифт' : 'Lift'}
                  </span>
                )}
                {building.hasGas && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-full">
                    <Thermometer className="w-3 h-3" /> {language === 'ru' ? 'Газ' : 'Gaz'}
                  </span>
                )}
                {building.hasHotWater && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-full">
                    <Droplets className="w-3 h-3" /> {language === 'ru' ? 'ГВС' : 'ISS'}
                  </span>
                )}
                {building.hasParkingLot && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 rounded-full">
                    <Car className="w-3 h-3" /> {language === 'ru' ? 'Парковка' : 'Parking'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center text-sm text-primary-600">
                <span>{language === 'ru' ? 'Подъезды' : 'Podyezdlar'}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}

          {searchedBuildings.length === 0 && (
            <div className="col-span-full glass-card p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Дома не найдены' : 'Uylar topilmadi'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'Добавьте первый дом в этом филиале' : 'Bu filialga birinchi uyni qo\'shing'}</p>
            </div>
          )}
        </div>
      )}

      {/* Entrances Grid */}
      {viewLevel === 'entrances' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingEntrances ? (
            <div className="col-span-full flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <>
              {entrances.map((entrance) => (
                <div key={entrance.id} className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl flex items-center justify-center">
                      <DoorOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{language === 'ru' ? 'Подъезд' : 'Podyezd'} {entrance.number}</h3>
                      {entrance.intercom_code && (
                        <span className="text-xs text-gray-500">{language === 'ru' ? 'Код' : 'Kod'}: {entrance.intercom_code}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {entrance.floors_from !== undefined && entrance.floors_to !== undefined && (
                      <div className="bg-white/30 rounded-lg p-2 text-center">
                        <div className="text-sm font-medium">{entrance.floors_from}-{entrance.floors_to}</div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Этажи' : 'Qavatlar'}</div>
                      </div>
                    )}
                    {entrance.apartments_from !== undefined && entrance.apartments_to !== undefined && (
                      <div className="bg-white/30 rounded-lg p-2 text-center">
                        <div className="text-sm font-medium">{entrance.apartments_from}-{entrance.apartments_to}</div>
                        <div className="text-xs text-gray-500">{language === 'ru' ? 'Квартиры' : 'Xonadonlar'}</div>
                      </div>
                    )}
                  </div>

                  {entrance.has_elevator === 1 && (
                    <div className="mt-3 flex items-center gap-1 text-xs text-green-600">
                      <Layers className="w-3 h-3" />
                      {language === 'ru' ? 'Есть лифт' : 'Lift bor'}
                    </div>
                  )}
                </div>
              ))}

              {entrances.length === 0 && (
                <div className="col-span-full glass-card p-8 text-center">
                  <DoorOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Подъезды не добавлены' : 'Podyezdlar qo\'shilmagan'}</h3>
                  <p className="text-gray-400 mt-1">{language === 'ru' ? 'Добавьте подъезды для этого дома' : 'Bu uy uchun podyezdlarni qo\'shing'}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Branch Modal */}
      {showAddBranchModal && (
        <BranchModal
          branch={null}
          onClose={() => setShowAddBranchModal(false)}
          onSave={handleAddBranch}
          language={language}
        />
      )}

      {/* Edit Branch Modal */}
      {editingBranch && (
        <BranchModal
          branch={editingBranch}
          onClose={() => setEditingBranch(null)}
          onSave={(data) => handleUpdateBranch(editingBranch.id, data)}
          language={language}
        />
      )}

      {/* Quick Add Building Modal */}
      {showQuickAddBuildingModal && (
        <QuickBuildingModal
          onClose={() => setShowQuickAddBuildingModal(false)}
          onSave={handleQuickAddBuilding}
          branchCode={selectedBranch?.code || ''}
          language={language}
        />
      )}

      {/* Add Building Modal (Full - for ЖК) */}
      {showAddBuildingModal && (
        <BuildingModal
          building={null}
          onClose={() => setShowAddBuildingModal(false)}
          onSave={handleAddBuilding}
          onSwitchToQuick={() => {
            setShowAddBuildingModal(false);
            setShowQuickAddBuildingModal(true);
          }}
          language={language}
        />
      )}

      {/* Edit Building Modal */}
      {editingBuilding && (
        <BuildingModal
          building={editingBuilding}
          onClose={() => setEditingBuilding(null)}
          onSave={(data) => handleUpdateBuilding(editingBuilding.id, data)}
          language={language}
        />
      )}

      {/* Add Entrance Modal */}
      {showAddEntranceModal && (
        <EntranceModal
          onClose={() => setShowAddEntranceModal(false)}
          onSave={handleAddEntrance}
          existingEntrances={entrances}
          language={language}
        />
      )}
    </div>
  );
}

// Branch Modal
function BranchModal({
  branch,
  onClose,
  onSave,
  language
}: {
  branch: Branch | null;
  onClose: () => void;
  onSave: (data: { code: string; name: string; address?: string; phone?: string }) => void;
  language: string;
}) {
  const [formData, setFormData] = useState({
    code: branch?.code || '',
    name: branch?.name || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.code.trim() || !formData.name.trim()) {
      setError(language === 'ru' ? 'Заполните обязательные поля' : 'Majburiy maydonlarni to\'ldiring');
      return;
    }

    onSave(formData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {branch ? (language === 'ru' ? 'Редактировать филиал' : 'Filialni tahrirlash') : (language === 'ru' ? 'Новый филиал' : 'Yangi filial')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Код филиала' : 'Filial kodi'} *
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className="input-field font-mono"
              placeholder="YS, CH, MR..."
              maxLength={5}
              required
              disabled={!!branch}
            />
            <p className="text-xs text-gray-500 mt-1">{language === 'ru' ? 'Используется для генерации паролей жильцов' : 'Yashovchilar parollarini yaratish uchun ishlatiladi'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Название' : 'Nomi'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field"
              placeholder={language === 'ru' ? 'Юнусабад' : 'Yunusobod'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Адрес' : 'Manzil'}
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input-field"
              placeholder={language === 'ru' ? 'ул. Примера, 1' : 'Namuna ko\'chasi, 1'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Телефон' : 'Telefon'}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input-field"
              placeholder="+998 90 123 45 67"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {branch ? (language === 'ru' ? 'Сохранить' : 'Saqlash') : (language === 'ru' ? 'Создать' : 'Yaratish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Building Modal (full form for ЖК)
function BuildingModal({
  building,
  onClose,
  onSave,
  onSwitchToQuick,
  language
}: {
  building: BuildingFull | null;
  onClose: () => void;
  onSave: (data: any) => void;
  onSwitchToQuick?: () => void;
  language: string;
}) {
  const [formData, setFormData] = useState({
    name: building?.name || '',
    address: building?.address || '',
    buildingNumber: building?.buildingNumber || '',
    floors: building?.floors || 5,
    entrances: building?.entrances || 2,
    totalApartments: building?.totalApartments || 40,
    yearBuilt: building?.yearBuilt || 2020,
    buildingType: building?.buildingType || 'monolith' as const,
    hasElevator: building?.hasElevator ?? true,
    elevatorCount: building?.elevatorCount || 2,
    hasGas: building?.hasGas ?? true,
    hasHotWater: building?.hasHotWater ?? true,
    hasParkingLot: building?.hasParkingLot ?? true,
    parkingSpaces: building?.parkingSpaces || 20,
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.address.trim()) {
      setError(language === 'ru' ? 'Заполните обязательные поля' : 'Majburiy maydonlarni to\'ldiring');
      return;
    }

    onSave(formData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {building ? (language === 'ru' ? 'Редактировать ЖК' : 'TJMni tahrirlash') : (language === 'ru' ? 'Новый ЖК' : 'Yangi TJM')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Switch to quick add */}
        {!building && onSwitchToQuick && (
          <button
            type="button"
            onClick={onSwitchToQuick}
            className="w-full mb-4 p-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {language === 'ru' ? 'Добавить просто дом (5Б, 121, 8А...)' : 'Oddiy uy qo\'shish (5B, 121, 8A...)'}
          </button>
        )}

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Название' : 'Nomi'} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field"
              placeholder={language === 'ru' ? 'ЖК "Название"' : 'TJM "Nomi"'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Адрес' : 'Manzil'} *
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input-field"
              placeholder={language === 'ru' ? 'ул. Пример, 1' : 'Namuna ko\'chasi, 1'}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Номер дома' : 'Uy raqami'}
              </label>
              <input
                type="text"
                value={formData.buildingNumber}
                onChange={(e) => setFormData({ ...formData, buildingNumber: e.target.value.toUpperCase() })}
                className="input-field"
                placeholder="8A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Год постройки' : 'Qurilgan yili'}
              </label>
              <input
                type="number"
                value={formData.yearBuilt}
                onChange={(e) => setFormData({ ...formData, yearBuilt: parseInt(e.target.value) || 2000 })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Этажей' : 'Qavatlar'}
              </label>
              <input
                type="number"
                value={formData.floors}
                onChange={(e) => setFormData({ ...formData, floors: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Подъездов' : 'Podyezdlar'}
              </label>
              <input
                type="number"
                value={formData.entrances}
                onChange={(e) => setFormData({ ...formData, entrances: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Квартир' : 'Xonadonlar'}
              </label>
              <input
                type="number"
                value={formData.totalApartments}
                onChange={(e) => setFormData({ ...formData, totalApartments: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Тип здания' : 'Bino turi'}
            </label>
            <select
              value={formData.buildingType}
              onChange={(e) => setFormData({ ...formData, buildingType: e.target.value as any })}
              className="input-field"
            >
              <option value="panel">{language === 'ru' ? 'Панельный' : 'Panelli'}</option>
              <option value="brick">{language === 'ru' ? 'Кирпичный' : 'G\'ishtli'}</option>
              <option value="monolith">{language === 'ru' ? 'Монолитный' : 'Monolitik'}</option>
              <option value="block">{language === 'ru' ? 'Блочный' : 'Blokli'}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasElevator}
                onChange={(e) => setFormData({ ...formData, hasElevator: e.target.checked })}
              />
              <span>{language === 'ru' ? 'Лифт' : 'Lift'}</span>
            </label>
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasGas}
                onChange={(e) => setFormData({ ...formData, hasGas: e.target.checked })}
              />
              <span>{language === 'ru' ? 'Газ' : 'Gaz'}</span>
            </label>
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasHotWater}
                onChange={(e) => setFormData({ ...formData, hasHotWater: e.target.checked })}
              />
              <span>{language === 'ru' ? 'Горячая вода' : 'Issiq suv'}</span>
            </label>
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.hasParkingLot}
                onChange={(e) => setFormData({ ...formData, hasParkingLot: e.target.checked })}
              />
              <span>{language === 'ru' ? 'Парковка' : 'Parking'}</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {building ? (language === 'ru' ? 'Сохранить' : 'Saqlash') : (language === 'ru' ? 'Создать' : 'Yaratish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Entrance Modal
function EntranceModal({
  onClose,
  onSave,
  existingEntrances,
  language
}: {
  onClose: () => void;
  onSave: (data: { number: number; floors_from?: number; floors_to?: number; apartments_from?: number; apartments_to?: number }) => void;
  existingEntrances: Entrance[];
  language: string;
}) {
  const nextNumber = existingEntrances.length > 0
    ? Math.max(...existingEntrances.map(e => e.number)) + 1
    : 1;

  const [formData, setFormData] = useState({
    number: nextNumber,
    floors_from: 1,
    floors_to: 9,
    apartments_from: 1,
    apartments_to: 36,
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.number < 1) {
      setError(language === 'ru' ? 'Номер подъезда должен быть больше 0' : 'Podyezd raqami 0 dan katta bo\'lishi kerak');
      return;
    }

    onSave(formData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{language === 'ru' ? 'Новый подъезд' : 'Yangi podyezd'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Номер подъезда' : 'Podyezd raqami'} *
            </label>
            <input
              type="number"
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: parseInt(e.target.value) || 1 })}
              className="input-field"
              min="1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Этаж с' : 'Qavatdan'}
              </label>
              <input
                type="number"
                value={formData.floors_from}
                onChange={(e) => setFormData({ ...formData, floors_from: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Этаж по' : 'Qavatgacha'}
              </label>
              <input
                type="number"
                value={formData.floors_to}
                onChange={(e) => setFormData({ ...formData, floors_to: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Квартира с' : 'Xonadondan'}
              </label>
              <input
                type="number"
                value={formData.apartments_from}
                onChange={(e) => setFormData({ ...formData, apartments_from: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {language === 'ru' ? 'Квартира по' : 'Xonadongacha'}
              </label>
              <input
                type="number"
                value={formData.apartments_to}
                onChange={(e) => setFormData({ ...formData, apartments_to: parseInt(e.target.value) || 1 })}
                className="input-field"
                min="1"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {language === 'ru' ? 'Создать' : 'Yaratish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Quick Building Modal (simplified - just building number)
function QuickBuildingModal({
  onClose,
  onSave,
  branchCode,
  language
}: {
  onClose: () => void;
  onSave: (buildingNumber: string) => void;
  branchCode: string;
  language: string;
}) {
  const [buildingNumber, setBuildingNumber] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!buildingNumber.trim()) {
      setError(language === 'ru' ? 'Введите номер дома' : 'Uy raqamini kiriting');
      return;
    }

    onSave(buildingNumber.trim());
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{language === 'ru' ? 'Добавить дом' : 'Uy qo\'shish'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/30 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ru' ? 'Номер дома' : 'Uy raqami'} *
            </label>
            <input
              type="text"
              value={buildingNumber}
              onChange={(e) => setBuildingNumber(e.target.value.toUpperCase())}
              className="input-field text-2xl text-center font-bold"
              placeholder="5B, 121, 8A..."
              autoFocus
              required
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              {language === 'ru' ? 'Пароль жителей' : 'Yashovchilar paroli'}: <span className="font-mono bg-gray-100 px-1 rounded">{branchCode}/{buildingNumber || '?'}/{language === 'ru' ? '[кв]' : '[xn]'}</span>
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
