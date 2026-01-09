import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Building2, Users, Upload, FileSpreadsheet, X, Check, Search,
  MapPin, UserPlus, Key, Copy, Trash2, Edit3, Eye, EyeOff, Save,
  AlertCircle, ChevronRight, Home, CheckCircle, Phone, Loader2, RefreshCw,
  GitBranch, ArrowLeft, DoorOpen
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useAuthStore } from '../stores/authStore';
import { authApi, usersApi, apiRequest } from '../services/api';
import type { BuildingFull } from '../types';

// Branch type (from API)
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
type ViewLevel = 'branches' | 'buildings' | 'entrances' | 'residents';

// Resident from API
interface ApiResident {
  id: string;
  login: string;
  name: string;
  phone?: string;
  address?: string;
  apartment?: string;
  building_id?: string;
  entrance?: string;
  floor?: string;
  created_at?: string;
}

// Excel parser interface
interface ExcelRow {
  personalAccount: string;
  fullName: string;
  address: string;
  totalArea?: number; // Площадь квартиры в кв.м
}

export function ResidentsPage() {
  const { buildings, fetchBuildings } = useCRMStore();
  const { addMockUser, additionalUsers, removeUser, updateUserPassword, getUserPassword } = useAuthStore();

  // Navigation state
  const [viewLevel, setViewLevel] = useState<ViewLevel>('branches');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingFull | null>(null);
  const [selectedEntrance, setSelectedEntrance] = useState<Entrance | null>(null);

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingEntrances, setIsLoadingEntrances] = useState(false);

  // API loaded residents
  const [apiResidents, setApiResidents] = useState<ApiResident[]>([]);
  const [isLoadingResidents, setIsLoadingResidents] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddManualModal, setShowAddManualModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadedData, setUploadedData] = useState<ExcelRow[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [createdAccounts, setCreatedAccounts] = useState<{login: string; name: string}[]>([]);
  const [showResidentCard, setShowResidentCard] = useState<{id?: string; login: string; name: string; address?: string; apartment?: string; phone?: string; branch?: string; building?: string} | null>(null);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{login: string; name: string} | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const DEFAULT_PASSWORD = 'kamizo';

  // Load branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  // Load buildings when branch is selected
  useEffect(() => {
    if (selectedBranch) {
      fetchBuildings();
    }
  }, [selectedBranch, fetchBuildings]);

  // Load entrances when building is selected
  useEffect(() => {
    if (selectedBuilding) {
      fetchEntrancesForBuilding(selectedBuilding.id);
      fetchResidents(selectedBuilding.id);
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

  const fetchResidents = async (buildingId?: string) => {
    setIsLoadingResidents(true);
    try {
      const result = await usersApi.getAll({
        role: 'resident',
        building_id: buildingId,
        limit: 5000,
      });
      setApiResidents(result.users || []);
    } catch (err) {
      console.error('Failed to fetch residents:', err);
      setApiResidents([]);
    } finally {
      setIsLoadingResidents(false);
    }
  };

  // Filter buildings by selected branch
  const filteredBuildings = selectedBranch
    ? buildings.filter(b => b.branchCode === selectedBranch.code)
    : buildings;

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

  const handleEntranceClick = (entrance: Entrance) => {
    setSelectedEntrance(entrance);
    setViewLevel('residents');
    setSearchQuery('');
  };

  const handleBack = () => {
    if (viewLevel === 'residents') {
      setSelectedEntrance(null);
      setViewLevel('entrances');
    } else if (viewLevel === 'entrances') {
      setSelectedBuilding(null);
      setEntrances([]);
      setApiResidents([]);
      setViewLevel('buildings');
    } else if (viewLevel === 'buildings') {
      setSelectedBranch(null);
      setViewLevel('branches');
    }
    setSearchQuery('');
  };

  // Extract building number from address (supports formats like 93, 93A, 93/2, 93-2, 93/2A)
  const extractBuildingFromAddress = (address: string): string => {
    if (!address) return '';

    // Pattern to match building numbers: 93, 93A, 93/2, 93-2, 93/2A, etc.
    const buildingPattern = '(\\d+(?:[/\\-]\\d+)?[А-Яа-яA-Za-z]?)';

    // Uzbek format: 93-уй, 93/2-уй, уй 93, уй 93/2
    const uzMatch = address.match(new RegExp(buildingPattern + '-уй|уй\\s*' + buildingPattern, 'i'));
    if (uzMatch) {
      const num = (uzMatch[1] || uzMatch[2]).toUpperCase();
      return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
    }

    // Russian format: дом 93, дом 93/2, д. 93, д. 93-2
    const ruMatch = address.match(new RegExp('(?:дом|д\\.?)\\s*' + buildingPattern, 'i'));
    if (ruMatch) {
      const num = ruMatch[1].toUpperCase();
      return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
    }

    return '';
  };

  // Generate password
  const generatePassword = (building: BuildingFull | null, apartment: string, address?: string): string => {
    if (!building?.branchCode) {
      return DEFAULT_PASSWORD;
    }
    const branch = building.branchCode.toUpperCase();
    let bldg = address ? extractBuildingFromAddress(address) : '';
    if (!bldg && building?.buildingNumber) {
      bldg = building.buildingNumber.toUpperCase();
    }
    if (!bldg) {
      return DEFAULT_PASSWORD;
    }
    const apt = apartment || '0';
    return `${branch}/${bldg}/${apt}`;
  };

  // Get password for resident
  const getResidentPassword = (resident: { login: string; branch?: string; building?: string; apartment?: string; buildingId?: string; password?: string; address?: string }): string => {
    if (resident.password) {
      return resident.password;
    }
    const storedPassword = getUserPassword(resident.login);
    if (storedPassword) {
      return storedPassword;
    }
    const residentBuilding = buildings.find(b => b.id === resident.buildingId) || selectedBuilding;
    // Try to get apartment from resident data, or extract from address if not available
    const apartmentFromAddress = resident.address ? extractApartmentFromAddress(resident.address) : '';
    const apartmentNumber = resident.apartment || apartmentFromAddress || '0';
    const buildingFromAddress = resident.address ? extractBuildingFromAddress(resident.address) : '';

    if (residentBuilding?.branchCode) {
      const bldgNum = buildingFromAddress || residentBuilding?.buildingNumber?.toUpperCase() || '';
      if (bldgNum) {
        return `${residentBuilding.branchCode.toUpperCase()}/${bldgNum}/${apartmentNumber}`;
      }
    }

    if (resident.branch && (buildingFromAddress || resident.building)) {
      const bldgNum = buildingFromAddress || resident.building?.toUpperCase() || '';
      return `${resident.branch.toUpperCase()}/${bldgNum}/${apartmentNumber}`;
    }

    return DEFAULT_PASSWORD;
  };

  // Get local residents
  const localResidents = Object.entries(additionalUsers)
    .filter(([_, data]) => data.user.role === 'resident')
    .map(([userLogin, data]) => ({
      ...data.user,
      login: userLogin,
      password: data.password
    }));

  // Use API residents as primary source
  const allResidents = apiResidents.length > 0
    ? apiResidents.map(r => ({
        id: r.id,
        login: r.login,
        name: r.name,
        phone: r.phone,
        address: r.address,
        apartment: r.apartment,
        buildingId: r.building_id,
        entrance: r.entrance,
        floor: r.floor,
        createdAt: r.created_at
      }))
    : localResidents;

  // Filter residents by selected entrance
  const buildingResidents = selectedEntrance
    ? allResidents.filter(r =>
        r.buildingId === selectedBuilding?.id &&
        r.entrance === String(selectedEntrance.number)
      )
    : allResidents.filter(r => r.buildingId === selectedBuilding?.id);

  // Filter by search
  const filteredResidents = buildingResidents.filter(r => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(query) ||
      r.login.toLowerCase().includes(query) ||
      r.address?.toLowerCase().includes(query) ||
      r.apartment?.toLowerCase().includes(query) ||
      r.phone?.toLowerCase().includes(query)
    );
  });

  // Extract apartment from address (supports кв, kv, квартира, apt formats)
  const extractApartmentFromAddress = (address: string): string => {
    // Uzbek format: 5-хонадон or хонадон 5
    const uzMatch = address.match(/(\d+)-хонадон|хонадон\s*(\d+)/i);
    if (uzMatch) {
      return uzMatch[1] || uzMatch[2];
    }
    // Russian/Latin format: кв, кв., kv, kv., квартира, apt, apt.
    const ruMatch = address.match(/(?:кв\.?|kv\.?|квартира|apt\.?)\s*(\d+)/i);
    if (ruMatch) {
      return ruMatch[1];
    }
    // Fallback: last number after comma
    const lastNumberMatch = address.match(/,\s*(\d+)\s*$/);
    if (lastNumberMatch) {
      return lastNumberMatch[1];
    }
    return '';
  };

  // Calculate entrance and floor
  const calculateEntranceAndFloor = (apartment: string): { entrance: string; floor: string } => {
    const aptNum = parseInt(apartment);
    if (isNaN(aptNum) || aptNum <= 0) return { entrance: '', floor: '' };

    const apartmentsPerFloor = 4;
    const floorsPerEntrance = 9;
    const apartmentsPerEntrance = apartmentsPerFloor * floorsPerEntrance;

    const entrance = Math.ceil(aptNum / apartmentsPerEntrance);
    const positionInEntrance = ((aptNum - 1) % apartmentsPerEntrance);
    const floor = Math.floor(positionInEntrance / apartmentsPerFloor) + 1;

    return {
      entrance: String(entrance),
      floor: String(floor),
    };
  };

  // Check if non-residential
  const isNonResidential = (address: string): boolean => {
    return /(?:неж\.?|нежилое)/i.test(address);
  };

  // Parse Excel file
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError('');

    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        setUploadError('Файл пустой или имеет неверный формат');
        return;
      }

      const rows = parseExcelData(jsonData as unknown as string[][]);

      if (rows.length === 0) {
        setUploadError(`Не удалось найти данные. Проверьте формат файла.`);
        return;
      }

      setUploadedData(rows);
    } catch {
      setUploadError('Ошибка при чтении файла');
    }

    if (event.target) {
      event.target.value = '';
    }
  }, []);

  // Parse Excel data
  const parseExcelData = (data: string[][]): ExcelRow[] => {
    if (data.length < 1) return [];

    let headerRowIndex = -1;
    let accountCol = -1;
    let nameCol = -1;
    let addressCol = -1;
    let areaCol = -1;

    const findColumnInRow = (row: string[], names: string[]): number => {
      if (!row) return -1;
      for (const name of names) {
        const idx = row.findIndex(h => String(h || '').toLowerCase().trim().includes(name));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;

      const acc = findColumnInRow(row, ['л/с', 'лицевой', 'л.с', 'лс']);
      const name = findColumnInRow(row, ['фио', 'абонент']);
      const addr = findColumnInRow(row, ['адрес']);
      const area = findColumnInRow(row, ['площадь', 'кв.м', 'кв м', 's кв', 'sкв', 'общая площадь']);

      const foundCount = [acc, name, addr].filter(x => x >= 0).length;
      if (foundCount >= 2) {
        headerRowIndex = i;
        accountCol = acc;
        nameCol = name;
        addressCol = addr;
        areaCol = area;
        break;
      }
    }

    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    const accIdx = accountCol >= 0 ? accountCol : 0;
    const nameIdx = nameCol >= 0 ? nameCol : 1;
    const addrIdx = addressCol >= 0 ? addressCol : 2;

    const rows: ExcelRow[] = [];

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every(v => !v)) continue;

      let personalAccount = String(row[accIdx] || '').trim();
      personalAccount = personalAccount.replace(/\s+/g, '');

      const fullName = String(row[nameIdx] || '').trim();
      const address = String(row[addrIdx] || '').trim();

      // Parse area - can be number or string with comma/dot
      // Excel sometimes stores 98.39 as 9839 (multiplied by 100 without decimal)
      let totalArea: number | undefined;
      if (areaCol >= 0 && row[areaCol]) {
        const rawValue = row[areaCol];
        let areaStr = String(rawValue).replace(',', '.').replace(/[^\d.]/g, '');
        let parsed = parseFloat(areaStr);

        if (!isNaN(parsed) && parsed > 0) {
          // If no decimal point in original and value > 1000, it's likely scaled by 100
          // Normal apartment areas are 20-300 m², so 2000+ is suspicious
          const hasDecimal = String(rawValue).includes('.') || String(rawValue).includes(',');
          if (!hasDecimal && parsed > 1000) {
            // Divide by 100 to get real area (e.g., 9839 -> 98.39)
            parsed = parsed / 100;
          }
          // Additional sanity check: if still > 500, might be scaled by 10
          if (parsed > 500 && !hasDecimal) {
            parsed = parsed / 10;
          }
          totalArea = Math.round(parsed * 100) / 100; // Round to 2 decimals
        }
      }

      if (!fullName) continue;
      if (fullName.toLowerCase().includes('фио') || fullName.toLowerCase().includes('абонент')) continue;

      rows.push({
        personalAccount,
        fullName,
        address: address || selectedBuilding?.address || '',
        totalArea,
      });
    }

    return rows;
  };

  // Create accounts from data
  const createAccountsFromData = async () => {
    const usersToCreate: any[] = [];
    let skippedNonResidential = 0;

    uploadedData.forEach((row, index) => {
      if (!row.fullName) return;

      if (isNonResidential(row.address)) {
        skippedNonResidential++;
        return;
      }

      const login = row.personalAccount
        ? row.personalAccount.trim().replace(/\s+/g, '')
        : `${Date.now()}_${index}`;

      if (additionalUsers[login]) return;

      const apartment = extractApartmentFromAddress(row.address);
      const { entrance, floor } = calculateEntranceAndFloor(apartment);
      const buildingId = selectedBuilding?.id || '';
      const residentAddress = row.address || selectedBuilding?.address || '';
      const password = generatePassword(selectedBuilding, apartment, residentAddress);

      usersToCreate.push({
        login,
        password,
        name: row.fullName,
        role: 'resident',
        phone: '',
        address: row.address || selectedBuilding?.address || '',
        apartment,
        building_id: buildingId,
        entrance,
        floor,
        total_area: row.totalArea || null,
      });
    });

    if (usersToCreate.length === 0) {
      const message = skippedNonResidential > 0
        ? `Нет новых пользователей для создания. Пропущено ${skippedNonResidential} нежилых помещений.`
        : 'Нет новых пользователей для создания';
      setUploadError(message);
      return;
    }

    setIsCreating(true);
    setProgressMessage(`Создание ${usersToCreate.length} аккаунтов...`);

    try {
      const result = await authApi.registerBulk(usersToCreate);
      const createdCount = result.created?.length || 0;
      const updatedCount = result.updated?.length || 0;

      if (createdCount > 0 || updatedCount > 0) {
        const allAccounts = [...(result.created || []), ...(result.updated || [])];
        setCreatedAccounts(allAccounts.map((u: any) => ({ login: u.login, name: u.name })));
      }

      setUploadedData([]);
      setShowUploadModal(false);
      setProgressMessage(`Готово! Создано: ${createdCount}, Обновлено: ${updatedCount}`);

      if (selectedBuilding) {
        await fetchResidents(selectedBuilding.id);
      }

      setTimeout(() => setProgressMessage(''), 3000);
    } catch (error: any) {
      setUploadError(error.message || 'Ошибка при массовой регистрации');
      setProgressMessage('');
    } finally {
      setIsCreating(false);
    }
  };

  // Manual add resident form
  const [manualForm, setManualForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    personalAccount: '',
  });

  const handleManualAdd = async () => {
    if (!manualForm.fullName) return;

    const login = manualForm.personalAccount
      ? manualForm.personalAccount.trim()
      : `${Date.now()}`;

    const apartment = extractApartmentFromAddress(manualForm.address);
    const buildingId = selectedBuilding?.id || '';
    const residentAddress = manualForm.address || selectedBuilding?.address || '';
    const password = generatePassword(selectedBuilding, apartment, residentAddress);

    setIsCreating(true);
    setProgressMessage('Создание аккаунта...');

    try {
      await authApi.register({
        login,
        password,
        name: manualForm.fullName,
        role: 'resident',
        phone: manualForm.phone,
        address: manualForm.address || selectedBuilding?.address || '',
        apartment: apartment,
        building_id: buildingId,
        entrance: '',
        floor: '',
        branch: selectedBuilding?.branchCode,
        building: selectedBuilding?.buildingNumber,
      });

      addMockUser(login, password, {
        id: `res_${Date.now()}`,
        phone: manualForm.phone,
        name: manualForm.fullName,
        login,
        role: 'resident',
        address: manualForm.address || selectedBuilding?.address || '',
        apartment: apartment,
        buildingId: buildingId,
        branch: selectedBuilding?.branchCode,
        building: selectedBuilding?.buildingNumber,
      });

      setShowResidentCard({
        login,
        name: manualForm.fullName,
        address: manualForm.address || selectedBuilding?.address || '',
        apartment: apartment,
        phone: manualForm.phone,
      });
      setShowPassword(true);

      setManualForm({
        fullName: '',
        phone: '',
        address: '',
        personalAccount: '',
      });
      setShowAddManualModal(false);

      if (selectedBuilding) {
        await fetchResidents(selectedBuilding.id);
      }

      setProgressMessage('Аккаунт создан!');
      setTimeout(() => setProgressMessage(''), 2000);
    } catch (error: any) {
      console.error('Manual registration error:', error);
      alert('Ошибка создания: ' + (error.message || 'Неизвестная ошибка'));
      setProgressMessage('');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete resident
  const handleDeleteResident = async (login: string) => {
    setIsDeleting(true);
    try {
      const apiResident = apiResidents.find(r => r.login === login);
      if (apiResident?.id) {
        await usersApi.delete(apiResident.id);
      }
      removeUser(login);
      if (selectedBuilding) {
        await fetchResidents(selectedBuilding.id);
      }
    } catch (err) {
      console.error('Failed to delete resident:', err);
      alert('Ошибка при удалении: ' + (err as Error).message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
      setShowResidentCard(null);
    }
  };

  // Delete all residents
  const handleDeleteAllResidents = async () => {
    setIsDeleting(true);
    setProgressMessage(`Удаление ${filteredResidents.length} жителей...`);
    let deletedCount = 0;
    const total = filteredResidents.length;

    try {
      for (let i = 0; i < filteredResidents.length; i++) {
        const resident = filteredResidents[i];
        setProgressMessage(`Удаление ${i + 1}/${total}: ${resident.name.split(' ')[0]}...`);

        try {
          let residentId = (resident as any).id;

          if (!residentId) {
            const apiResident = apiResidents.find(r => r.login === resident.login);
            residentId = apiResident?.id;
          }

          if (residentId) {
            await usersApi.delete(residentId);
            deletedCount++;
          }
          removeUser(resident.login);
        } catch (err) {
          console.error(`Failed to delete ${resident.login}:`, err);
        }
      }

      setProgressMessage(`Удалено ${deletedCount} жителей`);

      if (selectedBuilding) {
        await fetchResidents(selectedBuilding.id);
      }

      setTimeout(() => setProgressMessage(''), 3000);
    } finally {
      setIsDeleting(false);
      setDeleteAllConfirm(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Render residents list
  const renderResidentsList = () => (
    <div className="space-y-3">
      {/* Search */}
      <div className="glass-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по имени, телефону, квартире..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Residents count and actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Найдено: <strong>{filteredResidents.length}</strong> жителей
        </div>
        {filteredResidents.length > 0 && (
          <button
            onClick={() => setDeleteAllConfirm(true)}
            className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Удалить всех
          </button>
        )}
      </div>

      {/* List */}
      {isLoadingResidents ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
          <p className="text-gray-500">Загрузка жителей...</p>
        </div>
      ) : filteredResidents.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-600">Жители не найдены</h3>
          <p className="text-gray-400 mt-1 mb-4">
            Загрузите Excel файл с данными жителей
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => selectedBuilding && fetchResidents(selectedBuilding.id)}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Загрузить Excel
            </button>
          </div>
        </div>
      ) : (
        filteredResidents.map((resident) => (
          <div
            key={resident.login}
            className="glass-card p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => {
              setShowResidentCard(resident);
              setEditingPassword(false);
              setNewPassword('');
              setShowPassword(false);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-lg font-medium text-white shadow-sm">
                  {resident.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{resident.name}</h3>
                  <div className="flex items-center flex-wrap gap-2 text-sm mt-1">
                    <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono text-xs">
                      <Key className="w-3 h-3" />
                      {resident.login}
                    </span>
                    {resident.apartment && (
                      <span className="flex items-center gap-1 text-gray-500">
                        <Home className="w-3.5 h-3.5" />
                        кв. {resident.apartment}
                      </span>
                    )}
                  </div>
                  {resident.address && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{resident.address}</span>
                    </div>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Жители</h1>
          <p className="text-gray-500 mt-1">Управление аккаунтами жителей</p>
        </div>
      </div>

      {/* Step 1: Branch Selection */}
      {viewLevel === 'branches' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Выберите филиал</h2>
          {isLoadingBranches ? (
            <div className="glass-card p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
              <p className="text-gray-500">Загрузка филиалов...</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">Филиалы не найдены</h3>
              <p className="text-gray-400 mt-1">
                Добавьте филиалы в разделе "Дома/Объекты"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => handleBranchClick(branch)}
                  className="glass-card p-5 text-left hover:shadow-lg transition-shadow group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-lg">{branch.code}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">{branch.name}</h3>
                        <div className="text-sm text-gray-500">Филиал {branch.code}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span>{branch.buildings_count} домов</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{branch.residents_count} жителей</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Building Selection */}
      {viewLevel === 'buildings' && selectedBranch && (
        <div>
          {/* Branch Header */}
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold">{selectedBranch.code}</span>
              </div>
              <div>
                <h2 className="font-semibold">{selectedBranch.name}</h2>
                <p className="text-sm text-gray-500">Выберите дом</p>
              </div>
            </div>
          </div>

          {filteredBuildings.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">Дома не найдены</h3>
              <p className="text-gray-400 mt-1">
                Добавьте дома в этот филиал в разделе "Дома/Объекты"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBuildings.map((building) => (
                <button
                  key={building.id}
                  onClick={() => handleBuildingClick(building)}
                  className="glass-card p-5 text-left hover:shadow-lg transition-shadow group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
                        <Home className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Дом {building.buildingNumber || building.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="w-3 h-3" />
                          {building.address}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Home className="w-4 h-4 text-gray-400" />
                      <span>{building.totalApartments} кв.</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DoorOpen className="w-4 h-4 text-gray-400" />
                      <span>{building.entrances} подъездов</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Entrances/Residents */}
      {viewLevel === 'entrances' && selectedBuilding && (
        <div>
          {/* Building Header with Breadcrumb */}
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => {
                      setViewLevel('branches');
                      setSelectedBranch(null);
                      setSelectedBuilding(null);
                    }}
                    className="text-gray-500 hover:text-primary-600"
                  >
                    Филиалы
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <button
                    onClick={handleBack}
                    className="text-gray-500 hover:text-primary-600"
                  >
                    {selectedBranch?.name}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <span className="font-medium text-gray-900">
                    Дом {selectedBuilding.buildingNumber || selectedBuilding.name}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddManualModal(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить</span>
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Entrance selection or direct residents view */}
          {isLoadingEntrances ? (
            <div className="glass-card p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
              <p className="text-gray-500">Загрузка подъездов...</p>
            </div>
          ) : entrances.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entrances.map((entrance) => {
                const entranceResidents = allResidents.filter(r =>
                  r.buildingId === selectedBuilding.id &&
                  r.entrance === String(entrance.number)
                );
                return (
                  <button
                    key={entrance.id}
                    onClick={() => handleEntranceClick(entrance)}
                    className="glass-card p-5 text-left hover:shadow-lg transition-shadow group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl flex items-center justify-center">
                          <DoorOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Подъезд {entrance.number}</h3>
                          <div className="text-sm text-gray-500">
                            {entrance.floors_from && entrance.floors_to && (
                              <span>Этажи {entrance.floors_from}-{entrance.floors_to}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      {entrance.apartments_from && entrance.apartments_to && (
                        <div className="flex items-center gap-1">
                          <Home className="w-4 h-4 text-gray-400" />
                          <span>кв. {entrance.apartments_from}-{entrance.apartments_to}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>{entranceResidents.length} жителей</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            // No entrances - show residents directly
            renderResidentsList()
          )}
        </div>
      )}

      {/* Step 4: Residents for selected entrance */}
      {viewLevel === 'residents' && selectedEntrance && selectedBuilding && (
        <div>
          {/* Entrance Header with Breadcrumb */}
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <button
                    onClick={() => {
                      setViewLevel('branches');
                      setSelectedBranch(null);
                      setSelectedBuilding(null);
                      setSelectedEntrance(null);
                    }}
                    className="text-gray-500 hover:text-primary-600"
                  >
                    Филиалы
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <button
                    onClick={() => {
                      setViewLevel('buildings');
                      setSelectedBuilding(null);
                      setSelectedEntrance(null);
                    }}
                    className="text-gray-500 hover:text-primary-600"
                  >
                    {selectedBranch?.name}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <button
                    onClick={handleBack}
                    className="text-gray-500 hover:text-primary-600"
                  >
                    Дом {selectedBuilding.buildingNumber || selectedBuilding.name}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <span className="font-medium text-gray-900">
                    Подъезд {selectedEntrance.number}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddManualModal(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить</span>
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
              </div>
            </div>
          </div>

          {renderResidentsList()}
        </div>
      )}

      {/* Progress Indicator */}
      {(isCreating || isDeleting || progressMessage) && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 glass-card p-4 max-w-sm shadow-xl animate-fade-in">
          <div className="flex items-center gap-3">
            {(isCreating || isDeleting) && (
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
              </div>
            )}
            {!isCreating && !isDeleting && progressMessage && (
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium text-gray-900">{progressMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Created Accounts Notification */}
      {createdAccounts.length > 0 && !progressMessage && (
        <div className="fixed bottom-4 right-4 z-50 glass-card p-4 max-w-sm shadow-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-green-800">
                Обработано {createdAccounts.length} аккаунтов
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
                  <>Формат пароля: <code className="bg-gray-100 px-1 rounded">{selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/[кв]</code></>
                ) : (
                  <>Пароль по умолчанию: <code className="bg-gray-100 px-1 rounded">{DEFAULT_PASSWORD}</code></>
                )}
              </p>
              <button
                onClick={() => setCreatedAccounts([])}
                className="text-sm text-primary-600 hover:text-primary-700 mt-2"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Загрузка данных жителей</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadedData([]);
                  setUploadError('');
                }}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadedData.length === 0 ? (
              <>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-700 mb-2">
                    Загрузите XLS/XLSX файл
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Файл должен содержать столбцы: <strong>Л/С</strong>, <strong>ФИО абонента</strong>, <strong>Адрес</strong>, <strong>Площадь (кв.м)</strong>
                  </p>
                  <button className="btn-primary">
                    Выбрать файл
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {uploadError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {uploadError}
                  </div>
                )}

                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-medium text-gray-700 mb-2">Пример формата файла:</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Л/С</th>
                          <th className="text-left p-2">ФИО абонента</th>
                          <th className="text-left p-2">Адрес</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2">12345678</td>
                          <td className="p-2">Иванов Иван Иванович</td>
                          <td className="p-2">ул. Мустакиллик, 15, кв. 42</td>
                        </tr>
                        <tr>
                          <td className="p-2">12345679</td>
                          <td className="p-2">Петрова Анна Сергеевна</td>
                          <td className="p-2">ул. Мустакиллик, 15, кв. 18</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">
                      Найдено записей: {uploadedData.length}
                    </h3>
                    <button
                      onClick={() => setUploadedData([])}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Загрузить другой файл
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="border-b">
                          <th className="text-left p-3">Л/С</th>
                          <th className="text-left p-3">ФИО абонента</th>
                          <th className="text-left p-3">Адрес</th>
                          <th className="text-left p-3">Площадь, м²</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedData.slice(0, 20).map((row, idx) => (
                          <tr key={idx} className="border-b last:border-b-0">
                            <td className="p-3">{row.personalAccount}</td>
                            <td className="p-3">{row.fullName}</td>
                            <td className="p-3">{row.address}</td>
                            <td className="p-3">{row.totalArea ? `${row.totalArea} м²` : '—'}</td>
                          </tr>
                        ))}
                        {uploadedData.length > 20 && (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-gray-500">
                              и еще {uploadedData.length - 20} записей...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 text-blue-700 rounded-xl mb-4 text-sm">
                  {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
                    <>
                      <strong>Формат пароля:</strong> {selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/[номер квартиры]
                      <br />
                      <span className="text-blue-600">
                        Например: {selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/23 для квартиры 23
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Пароль по умолчанию:</strong> {DEFAULT_PASSWORD}
                      <br />
                      <span className="text-blue-600">
                        Жители смогут изменить пароль в личном кабинете
                      </span>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setUploadedData([])}
                    className="btn-secondary flex-1"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={createAccountsFromData}
                    disabled={isCreating}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Создание...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Создать {uploadedData.length} аккаунтов
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showAddManualModal && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Добавить жителя</h2>
              <button
                onClick={() => setShowAddManualModal(false)}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Л/С (Лицевой счет)</label>
                <input
                  type="text"
                  value={manualForm.personalAccount}
                  onChange={(e) => setManualForm({...manualForm, personalAccount: e.target.value})}
                  className="input-field"
                  placeholder="12345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ФИО абонента *</label>
                <input
                  type="text"
                  value={manualForm.fullName}
                  onChange={(e) => setManualForm({...manualForm, fullName: e.target.value})}
                  className="input-field"
                  placeholder="Иванов Иван Иванович"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
                <input
                  type="text"
                  value={manualForm.address}
                  onChange={(e) => setManualForm({...manualForm, address: e.target.value})}
                  className="input-field"
                  placeholder="ул. Мустакиллик, 15, кв. 42"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input
                  type="tel"
                  value={manualForm.phone}
                  onChange={(e) => setManualForm({...manualForm, phone: e.target.value})}
                  className="input-field"
                  placeholder="+998 90 123 45 67"
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                <strong>Пароль:</strong> {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber
                  ? `${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/[кв]`
                  : DEFAULT_PASSWORD}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddManualModal(false)}
                className="btn-secondary flex-1"
              >
                Отмена
              </button>
              <button
                onClick={handleManualAdd}
                disabled={!manualForm.fullName}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                Создать аккаунт
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resident Card Modal */}
      {showResidentCard && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Карточка жителя</h2>
              <button
                onClick={() => {
                  setShowResidentCard(null);
                  setEditingPassword(false);
                  setNewPassword('');
                }}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {showResidentCard.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">{showResidentCard.name}</h3>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Key className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-xs text-blue-600 font-medium">Л/С (Логин)</div>
                      <div className="font-mono font-bold text-blue-900">{showResidentCard.login}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(showResidentCard.login)}
                    className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Копировать"
                  >
                    <Copy className="w-4 h-4 text-blue-600" />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Key className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Пароль</div>
                      {!editingPassword ? (
                        <div className="font-mono font-bold text-gray-900 flex items-center gap-2">
                          {showPassword ? getResidentPassword(showResidentCard) : '••••••••'}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowPassword(!showPassword);
                            }}
                            className="p-2 hover:bg-gray-200 active:bg-gray-300 rounded touch-manipulation z-10"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Новый пароль"
                          className="input-field text-sm py-1 px-2 w-40"
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!editingPassword ? (
                      <>
                        <button
                          onClick={() => copyToClipboard(getResidentPassword(showResidentCard))}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Копировать"
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(true);
                            setNewPassword(getResidentPassword(showResidentCard));
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Изменить пароль"
                        >
                          <Edit3 className="w-4 h-4 text-gray-600" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            if (newPassword.length >= 4 && showResidentCard.id) {
                              try {
                                // Save to database
                                await usersApi.adminChangePassword(showResidentCard.id, newPassword);
                                // Also save locally for display
                                updateUserPassword(showResidentCard.login, newPassword);
                                setEditingPassword(false);
                                setShowPassword(true);
                              } catch (err: any) {
                                alert('Ошибка сохранения пароля: ' + err.message);
                              }
                            }
                          }}
                          disabled={newPassword.length < 4}
                          className="p-2 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                          title="Сохранить"
                        >
                          <Save className="w-4 h-4 text-green-600" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(false);
                            setNewPassword('');
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Отмена"
                        >
                          <X className="w-4 h-4 text-gray-600" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingPassword && newPassword.length > 0 && newPassword.length < 4 && (
                  <p className="text-xs text-red-500 mt-1 ml-13">Минимум 4 символа</p>
                )}
              </div>

              {showResidentCard.address && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Адрес</div>
                      <div className="font-medium text-gray-900">{showResidentCard.address}</div>
                    </div>
                  </div>
                </div>
              )}

              {showResidentCard.apartment && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Home className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Квартира / Помещение</div>
                      <div className="font-bold text-gray-900">{showResidentCard.apartment}</div>
                    </div>
                  </div>
                </div>
              )}

              {showResidentCard.phone && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Phone className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Телефон</div>
                      <div className="font-medium text-gray-900">{showResidentCard.phone}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm({ login: showResidentCard.login, name: showResidentCard.name })}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Удалить
              </button>
              <button
                onClick={() => setShowResidentCard(null)}
                className="btn-primary flex-1"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-center mb-2">
              Удалить жителя?
            </h3>
            <p className="text-gray-500 text-center text-sm mb-2">
              {deleteConfirm.name}
            </p>
            <p className="text-gray-400 text-center text-xs mb-6">
              Это действие нельзя отменить. Житель потеряет доступ к системе.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={() => handleDeleteResident(deleteConfirm.login)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Удаление...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {deleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-center mb-2">
              Удалить всех жителей?
            </h3>
            <p className="text-gray-500 text-center text-sm mb-2">
              Будет удалено: <strong>{filteredResidents.length}</strong> жителей
            </p>
            <p className="text-gray-400 text-center text-xs mb-6">
              Это действие нельзя отменить. Все жители потеряют доступ к системе.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteAllConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteAllResidents}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Удаление...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Удалить всех
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
