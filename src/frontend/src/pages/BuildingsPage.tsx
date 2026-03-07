import { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, MapPin,
  Trash2, Edit, X, ChevronRight,
  Layers, Thermometer, Droplets, Car, Loader2, RefreshCw,
  GitBranch, DoorOpen, ArrowLeft, User, Phone, Zap, Home,
  Save, PlusCircle
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

// Apartment type
interface Apartment {
  id: string;
  building_id: string;
  entrance_id?: string;
  number: string;
  floor?: number;
  total_area?: number;
  living_area?: number;
  rooms?: number;
  status?: string;
  is_commercial?: number;
  ownership_type?: string;
  resident_count?: number;
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

  // Apartments
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [isLoadingApartments, setIsLoadingApartments] = useState(false);
  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);
  const [apartmentResidents, setApartmentResidents] = useState<any[]>([]);
  const [isLoadingResidents, setIsLoadingResidents] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Apartment editing state
  const [isEditingApartment, setIsEditingApartment] = useState(false);
  const [isAddingApartment, setIsAddingApartment] = useState(false);
  const [editForm, setEditForm] = useState({
    number: '',
    floor: '',
    rooms: '',
    total_area: '',
    status: 'occupied',
    is_commercial: false,
    entrance_id: '',
  });
  const [isSavingApartment, setIsSavingApartment] = useState(false);

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

  // Load entrances and apartments when building is selected
  useEffect(() => {
    if (selectedBuilding) {
      fetchEntrancesForBuilding(selectedBuilding.id);
      fetchApartmentsForBuilding(selectedBuilding.id);
      setSelectedApartment(null);
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

  const fetchApartmentsForBuilding = async (buildingId: string) => {
    setIsLoadingApartments(true);
    try {
      const response = await apiRequest<{ apartments: Apartment[] }>(`/api/buildings/${buildingId}/apartments?limit=2000`);
      setApartments(response.apartments || []);
    } catch (error) {
      console.error('Failed to fetch apartments:', error);
      setApartments([]);
    } finally {
      setIsLoadingApartments(false);
    }
  };

  const handleApartmentClick = async (apt: Apartment) => {
    setSelectedApartment(apt);
    setApartmentResidents([]);
    setIsLoadingResidents(true);
    try {
      const aptDetail = await apiRequest<any>(`/api/apartments/${apt.id}`);
      const owners = aptDetail.owners || [];
      const userResidents = aptDetail.userResidents || [];
      let crmResidents: any[] = [];
      try {
        const crmRes = await apiRequest<{ residents: any[] }>(`/api/apartments/${apt.id}/residents`);
        crmResidents = crmRes.residents || [];
      } catch {}
      const combined = [
        ...owners.map((o: any) => ({ id: o.id, name: o.name || o.full_name || '', phone: o.phone, type: 'owner' })),
        ...userResidents.map((u: any) => ({ id: u.id, name: u.name || '', phone: u.phone, login: u.login, type: 'resident' })),
        ...crmResidents.map((r: any) => ({ id: r.id, name: r.name || r.full_name || '', phone: r.phone, type: 'resident' })),
      ];
      // Deduplicate by id
      const seen = new Set<string>();
      const unique = combined.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      setApartmentResidents(unique);
    } catch (error) {
      console.error('Failed to fetch apartment residents:', error);
      setApartmentResidents([]);
    } finally {
      setIsLoadingResidents(false);
    }
  };

  const handleGenerateApartments = async () => {
    if (!selectedBuilding) {
      alert(language === 'ru' ? 'Выберите здание' : 'Binoni tanlang');
      return;
    }
    if (entrances.length === 0) {
      alert(language === 'ru' ? 'Сначала добавьте подъезды' : 'Avval podyezdlarni qo\'shing');
      return;
    }

    setIsGenerating(true);
    try {
      // Build apartment data from entrances
      const aptData: Array<{ number: string; floor: number; entrance_id: string; status: string }> = [];
      for (const entrance of entrances) {
        const floorsFrom = entrance.floors_from || 1;
        const floorsTo = entrance.floors_to || (selectedBuilding.floors || 9);
        const aptsFrom = entrance.apartments_from || 1;
        const aptsTo = entrance.apartments_to || 36;
        const totalApts = aptsTo - aptsFrom + 1;
        const totalFloors = floorsTo - floorsFrom + 1;
        const aptsPerFloor = Math.ceil(totalApts / totalFloors);
        let aptNum = aptsFrom;
        for (let floor = floorsFrom; floor <= floorsTo && aptNum <= aptsTo; floor++) {
          for (let i = 0; i < aptsPerFloor && aptNum <= aptsTo; i++) {
            aptData.push({ number: String(aptNum), floor, entrance_id: entrance.id, status: 'occupied' });
            aptNum++;
          }
        }
      }

      if (aptData.length === 0) {
        alert(language === 'ru' ? 'Нет данных для генерации. Проверьте настройки подъездов.' : 'Yaratish uchun ma\'lumot yo\'q. Podyezd sozlamalarini tekshiring.');
        setIsGenerating(false);
        return;
      }

      // Use bulk endpoint - single request
      const result = await apiRequest<{ created: number; total: number; errors?: string[] }>(`/api/buildings/${selectedBuilding.id}/apartments/bulk`, {
        method: 'POST',
        body: JSON.stringify({ apartments: aptData }),
      });

      // Check for partial failures
      if (result.errors && result.errors.length > 0) {
        console.warn('Bulk create had errors:', result.errors);
        // If all failed, likely UNIQUE constraint - try to show what happened
        if (result.created <= 0) {
          alert(language === 'ru'
            ? 'Квартиры уже существуют для этого здания. Обновите страницу.'
            : 'Xonadonlar allaqachon mavjud. Sahifani yangilang.');
        }
      }

      await fetchApartmentsForBuilding(selectedBuilding.id);
    } catch (error: any) {
      console.error('Failed to generate apartments:', error);
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || ''));
    } finally {
      setIsGenerating(false);
    }
  };

  const getAptColor = (apt: Apartment) => {
    if (apt.is_commercial) return 'bg-pink-200 text-pink-800 hover:bg-pink-300';
    switch (apt.status) {
      case 'vacant': return 'bg-green-200 text-green-800 hover:bg-green-300';
      case 'rented': return 'bg-purple-200 text-purple-800 hover:bg-purple-300';
      case 'renovation': return 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300';
      case 'commercial': return 'bg-pink-200 text-pink-800 hover:bg-pink-300';
      default: return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    }
  };

  const getStatusLabel = (apt: Apartment) => {
    if (apt.is_commercial) return language === 'ru' ? 'Коммерция' : 'Tijorat';
    switch (apt.status) {
      case 'vacant': return language === 'ru' ? 'Свободна' : 'Bo\'sh';
      case 'rented': return language === 'ru' ? 'Аренда' : 'Ijara';
      case 'renovation': return language === 'ru' ? 'Ремонт' : 'Ta\'mir';
      case 'commercial': return language === 'ru' ? 'Коммерция' : 'Tijorat';
      default: return language === 'ru' ? 'Занята' : 'Band';
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

  // Apartment editing handlers
  const startEditApartment = (apt: Apartment) => {
    setIsEditingApartment(true);
    setIsAddingApartment(false);
    setEditForm({
      number: apt.number || '',
      floor: String(apt.floor || ''),
      rooms: String(apt.rooms || ''),
      total_area: String(apt.total_area || ''),
      status: apt.status || 'occupied',
      is_commercial: !!apt.is_commercial,
      entrance_id: apt.entrance_id || '',
    });
  };

  const startAddApartment = () => {
    setSelectedApartment(null);
    setIsAddingApartment(true);
    setIsEditingApartment(false);
    setEditForm({
      number: '',
      floor: '1',
      rooms: '',
      total_area: '',
      status: 'occupied',
      is_commercial: false,
      entrance_id: entrances.length > 0 ? entrances[0].id : '',
    });
  };

  const cancelEditApartment = () => {
    setIsEditingApartment(false);
    setIsAddingApartment(false);
  };

  const handleSaveApartment = async () => {
    if (!editForm.number.trim()) {
      alert(language === 'ru' ? 'Укажите номер квартиры' : 'Xonadon raqamini kiriting');
      return;
    }
    setIsSavingApartment(true);
    try {
      if (isAddingApartment && selectedBuilding) {
        // Create new apartment
        await apiRequest(`/api/buildings/${selectedBuilding.id}/apartments`, {
          method: 'POST',
          body: JSON.stringify({
            number: editForm.number.trim(),
            floor: editForm.floor ? parseInt(editForm.floor) : 1,
            rooms: editForm.rooms ? parseInt(editForm.rooms) : null,
            total_area: editForm.total_area ? parseFloat(editForm.total_area) : null,
            status: editForm.status,
            is_commercial: editForm.is_commercial ? 1 : 0,
            entrance_id: editForm.entrance_id || null,
          }),
        });
        setIsAddingApartment(false);
        await fetchApartmentsForBuilding(selectedBuilding.id);
      } else if (selectedApartment) {
        // Update existing apartment
        await apiRequest(`/api/apartments/${selectedApartment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            number: editForm.number.trim(),
            floor: editForm.floor ? parseInt(editForm.floor) : null,
            rooms: editForm.rooms ? parseInt(editForm.rooms) : null,
            total_area: editForm.total_area ? parseFloat(editForm.total_area) : null,
            status: editForm.status,
            is_commercial: editForm.is_commercial ? 1 : 0,
            entrance_id: editForm.entrance_id || null,
          }),
        });
        // Update local state
        const updated = {
          ...selectedApartment,
          number: editForm.number.trim(),
          floor: editForm.floor ? parseInt(editForm.floor) : undefined,
          rooms: editForm.rooms ? parseInt(editForm.rooms) : undefined,
          total_area: editForm.total_area ? parseFloat(editForm.total_area) : undefined,
          status: editForm.status,
          is_commercial: editForm.is_commercial ? 1 : 0,
          entrance_id: editForm.entrance_id || undefined,
        };
        setSelectedApartment(updated);
        setApartments(prev => prev.map(a => a.id === updated.id ? updated : a));
        setIsEditingApartment(false);
      }
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || ''));
    } finally {
      setIsSavingApartment(false);
    }
  };

  const handleDeleteApartment = async () => {
    if (!selectedApartment) return;
    if (!confirm(language === 'ru' ? 'Удалить эту квартиру?' : 'Bu xonadonni o\'chirasizmi?')) return;
    try {
      await apiRequest(`/api/apartments/${selectedApartment.id}`, { method: 'DELETE' });
      setApartments(prev => prev.filter(a => a.id !== selectedApartment.id));
      setSelectedApartment(null);
      setIsEditingApartment(false);
    } catch (error: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (error.message || ''));
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
              {viewLevel === 'entrances' && `${selectedBuilding?.name}`}
            </h1>
            <p className="text-gray-500 mt-1">
              {viewLevel === 'branches' && (language === 'ru' ? 'Выберите филиал для просмотра домов' : 'Uylarni ko\'rish uchun filialni tanlang')}
              {viewLevel === 'buildings' && (language === 'ru' ? 'Выберите дом для просмотра подъездов' : 'Podyezdlarni ko\'rish uchun uyni tanlang')}
              {viewLevel === 'entrances' && (language === 'ru' ? 'Сетка квартир по подъездам и этажам' : 'Podyezd va qavatlar bo\'yicha xonadonlar')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (viewLevel === 'branches') fetchBranches();
              else if (viewLevel === 'buildings' && selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
              else if (viewLevel === 'entrances' && selectedBuilding) { fetchEntrancesForBuilding(selectedBuilding.id); fetchApartmentsForBuilding(selectedBuilding.id); }
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {viewLevel === 'entrances' && apartments.length === 0 && entrances.length > 0 && (
            <button
              onClick={handleGenerateApartments}
              disabled={isGenerating}
              className="btn-secondary flex items-center gap-2"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {language === 'ru' ? 'Сгенерировать' : 'Yaratish'}
            </button>
          )}
          {viewLevel === 'entrances' && apartments.length > 0 && (
            <button
              onClick={startAddApartment}
              className="btn-secondary flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              {language === 'ru' ? 'Добавить кв.' : 'Xonadon qo\'shish'}
            </button>
          )}
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
            {viewLevel === 'entrances' && (language === 'ru' ? 'Подъезд' : 'Podyezd')}
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Search */}
      {viewLevel !== 'entrances' && (
        <div className="flex items-center gap-2 input-field">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder={viewLevel === 'branches' ? (language === 'ru' ? 'Поиск по филиалам...' : 'Filiallar bo\'yicha qidirish...') : (language === 'ru' ? 'Поиск по домам...' : 'Uylar bo\'yicha qidirish...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
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

      {/* Apartment Grid */}
      {viewLevel === 'entrances' && (
        <div className="flex gap-4">
          {/* Grid area */}
          <div className="flex-1 min-w-0">
            {(isLoadingEntrances || isLoadingApartments) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              </div>
            ) : entrances.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <DoorOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Подъезды не добавлены' : 'Podyezdlar qo\'shilmagan'}</h3>
                <p className="text-gray-400 mt-1">{language === 'ru' ? 'Сначала добавьте подъезды' : 'Avval podyezdlarni qo\'shing'}</p>
              </div>
            ) : apartments.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <Home className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Квартиры не добавлены' : 'Xonadonlar qo\'shilmagan'}</h3>
                <p className="text-gray-400 mt-1 mb-4">{language === 'ru' ? 'Сгенерируйте квартиры на основе данных подъездов' : 'Podyezd ma\'lumotlari asosida xonadonlarni yarating'}</p>
                <button
                  onClick={handleGenerateApartments}
                  disabled={isGenerating}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {language === 'ru' ? 'Сгенерировать квартиры' : 'Xonadonlarni yaratish'}
                </button>
              </div>
            ) : (() => {
              const sortedEntrances = [...entrances].sort((a, b) => a.number - b.number);
              const entranceMap = new Map<string, Apartment[]>();
              apartments.forEach(apt => {
                const key = apt.entrance_id || '__none__';
                const arr = entranceMap.get(key) || [];
                arr.push(apt);
                entranceMap.set(key, arr);
              });
              let minFloor = Infinity, maxFloor = -Infinity;
              apartments.forEach(apt => {
                if (apt.floor != null) {
                  minFloor = Math.min(minFloor, apt.floor);
                  maxFloor = Math.max(maxFloor, apt.floor);
                }
              });
              if (minFloor === Infinity) {
                entrances.forEach(e => {
                  if (e.floors_from) minFloor = Math.min(minFloor, e.floors_from);
                  if (e.floors_to) maxFloor = Math.max(maxFloor, e.floors_to);
                });
              }
              if (minFloor === Infinity) { minFloor = 1; maxFloor = 9; }
              const floors: number[] = [];
              for (let f = maxFloor; f >= minFloor; f--) floors.push(f);

              return (
                <div className="glass-card p-4 overflow-x-auto">
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-4 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span> {language === 'ru' ? 'Занята' : 'Band'}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 border border-green-400"></span> {language === 'ru' ? 'Свободна' : 'Bo\'sh'}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-pink-200 border border-pink-400"></span> {language === 'ru' ? 'Коммерция' : 'Tijorat'}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400"></span> {language === 'ru' ? 'Ремонт' : 'Ta\'mir'}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 border border-purple-400"></span> {language === 'ru' ? 'Аренда' : 'Ijara'}</span>
                    <span className="ml-auto text-gray-500">{language === 'ru' ? 'Всего квартир' : 'Jami xonadonlar'}: {apartments.length}</span>
                  </div>

                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-xs text-gray-500 font-medium w-12 sticky left-0 bg-white/80 z-10">
                          {language === 'ru' ? 'Этаж' : 'Qavat'}
                        </th>
                        {sortedEntrances.map(ent => (
                          <th key={ent.id} className="p-2 text-xs font-medium text-gray-700 border-l border-gray-200">
                            <div className="flex items-center justify-center gap-1">
                              <DoorOpen className="w-3 h-3" />
                              {language === 'ru' ? 'Подъезд' : 'Podyezd'} {ent.number}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {floors.map(floor => (
                        <tr key={floor} className="border-t border-gray-100">
                          <td className="p-2 text-sm font-bold text-gray-500 text-center sticky left-0 bg-white/80 z-10">
                            {floor}
                          </td>
                          {sortedEntrances.map(ent => {
                            const aptsOnFloor = (entranceMap.get(ent.id) || [])
                              .filter(a => a.floor === floor)
                              .sort((a, b) => parseInt(a.number) - parseInt(b.number));
                            return (
                              <td key={ent.id} className="p-1 border-l border-gray-100">
                                <div className="flex flex-wrap gap-1 justify-center min-h-[2.5rem] items-center">
                                  {aptsOnFloor.map(apt => (
                                    <button
                                      key={apt.id}
                                      onClick={() => handleApartmentClick(apt)}
                                      className={`relative min-w-[2.5rem] h-9 px-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                        selectedApartment?.id === apt.id
                                          ? 'ring-2 ring-offset-1 ring-blue-500 scale-110 shadow-md'
                                          : 'shadow-sm'
                                      } ${getAptColor(apt)}`}
                                      title={`${language === 'ru' ? 'Кв' : 'Xn'}. ${apt.number}${apt.resident_count ? ` (${apt.resident_count} ${language === 'ru' ? 'жит.' : 'yas.'})` : ''}`}
                                    >
                                      {apt.number}
                                      {(apt.resident_count || 0) > 0 && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Detail Panel */}
          {(selectedApartment || isAddingApartment) && (
            <div className="w-80 flex-shrink-0">
              <div className="glass-card p-5 sticky top-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Home className="w-5 h-5 text-blue-500" />
                    {isAddingApartment
                      ? (language === 'ru' ? 'Новая квартира' : 'Yangi xonadon')
                      : `${language === 'ru' ? 'Кв' : 'Xn'}. ${selectedApartment?.number}`}
                  </h3>
                  <div className="flex items-center gap-1">
                    {!isEditingApartment && !isAddingApartment && selectedApartment && (
                      <button onClick={() => startEditApartment(selectedApartment)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}>
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => { setSelectedApartment(null); cancelEditApartment(); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Edit / Add Form */}
                {(isEditingApartment || isAddingApartment) ? (
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Номер квартиры' : 'Xonadon raqami'} *</label>
                      <input
                        type="text"
                        value={editForm.number}
                        onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                        className="input-field text-sm"
                        placeholder="1, 2, 101..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Этаж' : 'Qavat'}</label>
                        <input
                          type="number"
                          value={editForm.floor}
                          onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}
                          className="input-field text-sm"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Комнат' : 'Xonalar'}</label>
                        <input
                          type="number"
                          value={editForm.rooms}
                          onChange={(e) => setEditForm({ ...editForm, rooms: e.target.value })}
                          className="input-field text-sm"
                          min="1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Площадь (м²)' : 'Maydon (m²)'}</label>
                      <input
                        type="number"
                        value={editForm.total_area}
                        onChange={(e) => setEditForm({ ...editForm, total_area: e.target.value })}
                        className="input-field text-sm"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Подъезд' : 'Podyezd'}</label>
                      <select
                        value={editForm.entrance_id}
                        onChange={(e) => setEditForm({ ...editForm, entrance_id: e.target.value })}
                        className="input-field text-sm"
                      >
                        <option value="">—</option>
                        {entrances.sort((a, b) => a.number - b.number).map(ent => (
                          <option key={ent.id} value={ent.id}>{language === 'ru' ? 'Подъезд' : 'Podyezd'} {ent.number}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'ru' ? 'Статус' : 'Holat'}</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="input-field text-sm"
                      >
                        <option value="occupied">{language === 'ru' ? 'Занята' : 'Band'}</option>
                        <option value="vacant">{language === 'ru' ? 'Свободна' : 'Bo\'sh'}</option>
                        <option value="rented">{language === 'ru' ? 'Аренда' : 'Ijara'}</option>
                        <option value="renovation">{language === 'ru' ? 'Ремонт' : 'Ta\'mir'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.is_commercial}
                          onChange={(e) => setEditForm({ ...editForm, is_commercial: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                        />
                        <span className="text-sm">{language === 'ru' ? 'Коммерческое помещение' : 'Tijorat binosi'}</span>
                      </label>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveApartment}
                        disabled={isSavingApartment}
                        className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                      >
                        {isSavingApartment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                      </button>
                      <button
                        onClick={cancelEditApartment}
                        className="btn-secondary flex-1 text-sm"
                      >
                        {language === 'ru' ? 'Отмена' : 'Bekor'}
                      </button>
                    </div>

                    {/* Delete button (only for existing apartments) */}
                    {!isAddingApartment && selectedApartment && (
                      <button
                        onClick={handleDeleteApartment}
                        className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        {language === 'ru' ? 'Удалить квартиру' : 'Xonadonni o\'chirish'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Read-only view */}
                    <div className="space-y-2 mb-5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{language === 'ru' ? 'Этаж' : 'Qavat'}</span>
                        <span className="font-medium">{selectedApartment?.floor || '—'}</span>
                      </div>
                      {selectedApartment?.total_area && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{language === 'ru' ? 'Площадь' : 'Maydon'}</span>
                          <span className="font-medium">{selectedApartment.total_area} {language === 'ru' ? 'м²' : 'm²'}</span>
                        </div>
                      )}
                      {selectedApartment?.rooms && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{language === 'ru' ? 'Комнат' : 'Xonalar'}</span>
                          <span className="font-medium">{selectedApartment.rooms}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{language === 'ru' ? 'Статус' : 'Holat'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedApartment ? getAptColor(selectedApartment) : ''}`}>
                          {selectedApartment ? getStatusLabel(selectedApartment) : ''}
                        </span>
                      </div>
                      {selectedApartment?.ownership_type && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{language === 'ru' ? 'Тип' : 'Turi'}</span>
                          <span className="font-medium">
                            {selectedApartment.ownership_type === 'private' ? (language === 'ru' ? 'Частная' : 'Xususiy') :
                             selectedApartment.ownership_type === 'municipal' ? (language === 'ru' ? 'Муниципальная' : 'Munitsipal') :
                             selectedApartment.ownership_type === 'commercial' ? (language === 'ru' ? 'Коммерческая' : 'Tijorat') :
                             selectedApartment.ownership_type}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Residents Section */}
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        {language === 'ru' ? 'Жильцы' : 'Yashovchilar'}
                      </h4>
                      {isLoadingResidents ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                        </div>
                      ) : apartmentResidents.length > 0 ? (
                        <div className="space-y-2">
                          {apartmentResidents.map((r, idx) => (
                            <div key={r.id || idx} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{r.name || (language === 'ru' ? 'Без имени' : 'Ismsiz')}</div>
                                {r.phone && (
                                  <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <Phone className="w-3 h-3" />
                                    {r.phone}
                                  </div>
                                )}
                                {r.login && (
                                  <span className="text-xs text-gray-400">Л/С: {r.login}</span>
                                )}
                                {r.type === 'owner' && (
                                  <span className="text-xs text-blue-600">{language === 'ru' ? 'Собственник' : 'Mulkdor'}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-3">
                          {language === 'ru' ? 'Нет зарегистрированных жильцов' : 'Ro\'yxatdan o\'tgan yashovchilar yo\'q'}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
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
