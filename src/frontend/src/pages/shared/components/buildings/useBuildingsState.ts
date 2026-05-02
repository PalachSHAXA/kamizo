import { useState, useEffect } from 'react';
import { useCRMStore } from '../../../../stores/crmStore';
import { useLanguageStore } from '../../../../stores/languageStore';
import { useAuthStore } from '../../../../stores/authStore';
import { apiRequest } from '../../../../services/api';
import type { BuildingFull } from '../../../../types';
import { useBackGuard } from '../../../../hooks/useBackGuard';
import { useToastStore } from '../../../../stores/toastStore';
import type { Branch, Entrance, Apartment, ViewLevel } from './types';

export function useBuildingsState() {
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
  const addToast = useToastStore(s => s.addToast);
  const canManageImportExport = user && ['admin', 'director', 'manager'].includes(user.role);

  // Navigation
  const [viewLevel, setViewLevel] = useState<ViewLevel>('branches');
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
  const [apartmentResidents, setApartmentResidents] = useState<Array<{ id: string; name: string; phone?: string; type?: string; login?: string; password_decrypted?: string }>>([]);
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
  const [importResult, setImportResult] = useState<{ success: boolean; stats?: Record<string, number>; error?: string } | null>(null);

  // Load branches on mount
  useEffect(() => { fetchBranches(); }, []);

  useEffect(() => {
    if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBuildingsForBranch is a stable local function defined in this hook scope
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const aptDetail = await apiRequest<{ owners?: Array<Record<string, unknown>>; userResidents?: Array<Record<string, unknown>> }>(`/api/apartments/${apt.id}`);
      const owners = aptDetail.owners || [];
      const userResidents = aptDetail.userResidents || [];
      let crmResidents: Array<Record<string, unknown>> = [];
      try {
        const crmRes = await apiRequest<{ residents: Array<Record<string, unknown>> }>(`/api/apartments/${apt.id}/residents`);
        crmResidents = crmRes.residents || [];
      } catch { /* CRM residents endpoint may not exist */ }
      const combined = [
        ...owners.map((o) => ({ id: String(o.id), name: String(o.name || o.full_name || ''), phone: o.phone as string | undefined, type: 'owner' as const })),
        ...userResidents.map((u) => ({ id: String(u.id), name: String(u.name || ''), phone: u.phone as string | undefined, login: u.login as string | undefined, password_decrypted: u.password_decrypted as string | undefined, type: 'resident' as const })),
        ...crmResidents.map((r) => ({ id: String(r.id), name: String(r.name || r.full_name || ''), phone: r.phone as string | undefined, type: 'resident' as const })),
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
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
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
    } catch (err: unknown) {
      addToast('error', (language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + ((err instanceof Error ? err.message : '') || 'Error'));
    } finally {
      setIsDeletingDistrict(false);
    }
  };

  const closeSidePanel = () => {
    setPanelOpen(false);
    setSelectedApartment(null);
    setIsEditingApartment(false);
    setIsAddingApartment(false);
  };

  const handleBack = () => {
    closeSidePanel();
    if (viewLevel === 'entrances') {
      setSelectedBuilding(null);
      setViewLevel('buildings');
    } else if (viewLevel === 'buildings') {
      setSelectedBranch(null);
      setViewLevel('branches');
    }
    setSearchQuery('');
  };

  useBackGuard(viewLevel !== 'branches', handleBack);

  // CRUD: branches (ЖК)
  const handleAddBranch = async (data: { code: string; name: string; address?: string; phone?: string; district?: string }) => {
    try {
      await apiRequest('/api/branches', { method: 'POST', body: JSON.stringify({ ...data, district: data.district || selectedDistrict || undefined }) });
      fetchBranches();
      setShowAddBranchModal(false);
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
    }
  };

  const handleUpdateBranch = async (id: string, data: Partial<Branch>) => {
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      fetchBranches();
      setEditingBranch(null);
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
    }
  };

  const handleChangeCode = async (id: string, newCode: string) => {
    try {
      await apiRequest(`/api/branches/${id}/change-code`, { method: 'POST', body: JSON.stringify({ new_code: newCode }) });
      fetchBranches();
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
      throw error;
    }
  };

  const handleDeleteBranch = async (id: string) => {
    if (!confirm(t('Удалить этот комплекс?', "Bu kompleksni o'chirasizmi?"))) return;
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'DELETE' });
      fetchBranches();
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
    }
  };

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
    } catch (err: unknown) {
      addToast('error', (err instanceof Error ? err.message : '') || t('Ошибка экспорта', 'Eksport xatosi'));
    } finally {
      setExportingBranchId(null);
    }
  };

  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      if (selectedBranch && !data.branch) {
        data.branch = { id: selectedBranch.id, code: selectedBranch.code, name: selectedBranch.name };
      }
      const url = selectedBranch
        ? `/api/branches/import?branchId=${selectedBranch.id}`
        : '/api/branches/import';
      const result = await apiRequest(url, {
        method: 'POST',
        body: JSON.stringify(data),
      }) as { stats?: Record<string, number> };
      setImportResult({ success: true, stats: result.stats });
      fetchBranches();
      if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
    } catch (err: unknown) {
      setImportResult({ success: false, error: (err instanceof Error ? err.message : '') || t('Ошибка импорта', 'Import xatosi') });
    } finally {
      setImportLoading(false);
    }
  };

  // CRUD: buildings
  const handleAddBuilding = async (data: Record<string, unknown>) => {
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
    if (!confirm(t('Удалить этот дом?', "Bu uyni o'chirasizmi?"))) return;
    try {
      await deleteBuilding(id);
      if (selectedBranch) fetchBuildingsForBranch(selectedBranch.id);
      fetchBranches();
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
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
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
    }
  };

  const handleSaveEntrance = async (id: string, data: { floors_from: number; floors_to: number; apartments_from: number; apartments_to: number }) => {
    try {
      const result = await apiRequest<{ entrance: Entrance }>(`/api/entrances/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        cache: 'no-store',
      });
      if (result.entrance) {
        setEntrances(prev => prev.map(e => e.id === id ? { ...e, ...result.entrance } : e));
      }
      setEditingEntrance(null);
      if (selectedBuilding) {
        fetchEntrancesForBuilding(selectedBuilding.id);
        fetchApartmentsForBuilding(selectedBuilding.id);
      }
      const msg = language === 'ru' ? 'Данные подъезда успешно обновлены' : 'Podyezd ma\'lumotlari muvaffaqiyatli yangilandi';
      setEntranceEditToast(msg);
      setTimeout(() => setEntranceEditToast(''), 3000);
    } catch (err: unknown) {
      addToast('error', (language === 'ru' ? 'Ошибка сохранения: ' : 'Saqlash xatoligi: ') + ((err instanceof Error ? err.message : '') || 'Error'));
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
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
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
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : '') || 'Error');
    }
  };

  // Filters
  const filteredBuildings = selectedBranch
    ? buildings.filter(b => b.branchCode === selectedBranch.code)
    : buildings;
  const searchedBuildings = filteredBuildings.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const districtBranches = selectedDistrict
    ? branches.filter(b => (b.district || '') === selectedDistrict)
    : branches;

  // District filter handler (for dropdown)
  const handleDistrictFilter = (district: string) => {
    setSelectedDistrict(district || null);
    setSearchQuery('');
  };
  const searchedBranches = districtBranches.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.code.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const allDistricts = [...new Set(branches.map(b => b.district || '').filter(Boolean))].sort();
  const noBranchDistrict = branches.some(b => !b.district);

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

  return {
    // Stores
    language, user, canManageImportExport, buildings, isLoadingBuildings,
    // Navigation state
    viewLevel, setViewLevel, selectedDistrict, setSelectedDistrict,
    selectedBranch, setSelectedBranch, selectedBuilding, setSelectedBuilding,
    // District
    showAddDistrictModal, setShowAddDistrictModal,
    deleteDistrictConfirm, setDeleteDistrictConfirm,
    isDeletingDistrict, cascadeConfirmChecked, setCascadeConfirmChecked,
    // Data
    branches, entrances, isLoadingBranches, isLoadingEntrances,
    // Modals
    showAddBranchModal, setShowAddBranchModal,
    showAddBuildingModal, setShowAddBuildingModal,
    showAddEntranceModal, setShowAddEntranceModal,
    editingEntrance, setEditingEntrance,
    entranceEditToast, editingBranch, setEditingBranch,
    editingBuilding, setEditingBuilding,
    // Search
    searchQuery, setSearchQuery,
    // Apartments
    apartments, isLoadingApartments, selectedApartment,
    apartmentResidents, isLoadingResidents, isGenerating,
    // Side panel
    panelOpen,
    // Apartment editing
    isEditingApartment, isAddingApartment, editForm, setEditForm, isSavingApartment,
    // Import/Export
    exportingBranchId, showImportModal, setShowImportModal,
    importFile, setImportFile, importLoading, importResult, setImportResult,
    // Computed
    searchedBuildings, searchedBranches, allDistricts, noBranchDistrict,
    sortedEntrances, entranceMap, floors,
    // Fetchers
    fetchBranches, fetchBuildingsForBranch, fetchEntrancesForBuilding, fetchApartmentsForBuilding,
    // Handlers
    handleApartmentClick, handleGenerateApartments,
    handleBranchClick, handleBuildingClick, handleDistrictClick,
    handleDeleteDistrict, handleBack, closeSidePanel,
    handleDistrictFilter,
    handleAddBranch, handleUpdateBranch, handleChangeCode, handleDeleteBranch,
    handleExportBranch, handleImportSubmit,
    handleAddBuilding, handleUpdateBuilding, handleDeleteBuilding,
    handleAddEntrance, handleSaveEntrance,
    startEditApartment, startAddApartment, cancelEdit,
    handleSaveApartment, handleDeleteApartment,
  };
}
