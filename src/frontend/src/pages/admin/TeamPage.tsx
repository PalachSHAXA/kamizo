import { useState, useEffect, useRef } from 'react';
import {
  UserCog, Wrench, Phone, Star, X, Eye, EyeOff, Plus,
  Copy, Check, Edit3, Save, Clock, Award, Loader2, RefreshCw,
  Shield, ChevronDown, ChevronUp, Search, Filter,
  Droplets, Zap, ArrowUpDown, Bell, Brush, ShieldCheck,
  Hammer, Flame, Wind, Trash2, Key, Truck, Leaf,
  Download, Upload, CheckCircle, AlertCircle,
  UserPlus
} from 'lucide-react';
import { EmptyState } from '../../components/common';
import { teamApi, apiRequest } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { SPECIALIZATION_LABELS } from '../../types';
import type { ExecutorSpecialization } from '../../types';

interface StaffMember {
  id: string;
  login: string;
  password?: string;
  name: string;
  phone: string;
  role: 'admin' | 'manager' | 'department_head' | 'executor' | 'advertiser';
  specialization?: ExecutorSpecialization;
  status?: string;
  created_at: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

const ROLE_LABELS_RU: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  advertiser: 'Менеджер рекламы',
  department_head: 'Глава отдела',
  executor: 'Исполнитель',
};

const ROLE_LABELS_UZ: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Menejer',
  advertiser: 'Reklama menejeri',
  department_head: 'Bo\'lim boshlig\'i',
  executor: 'Ijrochi',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  advertiser: 'bg-orange-100 text-orange-700',
  department_head: 'bg-blue-100 text-blue-700',
  executor: 'bg-green-100 text-green-700',
};

// Иконки для специализаций
const SPECIALIZATION_ICONS: Record<ExecutorSpecialization, React.ReactNode> = {
  plumber: <Droplets className="w-4 h-4" />,
  electrician: <Zap className="w-4 h-4" />,
  elevator: <ArrowUpDown className="w-4 h-4" />,
  intercom: <Bell className="w-4 h-4" />,
  cleaning: <Brush className="w-4 h-4" />,
  security: <ShieldCheck className="w-4 h-4" />,
  trash: <Hammer className="w-4 h-4" />,
  boiler: <Flame className="w-4 h-4" />,
  ac: <Wind className="w-4 h-4" />,
  courier: <Truck className="w-4 h-4" />,
  gardener: <Leaf className="w-4 h-4" />,
  other: <Wrench className="w-4 h-4" />,
};

// Цвета для специализаций
const SPECIALIZATION_COLORS: Record<ExecutorSpecialization, string> = {
  plumber: 'bg-blue-100 text-blue-700',
  electrician: 'bg-yellow-100 text-yellow-700',
  elevator: 'bg-gray-100 text-gray-700',
  intercom: 'bg-purple-100 text-purple-700',
  cleaning: 'bg-pink-100 text-pink-700',
  security: 'bg-red-100 text-red-700',
  trash: 'bg-amber-100 text-amber-700',
  boiler: 'bg-orange-100 text-orange-700',
  ac: 'bg-cyan-100 text-cyan-700',
  courier: 'bg-green-100 text-green-700',
  gardener: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
};

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
  const [importResult, setImportResult] = useState<{ success: boolean; stats?: any; error?: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const ROLE_LABELS = language === 'ru' ? ROLE_LABELS_RU : ROLE_LABELS_UZ;

  // Fetch team data
  const fetchTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teamApi.getAll();
      setAdmins(data.admins || []);
      setManagers(data.managers || []);
      setDepartmentHeads(data.departmentHeads || []);
      setExecutors(data.executors || []);
    } catch (err: any) {
      setError(err.message || (language === 'ru' ? 'Ошибка загрузки данных' : 'Ma\'lumotlarni yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportStaff = async () => {
    setExportLoading(true);
    try {
      const data = await apiRequest('/api/team/export') as any;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      addToast('error', e.message || 'Ошибка экспорта');
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
      }) as any;
      setImportResult({ success: true, stats: result.stats });
      fetchTeam();
    } catch (e: any) {
      setImportResult({ success: false, error: e.message || 'Ошибка импорта' });
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
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
      const updates: any = {};
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
    } catch (err: any) {
      addToast('error', (language === 'ru' ? 'Ошибка сохранения: ' : 'Saqlashda xatolik: ') + err.message);
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
    } catch (err: any) {
      setAddError(err.message || (language === 'ru' ? 'Ошибка создания сотрудника' : 'Xodim yaratishda xatolik'));
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
    } catch (err: any) {
      addToast('error', (language === 'ru' ? 'Ошибка удаления: ' : 'O\'chirishda xatolik: ') + err.message);
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

    if (!confirm(language === 'ru'
      ? `Сбросить пароли для ${staffWithoutPassword.length} сотрудников без паролей?\n\nЭто сгенерирует новые пароли для всех сотрудников, у которых не отображается пароль.`
      : `Parolsiz ${staffWithoutPassword.length} xodimlarning parollarini tiklash?\n\nBu paroli ko'rinmaydigan barcha xodimlar uchun yangi parollar yaratadi.`
    )) {
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
    } catch (err: any) {
      addToast('error', (language === 'ru' ? 'Ошибка сброса паролей: ' : 'Parollarni tiklashda xatolik: ') + err.message);
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

  const filteredAdmins = filterMembers(admins);
  const filteredManagers = filterMembers(managers);
  const filteredDepartmentHeads = filterMembers(departmentHeads);
  const filteredExecutors = filterMembers(executors);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'available': return <span className="badge badge-done text-xs">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge badge-progress text-xs">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600 text-xs">{language === 'ru' ? 'Не в сети' : 'Oflayn'}</span>;
      default: return null;
    }
  };

  const getSpecLabel = (spec: ExecutorSpecialization) => {
    return language === 'ru' ? (SPECIALIZATION_LABELS[spec] || spec) : (SPECIALIZATION_LABELS_UZ[spec] || spec);
  };

  const renderStaffCard = (member: StaffMember) => (
    <div
      key={member.id}
      className="glass-card p-3 sm:p-4 hover:shadow-lg transition-shadow cursor-pointer relative group"
      onClick={() => handleOpenDetails(member)}
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteMember(member);
        }}
        className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        title={language === 'ru' ? 'Удалить сотрудника' : 'Xodimni o\'chirish'}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="flex items-start justify-between mb-2 sm:mb-3 pr-8">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-lg font-medium flex-shrink-0 ${
            member.specialization
              ? SPECIALIZATION_COLORS[member.specialization]
              : 'bg-primary-100 text-primary-700'
          }`}>
            {member.specialization
              ? SPECIALIZATION_ICONS[member.specialization]
              : member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
            }
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base truncate">{member.name}</h3>
            {member.specialization && (
              <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500">
                {getSpecLabel(member.specialization)}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
            {ROLE_LABELS[member.role]}
          </span>
          {getStatusBadge(member.status)}
        </div>
      </div>

      <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          {member.phone}
        </div>
        {(member.role === 'executor' || member.role === 'department_head') && (
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              {member.avg_rating || 0}
            </div>
            <div className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
              {member.completed_count || 0} {language === 'ru' ? 'выполнено' : 'bajarilgan'}
            </div>
            {member.active_count ? (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-500" />
                {member.active_count} {language === 'ru' ? 'активных' : 'faol'}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    members: StaffMember[],
    sectionKey: keyof typeof expandedSections
  ) => (
    <div className="glass-card overflow-hidden">
      <button
        className="w-full p-3 sm:p-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {icon}
          <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs sm:text-sm">
            {members.length}
          </span>
        </div>
        {expandedSections[sectionKey] ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {expandedSections[sectionKey] && (
        <div className="p-2 sm:p-4">
          {members.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-12 h-12" />}
              title={language === 'ru' ? 'Нет сотрудников' : 'Xodimlar yo\'q'}
              description={language === 'ru' ? 'В этой категории пока нет сотрудников' : 'Bu toifada hali xodimlar yo\'q'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
              {members.map(renderStaffCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );

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
            {language === 'ru' ? 'Всего' : 'Jami'}: {(isDirector ? 0 : admins.length) + managers.length + departmentHeads.length + executors.length} {language === 'ru' ? 'сотрудников' : 'xodimlar'}
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
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {/* Show reset passwords button only if there are staff without passwords */}
            {[...admins, ...managers, ...departmentHeads, ...executors].some(m => !m.password) && (
              <button
                onClick={handleResetAllPasswords}
                className="btn-secondary flex items-center gap-2 text-orange-600 hover:bg-orange-50"
                title={language === 'ru' ? 'Сбросить пароли для сотрудников без паролей' : 'Parolsiz xodimlarning parollarini tiklash'}
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
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-4">
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
        {!isDirector && filteredAdmins.length > 0 && renderSection(
          language === 'ru' ? 'Администраторы' : 'Administratorlar',
          <Shield className="w-5 h-5 text-red-500" />,
          filteredAdmins,
          'admins'
        )}
        {renderSection(
          language === 'ru' ? 'Менеджеры' : 'Menejerlar',
          <Shield className="w-5 h-5 text-purple-500" />,
          filteredManagers,
          'managers'
        )}
        {renderSection(
          language === 'ru' ? 'Главы отделов' : 'Bo\'lim boshliqlari',
          <UserCog className="w-5 h-5 text-primary-500" />,
          filteredDepartmentHeads,
          'departmentHeads'
        )}
        {renderSection(
          language === 'ru' ? 'Исполнители' : 'Ijrochilar',
          <Wrench className="w-5 h-5 text-green-500" />,
          filteredExecutors,
          'executors'
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-backdrop items-end sm:items-center" onClick={() => setShowAddModal(false)}>
          <div className="modal-content p-4 sm:p-6 w-full max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold">{language === 'ru' ? 'Добавить сотрудника' : 'Xodim qo\'shish'}</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-3 text-sm">
                {addError}
              </div>
            )}

            <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 -mx-4 px-4 sm:-mx-6 sm:px-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Роль' : 'Rol'} *</label>
                  <select
                    value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value as 'manager' | 'department_head' | 'executor', managerType: 'manager' })}
                    className="input-field"
                  >
                    <option value="executor">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</option>
                    <option value="department_head">{language === 'ru' ? 'Глава отдела' : 'Bo\'lim boshlig\'i'}</option>
                    <option value="manager">{language === 'ru' ? 'Менеджер' : 'Menejer'}</option>
                  </select>
                </div>

                {(addForm.role === 'executor' || addForm.role === 'department_head') ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'} *</label>
                    <select
                      value={addForm.specialization}
                      onChange={(e) => setAddForm({ ...addForm, specialization: e.target.value as ExecutorSpecialization })}
                      className="input-field"
                    >
                      <option value="">{language === 'ru' ? 'Выберите' : 'Tanlang'}</option>
                      <option value="plumber">{language === 'ru' ? 'Сантехник' : 'Santexnik'}</option>
                      <option value="electrician">{language === 'ru' ? 'Электрик' : 'Elektrik'}</option>
                      <option value="elevator">{language === 'ru' ? 'Лифтёр' : 'Liftchi'}</option>
                      <option value="intercom">{language === 'ru' ? 'Домофон' : 'Domofon'}</option>
                      <option value="cleaning">{language === 'ru' ? 'Уборщица' : 'Tozalovchi'}</option>
                      <option value="security">{language === 'ru' ? 'Охранник' : 'Qorovul'}</option>
                      <option value="trash">{language === 'ru' ? 'Вывоз мусора' : 'Chiqindi tashish'}</option>
                      <option value="boiler">{language === 'ru' ? 'Котельщик' : 'Qozonxonachi'}</option>
                      <option value="ac">{language === 'ru' ? 'Кондиционерщик' : 'Konditsionerchi'}</option>
                      <option value="courier">{language === 'ru' ? 'Курьер' : 'Kuryer'}</option>
                      <option value="other">{language === 'ru' ? 'Другое' : 'Boshqa'}</option>
                    </select>
                  </div>
                ) : addForm.role === 'manager' && hasFeature('advertiser') ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Тип' : 'Turi'}</label>
                    <select
                      value={addForm.managerType}
                      onChange={(e) => setAddForm({ ...addForm, managerType: e.target.value as 'manager' | 'advertiser' })}
                      className="input-field"
                    >
                      <option value="manager">{language === 'ru' ? 'Менеджер' : 'Menejer'}</option>
                      <option value="advertiser">{language === 'ru' ? 'Реклама' : 'Reklama'}</option>
                    </select>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.O.'} *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const login = generateLogin(name);
                    setAddForm({ ...addForm, name, login });
                  }}
                  className="input-field"
                  placeholder={language === 'ru' ? 'Иванов Иван Иванович' : 'Ismailov Ismoil Ismailovich'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
                <input
                  type="text"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="input-field"
                  placeholder="+998 XX XXX XX XX"
                  maxLength={13}
                />
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="text-sm font-medium text-gray-700 mb-3">{language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}</div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Логин' : 'Login'} *</label>
                    <input
                      type="text"
                      value={addForm.login}
                      onChange={(e) => setAddForm({ ...addForm, login: e.target.value })}
                      className="input-field"
                      placeholder="ivanov.ii"
                    />
                    <p className="text-xs text-gray-400 mt-1">{language === 'ru' ? 'Генерируется из ФИО, можно изменить' : 'F.I.O. dan yaratiladi, o\'zgartirish mumkin'}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'} *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={addForm.password}
                        onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                        className="input-field flex-1 min-w-0 font-mono tracking-wide"
                      />
                      <button
                        type="button"
                        onClick={() => setAddForm({ ...addForm, password: generatePassword() })}
                        className="btn-secondary px-3 flex-shrink-0"
                        title={language === 'ru' ? 'Сгенерировать пароль' : 'Parol yaratish'}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(addForm.password, 'addPassword')}
                        className="btn-secondary px-3 flex-shrink-0"
                        title={language === 'ru' ? 'Копировать пароль' : 'Parolni nusxalash'}
                      >
                        {copiedField === 'addPassword' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 sm:mt-6 pt-3 border-t sm:border-t-0 sm:pt-0">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-secondary flex-1"
                disabled={addLoading}
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={handleAddMember}
                disabled={addLoading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {addLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedMember && (
        <div className="modal-backdrop items-end sm:items-center" onClick={handleCloseDetails}>
          <div className="modal-content p-4 sm:p-6 w-full max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-2xl font-medium text-primary-700">
                  {selectedMember.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedMember.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[selectedMember.role]}`}>
                      {ROLE_LABELS[selectedMember.role]}
                    </span>
                    {selectedMember.specialization && (
                      <span className="text-sm text-gray-500">
                        {getSpecLabel(selectedMember.specialization)}
                      </span>
                    )}
                  </div>
                  {getStatusBadge(selectedMember.status)}
                </div>
              </div>
              <button onClick={handleCloseDetails} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats for executors */}
            {selectedMember.role === 'executor' && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
                    <Star className="w-4 h-4" />
                    <span className="font-bold text-lg">{selectedMember.avg_rating || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <Award className="w-4 h-4" />
                    <span className="font-bold text-lg">{selectedMember.completed_count || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</div>
                </div>
                <div className="bg-primary-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-primary-600 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="font-bold text-lg">{selectedMember.active_count || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
                </div>
              </div>
            )}

            {/* Info / Edit Form */}
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.O.'}</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'}</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="input-field"
                    maxLength={13}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Логин' : 'Login'}</label>
                  <input
                    type="text"
                    value={editForm.login}
                    onChange={(e) => setEditForm({ ...editForm, login: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Новый пароль' : 'Yangi parol'}</label>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="input-field"
                    placeholder={language === 'ru' ? 'Оставьте пустым, чтобы не менять' : 'O\'zgartirmaslik uchun bo\'sh qoldiring'}
                  />
                </div>
                {(selectedMember.role === 'executor' || selectedMember.role === 'department_head') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'}</label>
                    <select
                      value={editForm.specialization}
                      onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value as ExecutorSpecialization })}
                      className="input-field"
                    >
                      <option value="">{language === 'ru' ? 'Не указана' : 'Ko\'rsatilmagan'}</option>
                      <option value="plumber">{language === 'ru' ? 'Сантехник' : 'Santexnik'}</option>
                      <option value="electrician">{language === 'ru' ? 'Электрик' : 'Elektrik'}</option>
                      <option value="elevator">{language === 'ru' ? 'Лифтёр' : 'Liftchi'}</option>
                      <option value="intercom">{language === 'ru' ? 'Домофон' : 'Domofon'}</option>
                      <option value="cleaning">{language === 'ru' ? 'Уборщица' : 'Tozalovchi'}</option>
                      <option value="gardener">{language === 'ru' ? 'Садовник' : 'Bog\'bon'}</option>
                      <option value="security">{language === 'ru' ? 'Охранник' : 'Qorovul'}</option>
                      <option value="trash">{language === 'ru' ? 'Вывоз мусора' : 'Chiqindi tashish'}</option>
                      <option value="boiler">{language === 'ru' ? 'Котельщик' : 'Qozonxonachi'}</option>
                      <option value="ac">{language === 'ru' ? 'Кондиционерщик' : 'Konditsionerchi'}</option>
                      <option value="other">{language === 'ru' ? 'Другое' : 'Boshqa'}</option>
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Contact Info */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span className="text-sm">{language === 'ru' ? 'Телефон' : 'Telefon'}</span>
                    </div>
                    <span className="font-medium">{selectedMember.phone}</span>
                  </div>
                </div>

                {/* Credentials */}
                <div className="bg-primary-50 rounded-xl p-4 space-y-3">
                  <div className="text-sm font-medium text-primary-800 mb-2">{language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}</div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}</span>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono">{selectedMember.login}</code>
                      <button
                        onClick={() => handleCopy(selectedMember.login, 'login')}
                        className="p-1 hover:bg-primary-100 rounded"
                        title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                      >
                        {copiedField === 'login' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Пароль' : 'Parol'}</span>
                    <div className="flex items-center gap-2">
                      {isLoadingDetails ? (
                        <span className="flex items-center gap-2 text-sm text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                        </span>
                      ) : selectedMember.password ? (
                        <>
                          <code className="bg-white px-2 py-1 rounded text-sm font-mono">
                            {showPassword ? selectedMember.password : '••••••••'}
                          </code>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowPassword(!showPassword);
                            }}
                            className="p-2 hover:bg-primary-100 active:bg-primary-200 rounded touch-manipulation z-10"
                            title={showPassword ? (language === 'ru' ? 'Скрыть пароль' : 'Parolni yashirish') : (language === 'ru' ? 'Показать пароль' : 'Parolni ko\'rsatish')}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                          </button>
                          <button
                            onClick={() => handleCopy(selectedMember.password || '', 'password')}
                            className="p-1 hover:bg-primary-100 rounded"
                            title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                          >
                            {copiedField === 'password' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400 italic">{language === 'ru' ? 'Задайте через "Редактировать"' : '"Tahrirlash" orqali belgilang'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Created date */}
                <div className="text-sm text-gray-500 text-center">
                  {language === 'ru' ? 'Добавлен' : 'Qo\'shilgan'}: {new Date(selectedMember.created_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              {isEditing ? (
                <>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary flex-1">
                    {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                  </button>
                  <button onClick={handleSaveChanges} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    {language === 'ru' ? 'Сохранить' : 'Saqlash'}
                  </button>
                </>
              ) : (
                <button onClick={() => setIsEditing(true)} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal - shows after creating new user */}
      {showCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{language === 'ru' ? 'Сотрудник создан!' : 'Xodim yaratildi!'}</h3>
              <p className="text-gray-500 mt-2">{language === 'ru' ? 'Сохраните учетные данные для входа' : 'Kirish ma\'lumotlarini saqlang'}</p>
            </div>

            <div className="space-y-4 bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}</span>
                <div className="flex items-center gap-2">
                  <code className="bg-white px-3 py-1.5 rounded-lg text-sm font-mono font-medium">
                    {showCredentialsModal.login}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(showCredentialsModal.login);
                      setCopiedField('cred-login');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {copiedField === 'cred-login' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{language === 'ru' ? 'Пароль' : 'Parol'}</span>
                <div className="flex items-center gap-2">
                  <code className="bg-white px-3 py-1.5 rounded-lg text-sm font-mono font-medium">
                    {showCredentialsModal.password}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(showCredentialsModal.password);
                      setCopiedField('cred-password');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {copiedField === 'cred-password' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
              <p className="text-sm text-yellow-800">
                {language === 'ru'
                  ? '⚠️ Сохраните эти данные! Пароль показывается только один раз.'
                  : '⚠️ Bu ma\'lumotlarni saqlang! Parol faqat bir marta ko\'rsatiladi.'}
              </p>
            </div>

            <button
              onClick={() => setShowCredentialsModal(null)}
              className="btn-primary w-full mt-6"
            >
              {language === 'ru' ? 'Готово' : 'Tayyor'}
            </button>
          </div>
        </div>
      )}

      {/* Staff Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[18px] font-extrabold">{language === 'ru' ? 'Импорт персонала' : 'Xodimlarni import qilish'}</h3>
                <p className="text-[13px] text-gray-400 mt-0.5">{language === 'ru' ? 'Загрузите .json файл с данными сотрудников' : 'Xodimlar ma\'lumotlari bilan .json faylni yuklang'}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              onClick={() => importFileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              {importFile ? (
                <div>
                  <p className="text-[14px] font-bold text-gray-700">{importFile.name}</p>
                  <p className="text-[12px] text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-[14px] font-bold text-gray-600">{language === 'ru' ? 'Выберите файл' : 'Faylni tanlang'}</p>
                  <p className="text-[12px] text-gray-400 mt-1">{language === 'ru' ? 'Поддерживается .json формат' : '.json format qo\'llab-quvvatlanadi'}</p>
                </div>
              )}
              <input ref={importFileRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImportFile(f); setImportResult(null); } }} />
            </div>

            {importResult && (
              <div className={`mt-4 p-4 rounded-xl ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {importResult.success ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-[14px] font-bold text-green-700">{language === 'ru' ? 'Импорт успешен!' : 'Import muvaffaqiyatli!'}</span>
                    </div>
                    <div className="flex gap-4">
                      {importResult.stats?.created > 0 && (
                        <div className="text-center"><div className="text-[22px] font-extrabold text-green-600">{importResult.stats.created}</div><div className="text-[11px] text-gray-400">{language === 'ru' ? 'Создано' : 'Yaratildi'}</div></div>
                      )}
                      {importResult.stats?.updated > 0 && (
                        <div className="text-center"><div className="text-[22px] font-extrabold text-blue-600">{importResult.stats.updated}</div><div className="text-[11px] text-gray-400">{language === 'ru' ? 'Обновлено' : 'Yangilandi'}</div></div>
                      )}
                      {importResult.stats?.skipped > 0 && (
                        <div className="text-center"><div className="text-[22px] font-extrabold text-gray-400">{importResult.stats.skipped}</div><div className="text-[11px] text-gray-400">{language === 'ru' ? 'Пропущено' : 'O\'tkazib yuborildi'}</div></div>
                      )}
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
              <button onClick={() => setShowImportModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-bold text-gray-600 hover:bg-gray-50 transition-all">
                {language === 'ru' ? 'Закрыть' : 'Yopish'}
              </button>
              <button onClick={handleImportStaff} disabled={!importFile || importLoading}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-all disabled:opacity-50">
                {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {language === 'ru' ? 'Импортировать' : 'Import qilish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
