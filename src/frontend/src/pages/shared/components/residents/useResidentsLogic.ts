import { useState, useRef, useCallback, useEffect } from 'react';
import { useCRMStore } from '../../../../stores/crmStore';
import { useAuthStore } from '../../../../stores/authStore';
import { authApi, usersApi, vehiclesApi, apiRequest } from '../../../../services/api';
import { useLanguageStore } from '../../../../stores/languageStore';
import { useToastStore } from '../../../../stores/toastStore';
import type { BuildingFull } from '../../../../types';
import { useBackGuard } from '../../../../hooks/useBackGuard';
import type {
  Branch,
  Entrance,
  ViewLevel,
  ApiResident,
  ExcelRow,
  MappedResident,
  ResidentCardData,
} from './types';

export function useResidentsLogic() {
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
  const [showResidentCard, setShowResidentCard] = useState<ResidentCardData | null>(null);
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

  // Manual add resident form
  const [manualForm, setManualForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    personalAccount: '',
  });

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

  // Extract building number from address
  const extractBuildingFromAddress = (address: string): string => {
    if (!address) return '';
    const buildingPattern = '(\\d+(?:[/\\-]\\d+)?[А-Яа-яA-Za-z]?)';
    const uzMatch = address.match(new RegExp(buildingPattern + '-уй|уй\\s*' + buildingPattern, 'i'));
    if (uzMatch) {
      const num = (uzMatch[1] || uzMatch[2]).toUpperCase();
      return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
    }
    const ruMatch = address.match(new RegExp('(?:дом|д\\.?)\\s*' + buildingPattern, 'i'));
    if (ruMatch) {
      const num = ruMatch[1].toUpperCase();
      return num.replace(/Б/gi, 'B').replace(/А/gi, 'A');
    }
    return '';
  };

  // Generate password
  const generatePassword = (building: BuildingFull | null, apartment: string, address?: string): string => {
    if (!building?.branchCode) return DEFAULT_PASSWORD;
    const branch = building.branchCode.toUpperCase();
    let bldg = building.buildingNumber ? building.buildingNumber.toUpperCase() : '';
    if (!bldg && address) bldg = extractBuildingFromAddress(address);
    if (!bldg) return DEFAULT_PASSWORD;
    const apt = apartment || '0';
    return `${branch}/${bldg}/${apt}`;
  };

  // Get password for resident
  const getResidentPassword = (resident: ResidentCardData): string => {
    const storedPassword = getUserPassword(resident.login);
    if (storedPassword) return storedPassword;
    const residentBuilding = buildings.find(b => b.id === (resident as any).buildingId) || selectedBuilding;
    const apartmentFromAddress = resident.address ? extractApartmentFromAddress(resident.address) : '';
    const apartmentNumber = resident.apartment || apartmentFromAddress || '0';
    const buildingFromAddress = resident.address ? extractBuildingFromAddress(resident.address) : '';

    if (residentBuilding?.branchCode) {
      const bldgNum = residentBuilding?.buildingNumber?.toUpperCase() || buildingFromAddress || '';
      if (bldgNum) return `${residentBuilding.branchCode.toUpperCase()}/${bldgNum}/${apartmentNumber}`;
    }

    if (resident.branch && (resident.building || buildingFromAddress)) {
      const bldgNum = resident.building?.toUpperCase() || buildingFromAddress || '';
      return `${resident.branch.toUpperCase()}/${bldgNum}/${apartmentNumber}`;
    }

    return DEFAULT_PASSWORD;
  };

  // Get local residents
  const localResidents: MappedResident[] = Object.entries(additionalUsers)
    .filter(([_, data]) => data.user.role === 'resident')
    .map(([userLogin, data]) => ({
      ...data.user,
      login: userLogin,
      password: data.password
    }));

  // Use API residents as primary source
  const allResidents: MappedResident[] = apiResidents.length > 0
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

  // Extract apartment from address
  const extractApartmentFromAddress = (address: string): string => {
    const uzMatch = address.match(/(\d+)-хонадон|хонадон\s*(\d+)/i);
    if (uzMatch) return uzMatch[1] || uzMatch[2];
    const ruMatch = address.match(/(?:кв\.?|kv\.?|квартира|apt\.?)\s*(\d+)/i);
    if (ruMatch) return ruMatch[1];
    const lastNumberMatch = address.match(/,\s*(\d+)\s*$/);
    if (lastNumberMatch) return lastNumberMatch[1];
    return '';
  };

  // Calculate entrance and floor
  const calculateEntranceAndFloor = (apartment: string): { entrance: string; floor: string } => {
    const aptNum = parseInt(apartment);
    if (isNaN(aptNum) || aptNum <= 0) return { entrance: '', floor: '' };

    if (entrances.length > 0) {
      const sortedEntrances = [...entrances].sort((a, b) => a.number - b.number);
      for (const ent of sortedEntrances) {
        const from = ent.apartments_from ?? 1;
        const to = ent.apartments_to ?? Infinity;
        if (aptNum >= from && aptNum <= to) {
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

  // Extract entrance number from address string
  const extractEntranceFromAddress = (address: string): string => {
    const m = address.match(/(?:подъезд|под\.?|пд\.?|п\/д|kirish|k\/ch)\s*(\d+)/i);
    return m ? m[1] : '';
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

      let totalArea: number | undefined;
      if (areaCol >= 0 && row[areaCol]) {
        const rawValue = row[areaCol];
        let areaStr = String(rawValue).replace(',', '.').replace(/[^\d.]/g, '');
        let parsed = parseFloat(areaStr);

        if (!isNaN(parsed) && parsed > 0) {
          const hasDecimal = String(rawValue).includes('.') || String(rawValue).includes(',');
          if (!hasDecimal && parsed > 1000) parsed = parsed / 100;
          if (parsed > 500 && !hasDecimal) parsed = parsed / 10;
          totalArea = Math.round(parsed * 100) / 100;
        }
      }

      if (!fullName) continue;
      const nameLower = fullName.toLowerCase();
      if (nameLower.includes('фио') || nameLower.includes('абонент') || nameLower.includes('f.i.sh') || nameLower.includes('f.i.o') || nameLower.includes('abonent') || nameLower.includes('fish')) continue;

      let entrance: string | undefined;
      if (entranceCol >= 0 && row[entranceCol]) {
        const eStr = String(row[entranceCol]).trim().replace(/[^\d]/g, '');
        if (eStr) entrance = eStr;
      }
      if (!entrance && address) {
        const fromAddr = extractEntranceFromAddress(address);
        if (fromAddr) entrance = fromAddr;
      }

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
      if (isNonResidential(row.address)) { skippedNonResidential++; return; }

      const login = row.personalAccount
        ? row.personalAccount.trim().replace(/\s+/g, '')
        : `${Date.now()}_${index}`;
      if (additionalUsers[login]) return;

      const apartment = extractApartmentFromAddress(row.address);
      const { entrance: calcEntrance, floor: calcFloor } = calculateEntranceAndFloor(apartment);
      const entrance = row.entrance || calcEntrance;
      const floor    = row.floor    || calcFloor;
      const buildingId = selectedBuilding?.id || '';
      const residentAddress = row.address || selectedBuilding?.address || '';
      const password = generatePassword(selectedBuilding, apartment, residentAddress);

      usersToCreate.push({
        login, password, name: row.fullName, role: 'resident', phone: '',
        address: row.address || selectedBuilding?.address || '',
        apartment, building_id: buildingId, entrance, floor,
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

      if (selectedBuilding) await fetchResidents(selectedBuilding.id);
      setTimeout(() => setProgressMessage(''), 6000);
    } catch (error: any) {
      setUploadError(error.message || (language === 'ru' ? 'Ошибка при массовой регистрации' : 'Ommaviy ro\'yxatdan o\'tishda xatolik'));
      setProgressMessage('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleManualAdd = async (vehicleData?: { plateNumber: string; brandModel: string; color: string }) => {
    if (!manualForm.fullName) return;

    const login = manualForm.personalAccount ? manualForm.personalAccount.trim() : `${Date.now()}`;
    const apartment = extractApartmentFromAddress(manualForm.address);
    const { entrance: calcEntrance, floor: calcFloor } = calculateEntranceAndFloor(apartment);
    const entrance = selectedEntrance ? String(selectedEntrance.number) : calcEntrance;
    const floor = calcFloor || '';
    const buildingId = selectedBuilding?.id || '';
    const residentAddress = manualForm.address || selectedBuilding?.address || '';
    const password = generatePassword(selectedBuilding, apartment, residentAddress);

    setIsCreating(true);
    setProgressMessage(language === 'ru' ? 'Создание аккаунта...' : 'Akkaunt yaratilmoqda...');

    try {
      await authApi.register({
        login, password, name: manualForm.fullName, role: 'resident',
        phone: manualForm.phone,
        address: manualForm.address || selectedBuilding?.address || '',
        apartment, building_id: buildingId, entrance, floor,
        branch: selectedBuilding?.branchCode, building: selectedBuilding?.buildingNumber,
      });

      addMockUser(login, password, {
        id: `res_${Date.now()}`, phone: manualForm.phone, name: manualForm.fullName,
        login, role: 'resident',
        address: manualForm.address || selectedBuilding?.address || '',
        apartment, buildingId, entrance, floor,
        branch: selectedBuilding?.branchCode, building: selectedBuilding?.buildingNumber,
      });

      // Create vehicle if provided
      if (vehicleData?.plateNumber?.trim()) {
        const [brand, ...modelParts] = (vehicleData.brandModel || '').trim().split(' ');
        vehiclesApi.create({
          plate_number: vehicleData.plateNumber.trim(),
          brand: brand || undefined,
          model: modelParts.join(' ') || undefined,
          color: vehicleData.color?.trim() || undefined,
        }).catch(() => {}); // Don't block resident creation
      }

      setShowResidentCard({
        login, name: manualForm.fullName,
        address: manualForm.address || selectedBuilding?.address || '',
        apartment, phone: manualForm.phone,
      });
      setShowPassword(true);
      setManualForm({ fullName: '', phone: '', address: '', personalAccount: '' });
      setShowAddManualModal(false);

      if (selectedBuilding) await fetchResidents(selectedBuilding.id);
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
      if (apiResident?.id) await usersApi.delete(apiResident.id);
      removeUser(login);
      setApiResidents(prev => prev.filter(r => r.login !== login));
      setDeleteConfirm(null);
      setShowResidentCard(null);
      setIsDeleting(false);
      if (selectedBuilding) fetchResidents(selectedBuilding.id);
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
          if (residentId) { await usersApi.delete(residentId); deletedCount++; }
          removeUser(resident.login);
        } catch (err) {
          console.error(`Failed to delete ${resident.login}:`, err);
        }
      }

      setProgressMessage(language === 'ru' ? `Удалено ${deletedCount} жителей` : `${deletedCount} ta yashovchi o'chirildi`);
      if (selectedBuilding) await fetchResidents(selectedBuilding.id);
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

  // Resident click handler
  const handleResidentClick = (resident: MappedResident) => {
    setShowResidentCard(resident);
    setEditingPassword(false);
    setNewPassword('');
    setShowPassword(false);
  };

  // Save password handler
  const handleSavePassword = async () => {
    if (newPassword.length >= 4 && showResidentCard?.id) {
      try {
        await usersApi.adminChangePassword(showResidentCard.id, newPassword);
        updateUserPassword(showResidentCard.login, newPassword);
        setEditingPassword(false);
        setShowPassword(true);
      } catch (err: any) {
        addToast('error', (language === 'ru' ? 'Ошибка сохранения пароля: ' : 'Parolni saqlashda xatolik: ') + err.message);
      }
    }
  };

  // Save name handler
  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || !showResidentCard?.id) return;
    setSavingName(true);
    try {
      await usersApi.adminChangeName(showResidentCard.id, trimmed);
      setShowResidentCard(prev => prev ? { ...prev, name: trimmed } : prev);
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
  };

  return {
    // State
    language,
    currentUser,
    viewLevel,
    selectedBranch,
    selectedBuilding,
    selectedEntrance,
    branches,
    entrances,
    isLoadingBranches,
    isLoadingEntrances,
    isLoadingResidents,
    filteredBuildings,
    allResidents,
    filteredResidents,
    searchQuery,
    setSearchQuery,
    showUploadModal,
    setShowUploadModal,
    showAddManualModal,
    setShowAddManualModal,
    uploadedData,
    setUploadedData,
    uploadError,
    setUploadError,
    createdAccounts,
    setCreatedAccounts,
    showResidentCard,
    setShowResidentCard,
    editingPassword,
    setEditingPassword,
    newPassword,
    setNewPassword,
    showPassword,
    setShowPassword,
    editingName,
    setEditingName,
    editNameValue,
    setEditNameValue,
    savingName,
    nameToast,
    deleteConfirm,
    setDeleteConfirm,
    deleteAllConfirm,
    setDeleteAllConfirm,
    isDeleting,
    isCreating,
    progressMessage,
    fileInputRef,
    manualForm,
    setManualForm,
    DEFAULT_PASSWORD,

    // Handlers
    handleBranchClick,
    handleBuildingClick,
    handleEntranceClick,
    handleBack,
    handleFileUpload,
    createAccountsFromData,
    handleManualAdd,
    handleDeleteResident,
    handleDeleteAllResidents,
    handleResidentClick,
    handleSavePassword,
    handleSaveName,
    copyToClipboard,
    getResidentPassword,
    extractApartmentFromAddress,
    calculateEntranceAndFloor,

    // Navigation helpers
    setViewLevel,
    setSelectedBranch,
    setSelectedBuilding,
    setSelectedEntrance,
  };
}
