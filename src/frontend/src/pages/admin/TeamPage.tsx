import { useState, useEffect } from 'react';
import {
  UserCog, Wrench, Phone, Star, X, Eye, EyeOff, Plus,
  Copy, Check, Edit3, Save, Clock, Award, Loader2, RefreshCw,
  Shield, ChevronDown, ChevronUp, Search, Filter,
  Droplets, Zap, ArrowUpDown, Bell, Brush, ShieldCheck,
  Hammer, Flame, Wind, Trash2, Key, Truck
} from 'lucide-react';
import { teamApi } from '../../services/api';
import { SPECIALIZATION_LABELS } from '../../types';
import type { ExecutorSpecialization } from '../../types';

interface StaffMember {
  id: string;
  login: string;
  password?: string;
  name: string;
  phone: string;
  role: 'admin' | 'manager' | 'department_head' | 'executor';
  specialization?: ExecutorSpecialization;
  status?: string;
  created_at: string;
  completed_count?: number;
  active_count?: number;
  avg_rating?: number;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  department_head: 'Глава отдела',
  executor: 'Исполнитель',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
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
  carpenter: <Hammer className="w-4 h-4" />,
  boiler: <Flame className="w-4 h-4" />,
  ac: <Wind className="w-4 h-4" />,
  courier: <Truck className="w-4 h-4" />,
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
  carpenter: 'bg-amber-100 text-amber-700',
  boiler: 'bg-orange-100 text-orange-700',
  ac: 'bg-cyan-100 text-cyan-700',
  courier: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
};

export function TeamPage() {
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
    role: 'executor' as 'admin' | 'manager' | 'department_head' | 'executor',
    specialization: '' as ExecutorSpecialization | '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
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
      alert('Ошибка сохранения: ' + err.message);
    }
  };

  // Generate random password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Handle add new member
  const handleAddMember = async () => {
    setAddError(null);

    // Validation
    if (!addForm.name.trim()) {
      setAddError('Введите ФИО');
      return;
    }
    if (!addForm.login.trim()) {
      setAddError('Введите логин');
      return;
    }
    if (!addForm.password.trim()) {
      setAddError('Введите пароль');
      return;
    }
    if ((addForm.role === 'executor' || addForm.role === 'department_head') && !addForm.specialization) {
      setAddError('Выберите специализацию');
      return;
    }

    setAddLoading(true);
    try {
      const result = await teamApi.create({
        login: addForm.login,
        password: addForm.password,
        name: addForm.name,
        phone: addForm.phone,
        role: addForm.role,
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
        specialization: '',
      });
      setShowAddModal(false);

      // Refresh data
      await fetchTeam();
    } catch (err: any) {
      setAddError(err.message || 'Ошибка создания сотрудника');
    } finally {
      setAddLoading(false);
    }
  };

  const openAddModal = (role: 'admin' | 'manager' | 'department_head' | 'executor' = 'executor') => {
    setAddForm({
      name: '',
      phone: '',
      login: '',
      password: generatePassword(),
      role,
      specialization: '',
    });
    setAddError(null);
    setShowAddModal(true);
  };

  // Handle delete member
  const handleDeleteMember = async (member: StaffMember) => {
    if (!confirm(`Удалить сотрудника "${member.name}"? Это действие необратимо.`)) {
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
      alert('Ошибка удаления: ' + err.message);
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
      alert('Все сотрудники уже имеют пароли');
      return;
    }

    if (!confirm(`Сбросить пароли для ${staffWithoutPassword.length} сотрудников без паролей?\n\nЭто сгенерирует новые пароли для всех сотрудников, у которых не отображается пароль.`)) {
      return;
    }

    try {
      setLoading(true);
      const result = await teamApi.resetAllPasswords();

      if (result.updated > 0) {
        // Show list of updated users with their new passwords
        const message = result.staff.map(s => `${s.name}: ${s.login} / ${s.password}`).join('\n');
        alert(`Обновлено ${result.updated} сотрудников:\n\n${message}`);
      } else {
        alert(result.message);
      }

      // Refresh data
      await fetchTeam();
    } catch (err: any) {
      alert('Ошибка сброса паролей: ' + err.message);
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
      case 'available': return <span className="badge badge-done text-xs">Доступен</span>;
      case 'busy': return <span className="badge badge-progress text-xs">Занят</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600 text-xs">Не в сети</span>;
      default: return null;
    }
  };

  const renderStaffCard = (member: StaffMember) => (
    <div
      key={member.id}
      className="glass-card p-4 hover:shadow-lg transition-shadow cursor-pointer relative group"
      onClick={() => handleOpenDetails(member)}
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteMember(member);
        }}
        className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        title="Удалить сотрудника"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="flex items-start justify-between mb-3 pr-8">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium ${
            member.specialization
              ? SPECIALIZATION_COLORS[member.specialization]
              : 'bg-primary-100 text-primary-700'
          }`}>
            {member.specialization
              ? SPECIALIZATION_ICONS[member.specialization]
              : member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
            }
          </div>
          <div>
            <h3 className="font-semibold">{member.name}</h3>
            {member.specialization && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                {SPECIALIZATION_LABELS[member.specialization] || member.specialization}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
            {ROLE_LABELS[member.role]}
          </span>
          {getStatusBadge(member.status)}
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          {member.phone}
        </div>
        {(member.role === 'executor' || member.role === 'department_head') && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-400" />
              {member.avg_rating || 0}
            </div>
            <div className="flex items-center gap-1">
              <Check className="w-4 h-4 text-green-500" />
              {member.completed_count || 0} выполнено
            </div>
            {member.active_count ? (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-blue-500" />
                {member.active_count} активных
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
        className="w-full p-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-sm">
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
        <div className="p-4">
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Нет сотрудников
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Персонал</h1>
          <p className="text-gray-500 text-sm mt-1">
            Всего: {admins.length + managers.length + departmentHeads.length + executors.length} сотрудников
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          {/* Specialization Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={specializationFilter}
              onChange={(e) => setSpecializationFilter(e.target.value as ExecutorSpecialization | 'all')}
              className="pl-10 pr-8 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="all">Все специализации</option>
              {allSpecializations.map(spec => (
                <option key={spec} value={spec}>{SPECIALIZATION_LABELS[spec]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchTeam}
            className="btn-secondary p-2"
            title="Обновить"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {/* Show reset passwords button only if there are staff without passwords */}
          {[...admins, ...managers, ...departmentHeads, ...executors].some(m => !m.password) && (
            <button
              onClick={handleResetAllPasswords}
              className="btn-secondary flex items-center gap-2 text-orange-600 hover:bg-orange-50"
              title="Сбросить пароли для сотрудников без паролей"
            >
              <Key className="w-5 h-5" />
              <span className="hidden sm:inline">Сбросить пароли</span>
            </button>
          )}
          <button
            onClick={() => openAddModal('executor')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Добавить сотрудника</span>
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {admins.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{admins.length}</div>
                <div className="text-sm text-gray-500">Администраторов</div>
              </div>
            </div>
          </div>
        )}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{managers.length}</div>
              <div className="text-sm text-gray-500">Менеджеров</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <UserCog className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{departmentHeads.length}</div>
              <div className="text-sm text-gray-500">Глав отделов</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Wrench className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{executors.length}</div>
              <div className="text-sm text-gray-500">Исполнителей</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {filteredAdmins.length > 0 && renderSection(
          'Администраторы',
          <Shield className="w-5 h-5 text-red-500" />,
          filteredAdmins,
          'admins'
        )}
        {renderSection(
          'Менеджеры',
          <Shield className="w-5 h-5 text-purple-500" />,
          filteredManagers,
          'managers'
        )}
        {renderSection(
          'Главы отделов',
          <UserCog className="w-5 h-5 text-blue-500" />,
          filteredDepartmentHeads,
          'departmentHeads'
        )}
        {renderSection(
          'Исполнители',
          <Wrench className="w-5 h-5 text-green-500" />,
          filteredExecutors,
          'executors'
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-content p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Добавить сотрудника</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm">
                {addError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Роль *</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value as 'admin' | 'manager' | 'department_head' | 'executor' })}
                  className="input-field"
                >
                  <option value="executor">Исполнитель</option>
                  <option value="department_head">Глава отдела</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ФИО *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="input-field"
                  placeholder="Иванов Иван Иванович"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input
                  type="text"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="input-field"
                  placeholder="+998 XX XXX XX XX"
                />
              </div>

              {(addForm.role === 'executor' || addForm.role === 'department_head') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Специализация *</label>
                  <select
                    value={addForm.specialization}
                    onChange={(e) => setAddForm({ ...addForm, specialization: e.target.value as ExecutorSpecialization })}
                    className="input-field"
                  >
                    <option value="">Выберите специализацию</option>
                    <option value="plumber">Сантехник</option>
                    <option value="electrician">Электрик</option>
                    <option value="elevator">Лифтёр</option>
                    <option value="intercom">Домофон</option>
                    <option value="cleaning">Уборщица</option>
                    <option value="security">Охранник</option>
                    <option value="carpenter">Столяр</option>
                    <option value="boiler">Котельщик</option>
                    <option value="ac">Кондиционерщик</option>
                    <option value="courier">Курьер</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
              )}

              <div className="border-t pt-4 mt-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Данные для входа</div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Логин *</label>
                  <input
                    type="text"
                    value={addForm.login}
                    onChange={(e) => setAddForm({ ...addForm, login: e.target.value })}
                    className="input-field"
                    placeholder="ivanov"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Пароль *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      className="input-field flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setAddForm({ ...addForm, password: generatePassword() })}
                      className="btn-secondary px-3"
                      title="Сгенерировать пароль"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(addForm.password, 'addPassword')}
                      className="btn-secondary px-3"
                      title="Копировать пароль"
                    >
                      {copiedField === 'addPassword' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-secondary flex-1"
                disabled={addLoading}
              >
                Отмена
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
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedMember && (
        <div className="modal-backdrop" onClick={handleCloseDetails}>
          <div className="modal-content p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
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
                        {SPECIALIZATION_LABELS[selectedMember.specialization]}
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
                  <div className="text-xs text-gray-500">Рейтинг</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <Award className="w-4 h-4" />
                    <span className="font-bold text-lg">{selectedMember.completed_count || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">Выполнено</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="font-bold text-lg">{selectedMember.active_count || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">Активных</div>
                </div>
              </div>
            )}

            {/* Info / Edit Form */}
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ФИО</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
                  <input
                    type="text"
                    value={editForm.login}
                    onChange={(e) => setEditForm({ ...editForm, login: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                  <input
                    type="text"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    className="input-field"
                    placeholder="Оставьте пустым, чтобы не менять"
                  />
                </div>
                {(selectedMember.role === 'executor' || selectedMember.role === 'department_head') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Специализация</label>
                    <select
                      value={editForm.specialization}
                      onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value as ExecutorSpecialization })}
                      className="input-field"
                    >
                      <option value="">Не указана</option>
                      <option value="plumber">Сантехник</option>
                      <option value="electrician">Электрик</option>
                      <option value="elevator">Лифтёр</option>
                      <option value="intercom">Домофон</option>
                      <option value="cleaning">Уборщица</option>
                      <option value="gardener">Садовник</option>
                      <option value="security">Охранник</option>
                      <option value="carpenter">Столяр</option>
                      <option value="boiler">Котельщик</option>
                      <option value="ac">Кондиционерщик</option>
                      <option value="other">Другое</option>
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
                      <span className="text-sm">Телефон</span>
                    </div>
                    <span className="font-medium">{selectedMember.phone}</span>
                  </div>
                </div>

                {/* Credentials */}
                <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                  <div className="text-sm font-medium text-blue-800 mb-2">Данные для входа</div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Логин</span>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono">{selectedMember.login}</code>
                      <button
                        onClick={() => handleCopy(selectedMember.login, 'login')}
                        className="p-1 hover:bg-blue-100 rounded"
                        title="Копировать"
                      >
                        {copiedField === 'login' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Пароль</span>
                    <div className="flex items-center gap-2">
                      {isLoadingDetails ? (
                        <span className="flex items-center gap-2 text-sm text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Загрузка...
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
                            className="p-2 hover:bg-blue-100 active:bg-blue-200 rounded touch-manipulation z-10"
                            title={showPassword ? 'Скрыть' : 'Показать'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                          </button>
                          <button
                            onClick={() => handleCopy(selectedMember.password || '', 'password')}
                            className="p-1 hover:bg-blue-100 rounded"
                            title="Копировать"
                          >
                            {copiedField === 'password' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Задайте через "Редактировать"</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Created date */}
                <div className="text-sm text-gray-500 text-center">
                  Добавлен: {new Date(selectedMember.created_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              {isEditing ? (
                <>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary flex-1">
                    Отмена
                  </button>
                  <button onClick={handleSaveChanges} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    Сохранить
                  </button>
                </>
              ) : (
                <button onClick={() => setIsEditing(true)} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  Редактировать
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal - shows after creating new user */}
      {showCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Сотрудник создан!</h3>
              <p className="text-gray-500 mt-2">Сохраните учетные данные для входа</p>
            </div>

            <div className="space-y-4 bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Логин</span>
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
                <span className="text-sm text-gray-600">Пароль</span>
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
                ⚠️ Сохраните эти данные! Пароль показывается только один раз.
              </p>
            </div>

            <button
              onClick={() => setShowCredentialsModal(null)}
              className="btn-primary w-full mt-6"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
