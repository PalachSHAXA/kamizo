import { useState, useEffect, useRef } from 'react';
import {
  UserCog, Wrench, X, Plus,
  Loader2, RefreshCw,
  Shield, Search, Filter,
  Key,
  Download, Upload,
} from 'lucide-react';
import { StatusBadge } from '../../components/common';
import type { StatusTone } from '../../theme';
import { teamApi, apiRequest } from '../../services/api';
import { pluralWithCount } from '../../utils/plural';
import { CredentialsModal } from './team/CredentialsModal';
import { StaffImportModal } from './team/StaffImportModal';
import { AddStaffModal } from './team/AddStaffModal';
import { MemberDetailsModal } from './team/MemberDetailsModal';
import { StaffSection } from './team/StaffSection';
import { type StaffMember } from './team/constants';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { SPECIALIZATION_LABELS } from '../../types';
import type { ExecutorSpecialization } from '../../types';


const SPECIALIZATION_LABELS_UZ: Record<string, string> = {
  plumber: 'Santexnik',
  electrician: 'Elektrik',
  elevator: 'Liftchi',
  intercom: 'Domofon',
  cleaning: 'Tozalovchi',
  security: 'Qorovul',
  trash: 'Chiqindi tashish',
  boiler: 'Qozonxonachi',
  ac: 'Konditsionerchi',
  courier: 'Kuryer',
  gardener: 'Bog\'bon',
  other: 'Boshqa',
};

export function TeamPage() {
  const { user: currentUser } = useAuthStore();
  const { hasFeature } = useTenantStore();
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const isDirector = currentUser?.role === 'director';
  const [directors, setDirectors] = useState<StaffMember[]>([]);
  const [admins, setAdmins] = useState<StaffMember[]>([]);
  const [managers, setManagers] = useState<StaffMember[]>([]);
  const [departmentHeads, setDepartmentHeads] = useState<StaffMember[]>([]);
  const [executors, setExecutors] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState<{ login: string; password: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState<ExecutorSpecialization | 'all'>('all');
  const [expandedSections, setExpandedSections] = useState({
    directors: true,
    admins: true,
    managers: true,
    departmentHeads: true,
    executors: true,
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    login: '',
    password: '',
    specialization: '' as ExecutorSpecialization | '',
  });
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Add new member modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    login: '',
    password: '',
    role: 'executor' as 'manager' | 'department_head' | 'executor',
    managerType: 'manager' as 'manager' | 'advertiser',
    specialization: '' as ExecutorSpecialization | '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Export/Import
  const [exportLoading, setExportLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; stats?: Record<string, number>; error?: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const ROLE_LABELS = language === 'ru' ? ROLE_LABELS_RU : ROLE_LABELS_UZ;

  // Fetch team data
  const fetchTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teamApi.getAll() as { directors?: StaffMember[]; admins?: StaffMember[]; managers?: StaffMember[]; departmentHeads?: StaffMember[]; executors?: StaffMember[] };
      setDirectors(data.directors || []);
      setAdmins(data.admins || []);
      setManagers(data.managers || []);
      setDepartmentHeads(data.departmentHeads || []);
      setExecutors(data.executors || []);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : '') || (language === 'ru' ? 'Ошибка загрузки данных' : 'Ma\'lumotlarni yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportStaff = async () => {
    setExportLoading(true);
    try {
      const data = await apiRequest('/api/team/export') as Record<string, unknown>;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      addToast('error', (e instanceof Error ? e.message : '') || 'Ошибка экспорта');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportStaff = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      const result = await apiRequest('/api/team/import', {
        method: 'POST',
        body: JSON.stringify(data),
      }) as { stats?: Record<string, number> };
      setImportResult({ success: true, stats: result.stats });
      fetchTeam();
    } catch (e: unknown) {
      setImportResult({ success: false, error: (e instanceof Error ? e.message : '') || 'Ошибка импорта' });
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const handleOpenDetails = async (member: StaffMember) => {
    // Show modal immediately with cached data
    setSelectedMember(member);
    setEditForm({
      name: member.name,
      phone: member.phone,
      login: member.login,
      password: '',
      specialization: member.specialization || '',
    });
    setIsEditing(false);
    setShowPassword(false);

    // Then fetch fresh data from API (including password)
    setIsLoadingDetails(true);
    try {
      const response = await teamApi.getById(member.id);
      if (response.user) {
        const freshData = {
          ...member,
          ...response.user,
        };
        setSelectedMember(freshData);
        setEditForm({
          name: freshData.name,
          phone: freshData.phone,
          login: freshData.login,
          password: '',
          specialization: freshData.specialization || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch staff details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedMember(null);
    setIsEditing(false);
    setShowPassword(false);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveChanges = async () => {
    if (!selectedMember) return;

    try {
      const updates: Record<string, string> = {};
      if (editForm.name !== selectedMember.name) updates.name = editForm.name;
      if (editForm.phone !== selectedMember.phone) updates.phone = editForm.phone;
      if (editForm.login !== selectedMember.login) updates.login = editForm.login;
      if (editForm.password) updates.password = editForm.password;
      if (editForm.specialization !== selectedMember.specialization) {
        updates.specialization = editForm.specialization;
      }

      if (Object.keys(updates).length > 0) {
        const response = await teamApi.update(selectedMember.id, updates);

        // Refresh data from server
        await fetchTeam();

        // Update selected member with response data (includes password from server)
        if (response.user) {
          setSelectedMember({
            ...selectedMember,
            ...response.user,
          });
        }
      }

      setIsEditing(false);
      setEditForm(prev => ({ ...prev, password: '' })); // Clear password field
    } catch (err: unknown) {
      addToast('error', (language === 'ru' ? 'Ошибка сохранения: ' : 'Saqlashda xatolik: ') + (err instanceof Error ? err.message : ''));
    }
  };

  // Transliterate Cyrillic to Latin
  const transliterate = (text: string): string => {
    const map: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h',
    };
    return text.toLowerCase().split('').map(c => map[c] ?? c).join('');
  };

  // Generate login from full name: "Иванов Иван Иванович" → "ivanov.ii"
  const generateLogin = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const surname = transliterate(parts[0]);
    const initials = parts.slice(1).map(p => transliterate(p[0] || '')).join('');
    return initials ? `${surname}.${initials}` : surname;
  };

  // Generate readable password: "Abc1234" format
  const generatePassword = () => {
    const consonants = 'bcdfghjkmnpqrstvwxyz';
    const vowels = 'aeiou';
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    // 1 uppercase + 2 syllables (consonant+vowel) + 4 digits
    let pwd = upper[Math.floor(Math.random() * upper.length)];
    for (let i = 0; i < 2; i++) {
      pwd += consonants[Math.floor(Math.random() * consonants.length)];
      pwd += vowels[Math.floor(Math.random() * vowels.length)];
    }
    for (let i = 0; i < 4; i++) {
      pwd += Math.floor(Math.random() * 10);
    }
    return pwd;
  };

  // Handle add new member
  const handleAddMember = async () => {
    setAddError(null);

    // Validation
    if (!addForm.name.trim()) {
      setAddError(language === 'ru' ? 'Введите ФИО' : 'F.I.O. kiriting');
      return;
    }
    if (!addForm.login.trim()) {
      setAddError(language === 'ru' ? 'Введите логин' : 'Login kiriting');
      return;
    }
    if (!addForm.password.trim()) {
      setAddError(language === 'ru' ? 'Введите пароль' : 'Parol kiriting');
      return;
    }
    if ((addForm.role === 'executor' || addForm.role === 'department_head') && !addForm.specialization) {
      setAddError(language === 'ru' ? 'Выберите специализацию' : 'Mutaxassislikni tanlang');
      return;
    }

    setAddLoading(true);
    try {
      // For managers, use managerType as the actual role (manager/advertiser)
      const actualRole = addForm.role === 'manager' ? addForm.managerType : addForm.role;
      const result = await teamApi.create({
        login: addForm.login,
        password: addForm.password,
        name: addForm.name,
        phone: addForm.phone,
        role: actualRole,
        specialization: addForm.specialization || undefined,
      });

      // Show credentials modal (password comes from server response or use submitted)
      setShowCredentialsModal({
        login: addForm.login,
        password: result.user?.password || addForm.password,
      });

      // Reset form and close modal
      setAddForm({
        name: '',
        phone: '',
        login: '',
        password: '',
        role: 'executor',
        managerType: 'manager',
        specialization: '',
      });
      setShowAddModal(false);

      // Refresh data
      await fetchTeam();
    } catch (err: unknown) {
      setAddError((err instanceof Error ? err.message : '') || (language === 'ru' ? 'Ошибка создания сотрудника' : 'Xodim yaratishda xatolik'));
    } finally {
      setAddLoading(false);
    }
  };

  const openAddModal = (role: 'manager' | 'department_head' | 'executor' = 'executor') => {
    setAddForm({
      name: '',
      phone: '',
      login: '',
      password: generatePassword(),
      role,
      managerType: 'manager',
      specialization: '',
    });
    setAddError(null);
    setShowAddModal(true);
  };

  // Handle delete member
  const handleDeleteMember = async (member: StaffMember) => {
    if (!confirm(language === 'ru'
      ? `Удалить сотрудника "${member.name}"? Это действие необратимо.`
      : `"${member.name}" xodimni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.`
    )) {
      return;
    }

    try {
      await teamApi.delete(member.id);
      // Close modal if this member was selected
      if (selectedMember?.id === member.id) {
        setSelectedMember(null);
      }
      // Refresh data
      await fetchTeam();
    } catch (err: unknown) {
      addToast('error', (language === 'ru' ? 'Ошибка удаления: ' : 'O\'chirishda xatolik: ') + (err instanceof Error ? err.message : ''));
    }
  };

  // Handle reset all passwords for staff without password_plain
  const handleResetAllPasswords = async () => {
    // Count staff without passwords
    const staffWithoutPassword = [
      ...managers.filter(m => !m.password),
      ...departmentHeads.filter(m => !m.password),
      ...executors.filter(m => !m.password),
    ];

    if (staffWithoutPassword.length === 0) {
      addToast('info', language === 'ru' ? 'Все сотрудники уже имеют пароли' : 'Barcha xodimlarning parollari mavjud');
      return;
    }

    // Require typed confirmation — plain OK click too easy to trigger accidentally
    // on mobile with an icon-only button.
    const confirmWord = language === 'ru' ? 'СБРОСИТЬ' : 'TIKLASH';
    const typed = prompt(language === 'ru'
      ? `Сбросить пароли для ${staffWithoutPassword.length} сотрудников?\n\nЭто сгенерирует новые пароли для всех сотрудников, у которых не отображается пароль.\n\nВведите "${confirmWord}" для подтверждения:`
      : `${staffWithoutPassword.length} ta xodim uchun parollarni tiklash?\n\nBu paroli ko'rinmaydigan xodimlar uchun yangi parollar yaratadi.\n\nTasdiqlash uchun "${confirmWord}" ni kiriting:`
    );
    if (typed?.trim().toUpperCase() !== confirmWord) {
      if (typed !== null) {
        addToast('info', language === 'ru' ? 'Сброс отменён' : 'Bekor qilindi');
      }
      return;
    }

    try {
      setLoading(true);
      const result = await teamApi.resetAllPasswords();

      if (result.updated > 0) {
        addToast('success', language === 'ru' ? `Обновлено ${result.updated} сотрудников` : `${result.updated} xodim yangilandi`);
      } else {
        addToast('info', result.message);
      }

      // Refresh data
      await fetchTeam();
    } catch (err: unknown) {
      addToast('error', (language === 'ru' ? 'Ошибка сброса паролей: ' : 'Parollarni tiklashda xatolik: ') + (err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Filter by search query and specialization
  const filterMembers = (members: StaffMember[]) => {
    let filtered = members;

    // Filter by specialization
    if (specializationFilter !== 'all') {
      filtered = filtered.filter(m => m.specialization === specializationFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.phone.includes(query) ||
        m.login.toLowerCase().includes(query) ||
        (m.specialization && SPECIALIZATION_LABELS[m.specialization]?.toLowerCase().includes(query))
      );
    }

    return filtered;
  };

  // Get unique specializations from all staff
  const allSpecializations = [...new Set([
    ...departmentHeads.map(m => m.specialization).filter(Boolean),
    ...executors.map(m => m.specialization).filter(Boolean),
  ])] as ExecutorSpecialization[];

  const filteredDirectors = filterMembers(directors);
  const filteredAdmins = filterMembers(admins);
  const filteredManagers = filterMembers(managers);
  const filteredDepartmentHeads = filterMembers(departmentHeads);
  const filteredExecutors = filterMembers(executors);

  const getStatusBadge = (status?: string) => {
    const tone: StatusTone | null =
      status === 'available' ? 'active'
      : status === 'busy' ? 'pending'
      : status === 'offline' ? 'expired'
      : null;
    const label =
      status === 'available' ? (language === 'ru' ? 'Доступен' : 'Mavjud')
      : status === 'busy' ? (language === 'ru' ? 'Занят' : 'Band')
      : status === 'offline' ? (language === 'ru' ? 'Не в сети' : 'Oflayn')
      : null;
    if (!tone || !label) return null;
    return <StatusBadge status={tone} size="sm">{label}</StatusBadge>;
  };

  const getSpecLabel = (spec: ExecutorSpecialization) => {
    return language === 'ru' ? (SPECIALIZATION_LABELS[spec] || spec) : (SPECIALIZATION_LABELS_UZ[spec] || spec);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-red-500 mb-4">{error}</div>
        <button onClick={fetchTeam} className="btn-primary">
          {language === 'ru' ? 'Повторить' : 'Qayta urinish'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{language === 'ru' ? 'Персонал' : 'Xodimlar'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {language === 'ru' ? 'Всего' : 'Jami'}:{' '}
            {pluralWithCount(
              language === 'ru' ? 'ru' : 'uz',
              directors.length + (isDirector ? 0 : admins.length) + managers.length + departmentHeads.length + executors.length,
              { one: 'сотрудник', few: 'сотрудника', many: 'сотрудников' },
              { one: 'xodim', other: 'xodim' }
            )}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={language === 'ru' ? 'Поиск...' : 'Qidirish...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-auto pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            {/* Specialization Filter */}
            <div className="relative flex-1 sm:flex-none min-w-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={specializationFilter}
                onChange={(e) => setSpecializationFilter(e.target.value as ExecutorSpecialization | 'all')}
                className="w-full pl-10 pr-8 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white text-sm"
              >
                <option value="all">{language === 'ru' ? 'Все специализации' : 'Barcha mutaxassisliklar'}</option>
                {allSpecializations.map(spec => (
                  <option key={spec} value={spec}>{getSpecLabel(spec)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTeam}
              className="btn-secondary p-2"
              title={language === 'ru' ? 'Обновить' : 'Yangilash'}
              aria-label={language === 'ru' ? 'Обновить' : 'Yangilash'}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {/* Show reset passwords button only if there are staff without passwords */}
            {[...admins, ...managers, ...departmentHeads, ...executors].some(m => !m.password) && (
              <button
                onClick={handleResetAllPasswords}
                className="btn-secondary flex items-center gap-2 text-orange-600 hover:bg-orange-50"
                title={language === 'ru' ? 'Сбросить пароли для сотрудников без паролей' : 'Parolsiz xodimlarning parollarini tiklash'}
                aria-label={language === 'ru' ? 'Массовый сброс паролей сотрудников' : 'Xodimlar parollarini ommaviy tiklash'}
              >
                <Key className="w-5 h-5" />
                <span className="hidden sm:inline">{language === 'ru' ? 'Сбросить пароли' : 'Parollarni tiklash'}</span>
              </button>
            )}
            <button
              onClick={handleExportStaff}
              disabled={exportLoading}
              className="btn-secondary flex items-center gap-2 text-green-600 hover:bg-green-50 disabled:opacity-50"
              title={language === 'ru' ? 'Экспорт персонала' : 'Xodimlarni eksport qilish'}
            >
              {exportLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              <span className="hidden sm:inline">{language === 'ru' ? 'Экспорт' : 'Eksport'}</span>
            </button>
            <button
              onClick={() => { setImportFile(null); setImportResult(null); setShowImportModal(true); }}
              className="btn-secondary flex items-center gap-2 text-blue-600 hover:bg-blue-50"
              title={language === 'ru' ? 'Импорт персонала' : 'Xodimlarni import qilish'}
            >
              <Upload className="w-5 h-5" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Импорт' : 'Import'}</span>
            </button>
            <button
              onClick={() => openAddModal('executor')}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Добавить сотрудника' : 'Xodim qo\'shish'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
        {directors.length > 0 && (
          <div className="glass-card p-3 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-bold">{directors.length}</div>
                <div className="text-xs sm:text-sm text-gray-500 truncate">{language === 'ru' ? 'Директоров' : 'Direktorlar'}</div>
              </div>
            </div>
          </div>
        )}
        {!isDirector && admins.length > 0 && (
          <div className="glass-card p-3 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xl sm:text-2xl font-bold">{admins.length}</div>
                <div className="text-xs sm:text-sm text-gray-500 truncate">{language === 'ru' ? 'Администраторов' : 'Administratorlar'}</div>
              </div>
            </div>
          </div>
        )}
        <div className="glass-card p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold">{managers.length}</div>
              <div className="text-xs sm:text-sm text-gray-500 truncate">{language === 'ru' ? 'Менеджеров' : 'Menejerlar'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserCog className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold">{departmentHeads.length}</div>
              <div className="text-xs sm:text-sm text-gray-500 truncate">{language === 'ru' ? 'Глав отделов' : 'Bo\'lim boshliqlari'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold">{executors.length}</div>
              <div className="text-xs sm:text-sm text-gray-500 truncate">{language === 'ru' ? 'Исполнителей' : 'Ijrochilar'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3 sm:space-y-4">
        {filteredDirectors.length > 0 && (
          <StaffSection
            title={language === 'ru' ? 'Директора' : 'Direktorlar'}
            icon={<Shield className="w-5 h-5 text-amber-500" />}
            members={filteredDirectors}
            expanded={expandedSections.directors}
            onToggle={() => toggleSection('directors')}
            onOpenMember={handleOpenDetails}
            onDeleteMember={handleDeleteMember}
            getSpecLabel={getSpecLabel}
            getStatusBadge={getStatusBadge}
          />
        )}
        {!isDirector && filteredAdmins.length > 0 && (
          <StaffSection
            title={language === 'ru' ? 'Администраторы' : 'Administratorlar'}
            icon={<Shield className="w-5 h-5 text-red-500" />}
            members={filteredAdmins}
            expanded={expandedSections.admins}
            onToggle={() => toggleSection('admins')}
            onOpenMember={handleOpenDetails}
            onDeleteMember={handleDeleteMember}
            getSpecLabel={getSpecLabel}
            getStatusBadge={getStatusBadge}
          />
        )}
        <StaffSection
          title={language === 'ru' ? 'Менеджеры' : 'Menejerlar'}
          icon={<Shield className="w-5 h-5 text-purple-500" />}
          members={filteredManagers}
          expanded={expandedSections.managers}
          onToggle={() => toggleSection('managers')}
          onOpenMember={handleOpenDetails}
          onDeleteMember={handleDeleteMember}
          getSpecLabel={getSpecLabel}
          getStatusBadge={getStatusBadge}
        />
        <StaffSection
          title={language === 'ru' ? 'Главы отделов' : "Bo'lim boshliqlari"}
          icon={<UserCog className="w-5 h-5 text-primary-500" />}
          members={filteredDepartmentHeads}
          expanded={expandedSections.departmentHeads}
          onToggle={() => toggleSection('departmentHeads')}
          onOpenMember={handleOpenDetails}
          onDeleteMember={handleDeleteMember}
          getSpecLabel={getSpecLabel}
          getStatusBadge={getStatusBadge}
        />
        <StaffSection
          title={language === 'ru' ? 'Исполнители' : 'Ijrochilar'}
          icon={<Wrench className="w-5 h-5 text-green-500" />}
          members={filteredExecutors}
          expanded={expandedSections.executors}
          onToggle={() => toggleSection('executors')}
          onOpenMember={handleOpenDetails}
          onDeleteMember={handleDeleteMember}
          getSpecLabel={getSpecLabel}
          getStatusBadge={getStatusBadge}
        />
      </div>

      {showAddModal && (
        <AddStaffModal
          language={language}
          hasAdvertiserFeature={hasFeature('advertiser')}
          form={addForm}
          setForm={setAddForm}
          error={addError}
          loading={addLoading}
          copiedField={copiedField}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddMember}
          onCopy={handleCopy}
          generateLogin={generateLogin}
          generatePassword={generatePassword}
        />
      )}


      {selectedMember && (
        <MemberDetailsModal
          member={selectedMember}
          language={language}
          isEditing={isEditing}
          isLoadingDetails={isLoadingDetails}
          showPassword={showPassword}
          editForm={editForm}
          setEditForm={setEditForm}
          copiedField={copiedField}
          roleLabel={ROLE_LABELS[selectedMember.role]}
          roleColorClass={ROLE_COLORS[selectedMember.role]}
          specLabel={selectedMember.specialization ? getSpecLabel(selectedMember.specialization) : null}
          statusBadge={getStatusBadge(selectedMember.status)}
          onClose={handleCloseDetails}
          onToggleEditing={setIsEditing}
          onTogglePassword={() => setShowPassword(!showPassword)}
          onSave={handleSaveChanges}
          onCopy={handleCopy}
        />
      )}

      {showCredentialsModal && (
        <CredentialsModal
          credentials={showCredentialsModal}
          language={language}
          onClose={() => setShowCredentialsModal(null)}
          copiedField={copiedField}
          onCopy={(field, value) => {
            navigator.clipboard.writeText(value);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
          }}
        />
      )}

      {showImportModal && (
        <StaffImportModal
          language={language}
          onClose={() => setShowImportModal(false)}
          fileInputRef={importFileRef}
          importFile={importFile}
          onFileSelect={(f) => {
            setImportFile(f);
            setImportResult(null);
          }}
          importResult={importResult}
          importLoading={importLoading}
          onImport={handleImportStaff}
        />
      )}
    </div>
  );
}
