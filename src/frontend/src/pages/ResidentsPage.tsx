import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Building2, Users, Upload, FileSpreadsheet, X, Check, Search,
  MapPin, UserPlus, Key, Copy, Trash2, Edit3, Eye, EyeOff, Save,
  AlertCircle, ChevronRight, Home, CheckCircle, Phone, Loader2, RefreshCw,
  GitBranch, ArrowLeft, DoorOpen, LogIn, Car, FileText, Shield
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { useCRMStore } from '../stores/crmStore';
import { useAuthStore } from '../stores/authStore';
import { authApi, usersApi, apiRequest } from '../services/api';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import type { BuildingFull } from '../types';
import { useBackGuard } from '../hooks/useBackGuard';

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
  contract_signed_at?: string;
  password_changed_at?: string;
  last_login_at?: string;
  vehicle_count?: number;
}

// Excel parser interface
interface ExcelRow {
  personalAccount: string;
  fullName: string;
  address: string;
  totalArea?: number; // Площадь квартиры в кв.м
  entrance?: string;  // Подъезд — из колонки Excel или извлечённый из адреса
  floor?: string;     // Этаж — из колонки Excel
}

export function ResidentsPage() {
  const { buildings, fetchBuildings } = useCRMStore();
  const { addMockUser, additionalUsers, removeUser, updateUserPassword, getUserPassword, user: currentUser } = useAuthStore();
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);

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
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameToast, setNameToast] = useState('');
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

  // Intercept browser/hardware back so it follows the logical hierarchy
  useBackGuard(viewLevel !== 'branches', handleBack);

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
    // Prioritize building.buildingNumber (canonical "5/А") over address extraction ("5а")
    let bldg = building.buildingNumber ? building.buildingNumber.toUpperCase() : '';
    if (!bldg && address) {
      bldg = extractBuildingFromAddress(address);
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
      // Prioritize buildingNumber (canonical "5/А") over address extraction ("5а")
      const bldgNum = residentBuilding?.buildingNumber?.toUpperCase() || buildingFromAddress || '';
      if (bldgNum) {
        return `${residentBuilding.branchCode.toUpperCase()}/${bldgNum}/${apartmentNumber}`;
      }
    }

    if (resident.branch && (resident.building || buildingFromAddress)) {
      const bldgNum = resident.building?.toUpperCase() || buildingFromAddress || '';
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
        createdAt: r.created_at,
        contract_signed_at: r.contract_signed_at,
        password_changed_at: r.password_changed_at,
        last_login_at: r.last_login_at,
        vehicle_count: r.vehicle_count,
      }))
    : localResidents;

  // Filter residents by selected entrance
  const buildingResidents = selectedEntrance
    ? selectedEntrance.number === 0
      ? allResidents.filter(r => r.buildingId === selectedBuilding?.id && !r.entrance)
      : allResidents.filter(r =>
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

    // Use actual entrance ranges defined by manager if available
    if (entrances.length > 0) {
      const sortedEntrances = [...entrances].sort((a, b) => a.number - b.number);
      for (const ent of sortedEntrances) {
        const from = ent.apartments_from ?? 1;
        const to = ent.apartments_to ?? Infinity;
        if (aptNum >= from && aptNum <= to) {
          // Compute floor within this entrance
          const floorsFrom = ent.floors_from ?? 1;
          const floorsTo = ent.floors_to ?? 9;
          const totalApts = to - from + 1;
          const totalFloors = floorsTo - floorsFrom + 1;
          const aptsPerFloor = Math.ceil(totalApts / totalFloors);
          const posInEntrance = aptNum - from;
          const floorIndex = Math.floor(posInEntrance / aptsPerFloor);
          const floor = floorsFrom + floorIndex;
          return { entrance: String(ent.number), floor: String(floor) };
        }
      }
    }

    // Fallback heuristic (when no entrances configured)
    const apartmentsPerFloor = 4;
    const floorsPerEntrance = 9;
    const apartmentsPerEntrance = apartmentsPerFloor * floorsPerEntrance;
    const entrance = Math.ceil(aptNum / apartmentsPerEntrance);
    const positionInEntrance = (aptNum - 1) % apartmentsPerEntrance;
    const floor = Math.floor(positionInEntrance / apartmentsPerFloor) + 1;
    return { entrance: String(entrance), floor: String(floor) };
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
        setUploadError(language === 'ru' ? 'Файл пустой или имеет неверный формат' : 'Fayl bo\'sh yoki noto\'g\'ri formatda');
        return;
      }

      const rows = parseExcelData(jsonData as unknown as string[][]);

      if (rows.length === 0) {
        setUploadError(language === 'ru' ? 'Не удалось найти данные. Проверьте формат файла.' : 'Ma\'lumotlar topilmadi. Fayl formatini tekshiring.');
        return;
      }

      setUploadedData(rows);
    } catch {
      setUploadError(language === 'ru' ? 'Ошибка при чтении файла' : 'Faylni o\'qishda xatolik');
    }

    if (event.target) {
      event.target.value = '';
    }
  }, [language]);

  // Extract entrance number from address string
  // Handles: "подъезд 2", "под. 2", "пд. 2", "п/д 2", "kirish 2", "k/ch 2"
  const extractEntranceFromAddress = (address: string): string => {
    const m = address.match(/(?:подъезд|под\.?|пд\.?|п\/д|kirish|k\/ch)\s*(\d+)/i);
    return m ? m[1] : '';
  };

  // Parse Excel data
  const parseExcelData = (data: string[][]): ExcelRow[] => {
    if (data.length < 1) return [];

    let headerRowIndex = -1;
    let accountCol = -1;
    let nameCol = -1;
    let addressCol = -1;
    let areaCol = -1;
    let entranceCol = -1;
    let floorCol = -1;

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

      const acc = findColumnInRow(row, ['л/с', 'лицевой', 'л.с', 'лс', 'hisob raqami', 'hisob', 'sh/h', 'sh h', 'шахсий']);
      const name = findColumnInRow(row, ['фио', 'абонент', 'f.i.sh', 'fish', 'f.i.o', 'fio', 'abonent', 'ism']);
      const addr = findColumnInRow(row, ['адрес', 'manzil', 'манзил']);
      const area = findColumnInRow(row, ['площадь', 'кв.м', 'кв м', 's кв', 'sкв', 'общая площадь', 'maydon', 'майдон', 'kv.m', 'kv m', 'm²', 'm2']);
      const entr = findColumnInRow(row, ['подъезд', 'под.', 'пд.', 'п/д', 'kirish', 'entrance', 'podyezd']);
      const fl   = findColumnInRow(row, ['этаж', 'этажность', 'etaj', 'qavat', 'floor']);

      const foundCount = [acc, name, addr].filter(x => x >= 0).length;
      if (foundCount >= 2) {
        headerRowIndex = i;
        accountCol = acc;
        nameCol = name;
        addressCol = addr;
        areaCol = area;
        entranceCol = entr;
        floorCol = fl;
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
          const hasDecimal = String(rawValue).includes('.') || String(rawValue).includes(',');
          if (!hasDecimal && parsed > 1000) {
            parsed = parsed / 100;
          }
          if (parsed > 500 && !hasDecimal) {
            parsed = parsed / 10;
          }
          totalArea = Math.round(parsed * 100) / 100;
        }
      }

      if (!fullName) continue;
      const nameLower = fullName.toLowerCase();
      if (nameLower.includes('фио') || nameLower.includes('абонент') || nameLower.includes('f.i.sh') || nameLower.includes('f.i.o') || nameLower.includes('abonent') || nameLower.includes('fish')) continue;

      // Extract entrance: explicit column → address field → leave empty (will calc from apt later)
      let entrance: string | undefined;
      if (entranceCol >= 0 && row[entranceCol]) {
        const eStr = String(row[entranceCol]).trim().replace(/[^\d]/g, '');
        if (eStr) entrance = eStr;
      }
      if (!entrance && address) {
        const fromAddr = extractEntranceFromAddress(address);
        if (fromAddr) entrance = fromAddr;
      }

      // Extract floor from explicit column if present
      let floor: string | undefined;
      if (floorCol >= 0 && row[floorCol]) {
        const fStr = String(row[floorCol]).trim().replace(/[^\d]/g, '');
        if (fStr) floor = fStr;
      }

      rows.push({
        personalAccount,
        fullName,
        address: address || selectedBuilding?.address || '',
        totalArea,
        entrance,
        floor,
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
      const { entrance: calcEntrance, floor: calcFloor } = calculateEntranceAndFloor(apartment);

      // Entrance priority for BULK import:
      //   1. Explicit column in Excel file (row.entrance)
      //   2. Entrance extracted from address field (already in row.entrance via parseExcelData)
      //   3. Calculated from apartment number using building layout heuristic
      // NOTE: selectedEntrance is intentionally NOT used here — it reflects the current
      // UI navigation state and must not override individual apartment assignments.
      const entrance = row.entrance || calcEntrance;
      const floor    = row.floor    || calcFloor;

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
        ? (language === 'ru'
            ? `Нет новых пользователей для создания. Пропущено ${skippedNonResidential} нежилых помещений.`
            : `Yangi foydalanuvchilar yo'q. ${skippedNonResidential} ta noturar joy o'tkazib yuborildi.`)
        : (language === 'ru' ? 'Нет новых пользователей для создания' : 'Yangi foydalanuvchilar yo\'q');
      setUploadError(message);
      return;
    }

    // Build entrance distribution summary (for success message)
    const byEntrance: Record<string, number> = {};
    usersToCreate.forEach(u => {
      const key = u.entrance ? (language === 'ru' ? `пд.${u.entrance}` : `kir.${u.entrance}`) : (language === 'ru' ? 'без подъезда' : 'kirish yo\'q');
      byEntrance[key] = (byEntrance[key] || 0) + 1;
    });
    const distributionStr = Object.entries(byEntrance)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    setIsCreating(true);
    setProgressMessage(language === 'ru' ? `Создание ${usersToCreate.length} аккаунтов...` : `${usersToCreate.length} ta akkaunt yaratilmoqda...`);

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
      setProgressMessage(language === 'ru'
        ? `Готово! Создано: ${createdCount}, Обновлено: ${updatedCount}. Распределение: ${distributionStr}`
        : `Tayyor! Yaratildi: ${createdCount}, Yangilandi: ${updatedCount}. Taqsimot: ${distributionStr}`);

      if (selectedBuilding) {
        await fetchResidents(selectedBuilding.id);
      }

      setTimeout(() => setProgressMessage(''), 6000);
    } catch (error: any) {
      setUploadError(error.message || (language === 'ru' ? 'Ошибка при массовой регистрации' : 'Ommaviy ro\'yxatdan o\'tishda xatolik'));
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
    const { entrance: calcEntrance, floor: calcFloor } = calculateEntranceAndFloor(apartment);
    // Selected entrance takes priority over calculated entrance
    const entrance = selectedEntrance ? String(selectedEntrance.number) : calcEntrance;
    const floor = calcFloor || '';
    const buildingId = selectedBuilding?.id || '';
    const residentAddress = manualForm.address || selectedBuilding?.address || '';
    const password = generatePassword(selectedBuilding, apartment, residentAddress);

    setIsCreating(true);
    setProgressMessage(language === 'ru' ? 'Создание аккаунта...' : 'Akkaunt yaratilmoqda...');

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
        entrance,
        floor,
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
        entrance,
        floor,
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

      setProgressMessage(language === 'ru' ? 'Аккаунт создан!' : 'Akkaunt yaratildi!');
      setTimeout(() => setProgressMessage(''), 2000);
    } catch (error: any) {
      console.error('Manual registration error:', error);
      addToast('error', (language === 'ru' ? 'Ошибка создания: ' : 'Yaratishda xatolik: ') + (error.message || (language === 'ru' ? 'Неизвестная ошибка' : 'Noma\'lum xatolik')));
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
      // Immediately remove from UI (optimistic update)
      removeUser(login);
      setApiResidents(prev => prev.filter(r => r.login !== login));
      setDeleteConfirm(null);
      setShowResidentCard(null);
      setIsDeleting(false);
      // Refetch in background for consistency
      if (selectedBuilding) {
        fetchResidents(selectedBuilding.id);
      }
    } catch (err) {
      console.error('Failed to delete resident:', err);
      addToast('error', (language === 'ru' ? 'Ошибка при удалении: ' : 'O\'chirishda xatolik: ') + (err as Error).message);
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // Delete all residents
  const handleDeleteAllResidents = async () => {
    setIsDeleting(true);
    setProgressMessage(language === 'ru' ? `Удаление ${filteredResidents.length} жителей...` : `${filteredResidents.length} ta yashovchi o'chirilmoqda...`);
    let deletedCount = 0;
    const total = filteredResidents.length;

    try {
      for (let i = 0; i < filteredResidents.length; i++) {
        const resident = filteredResidents[i];
        setProgressMessage(language === 'ru'
          ? `Удаление ${i + 1}/${total}: ${resident.name.split(' ')[0]}...`
          : `O'chirish ${i + 1}/${total}: ${resident.name.split(' ')[0]}...`);

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

      setProgressMessage(language === 'ru' ? `Удалено ${deletedCount} жителей` : `${deletedCount} ta yashovchi o'chirildi`);

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
        <div className="flex items-center gap-2 input-field">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск по имени, телефону, квартире...' : 'Ism, telefon, xonadon bo\'yicha qidirish...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      {/* Residents count and actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {language === 'ru' ? 'Найдено' : 'Topildi'}: <strong>{filteredResidents.length}</strong> {language === 'ru' ? 'жителей' : 'yashovchi'}
        </div>
        {filteredResidents.length > 0 && (
          <button
            onClick={() => setDeleteAllConfirm(true)}
            className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            {language === 'ru' ? 'Удалить всех' : 'Hammasini o\'chirish'}
          </button>
        )}
      </div>

      {/* List */}
      {isLoadingResidents ? (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
          <p className="text-gray-500">{language === 'ru' ? 'Загрузка жителей...' : 'Yashovchilar yuklanmoqda...'}</p>
        </div>
      ) : filteredResidents.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет жильцов' : 'Aholilar yo\'q'}
          description={language === 'ru' ? 'Загрузите Excel файл с данными жителей' : 'Yashovchilar ma\'lumotlari bilan Excel faylni yuklang'}
        />
      ) : (
        filteredResidents.map((resident) => {
          const hasContract = !!(resident as any).contract_signed_at;
          const hasVehicle = ((resident as any).vehicle_count || 0) > 0;
          const hasPhone = !!resident.phone;
          const hasChangedPassword = !!(resident as any).password_changed_at;
          const hasLoggedIn = !!(resident as any).last_login_at;
          const completedTasks = [hasContract, hasVehicle, hasPhone, hasChangedPassword, hasLoggedIn].filter(Boolean).length;
          const totalTasks = 5;

          return (
          <div
            key={resident.login}
            className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => {
              setShowResidentCard(resident);
              setEditingPassword(false);
              setNewPassword('');
              setShowPassword(false);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-lg font-medium text-white shadow-sm">
                    {resident.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  {completedTasks === totalTasks && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900">{resident.name}</h3>
                  <div className="flex items-center flex-wrap gap-2 text-sm mt-1">
                    <span className="flex items-center gap-1 bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-mono text-xs">
                      <Key className="w-3 h-3" />
                      {resident.login}
                    </span>
                    {resident.apartment && (
                      <span className="flex items-center gap-1 text-gray-500">
                        <Home className="w-3.5 h-3.5" />
                        {language === 'ru' ? 'кв.' : 'xon.'} {resident.apartment}
                      </span>
                    )}
                  </div>
                  {resident.address && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{resident.address}</span>
                    </div>
                  )}
                  {/* Progress badges */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {/* Contract signed */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasContract ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasContract ? (language === 'ru' ? 'Договор подписан' : 'Shartnoma imzolangan') : (language === 'ru' ? 'Договор не подписан' : 'Shartnoma imzolanmagan')}>
                      <FileText className={`w-3 h-3 ${hasContract ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Has vehicle */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasVehicle ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasVehicle ? (language === 'ru' ? 'Автомобиль добавлен' : 'Avtomobil qo\'shilgan') : (language === 'ru' ? 'Нет автомобиля' : 'Avtomobil yo\'q')}>
                      <Car className={`w-3 h-3 ${hasVehicle ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Phone */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasPhone ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasPhone ? (language === 'ru' ? `Телефон: ${resident.phone}` : `Telefon: ${resident.phone}`) : (language === 'ru' ? 'Телефон не указан' : 'Telefon ko\'rsatilmagan')}>
                      <Phone className={`w-3 h-3 ${hasPhone ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Password changed */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasChangedPassword ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasChangedPassword ? (language === 'ru' ? 'Пароль изменён' : 'Parol o\'zgartirilgan') : (language === 'ru' ? 'Пароль не менялся' : 'Parol o\'zgartirilmagan')}>
                      <Shield className={`w-3 h-3 ${hasChangedPassword ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    {/* Logged in */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasLoggedIn ? 'bg-green-100' : 'bg-gray-100 opacity-40'}`}
                      title={hasLoggedIn ? `${language === 'ru' ? 'Последний вход' : 'Oxirgi kirish'}: ${new Date((resident as any).last_login_at).toLocaleDateString('ru-RU')}` : (language === 'ru' ? 'Ещё не входил в систему' : 'Hali tizimga kirmagan')}>
                      <LogIn className={`w-3 h-3 ${hasLoggedIn ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <span className="text-xs text-gray-400 ml-1">{completedTasks}/{totalTasks}</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{language === 'ru' ? 'Жители' : 'Yashovchilar'}</h1>
          <p className="text-gray-500 mt-1">{language === 'ru' ? 'Управление аккаунтами жителей' : 'Yashovchilar akkauntlarini boshqarish'}</p>
        </div>
      </div>

      {/* Step 1: Branch Selection */}
      {viewLevel === 'branches' && (
        <div className="flex-1 flex flex-col items-center gap-6 pt-6">
          {isLoadingBranches ? (
            <div className="glass-card p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
              <p className="text-gray-500">{language === 'ru' ? 'Загрузка филиалов...' : 'Filiallar yuklanmoqda...'}</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Филиалы не найдены' : 'Filiallar topilmadi'}</h3>
              <p className="text-gray-400 mt-1">
                {language === 'ru' ? 'Добавьте филиалы в разделе "Дома/Объекты"' : '"Uylar/Obyektlar" bo\'limida filiallar qo\'shing'}
              </p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-[28px] font-black tracking-tight">{language === 'ru' ? 'Выберите филиал' : 'Filialni tanlang'}</h1>
                <p className="text-[14px] text-gray-400 mt-2">{language === 'ru' ? 'Нажмите на филиал чтобы перейти к жителям' : "Yashovchilarga o'tish uchun filialni bosing"}</p>
              </div>

              {/* Search */}
              <div className="w-full max-w-[700px]">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl">
                  <Search className="w-4 h-4 text-gray-300" />
                  <input
                    type="text"
                    placeholder={language === 'ru' ? 'Поиск по филиалам...' : "Filiallar bo'yicha qidirish..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1100px] w-full">
                {branches.filter(b => !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.code.toLowerCase().includes(searchQuery.toLowerCase())).map((branch) => (
                  <div
                    key={branch.id}
                    onClick={() => handleBranchClick(branch)}
                    className="bg-white rounded-2xl border-2 border-gray-200 cursor-pointer transition-all hover:border-orange-400 hover:-translate-y-1 hover:shadow-lg group overflow-hidden"
                  >
                    {/* Branch header with gradient */}
                    <div className="h-28 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A2A6C 0%, #2D4A8C 50%, #3D5A9C 100%)' }}>
                      {/* Mini cityscape silhouette */}
                      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-6">
                        {[5,8,6,10,7,9,4,8,6,11,5,7,9,6,8,5,10,7].map((h, i) => (
                          <div key={i} className="rounded-t-[2px]" style={{ width: 12, height: h * 3.5, background: 'rgba(255,255,255,.1)' }} />
                        ))}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />
                        <div className="text-[17px] font-extrabold truncate">{branch.name}</div>
                      </div>
                      <div className="text-[13px] text-gray-400 mb-4 ml-[24px]">
                        {branch.address || (language === 'ru' ? 'Ташкент' : 'Toshkent')}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                            <Building2 className="w-4.5 h-4.5 text-green-600" />
                          </div>
                          <div>
                            <div className="text-[20px] font-extrabold text-green-600 leading-tight">{branch.buildings_count}</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{language === 'ru' ? 'Домов' : 'Uylar'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                            <Users className="w-4.5 h-4.5 text-orange-500" />
                          </div>
                          <div>
                            <div className="text-[20px] font-extrabold text-orange-500 leading-tight">{branch.residents_count}</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{language === 'ru' ? 'Жителей' : 'Yashovchilar'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Building Selection */}
      {viewLevel === 'buildings' && selectedBranch && (
        <div>
          {/* Branch Header */}
          <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold">{selectedBranch.code}</span>
              </div>
              <div>
                <h2 className="font-semibold">{selectedBranch.name}</h2>
                <p className="text-sm text-gray-500">{language === 'ru' ? 'Выберите дом' : 'Uyni tanlang'}</p>
              </div>
            </div>
          </div>

          {filteredBuildings.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Дома не найдены' : 'Uylar topilmadi'}</h3>
              <p className="text-gray-400 mt-1">
                {language === 'ru' ? 'Добавьте дома в этот филиал в разделе "Дома/Объекты"' : 'Bu filialga "Uylar/Obyektlar" bo\'limida uylar qo\'shing'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBuildings.map((building) => (
                <button
                  key={building.id}
                  onClick={() => handleBuildingClick(building)}
                  className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                        <Home className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{language === 'ru' ? 'Дом' : 'Uy'} {building.buildingNumber || building.name}</h3>
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
                      <span>{building.totalApartments} {language === 'ru' ? 'кв.' : 'xon.'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DoorOpen className="w-4 h-4 text-gray-400" />
                      <span>{building.entrances} {language === 'ru' ? 'подъездов' : 'podyezd'}</span>
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
          <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
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
                    {language === 'ru' ? 'Филиалы' : 'Filiallar'}
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
                    {language === 'ru' ? 'Дом' : 'Uy'} {selectedBuilding.buildingNumber || selectedBuilding.name}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddManualModal(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{language === 'ru' ? 'Добавить' : 'Qo\'shish'}</span>
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
              <p className="text-gray-500">{language === 'ru' ? 'Загрузка подъездов...' : 'Podyezdlar yuklanmoqda...'}</p>
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
                    className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl flex items-center justify-center">
                          <DoorOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{language === 'ru' ? 'Подъезд' : 'Podyezd'} {entrance.number}</h3>
                          <div className="text-sm text-gray-500">
                            {entrance.floors_from && entrance.floors_to && (
                              <span>{language === 'ru' ? 'Этажи' : 'Qavatlar'} {entrance.floors_from}-{entrance.floors_to}</span>
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
                          <span>{language === 'ru' ? 'кв.' : 'xon.'} {entrance.apartments_from}-{entrance.apartments_to}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>{entranceResidents.length} {language === 'ru' ? 'жителей' : 'yashovchi'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Show card for residents without entrance */}
              {(() => {
                const unassignedResidents = allResidents.filter(r =>
                  r.buildingId === selectedBuilding.id && !r.entrance
                );
                if (unassignedResidents.length === 0) return null;
                return (
                  <button
                    onClick={() => {
                      setSelectedEntrance({ id: 'unassigned', building_id: selectedBuilding.id, number: 0 } as Entrance);
                      setViewLevel('residents');
                      setSearchQuery('');
                    }}
                    className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl text-left hover:shadow-lg transition-shadow group border-dashed border-2 border-gray-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center">
                          <AlertCircle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-500">{language === 'ru' ? 'Без подъезда' : 'Podyezdsiz'}</h3>
                          <div className="text-sm text-gray-400">{language === 'ru' ? 'Не привязаны к подъезду' : 'Podyezdga biriktirilmagan'}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500 transition-colors" />
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>{unassignedResidents.length} {language === 'ru' ? 'жителей' : 'yashovchi'}</span>
                      </div>
                    </div>
                  </button>
                );
              })()}
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
          <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl mb-4">
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
                    {language === 'ru' ? 'Филиалы' : 'Filiallar'}
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
                    {language === 'ru' ? 'Дом' : 'Uy'} {selectedBuilding.buildingNumber || selectedBuilding.name}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <span className="font-medium text-gray-900">
                    {language === 'ru' ? 'Подъезд' : 'Podyezd'} {selectedEntrance.number}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddManualModal(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{language === 'ru' ? 'Добавить' : 'Qo\'shish'}</span>
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
                {language === 'ru'
                  ? `Обработано ${createdAccounts.length} аккаунтов`
                  : `${createdAccounts.length} ta akkaunt qayta ishlandi`}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
                  <>{language === 'ru' ? 'Формат пароля' : 'Parol formati'}: <code className="bg-gray-100 px-1 rounded">{selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/{language === 'ru' ? '[кв]' : '[xon]'}</code></>
                ) : (
                  <>{language === 'ru' ? 'Пароль по умолчанию' : 'Standart parol'}: <code className="bg-gray-100 px-1 rounded">{DEFAULT_PASSWORD}</code></>
                )}
              </p>
              <button
                onClick={() => setCreatedAccounts([])}
                className="text-sm text-primary-600 hover:text-primary-700 mt-2"
              >
                {language === 'ru' ? 'Понятно' : 'Tushunarli'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-backdrop items-end sm:items-center">
          <div className="modal-content p-4 sm:p-6 w-full max-w-2xl sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{language === 'ru' ? 'Загрузка данных жителей' : 'Yashovchilar ma\'lumotlarini yuklash'}</h2>
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
                    {language === 'ru' ? 'Загрузите XLS/XLSX файл' : 'XLS/XLSX faylni yuklang'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {language === 'ru'
                      ? <>Файл должен содержать столбцы: <strong>Л/С</strong>, <strong>ФИО абонента</strong>, <strong>Адрес</strong>, <strong>Площадь (кв.м)</strong></>
                      : <>Faylda ustunlar bo'lishi kerak: <strong>Sh/H</strong>, <strong>F.I.O.</strong>, <strong>Manzil</strong>, <strong>Maydon (kv.m)</strong></>
                    }
                  </p>
                  <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                    {language === 'ru' ? 'Выбрать файл' : 'Faylni tanlash'}
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
                  <h4 className="font-medium text-gray-700 mb-2">{language === 'ru' ? 'Пример формата файла:' : 'Fayl formati namunasi:'}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">{language === 'ru' ? 'Л/С' : 'Sh/H'}</th>
                          <th className="text-left p-2">{language === 'ru' ? 'ФИО абонента' : 'Abonent F.I.O.'}</th>
                          <th className="text-left p-2">{language === 'ru' ? 'Адрес' : 'Manzil'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2">12345678</td>
                          <td className="p-2">{language === 'ru' ? 'Иванов Иван Иванович' : 'Ivanov Ivan Ivanovich'}</td>
                          <td className="p-2">{language === 'ru' ? 'ул. Мустакиллик, 15, кв. 42' : 'Mustaqillik ko\'ch., 15, xon. 42'}</td>
                        </tr>
                        <tr>
                          <td className="p-2">12345679</td>
                          <td className="p-2">{language === 'ru' ? 'Петрова Анна Сергеевна' : 'Petrova Anna Sergeyevna'}</td>
                          <td className="p-2">{language === 'ru' ? 'ул. Мустакиллик, 15, кв. 18' : 'Mustaqillik ko\'ch., 15, xon. 18'}</td>
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
                      {language === 'ru' ? 'Найдено записей' : 'Topilgan yozuvlar'}: {uploadedData.length}
                    </h3>
                    <button
                      onClick={() => setUploadedData([])}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {language === 'ru' ? 'Загрузить другой файл' : 'Boshqa fayl yuklash'}
                    </button>
                  </div>

                  {/* Entrance distribution preview */}
                  {(() => {
                    const dist: Record<string, number> = {};
                    uploadedData.forEach(row => {
                      const apt = extractApartmentFromAddress(row.address);
                      const { entrance: calcE } = calculateEntranceAndFloor(apt);
                      const ent = row.entrance || calcE || (language === 'ru' ? 'без подъезда' : 'kirish yo\'q');
                      dist[ent] = (dist[ent] || 0) + 1;
                    });
                    const entries = Object.entries(dist).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
                    if (entries.length <= 1) return null;
                    return (
                      <div className="mb-3 p-3 bg-blue-50 rounded-xl text-sm">
                        <span className="font-semibold text-blue-700">{language === 'ru' ? 'Распределение по подъездам:' : 'Kirish bo\'yicha taqsimot:'} </span>
                        {entries.map(([k, v]) => (
                          <span key={k} className="inline-block mr-2 text-blue-600">
                            {language === 'ru' ? `пд.${k}` : `kir.${k}`}: <strong>{v}</strong>
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="max-h-64 overflow-y-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="border-b">
                          <th className="text-left p-3">{language === 'ru' ? 'Л/С' : 'Sh/H'}</th>
                          <th className="text-left p-3">{language === 'ru' ? 'ФИО абонента' : 'Abonent F.I.O.'}</th>
                          <th className="text-left p-3">{language === 'ru' ? 'Кв.' : 'Xon.'}</th>
                          <th className="text-left p-3">{language === 'ru' ? 'Пд.' : 'Kir.'}</th>
                          <th className="text-left p-3">{language === 'ru' ? 'м²' : 'm²'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedData.slice(0, 20).map((row, idx) => {
                          const apt = extractApartmentFromAddress(row.address);
                          const { entrance: calcE } = calculateEntranceAndFloor(apt);
                          const ent = row.entrance || calcE || '—';
                          return (
                            <tr key={idx} className="border-b last:border-b-0">
                              <td className="p-3 text-xs text-gray-500">{row.personalAccount}</td>
                              <td className="p-3">{row.fullName}</td>
                              <td className="p-3 font-mono">{apt || '—'}</td>
                              <td className="p-3 font-semibold text-blue-600">{ent}</td>
                              <td className="p-3">{row.totalArea ? row.totalArea : '—'}</td>
                            </tr>
                          );
                        })}
                        {uploadedData.length > 20 && (
                          <tr>
                            <td colSpan={5} className="p-3 text-center text-gray-500">
                              {language === 'ru' ? `и еще ${uploadedData.length - 20} записей...` : `va yana ${uploadedData.length - 20} ta yozuv...`}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-3 bg-primary-50 text-primary-700 rounded-xl mb-4 text-sm">
                  {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber ? (
                    <>
                      <strong>{language === 'ru' ? 'Формат пароля' : 'Parol formati'}:</strong> {selectedBuilding.branchCode}/{selectedBuilding.buildingNumber}/{language === 'ru' ? '[номер квартиры]' : '[xonadon raqami]'}
                      <br />
                      <span className="text-primary-600">
                        {language === 'ru'
                          ? `Например: ${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/23 для квартиры 23`
                          : `Masalan: ${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/23 — 23-xonadon uchun`}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{language === 'ru' ? 'Пароль по умолчанию' : 'Standart parol'}:</strong> {DEFAULT_PASSWORD}
                      <br />
                      <span className="text-primary-600">
                        {language === 'ru' ? 'Жители смогут изменить пароль в личном кабинете' : 'Yashovchilar parolni shaxsiy kabinetda o\'zgartira oladi'}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setUploadedData([])}
                    className="btn-secondary flex-1"
                  >
                    {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                  </button>
                  <button
                    onClick={createAccountsFromData}
                    disabled={isCreating}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'ru' ? 'Создание...' : 'Yaratilmoqda...'}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        {language === 'ru' ? `Создать ${uploadedData.length} аккаунтов` : `${uploadedData.length} ta akkaunt yaratish`}
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
        <div className="modal-backdrop items-end sm:items-center">
          <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}</h2>
              <button
                onClick={() => setShowAddManualModal(false)}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Адрес' : 'Manzil'}</label>
                <input
                  type="text"
                  value={manualForm.address}
                  onChange={(e) => setManualForm({...manualForm, address: e.target.value})}
                  className="input-field"
                  placeholder={language === 'ru' ? 'ул. Мустакиллик, 15, кв. 42' : 'Mustaqillik ko\'ch., 15, xon. 42'}
                />
              </div>

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

              <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                <strong>{language === 'ru' ? 'Пароль' : 'Parol'}:</strong> {selectedBuilding?.branchCode && selectedBuilding?.buildingNumber
                  ? `${selectedBuilding.branchCode}/${selectedBuilding.buildingNumber}/${language === 'ru' ? '[кв]' : '[xon]'}`
                  : DEFAULT_PASSWORD}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddManualModal(false)}
                className="btn-secondary flex-1"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={handleManualAdd}
                disabled={!manualForm.fullName}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {language === 'ru' ? 'Создать аккаунт' : 'Akkaunt yaratish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resident Card Modal */}
      {showResidentCard && (
        <div className="modal-backdrop items-end sm:items-center">
          <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Карточка жителя' : 'Yashovchi kartasi'}</h2>
              <button
                onClick={() => {
                  setShowResidentCard(null);
                  setEditingPassword(false);
                  setNewPassword('');
                  setEditingName(false);
                  setEditNameValue('');
                }}
                className="p-2 hover:bg-white/30 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Toast */}
            {nameToast && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {nameToast}
              </div>
            )}

            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {showResidentCard.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              {!editingName ? (
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{showResidentCard.name}</h3>
                  {['admin', 'director', 'manager', 'super_admin'].includes(currentUser?.role ?? '') && (
                    <button
                      onClick={() => {
                        setEditNameValue(showResidentCard.name);
                        setEditingName(true);
                      }}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                      title={language === 'ru' ? 'Редактировать ФИО' : 'FISh ni tahrirlash'}
                    >
                      <Edit3 className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <input
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    className="input-field text-center text-base font-semibold w-full max-w-xs"
                    placeholder={language === 'ru' ? 'Фамилия Имя Отчество' : 'Familiya Ism Otasining ismi'}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const trimmed = editNameValue.trim();
                        if (!trimmed || !showResidentCard.id) return;
                        setSavingName(true);
                        try {
                          await usersApi.adminChangeName(showResidentCard.id, trimmed);
                          // Update resident card
                          setShowResidentCard(prev => prev ? { ...prev, name: trimmed } : prev);
                          // Update residents list
                          setApiResidents(prev => prev.map(r => r.id === showResidentCard.id ? { ...r, name: trimmed } : r));
                          setEditingName(false);
                          setEditNameValue('');
                          const msg = language === 'ru' ? 'Данные жителя успешно обновлены' : 'Yashovchi ma\'lumotlari muvaffaqiyatli yangilandi';
                          setNameToast(msg);
                          setTimeout(() => setNameToast(''), 3000);
                        } catch (err: any) {
                          addToast('error', (language === 'ru' ? 'Ошибка: ' : 'Xatolik: ') + err.message);
                        } finally {
                          setSavingName(false);
                        }
                      }}
                      disabled={!editNameValue.trim() || savingName}
                      className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50 flex items-center gap-1"
                    >
                      {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                    </button>
                    <button
                      onClick={() => { setEditingName(false); setEditNameValue(''); }}
                      className="btn-secondary text-sm py-1.5 px-4"
                    >
                      {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-4 bg-primary-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                      <Key className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <div className="text-xs text-primary-600 font-medium">{language === 'ru' ? 'Л/С (Логин)' : 'Sh/H (Login)'}</div>
                      <div className="font-mono font-bold text-primary-900">{showResidentCard.login}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(showResidentCard.login)}
                    className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
                    title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                  >
                    <Copy className="w-4 h-4 text-primary-600" />
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
                      <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Пароль' : 'Parol'}</div>
                      {!editingPassword ? (
                        <div className="font-mono font-bold text-gray-900 flex items-center gap-2">
                          {showPassword ? getResidentPassword(showResidentCard) : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
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
                          placeholder={language === 'ru' ? 'Новый пароль' : 'Yangi parol'}
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
                          title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(true);
                            setNewPassword(getResidentPassword(showResidentCard));
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title={language === 'ru' ? 'Изменить пароль' : 'Parolni o\'zgartirish'}
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
                                addToast('error', (language === 'ru' ? 'Ошибка сохранения пароля: ' : 'Parolni saqlashda xatolik: ') + err.message);
                              }
                            }
                          }}
                          disabled={newPassword.length < 4}
                          className="p-2 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                          title={language === 'ru' ? 'Сохранить' : 'Saqlash'}
                        >
                          <Save className="w-4 h-4 text-green-600" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingPassword(false);
                            setNewPassword('');
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                        >
                          <X className="w-4 h-4 text-gray-600" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingPassword && newPassword.length > 0 && newPassword.length < 4 && (
                  <p className="text-xs text-red-500 mt-1 ml-13">{language === 'ru' ? 'Минимум 4 символа' : 'Kamida 4 ta belgi'}</p>
                )}
              </div>

              {showResidentCard.address && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
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
                      <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Квартира / Помещение' : 'Xonadon / Xona'}</div>
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
                      <div className="text-xs text-gray-500 font-medium">{language === 'ru' ? 'Телефон' : 'Telefon'}</div>
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
                {language === 'ru' ? 'Удалить' : 'O\'chirish'}
              </button>
              <button
                onClick={() => setShowResidentCard(null)}
                className="btn-primary flex-1"
              >
                {language === 'ru' ? 'Закрыть' : 'Yopish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {/* TODO: Refactor to use <Modal> component */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-center mb-2">
              {language === 'ru' ? 'Удалить жителя?' : 'Yashovchini o\'chirishni tasdiqlaysizmi?'}
            </h3>
            <p className="text-gray-500 text-center text-sm mb-2">
              {deleteConfirm.name}
            </p>
            <p className="text-gray-400 text-center text-xs mb-6">
              {language === 'ru' ? 'Это действие нельзя отменить. Житель потеряет доступ к системе.' : 'Bu amalni bekor qilib bo\'lmaydi. Yashovchi tizimga kirishni yo\'qotadi.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={() => handleDeleteResident(deleteConfirm.login)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {language === 'ru' ? 'Удаление...' : 'O\'chirilmoqda...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {language === 'ru' ? 'Удалить' : 'O\'chirish'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {deleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-center mb-2">
              {language === 'ru' ? 'Удалить всех жителей?' : 'Barcha yashovchilarni o\'chirishni tasdiqlaysizmi?'}
            </h3>
            <p className="text-gray-500 text-center text-sm mb-2">
              {language === 'ru' ? 'Будет удалено' : 'O\'chiriladi'}: <strong>{filteredResidents.length}</strong> {language === 'ru' ? 'жителей' : 'yashovchi'}
            </p>
            <p className="text-gray-400 text-center text-xs mb-6">
              {language === 'ru' ? 'Это действие нельзя отменить. Все жители потеряют доступ к системе.' : 'Bu amalni bekor qilib bo\'lmaydi. Barcha yashovchilar tizimga kirishni yo\'qotadi.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteAllConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={handleDeleteAllResidents}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {language === 'ru' ? 'Удаление...' : 'O\'chirilmoqda...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {language === 'ru' ? 'Удалить всех' : 'Hammasini o\'chirish'}
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
