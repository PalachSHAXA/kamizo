import { useState, useEffect, useRef } from 'react';
import {
  Building2, Plus, Search,
  Trash2, Edit, X, ChevronRight,
  Loader2, RefreshCw,
  ArrowLeft, User, Phone, Zap, Home,
  Save, Key, DoorOpen, MapPin, Users,
  Layers, LayoutGrid, Hash,
  Download, Upload, CheckCircle, AlertCircle
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { apiRequest } from '../services/api';
import type { BuildingFull } from '../types';
import { useBackGuard } from '../hooks/useBackGuard';

// Branch type (represents a residential complex — ЖК)
interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  district?: string;
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

type ViewLevel = 'districts' | 'branches' | 'buildings' | 'entrances';

// Color helpers
const STATUS_CONFIG = {
  occupied: { bg: '#E0E5F0', text: '#4B5580', label_ru: 'Занята', label_uz: 'Band' },
  vacant:   { bg: '#D1F0DC', text: '#16A34A', label_ru: 'Свободна', label_uz: "Bo'sh" },
  commercial: { bg: '#FFD6D6', text: '#DC2626', label_ru: 'Коммерция', label_uz: 'Tijorat' },
  rented:   { bg: '#FEF3C7', text: '#D97706', label_ru: 'Аренда', label_uz: 'Ijara' },
  renovation: { bg: '#F3E8FF', text: '#7C3AED', label_ru: 'Ремонт', label_uz: "Ta'mir" },
} as const;

function getAptStatus(apt: Apartment) {
  if (apt.is_commercial) return 'commercial';
  return (apt.status as keyof typeof STATUS_CONFIG) || 'occupied';
}

function getStatusStyle(status: string) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.occupied;
  return { background: cfg.bg, color: cfg.text };
}

function getStatusLabel(status: string, lang: string) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.occupied;
  return lang === 'ru' ? cfg.label_ru : cfg.label_uz;
}

// Building visual for cards — realistic building facade filling the card width
function BuildingVisual({ floors, entrances, color }: { floors: number; entrances: number; color: string }) {
  const displayFloors = Math.min(floors, 10);
  const displayEntrances = Math.min(entrances, 6);
  const windowsPerEntrance = 4;

  const isLit = (f: number, c: number) => {
    const seed = (f * 7 + c * 13) % 10;
    return seed < 6;
  };

  return (
    <div className="h-44 relative overflow-hidden rounded-t-xl" style={{ background: 'linear-gradient(180deg, #94A3B8 0%, #CBD5E1 50%, #E2E8F0 100%)' }}>
      {/* Building body — fills width */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div className="flex gap-[1px]" style={{ background: `${color}20`, padding: '0 2px', borderRadius: '6px 6px 0 0' }}>
          {Array.from({ length: displayEntrances }, (_, e) => (
            <div key={e} className="flex flex-col" style={{ background: color, borderRadius: e === 0 ? '5px 0 0 0' : e === displayEntrances - 1 ? '0 5px 0 0' : '0', padding: '6px 5px 0' }}>
              {/* Roof accent line */}
              <div className="h-[3px] rounded-t-sm mb-1" style={{ background: `${color}88`, marginLeft: -3, marginRight: -3 }} />
              {Array.from({ length: displayFloors }, (_, f) => (
                <div key={f} className="flex gap-[3px] mb-[3px]">
                  {Array.from({ length: windowsPerEntrance }, (_, w) => (
                    <div
                      key={w}
                      className="rounded-[2px]"
                      style={{
                        width: 11, height: 9,
                        background: isLit(f, e * windowsPerEntrance + w)
                          ? 'rgba(255,220,80,.9)'
                          : 'rgba(160,190,220,.25)',
                      }}
                    />
                  ))}
                </div>
              ))}
              {/* Door at bottom */}
              <div className="flex justify-center mt-auto pb-0">
                <div className="rounded-t-sm" style={{ width: 14, height: 10, background: 'rgba(255,255,255,.3)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ground */}
      <div className="absolute bottom-0 left-0 right-0 h-[5px]" style={{ background: `${color}25` }} />
    </div>
  );
}

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
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const { user } = useAuthStore();
  const canManageImportExport = user && ['admin', 'director', 'manager'].includes(user.role);

  // Navigation
  const [viewLevel, setViewLevel] = useState<ViewLevel>('districts');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingFull | null>(null);

  // District modal
  const [showAddDistrictModal, setShowAddDistrictModal] = useState(false);
  const [deleteDistrictConfirm, setDeleteDistrictConfirm] = useState<string | null>(null);
  const [isDeletingDistrict, setIsDeletingDistrict] = useState(false);
  const [cascadeConfirmChecked, setCascadeConfirmChecked] = useState(false);

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingEntrances, setIsLoadingEntrances] = useState(false);

  // Modals
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [showAddEntranceModal, setShowAddEntranceModal] = useState(false);
  const [editingEntrance, setEditingEntrance] = useState<Entrance | null>(null);
  const [entranceEditToast, setEntranceEditToast] = useState('');
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

  // Side panel
  const [panelOpen, setPanelOpen] = useState(false);

  // Apartment editing
  const [isEditingApartment, setIsEditingApartment] = useState(false);
  const [isAddingApartment, setIsAddingApartment] = useState(false);
  const [editForm, setEditForm] = useState({
    number: '', floor: '', rooms: '', total_area: '',
    status: 'occupied', is_commercial: false, entrance_id: '',
  });
  const [isSavingApartment, setIsSavingApartment] = useState(false);

  // Export/Import state
  const [exportingBranchId, setExportingBranchId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; stats?: any; error?: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Load branches on mount
  useEffect(() => { fetchBranches(); }, []);


  useEffect(() => {
    if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
  }, [selectedBranch]);

  useEffect(() => {
    if (selectedBuilding) {
      fetchEntrancesForBuilding(selectedBuilding.id);
      fetchApartmentsForBuilding(selectedBuilding.id);
      setSelectedApartment(null);
      setPanelOpen(false);
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
      const response = await apiRequest<{ entrances: Entrance[] }>(`/api/buildings/${buildingId}/entrances`, { cache: 'no-store' });
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
      const response = await apiRequest<{ apartments: Apartment[] }>(`/api/buildings/${buildingId}/apartments?limit=2000`, { cache: 'no-store' });
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
    setPanelOpen(true);
    setIsEditingApartment(false);
    setIsAddingApartment(false);
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
        ...userResidents.map((u: any) => ({ id: u.id, name: u.name || '', phone: u.phone, login: u.login, password_decrypted: u.password_decrypted, type: 'resident' })),
        ...crmResidents.map((r: any) => ({ id: r.id, name: r.name || r.full_name || '', phone: r.phone, type: 'resident' })),
      ];
      const seen = new Set<string>();
      const unique = combined.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      setApartmentResidents(unique);
    } catch {
      setApartmentResidents([]);
    } finally {
      setIsLoadingResidents(false);
    }
  };

  const handleGenerateApartments = async () => {
    if (!selectedBuilding || entrances.length === 0) return;
    setIsGenerating(true);
    try {
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
      if (aptData.length === 0) { setIsGenerating(false); return; }
      await apiRequest(`/api/buildings/${selectedBuilding.id}/apartments/bulk`, {
        method: 'POST',
        body: JSON.stringify({ apartments: aptData }),
      });
      await fetchApartmentsForBuilding(selectedBuilding.id);
    } catch (error: any) {
      alert(error.message || 'Error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Navigation
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

  const handleDistrictClick = (district: string) => {
    setSelectedDistrict(district);
    setViewLevel('branches');
    setSearchQuery('');
  };

  const handleDeleteDistrict = async (districtName: string) => {
    setIsDeletingDistrict(true);
    try {
      await apiRequest(`/api/districts/cascade?name=${encodeURIComponent(districtName)}`, { method: 'DELETE', cache: 'no-store' });
      setDeleteDistrictConfirm(null);
      setCascadeConfirmChecked(false);
      await fetchBranches();
    } catch (err: any) {
      alert((language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + (err.message || 'Error'));
    } finally {
      setIsDeletingDistrict(false);
    }
  };

  const handleBack = () => {
    closeSidePanel();
    if (viewLevel === 'entrances') {
      setSelectedBuilding(null);
      setViewLevel('buildings');
    } else if (viewLevel === 'buildings') {
      setSelectedBranch(null);
      setViewLevel('branches');
    } else if (viewLevel === 'branches') {
      setSelectedBranch(null);
      setSelectedDistrict(null);
      setViewLevel('districts');
    }
    setSearchQuery('');
  };

  // Intercept browser/hardware back so it follows the logical hierarchy
  // instead of jumping to the previously visited URL
  useBackGuard(viewLevel !== 'districts', handleBack);

  const closeSidePanel = () => {
    setPanelOpen(false);
    setSelectedApartment(null);
    setIsEditingApartment(false);
    setIsAddingApartment(false);
  };

  // CRUD: branches (ЖК)
  const handleAddBranch = async (data: { code: string; name: string; address?: string; phone?: string; district?: string }) => {
    try {
      await apiRequest('/api/branches', { method: 'POST', body: JSON.stringify({ ...data, district: data.district || selectedDistrict || undefined }) });
      fetchBranches();
      setShowAddBranchModal(false);
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  const handleUpdateBranch = async (id: string, data: Partial<Branch>) => {
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      fetchBranches();
      setEditingBranch(null);
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  const handleChangeCode = async (id: string, newCode: string) => {
    try {
      await apiRequest(`/api/branches/${id}/change-code`, { method: 'POST', body: JSON.stringify({ new_code: newCode }) });
      fetchBranches();
    } catch (error: any) {
      alert(error.message || 'Error');
      throw error; // propagate so modal knows it failed
    }
  };

  const handleDeleteBranch = async (id: string) => {
    if (!confirm(t('Удалить этот ЖК?', "Bu TJMni o'chirasizmi?"))) return;
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'DELETE' });
      fetchBranches();
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  // Export branch
  const handleExportBranch = async (branch: Branch, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingBranchId(branch.id);
    try {
      const data = await apiRequest(`/api/branches/${branch.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zhk-${branch.code}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || t('Ошибка экспорта', 'Eksport xatosi'));
    } finally {
      setExportingBranchId(null);
    }
  };

  // Import branch
  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      // If inside a branch — inject current branch context so file doesn't need it
      if (selectedBranch && !data.branch) {
        data.branch = { id: selectedBranch.id, code: selectedBranch.code, name: selectedBranch.name };
      }
      // Also pass branchId as query param for backend to use existing branch
      const url = selectedBranch
        ? `/api/branches/import?branchId=${selectedBranch.id}`
        : '/api/branches/import';
      const result = await apiRequest(url, {
        method: 'POST',
        body: JSON.stringify(data),
      }) as any;
      setImportResult({ success: true, stats: result.stats });
      fetchBranches();
      if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
    } catch (err: any) {
      setImportResult({ success: false, error: err.message || t('Ошибка импорта', 'Import xatosi') });
    } finally {
      setImportLoading(false);
    }
  };

  // CRUD: buildings
  const handleAddBuilding = async (data: any) => {
    await addBuilding({ ...data, branchId: selectedBranch?.id, branchCode: selectedBranch?.code });
    setShowAddBuildingModal(false);
    if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
    fetchBranches();
  };

  const handleUpdateBuilding = async (id: string, data: Partial<BuildingFull>) => {
    await updateBuilding(id, data);
    setEditingBuilding(null);
    if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
  };

  const handleDeleteBuilding = async (id: string) => {
    if (!confirm(t('Удалить это здание?', "Bu binoni o'chirasizmi?"))) return;
    try {
      await deleteBuilding(id);
      if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
      fetchBranches();
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  // CRUD: entrances
  const handleAddEntrance = async (data: { number: number; floors_from?: number; floors_to?: number; apartments_from?: number; apartments_to?: number }) => {
    if (!selectedBuilding) return;
    try {
      await apiRequest(`/api/buildings/${selectedBuilding.id}/entrances`, {
        method: 'POST', body: JSON.stringify(data),
      });
      fetchEntrancesForBuilding(selectedBuilding.id);
      setShowAddEntranceModal(false);
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  // CRUD: update entrance params
  const handleSaveEntrance = async (id: string, data: { floors_from: number; floors_to: number; apartments_from: number; apartments_to: number }) => {
    try {
      const result = await apiRequest<{ entrance: Entrance }>(`/api/entrances/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        cache: 'no-store',
      });
      // Optimistic update: apply new values immediately without waiting for refetch
      if (result.entrance) {
        setEntrances(prev => prev.map(e => e.id === id ? { ...e, ...result.entrance } : e));
      }
      setEditingEntrance(null);
      // Background refetch to sync apartments_count and any other derived fields
      if (selectedBuilding) {
        fetchEntrancesForBuilding(selectedBuilding.id);
        fetchApartmentsForBuilding(selectedBuilding.id);
      }
      const msg = language === 'ru' ? 'Данные подъезда успешно обновлены' : 'Podyezd ma\'lumotlari muvaffaqiyatli yangilandi';
      setEntranceEditToast(msg);
      setTimeout(() => setEntranceEditToast(''), 3000);
    } catch (err: any) {
      alert((language === 'ru' ? 'Ошибка сохранения: ' : 'Saqlash xatoligi: ') + (err.message || 'Error'));
    }
  };

  // Apartment editing
  const startEditApartment = (apt: Apartment) => {
    setIsEditingApartment(true);
    setIsAddingApartment(false);
    setEditForm({
      number: apt.number || '', floor: String(apt.floor || ''),
      rooms: String(apt.rooms || ''), total_area: String(apt.total_area || ''),
      status: apt.status || 'occupied', is_commercial: !!apt.is_commercial,
      entrance_id: apt.entrance_id || '',
    });
  };

  const startAddApartment = () => {
    setSelectedApartment(null);
    setIsAddingApartment(true);
    setIsEditingApartment(false);
    setPanelOpen(true);
    setEditForm({
      number: '', floor: '1', rooms: '', total_area: '',
      status: 'occupied', is_commercial: false,
      entrance_id: entrances.length > 0 ? entrances[0].id : '',
    });
  };

  const cancelEdit = () => { setIsEditingApartment(false); setIsAddingApartment(false); };

  const handleSaveApartment = async () => {
    if (!editForm.number.trim()) return;
    setIsSavingApartment(true);
    try {
      if (isAddingApartment && selectedBuilding) {
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
      alert(error.message || 'Error');
    } finally {
      setIsSavingApartment(false);
    }
  };

  const handleDeleteApartment = async () => {
    if (!selectedApartment) return;
    if (!confirm(t('Удалить эту квартиру?', "Bu xonadonni o'chirasizmi?"))) return;
    try {
      await apiRequest(`/api/apartments/${selectedApartment.id}`, { method: 'DELETE' });
      setApartments(prev => prev.filter(a => a.id !== selectedApartment.id));
      closeSidePanel();
    } catch (error: any) {
      alert(error.message || 'Error');
    }
  };

  // Filters
  const filteredBuildings = selectedBranch
    ? buildings.filter(b => b.branchCode === selectedBranch.code)
    : buildings;
  const searchedBuildings = filteredBuildings.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );
  // Branches filtered by selected district
  const districtBranches = selectedDistrict
    ? branches.filter(b => (b.district || '') === selectedDistrict)
    : branches;
  const searchedBranches = districtBranches.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.code.toLowerCase().includes(searchQuery.toLowerCase())
  );
  // Unique districts derived from branches
  const allDistricts = [...new Set(branches.map(b => b.district || '').filter(Boolean))].sort();
  const noBranchDistrict = branches.some(b => !b.district);

  // Building colors (deterministic from name)
  const getBuildingColor = (name: string) => {
    const colors = ['#1A5C30', '#1A2A6C', '#3D1A7A', '#6B3A1A', '#1A4F4F', '#4F1A1A', '#1A6B3A', '#1A1A4F'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // Loading
  if ((isLoadingBranches && branches.length === 0 && viewLevel === 'districts') || (isLoadingBuildings && buildings.length === 0 && viewLevel === 'buildings')) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Apartment grid data
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

  // Stats
  const statusCounts = { occupied: 0, vacant: 0, commercial: 0, rented: 0, renovation: 0 };
  apartments.forEach(apt => {
    const s = getAptStatus(apt);
    if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++;
  });

  return (
    <div className="flex flex-col h-full -m-3 sm:-m-4 md:-m-6 pb-24 md:pb-0" style={{ fontFamily: "'Onest', sans-serif" }}>
      {/* TOPBAR */}
      <div className="h-[52px] bg-white border-b border-gray-200 flex items-center px-5 gap-3 flex-shrink-0">
        {viewLevel !== 'districts' && (
          <button
            onClick={handleBack}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[13px] text-gray-400">
          <button
            onClick={() => { setViewLevel('districts'); setSelectedDistrict(null); setSelectedBranch(null); setSelectedBuilding(null); closeSidePanel(); }}
            className={`hover:text-orange-500 transition-colors ${viewLevel === 'districts' ? 'text-gray-900 font-bold' : ''}`}
          >
            {t('Районы', 'Tumanlar')}
          </button>
          {selectedDistrict && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <button
                onClick={() => { setViewLevel('branches'); setSelectedBranch(null); setSelectedBuilding(null); closeSidePanel(); }}
                className={`hover:text-orange-500 transition-colors ${viewLevel === 'branches' ? 'text-gray-900 font-bold' : ''}`}
              >
                {selectedDistrict}
              </button>
            </>
          )}
          {selectedBranch && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <button
                onClick={() => { setViewLevel('buildings'); setSelectedBuilding(null); closeSidePanel(); }}
                className={`hover:text-orange-500 transition-colors ${viewLevel === 'buildings' ? 'text-gray-900 font-bold' : ''}`}
              >
                {selectedBranch.name}
              </button>
            </>
          )}
          {selectedBuilding && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <span className="text-gray-900 font-bold">{selectedBuilding.name}</span>
            </>
          )}
        </div>

        {/* Right buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              if (viewLevel === 'districts' || viewLevel === 'branches') fetchBranches();
              else if (viewLevel === 'buildings' && selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
              else if (viewLevel === 'entrances' && selectedBuilding) { fetchEntrancesForBuilding(selectedBuilding.id); fetchApartmentsForBuilding(selectedBuilding.id); }
            }}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {viewLevel === 'entrances' && apartments.length === 0 && entrances.length > 0 && (
            <button
              onClick={handleGenerateApartments}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {t('Сгенерировать', 'Yaratish')}
            </button>
          )}

          {viewLevel === 'entrances' && apartments.length > 0 && (
            <button
              onClick={startAddApartment}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-orange-400 hover:text-orange-500 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('Добавить кв.', "Xonadon qo'shish")}
            </button>
          )}

          {canManageImportExport && (viewLevel === 'districts' || viewLevel === 'branches' || viewLevel === 'buildings') && (
            <>
              {viewLevel === 'buildings' && selectedBranch && (
                <button
                  onClick={(e) => handleExportBranch(selectedBranch, e)}
                  disabled={exportingBranchId === selectedBranch.id}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-green-400 hover:text-green-600 transition-all disabled:opacity-50"
                >
                  {exportingBranchId === selectedBranch.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                  {t('Экспорт', 'Eksport')}
                </button>
              )}
              <button
                onClick={() => { setImportFile(null); setImportResult(null); setShowImportModal(true); }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-bold flex items-center gap-1.5 hover:border-blue-400 hover:text-blue-500 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('Импорт', 'Import')}
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (viewLevel === 'districts') setShowAddDistrictModal(true);
              else if (viewLevel === 'branches') setShowAddBranchModal(true);
              else if (viewLevel === 'buildings') setShowAddBuildingModal(true);
              else if (viewLevel === 'entrances') setShowAddEntranceModal(true);
            }}
            className="px-3.5 py-1.5 rounded-lg bg-orange-500 text-white text-[13px] font-bold flex items-center gap-1.5 hover:bg-orange-600 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {viewLevel === 'districts' && t('Район', 'Tuman')}
            {viewLevel === 'branches' && t('ЖК', 'TJM')}
            {viewLevel === 'buildings' && t('Здание', 'Bino')}
            {viewLevel === 'entrances' && t('Подъезд', 'Podyezd')}
          </button>
        </div>
      </div>

      {/* LEGEND BAR (only on grid) */}
      {viewLevel === 'entrances' && apartments.length > 0 && (
        <div className="h-10 bg-white border-b border-gray-200 flex items-center px-5 gap-5 flex-shrink-0">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 text-[12px] text-gray-400">
              <div className="w-3 h-3 rounded-[3px]" style={{ background: cfg.bg }} />
              {language === 'ru' ? cfg.label_ru : cfg.label_uz}
              <span className="font-bold text-gray-900">{statusCounts[key as keyof typeof statusCounts] || 0}</span>
            </div>
          ))}
          <div className="ml-auto text-[12px] text-gray-400">
            {t('Всего квартир', 'Jami xonadonlar')}: <span className="font-bold text-gray-900">{apartments.length}</span>
          </div>
        </div>
      )}

      {/* LAYOUT */}
      <div className="flex flex-1 overflow-hidden">

        {/* DISTRICTS SCREEN */}
        {viewLevel === 'districts' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 overflow-y-auto">
            {branches.length > 0 ? (
              <>
                <div className="text-center">
                  <h1 className="text-[28px] font-black tracking-tight">{t('Выберите район', 'Tumanni tanlang')}</h1>
                  <p className="text-[14px] text-gray-400 mt-2">{t('Нажмите на район чтобы перейти к ЖК', "TJMlarga o'tish uchun tumanni bosing")}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
                  {allDistricts.map(district => {
                    const dBranches = branches.filter(b => b.district === district);
                    const totalBuildings = dBranches.reduce((s, b) => s + (b.buildings_count || 0), 0);
                    const totalResidents = dBranches.reduce((s, b) => s + (b.residents_count || 0), 0);
                    return (
                      <div key={district}
                        className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg overflow-hidden relative group/district"
                        onClick={() => handleDistrictClick(district)}>
                        <div className="h-20 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A4F4F 0%, #1A6B3A 100%)' }}>
                          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                            {[4,7,5,9,6,8,3,7,5,10,4,6,8,5,7].map((h, i) => (
                              <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3, background: 'rgba(255,255,255,.12)' }} />
                            ))}
                          </div>
                          <div className="absolute top-3 left-4 flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-white/80" />
                            <span className="text-white font-extrabold text-[15px] tracking-tight">{district}</span>
                          </div>
                          {user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteDistrictConfirm(district); }}
                              className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/20 hover:bg-red-500/80 flex items-center justify-center opacity-0 group-hover/district:opacity-100 transition-all"
                              title={language === 'ru' ? 'Удалить район' : 'Tumanni o\'chirish'}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-white" />
                            </button>
                          )}
                        </div>
                        <div className="p-4 flex flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Home className="w-4 h-4 text-blue-600" /></div>
                            <div><div className="text-[18px] font-extrabold text-blue-600 leading-tight">{dBranches.length}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('ЖК', 'TJM')}</div></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-green-600" /></div>
                            <div><div className="text-[18px] font-extrabold text-green-600 leading-tight">{totalBuildings}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Зданий', 'Binolar')}</div></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center"><Users className="w-4 h-4 text-orange-500" /></div>
                            <div><div className="text-[18px] font-extrabold text-orange-500 leading-tight">{totalResidents}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Жителей', 'Yashovchilar')}</div></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {noBranchDistrict && (
                    <div onClick={() => handleDistrictClick('')}
                      className="bg-white rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer transition-all hover:border-orange-300 hover:-translate-y-1 hover:shadow-lg">
                      <div className="p-5 text-center">
                        <p className="text-[14px] font-semibold text-gray-400">{t('Без района', 'Tumansiz ЖК')}</p>
                        <p className="text-[12px] text-gray-300 mt-1">{branches.filter(b => !b.district).length} {t('ЖК', 'TJM')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center">
                <MapPin className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <h2 className="text-[20px] font-bold text-gray-700 mb-2">{t('Нет районов', "Tumanlar yo'q")}</h2>
                <p className="text-gray-400 mb-6">{t('Добавьте первый район чтобы начать работу', "Boshlash uchun birinchi tumanni qo'shing")}</p>
                <button onClick={() => setShowAddDistrictModal(true)}
                  className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center gap-2 mx-auto hover:bg-orange-600 transition-all">
                  <Plus className="w-4 h-4" />
                  {t('Добавить район', "Tuman qo'shish")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ЖК SCREEN */}
        {viewLevel === 'branches' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 overflow-y-auto">
            {searchedBranches.length > 0 ? (
              <>
                <div className="text-center">
                  <h1 className="text-[28px] font-black tracking-tight">
                    {selectedDistrict ? selectedDistrict : t('Жилые комплексы', 'Turar-joy majmualari')}
                  </h1>
                  <p className="text-[14px] text-gray-400 mt-2">{t('Нажмите на ЖК чтобы перейти к зданиям', "Binolarga o'tish uchun TJMni bosing")}</p>
                </div>
                <div className="w-full max-w-[700px]">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl">
                    <Search className="w-4 h-4 text-gray-300" />
                    <input type="text" placeholder={t('Поиск по ЖК...', "TJM bo'yicha qidirish...")}
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[13px]" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
                  {searchedBranches.map(branch => (
                    <div key={branch.id} onClick={() => handleBranchClick(branch)}
                      className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg group overflow-hidden">
                      <div className="h-28 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A2A6C 0%, #2D4A8C 50%, #3D5A9C 100%)' }}>
                        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                          {[5,8,6,10,7,9,4,8,6,11,5,7,9,6,8,5,10,7].map((h, i) => (
                            <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3.5, background: 'rgba(255,255,255,.1)' }} />
                          ))}
                        </div>
                        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          {canManageImportExport && (
                            <button onClick={(e) => handleExportBranch(branch, e)} disabled={exportingBranchId === branch.id}
                              title={t('Экспортировать ЖК', 'TJMni eksport qilish')}
                              className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-green-500/60 disabled:opacity-50">
                              {exportingBranchId === branch.id ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Download className="w-4 h-4 text-white" />}
                            </button>
                          )}
                          <button onClick={() => setEditingBranch(branch)} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-white/40">
                            <Edit className="w-4 h-4 text-white" />
                          </button>
                          <button onClick={() => handleDeleteBranch(branch.id)} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur hover:bg-red-400/60">
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Home className="w-4 h-4 text-orange-400 flex-shrink-0" />
                          <div className="text-[17px] font-extrabold truncate">{branch.name}</div>
                        </div>
                        <div className="text-[13px] text-gray-400 mb-4 ml-[24px]">
                          {branch.address || (branch.district || t('Ташкент', 'Toshkent'))}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Building2 className="w-4 h-4 text-green-600" /></div>
                            <div><div className="text-[20px] font-extrabold text-green-600 leading-tight">{branch.buildings_count}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Зданий', 'Binolar')}</div></div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Users className="w-4 h-4 text-orange-500" /></div>
                            <div><div className="text-[20px] font-extrabold text-orange-500 leading-tight">{branch.residents_count}</div><div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('Жителей', 'Yashovchilar')}</div></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <Home className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <h2 className="text-[20px] font-bold text-gray-700 mb-2">{t('Нет жилых комплексов', "Turar-joy majmualari yo'q")}</h2>
                <p className="text-gray-400 mb-6">
                  {selectedDistrict
                    ? t(`В районе "${selectedDistrict}" нет ЖК`, `"${selectedDistrict}" tumanida TJM yo'q`)
                    : t('Добавьте первый ЖК', "Birinchi TJMni qo'shing")}
                </p>
                <button onClick={() => setShowAddBranchModal(true)}
                  className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center gap-2 mx-auto hover:bg-orange-600 transition-all">
                  <Plus className="w-4 h-4" />
                  {t('Добавить ЖК', "TJM qo'shish")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* BUILDINGS SCREEN */}
        {viewLevel === 'buildings' && (
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl mb-5 max-w-md focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
              <Search className="w-4 h-4 text-gray-300" />
              <input
                type="text"
                placeholder={t('Поиск по домам...', "Uylar bo'yicha qidirish...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[13px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchedBuildings.map(building => {
                const color = getBuildingColor(building.name);
                const occupied = Math.min(building.residentsCount || 0, building.totalApartments);
                const vacant = Math.max(0, building.totalApartments - occupied);
                const occupancyPct = building.totalApartments > 0 ? Math.min(100, Math.round((occupied / building.totalApartments) * 100)) : 0;
                return (
                  <div
                    key={building.id}
                    onClick={() => handleBuildingClick(building)}
                    className="bg-white rounded-2xl border border-gray-200 cursor-pointer transition-all hover:border-orange-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden group"
                  >
                    <BuildingVisual floors={building.floors || 9} entrances={building.entrances || 4} color={color} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[18px] font-extrabold mb-1.5 truncate">{building.name}</div>
                          <div className="flex items-center gap-2 text-[13px] text-gray-400 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Layers className="w-4 h-4" />
                              {building.floors} {t('эт.', 'qav.')}
                            </span>
                            <span className="text-gray-300">·</span>
                            <span className="flex items-center gap-1">
                              <DoorOpen className="w-4 h-4" />
                              {building.entrances} {t('подъ.', 'pod.')}
                            </span>
                            <span className="text-gray-300">·</span>
                            <span className="flex items-center gap-1">
                              <LayoutGrid className="w-4 h-4" />
                              {building.totalApartments} {t('кв.', 'xn.')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditingBuilding(building)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                            <Edit className="w-4 h-4 text-gray-400" />
                          </button>
                          <button onClick={() => handleDeleteBuilding(building.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>

                      {/* Occupancy bar */}
                      <div className="mt-3 mb-3">
                        <div className="flex justify-between text-[12px] mb-1.5">
                          <span className="text-gray-400">{t('Заселённость', 'Bandlik')}</span>
                          <span className="font-bold text-gray-600">{occupancyPct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${occupancyPct}%`,
                            background: occupancyPct > 80 ? '#16A34A' : occupancyPct > 50 ? '#F59E0B' : '#EF4444',
                          }} />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <span className="text-[13px] font-bold px-3 py-1 rounded-full" style={{ ...getStatusStyle('vacant') }}>
                          {vacant} {t('св.', "bo'sh")}
                        </span>
                        <span className="text-[13px] font-bold px-3 py-1 rounded-full" style={{ ...getStatusStyle('occupied') }}>
                          {occupied} {t('зан.', 'band')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {searchedBuildings.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-medium">{t('Дома не найдены', 'Uylar topilmadi')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* GRID SCREEN */}
        {viewLevel === 'entrances' && (
          <div className="flex-1 overflow-auto p-5">
            {(isLoadingEntrances || isLoadingApartments) ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : entrances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <DoorOpen className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-gray-600 font-bold">{t('Подъезды не добавлены', "Podyezdlar qo'shilmagan")}</p>
                <p className="text-gray-400 text-sm mt-1">{t('Сначала добавьте подъезды', "Avval podyezdlarni qo'shing")}</p>
              </div>
            ) : apartments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                {/* Entrance chips — clickable for management roles */}
                {user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) && (
                  <div className="mb-6">
                    <p className="text-xs text-gray-400 mb-3">{t('Нажмите на подъезд для редактирования параметров', 'Parametrlarni tahrirlash uchun podyezdni bosing')}</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {entrances.map(ent => (
                        <button
                          key={ent.id}
                          onClick={() => setEditingEntrance(ent)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-gray-600 to-gray-800 text-white shadow-md hover:from-orange-500 hover:to-orange-700 transition-all"
                        >
                          <DoorOpen className="w-4 h-4 opacity-80" />
                          <span className="text-[13px] font-bold">{t('Подъезд', 'Podyezd')} {ent.number}</span>
                          <span className="text-[11px] opacity-60 ml-1">{ent.apartments_from}–{ent.apartments_to}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Home className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-gray-600 font-bold">{t('Квартиры не добавлены', "Xonadonlar qo'shilmagan")}</p>
                <p className="text-gray-400 text-sm mt-1 mb-4">{t('Сгенерируйте квартиры из подъездов', 'Podyezdlardan xonadonlarni yarating')}</p>
                <button
                  onClick={handleGenerateApartments}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {t('Сгенерировать квартиры', 'Xonadonlarni yaratish')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full h-full overflow-auto py-4">
                {/* Each entrance as a separate building */}
                <div className="flex gap-6 items-end flex-wrap justify-center">
                  {sortedEntrances.map(ent => {
                    const aptsInEnt = entranceMap.get(ent.id) || [];
                    const resCount = aptsInEnt.reduce((sum, a) => sum + (a.resident_count || 0), 0);
                    const maxAptsPerFloor = Math.max(...floors.map(f => aptsInEnt.filter(a => a.floor === f).length), 1);
                    const buildingColor = getBuildingColor(`${selectedBuilding?.name || ''}-${ent.number}`);

                    return (
                      <div key={ent.id} className="flex flex-col items-center">
                        {/* Entrance info */}
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-gray-600 to-gray-800 text-white shadow-md ${user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) ? 'cursor-pointer hover:from-orange-500 hover:to-orange-700 transition-all' : ''}`}
                            onClick={() => { if (user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role)) setEditingEntrance(ent); }}
                            title={user && ['admin', 'director', 'manager', 'super_admin'].includes(user.role) ? (language === 'ru' ? 'Редактировать параметры подъезда' : 'Podyezd parametrlarini tahrirlash') : undefined}
                          >
                            <DoorOpen className="w-4 h-4 opacity-80" />
                            <span className="text-[13px] font-bold">{t('Подъезд', 'Podyezd')} {ent.number}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Home className="w-3 h-3" />{aptsInEnt.length}
                            {resCount > 0 && <><span className="mx-0.5">·</span><Users className="w-3 h-3 text-green-600" /><span className="font-bold text-green-600">{resCount}</span></>}
                          </div>
                        </div>

                        {/* Building body — the wall wrapping the apartments */}
                        <div className="relative" style={{ borderRadius: '8px 8px 0 0', overflow: 'hidden' }}>
                          {/* Roof */}
                          <div className="h-3 rounded-t-lg" style={{ background: buildingColor, marginLeft: -4, marginRight: -4, position: 'relative', zIndex: 2 }}>
                            <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: `${buildingColor}88` }} />
                          </div>

                          {/* Wall with apartments as windows */}
                          <div className="relative" style={{ background: buildingColor, padding: '6px 10px 8px', marginLeft: -4, marginRight: -4 }}>
                            {floors.map((floor) => {
                              const aptsOnFloor = aptsInEnt
                                .filter(a => a.floor === floor)
                                .sort((a, b) => parseInt(a.number) - parseInt(b.number));

                              return (
                                <div key={floor} className="flex items-center mb-[4px]">
                                  {/* Floor number on the wall */}
                                  <div className="w-8 flex-shrink-0 text-right pr-2">
                                    <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,.5)' }}>
                                      {floor}
                                    </span>
                                  </div>

                                  <div className="flex gap-[5px]" style={{ minWidth: maxAptsPerFloor * 66, minHeight: 46 }}>
                                    {aptsOnFloor.length > 0 ? aptsOnFloor.map(apt => {
                                      const status = getAptStatus(apt);
                                      const isSelected = selectedApartment?.id === apt.id;
                                      const style = getStatusStyle(status);
                                      const hasResidents = (apt.resident_count || 0) > 0;
                                      return (
                                        <button
                                          key={apt.id}
                                          onClick={() => handleApartmentClick(apt)}
                                          title={`${t('Кв', 'Xn')}. ${apt.number} — ${getStatusLabel(status, language)}${hasResidents ? ` (${apt.resident_count} ${t('чел.', 'kishi')})` : ''}`}
                                          className="relative flex items-center justify-center rounded-lg text-[13px] font-bold transition-all hover:scale-105 hover:shadow-lg hover:z-10"
                                          style={{
                                            width: 60, height: 42,
                                            background: isSelected ? '#FF6B35' : style.background,
                                            color: isSelected ? '#fff' : style.color,
                                            border: isSelected ? '2px solid #FF6B35' : '1px solid rgba(255,255,255,.15)',
                                            boxShadow: isSelected
                                              ? '0 0 0 3px rgba(255,107,53,.3), 0 4px 12px rgba(255,107,53,.4)'
                                              : 'inset 0 1px 2px rgba(0,0,0,.06)',
                                            ...(isSelected ? { transform: 'scale(1.1)', zIndex: 20 } : {}),
                                          }}
                                        >
                                          {apt.number}
                                          {hasResidents && !isSelected && (
                                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-green-500 border-2 border-white text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                                              {apt.resident_count}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    }) : (
                                      /* Empty floor — show dim window placeholders */
                                      Array.from({ length: maxAptsPerFloor }, (_, i) => (
                                        <div key={i} className="rounded-md" style={{ width: 60, height: 42, background: 'rgba(255,255,255,.08)', border: '1px dashed rgba(255,255,255,.12)' }} />
                                      ))
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Door at bottom */}
                            <div className="flex justify-center mt-1">
                              <div className="rounded-t-lg" style={{ width: 28, height: 18, background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.15)' }} />
                            </div>
                          </div>
                        </div>

                        {/* Ground */}
                        <div className="h-2 rounded-b-sm" style={{ width: 'calc(100% + 8px)', background: '#94A3B8' }} />
                      </div>
                    );
                  })}
                </div>

                {/* Quick help hint */}
                <div className="mt-4 flex items-center gap-2 text-[12px] text-gray-400">
                  <Hash className="w-3.5 h-3.5" />
                  {t('Нажмите на квартиру для просмотра · Зелёный бейдж = кол-во жителей', 'Xonadonni bosing · Yashil belgi = yashovchilar soni')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SIDE PANEL */}
        <div
          className="flex-shrink-0 bg-white border-l border-gray-200 overflow-hidden transition-all duration-300"
          style={{ width: panelOpen ? 360 : 0 }}
        >
          <div className="w-[360px] overflow-y-auto h-full">
            {/* Panel Header */}
            <div className="p-5 pb-3.5 border-b border-gray-200 flex items-start justify-between">
              <div>
                <div className="text-[24px] font-black tracking-tight">
                  {isAddingApartment ? t('Новая кв.', 'Yangi xn.') : `${t('Кв', 'Xn')}. ${selectedApartment?.number || ''}`}
                </div>
                {selectedApartment && !isAddingApartment && (
                  <div className="text-[12px] text-gray-400 mt-0.5">
                    {t('Этаж', 'Qavat')} {selectedApartment.floor}
                    {selectedApartment.rooms && ` · ${selectedApartment.rooms} ${t('ком.', 'xona')}`}
                    {selectedApartment.total_area && ` · ${selectedApartment.total_area} м²`}
                  </div>
                )}
              </div>
              <button
                onClick={closeSidePanel}
                className="w-[30px] h-[30px] rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status pill */}
            {selectedApartment && !isEditingApartment && !isAddingApartment && (
              <div className="px-5 pt-3.5">
                <span
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold"
                  style={getStatusStyle(getAptStatus(selectedApartment))}
                >
                  ● {getStatusLabel(getAptStatus(selectedApartment), language)}
                </span>
              </div>
            )}

            {/* Edit / Add form */}
            {(isEditingApartment || isAddingApartment) ? (
              <div className="p-5 space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер квартиры', 'Xonadon raqami')} *</label>
                  <input type="text" value={editForm.number} onChange={e => setEditForm({ ...editForm, number: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" placeholder="1, 2, 101..." />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж', 'Qavat')}</label>
                    <input type="number" value={editForm.floor} onChange={e => setEditForm({ ...editForm, floor: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" min="1" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Комнат', 'Xonalar')}</label>
                    <input type="number" value={editForm.rooms} onChange={e => setEditForm({ ...editForm, rooms: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" min="1" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Площадь (м²)', 'Maydon (m²)')}</label>
                  <input type="number" value={editForm.total_area} onChange={e => setEditForm({ ...editForm, total_area: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all" step="0.1" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Подъезд', 'Podyezd')}</label>
                  <select value={editForm.entrance_id} onChange={e => setEditForm({ ...editForm, entrance_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all">
                    <option value="">—</option>
                    {entrances.sort((a, b) => a.number - b.number).map(ent => (
                      <option key={ent.id} value={ent.id}>{t('Подъезд', 'Podyezd')} {ent.number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Статус', 'Holat')}</label>
                  <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none transition-all">
                    <option value="occupied">{t('Занята', 'Band')}</option>
                    <option value="vacant">{t('Свободна', "Bo'sh")}</option>
                    <option value="rented">{t('Аренда', 'Ijara')}</option>
                    <option value="renovation">{t('Ремонт', "Ta'mir")}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
                  <input type="checkbox" checked={editForm.is_commercial} onChange={e => setEditForm({ ...editForm, is_commercial: e.target.checked })}
                    className="w-4 h-4 rounded accent-orange-500" />
                  {t('Коммерческое помещение', 'Tijorat binosi')}
                </label>

                <div className="h-px bg-gray-200 my-1" />

                <button onClick={handleSaveApartment} disabled={isSavingApartment}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50">
                  {isSavingApartment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('Сохранить', 'Saqlash')}
                </button>
                <button onClick={cancelEdit} className="w-full py-3 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-500 hover:bg-gray-50 transition-all">
                  {t('Отмена', 'Bekor')}
                </button>
                {!isAddingApartment && selectedApartment && (
                  <button onClick={handleDeleteApartment}
                    className="w-full py-3 rounded-xl border border-red-200 text-[14px] font-bold text-red-600 flex items-center justify-center gap-2 hover:bg-red-50 transition-all">
                    <Trash2 className="w-4 h-4" /> {t('Удалить квартиру', "Xonadonni o'chirish")}
                  </button>
                )}
              </div>
            ) : selectedApartment && (
              <>
                {/* Read-only info */}
                <div className="p-5 space-y-3">
                  <div className="flex justify-between text-[14px]">
                    <span className="text-gray-400">{t('Этаж', 'Qavat')}</span>
                    <span className="font-semibold">{selectedApartment.floor || '—'}</span>
                  </div>
                  {selectedApartment.total_area && (
                    <div className="flex justify-between text-[14px]">
                      <span className="text-gray-400">{t('Площадь', 'Maydon')}</span>
                      <span className="font-semibold">{selectedApartment.total_area} м²</span>
                    </div>
                  )}
                  {selectedApartment.rooms && (
                    <div className="flex justify-between text-[14px]">
                      <span className="text-gray-400">{t('Комнат', 'Xonalar')}</span>
                      <span className="font-semibold">{selectedApartment.rooms}</span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-200 mx-5" />

                {/* Residents */}
                <div className="p-5">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> {t('Жильцы', 'Yashovchilar')}
                  </h4>
                  {isLoadingResidents ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                    </div>
                  ) : apartmentResidents.length > 0 ? (
                    <div className="space-y-2.5">
                      {apartmentResidents.map((r, idx) => (
                        <div key={r.id || idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-3 mb-1.5">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0">
                              {(r.name || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-[13px] truncate">{r.name || t('Без имени', 'Ismsiz')}</div>
                              {r.type === 'owner' && <span className="text-[10px] text-orange-600 font-bold">{t('Собственник', 'Mulkdor')}</span>}
                            </div>
                          </div>
                          <div className="space-y-1 pl-0.5">
                            {r.phone && (
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <Phone className="w-3 h-3 text-gray-300" /> {r.phone}
                              </div>
                            )}
                            {r.login && (
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <Key className="w-3 h-3 text-gray-300" /> <span className="font-mono">{t('Логин', 'Login')}: {r.login}</span>
                              </div>
                            )}
                            {r.password_decrypted && (
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <Key className="w-3 h-3 text-gray-300" /> <span className="font-mono">{t('Пароль', 'Parol')}: {r.password_decrypted}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-gray-300 text-center py-3">{t('Нет зарегистрированных', "Ro'yxatdan o'tganlar yo'q")}</p>
                  )}
                </div>

                <div className="h-px bg-gray-200 mx-5" />

                {/* Actions */}
                <div className="p-5 space-y-2">
                  <button onClick={() => startEditApartment(selectedApartment)}
                    className="w-full py-3 rounded-xl bg-orange-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-all">
                    <Edit className="w-4 h-4" /> {t('Редактировать', 'Tahrirlash')}
                  </button>
                  <button onClick={handleDeleteApartment}
                    className="w-full py-3 rounded-xl border border-red-200 text-[14px] font-bold text-red-600 flex items-center justify-center gap-2 hover:bg-red-50 transition-all">
                    <Trash2 className="w-4 h-4" /> {t('Удалить', "O'chirish")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showAddDistrictModal && (
        <DistrictModal
          onClose={() => setShowAddDistrictModal(false)}
          onSave={(districtName) => {
            setShowAddDistrictModal(false);
            setSelectedDistrict(districtName);
            setViewLevel('branches');
          }}
          language={language}
        />
      )}

      {/* Delete district confirm */}
      {deleteDistrictConfirm && (() => {
        const dBranches = branches.filter(b => b.district === deleteDistrictConfirm);
        const totalBuildings = dBranches.reduce((s, b) => s + (b.buildings_count || 0), 0);
        const totalResidents = dBranches.reduce((s, b) => s + (b.residents_count || 0), 0);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4 bg-red-100">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-center mb-2">
                {language === 'ru' ? `Удалить район «${deleteDistrictConfirm}»?` : `«${deleteDistrictConfirm}» tumani o'chirilsinmi?`}
              </h3>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-center text-red-700 bg-red-50 rounded-xl p-3">
                  {language === 'ru'
                    ? `Будут безвозвратно удалены: ${dBranches.length} ЖК, ${totalBuildings} зд., ${totalResidents} жит. и все связанные данные.`
                    : `Butunlay o'chiriladi: ${dBranches.length} TJM, ${totalBuildings} bino, ${totalResidents} yashovchi va barcha bog'liq ma'lumotlar.`
                  }
                </p>
              </div>
              <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cascadeConfirmChecked}
                  onChange={e => setCascadeConfirmChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-red-500 shrink-0"
                />
                <span className="text-sm text-gray-700">
                  {language === 'ru'
                    ? 'Я понимаю, что все данные будут удалены без возможности восстановления'
                    : 'Barcha ma\'lumotlar tiklab bo\'lmas tarzda o\'chirilishini tushunaman'}
                </span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => { setDeleteDistrictConfirm(null); setCascadeConfirmChecked(false); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor'}
                </button>
                <button
                  onClick={() => handleDeleteDistrict(deleteDistrictConfirm)}
                  disabled={isDeletingDistrict || !cascadeConfirmChecked}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeletingDistrict && <Loader2 className="w-4 h-4 animate-spin" />}
                  {language === 'ru' ? 'Удалить всё' : 'Hammasini o\'chirish'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {showAddBranchModal && (
        <BranchModal branch={null} onClose={() => setShowAddBranchModal(false)} onSave={handleAddBranch} language={language} defaultDistrict={selectedDistrict || ''} />
      )}
      {editingBranch && (
        <BranchModal branch={editingBranch} onClose={() => setEditingBranch(null)} onSave={(data) => handleUpdateBranch(editingBranch.id, data)} language={language}
          canEditCode={!!(user && ['admin', 'director', 'super_admin'].includes(user.role))}
          onChangeCode={(newCode) => handleChangeCode(editingBranch.id, newCode)} />
      )}
      {showAddBuildingModal && (
        <BuildingModal building={null} onClose={() => setShowAddBuildingModal(false)} onSave={handleAddBuilding} language={language} />
      )}
      {editingBuilding && (
        <BuildingModal building={editingBuilding} onClose={() => setEditingBuilding(null)} onSave={(data) => handleUpdateBuilding(editingBuilding.id, data)} language={language} />
      )}
      {showAddEntranceModal && (
        <EntranceModal onClose={() => setShowAddEntranceModal(false)} onSave={handleAddEntrance} existingEntrances={entrances} language={language} />
      )}
      {editingEntrance && (
        <EntranceEditModal
          entrance={editingEntrance}
          existingApartmentCount={apartments.filter(a => a.entrance_id === editingEntrance.id).length}
          onClose={() => setEditingEntrance(null)}
          onSave={(data) => handleSaveEntrance(editingEntrance.id, data)}
          language={language}
        />
      )}

      {/* Entrance edit toast */}
      {entranceEditToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {entranceEditToast}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/60">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[18px] font-extrabold">{t('Импорт ЖК', 'TJMni import qilish')}</h3>
                <p className="text-[13px] text-gray-400 mt-0.5">{t('Загрузите .json файл экспорта', 'Eksport .json faylini yuklang')}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File Drop Zone */}
            <div
              onClick={() => importFileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all"
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              {importFile ? (
                <div>
                  <p className="text-[14px] font-bold text-gray-700">{importFile.name}</p>
                  <p className="text-[12px] text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-[14px] font-bold text-gray-600">{t('Выберите файл', 'Faylni tanlang')}</p>
                  <p className="text-[12px] text-gray-400 mt-1">{t('Поддерживается .json формат', '.json format qo\'llab-quvvatlanadi')}</p>
                </div>
              )}
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setImportFile(f); setImportResult(null); }
                }}
              />
            </div>

            {/* Result */}
            {importResult && (
              <div className={`mt-4 p-4 rounded-xl ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {importResult.success ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-[14px] font-bold text-green-700">{t('Импорт успешен!', 'Import muvaffaqiyatli!')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(importResult.stats || {}).map(([key, val]) => (
                        val as number > 0 && (
                          <div key={key} className="bg-white rounded-lg p-2 text-center">
                            <div className="text-[18px] font-extrabold text-green-600">{val as number}</div>
                            <div className="text-[10px] text-gray-400 capitalize">{key.replace('_', ' ')}</div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-[13px] text-red-600">{importResult.error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-600 hover:bg-gray-50 transition-all"
              >
                {t('Закрыть', 'Yopish')}
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={!importFile || importLoading}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('Импортировать', 'Import qilish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MODALS ──

function DistrictModal({ onClose, onSave, language }: {
  onClose: () => void;
  onSave: (districtName: string) => void;
  language: string;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{t('Новый район', 'Yangi tuman')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название района', 'Tuman nomi')} *</label>
            <input
              value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
              placeholder={t('Юнусабадский район', 'Yunusobod tumani')} />
          </div>
          <p className="text-[12px] text-gray-400">{t('После создания района вы сможете добавить ЖК в него.', "Tuman yaratilgandan so'ng unga TJM qo'sha olasiz.")}</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{t('Продолжить', 'Davom etish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BranchModal({ branch, onClose, onSave, language, defaultDistrict, canEditCode, onChangeCode }: {
  branch: Branch | null; onClose: () => void;
  onSave: (data: { code: string; name: string; address?: string; phone?: string; district?: string }) => void;
  language: string; defaultDistrict?: string;
  canEditCode?: boolean; onChangeCode?: (newCode: string) => Promise<void>;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    code: branch?.code || '', name: branch?.name || '',
    address: branch?.address || '', phone: branch?.phone || '',
    district: branch?.district || defaultDistrict || '',
  });
  const [codeEditing, setCodeEditing] = useState(false);
  const [newCode, setNewCode] = useState(branch?.code || '');
  const [codeLoading, setCodeLoading] = useState(false);

  const handleCodeChange = async () => {
    const trimmed = newCode.trim().toUpperCase();
    if (!trimmed || trimmed === branch?.code) { setCodeEditing(false); return; }
    const confirmed = confirm(
      language === 'ru'
        ? `Изменение кода ЖК с "${branch?.code}" на "${trimmed}" обновит все связанные здания. Продолжить?`
        : `"${branch?.code}" dan "${trimmed}" ga TJM kodini o'zgartirish barcha binolarga ta'sir qiladi. Davom etasizmi?`
    );
    if (!confirmed) return;
    setCodeLoading(true);
    try {
      await onChangeCode!(trimmed);
      setForm(f => ({ ...f, code: trimmed }));
      setCodeEditing(false);
    } catch {
      // error already shown by parent
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{branch ? t('Редактировать ЖК', 'TJMni tahrirlash') : t('Новый ЖК', 'Yangi TJM')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (form.code && form.name) onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Район', 'Tuman')}</label>
            <input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
              placeholder={t('Юнусабадский, Мирзо-Улугбекский...', 'Yunusobod, Mirzo-Ulugbek...')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Код ЖК', 'TJM kodi')} *</label>
            {branch && canEditCode ? (
              codeEditing ? (
                <div className="flex gap-2">
                  <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2.5 border border-orange-400 rounded-xl text-sm font-mono font-bold bg-white outline-none"
                    placeholder={form.code} maxLength={20} autoFocus />
                  <button type="button" onClick={handleCodeChange} disabled={codeLoading}
                    className="px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl disabled:opacity-50">
                    {codeLoading ? '...' : t('ОК', 'OK')}
                  </button>
                  <button type="button" onClick={() => { setCodeEditing(false); setNewCode(form.code); }}
                    className="px-3 py-2 border border-gray-200 text-xs font-bold rounded-xl">✕</button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <div className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold bg-gray-50 text-gray-700">{form.code}</div>
                  <button type="button" onClick={() => { setCodeEditing(true); setNewCode(form.code); }}
                    className="px-3 py-2 border border-gray-200 text-xs font-semibold rounded-xl hover:border-orange-400 text-gray-600">
                    {t('Изменить', "O'zgartirish")}
                  </button>
                </div>
              )
            ) : (
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
                placeholder="YS, CH..." maxLength={20} disabled={!!branch} />
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название ЖК', 'TJM nomi')} *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none"
              placeholder={t('ЖК "Ориент", ЖК "Юнусабад"...', 'TJM "Orient", TJM "Yunusobod"...')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Адрес', 'Manzil')}</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Телефон', 'Telefon')}</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" placeholder="+998..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{branch ? t('Сохранить', 'Saqlash') : t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BuildingModal({ building, onClose, onSave, language }: {
  building: BuildingFull | null; onClose: () => void; onSave: (data: any) => void; language: string;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    name: building?.name || '', address: building?.address || '', buildingNumber: building?.buildingNumber || '',
    floors: building?.floors || 9, entrances: building?.entrances || 4, totalApartments: building?.totalApartments || 144,
    yearBuilt: building?.yearBuilt || 2020, buildingType: building?.buildingType || 'monolith' as const,
    hasElevator: building?.hasElevator ?? true, hasGas: building?.hasGas ?? true,
    hasHotWater: building?.hasHotWater ?? true, hasParkingLot: building?.hasParkingLot ?? false,
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{building ? t('Редактировать ЖК', 'TJMni tahrirlash') : t('Новый ЖК / Дом', "Yangi TJM / Uy")}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (form.name && form.address) onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Название', 'Nomi')} *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" placeholder={t('ЖК "Название" или Дом 5Б', 'TJM "Nomi" yoki Uy 5B')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Адрес', 'Manzil')} *</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер дома', 'Uy raqami')}</label>
              <input value={form.buildingNumber} onChange={e => setForm({ ...form, buildingNumber: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-mono font-bold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" placeholder="8A" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Год постройки', 'Qurilgan yili')}</label>
              <input type="number" value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: parseInt(e.target.value) || 2020 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этажей', 'Qavatlar')}</label>
              <input type="number" value={form.floors} onChange={e => setForm({ ...form, floors: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Подъездов', 'Podyezdlar')}</label>
              <input type="number" value={form.entrances} onChange={e => setForm({ ...form, entrances: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартир', 'Xonadonlar')}</label>
              <input type="number" value={form.totalApartments} onChange={e => setForm({ ...form, totalApartments: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Тип здания', 'Bino turi')}</label>
            <select value={form.buildingType} onChange={e => setForm({ ...form, buildingType: e.target.value as any })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none">
              <option value="panel">{t('Панельный', 'Panelli')}</option>
              <option value="brick">{t('Кирпичный', "G'ishtli")}</option>
              <option value="monolith">{t('Монолитный', 'Monolitik')}</option>
              <option value="block">{t('Блочный', 'Blokli')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'hasElevator', label: t('Лифт', 'Lift') },
              { key: 'hasGas', label: t('Газ', 'Gaz') },
              { key: 'hasHotWater', label: t('Горячая вода', 'Issiq suv') },
              { key: 'hasParkingLot', label: t('Парковка', 'Parking') },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl cursor-pointer text-sm font-semibold">
                <input type="checkbox" checked={(form as any)[item.key]}
                  onChange={e => setForm({ ...form, [item.key]: e.target.checked })} className="w-4 h-4 accent-orange-500" />
                {item.label}
              </label>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{building ? t('Сохранить', 'Saqlash') : t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EntranceModal({ onClose, onSave, existingEntrances, language }: {
  onClose: () => void;
  onSave: (data: { number: number; floors_from?: number; floors_to?: number; apartments_from?: number; apartments_to?: number }) => void;
  existingEntrances: Entrance[]; language: string;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const nextNum = existingEntrances.length > 0 ? Math.max(...existingEntrances.map(e => e.number)) + 1 : 1;
  const [form, setForm] = useState({ number: nextNum, floors_from: 1, floors_to: 9, apartments_from: 1, apartments_to: 36 });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 border border-white/60 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{t('Новый подъезд', 'Yangi podyezd')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Номер подъезда', 'Podyezd raqami')} *</label>
            <input type="number" value={form.number} onChange={e => setForm({ ...form, number: parseInt(e.target.value) || 1 })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж с', 'Qavatdan')}</label>
              <input type="number" value={form.floors_from} onChange={e => setForm({ ...form, floors_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж по', 'Qavatgacha')}</label>
              <input type="number" value={form.floors_to} onChange={e => setForm({ ...form, floors_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира с', 'Xonadondan')}</label>
              <input type="number" value={form.apartments_from} onChange={e => setForm({ ...form, apartments_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира по', 'Xonadongacha')}</label>
              <input type="number" value={form.apartments_to} onChange={e => setForm({ ...form, apartments_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 transition-colors">{t('Отмена', 'Bekor')}</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600">{t('Создать', 'Yaratish')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EntranceEditModal({ entrance, existingApartmentCount, onClose, onSave, language }: {
  entrance: Entrance;
  existingApartmentCount: number;
  onClose: () => void;
  onSave: (data: { floors_from: number; floors_to: number; apartments_from: number; apartments_to: number }) => void;
  language: string;
}) {
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const [form, setForm] = useState({
    floors_from: entrance.floors_from ?? 1,
    floors_to: entrance.floors_to ?? 9,
    apartments_from: entrance.apartments_from ?? 1,
    apartments_to: entrance.apartments_to ?? 36,
  });
  const [saving, setSaving] = useState(false);

  const newAptCount = form.apartments_to - form.apartments_from + 1;
  const tooFew = newAptCount < existingApartmentCount;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-lg font-bold">{t('Подъезд', 'Podyezd')} {entrance.number}</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">{t('Редактирование параметров', 'Parametrlarni tahrirlash')}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:border-orange-400"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={async e => {
          e.preventDefault();
          if (tooFew) return;
          setSaving(true);
          try { await onSave(form); } finally { setSaving(false); }
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж с', 'Qavatdan')}</label>
              <input type="number" value={form.floors_from} onChange={e => setForm({ ...form, floors_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Этаж по', 'Qavatgacha')}</label>
              <input type="number" value={form.floors_to} onChange={e => setForm({ ...form, floors_to: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира с', 'Xonadondan')}</label>
              <input type="number" value={form.apartments_from} onChange={e => setForm({ ...form, apartments_from: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:border-orange-400 outline-none" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('Квартира по', 'Xonadongacha')}</label>
              <input type="number" value={form.apartments_to} onChange={e => setForm({ ...form, apartments_to: parseInt(e.target.value) || 1 })}
                className={`w-full px-3.5 py-2.5 border rounded-xl text-sm bg-gray-50 focus:bg-white outline-none ${tooFew ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-orange-400'}`} min="1" />
            </div>
          </div>

          {existingApartmentCount > 0 && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${tooFew ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {tooFew
                  ? t(
                      `Количество квартир не может быть меньше уже существующих записей (${existingApartmentCount} кв.)`,
                      `Xonadonlar soni mavjud yozuvlardan kam bo'lishi mumkin emas (${existingApartmentCount} xn.)`
                    )
                  : t(
                      `В подъезде уже создано ${existingApartmentCount} кв. Существующие квартиры и жители не будут удалены.`,
                      `Podyezdda allaqachon ${existingApartmentCount} xn. yaratilgan. Mavjud xonadonlar va yashovchilar o'chirilmaydi.`
                    )
                }
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-sm">{t('Отмена', 'Bekor')}</button>
            <button type="submit" disabled={tooFew || saving} className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Сохранить', 'Saqlash')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
