import { useState, useEffect, useMemo } from 'react';
import { Phone, Star, X, Eye, EyeOff, Copy, Check, Edit3, Save, Clock, Award, Loader2, RefreshCw } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { executorsApi } from '../../services/api';
import type { Executor, ExecutorSpecialization } from '../../types';

export function ExecutorsPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const { executors, addExecutor, updateExecutor, deleteExecutor, fetchExecutors, isLoadingExecutors } = useDataStore();

  // Check if user is department head - they can only see and manage their department's executors
  const isDepartmentHead = user?.role === 'department_head';
  const userSpecialization = user?.specialization;

  // Filter executors by department if user is department head
  const filteredExecutors = useMemo(() => {
    if (isDepartmentHead && userSpecialization) {
      return executors.filter(e => e.specialization === userSpecialization);
    }
    return executors;
  }, [executors, isDepartmentHead, userSpecialization]);

  // Fetch executors from API on mount
  useEffect(() => {
    fetchExecutors();
  }, [fetchExecutors]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedExecutor, setSelectedExecutor] = useState<Executor | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [createdPasswords, setCreatedPasswords] = useState<Record<string, string>>({});
  // @ts-ignore - used in modal
  const [showCredentialsModal, setShowCredentialsModal] = useState<{ login: string; password: string } | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    login: '',
    password: '',
    specialization: 'plumber' as ExecutorSpecialization,
  });
  const [newExecutor, setNewExecutor] = useState<{
    name: string;
    phone: string;
    login: string;
    password: string;
    specialization: ExecutorSpecialization;
    role: 'executor' | 'department_head';
  }>({
    name: '',
    phone: '',
    login: '',
    password: '',
    specialization: 'plumber',
    role: 'executor',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Specialization labels with language support
  const specLabels: Record<ExecutorSpecialization, string> = language === 'ru' ? {
    plumber: 'Сантехник',
    electrician: 'Электрик',
    elevator: 'Лифтёр',
    intercom: 'Домофон',
    cleaning: 'Уборщица',
    security: 'Охранник',
    trash: 'Вывоз мусора',
    boiler: 'Котельщик',
    ac: 'Кондиционерщик',
    courier: 'Курьер',
    gardener: 'Садовник',
    other: 'Другое',
  } : {
    plumber: 'Santexnik',
    electrician: 'Elektrik',
    elevator: 'Liftchi',
    intercom: 'Domofon',
    cleaning: 'Tozalovchi',
    security: 'Qo\'riqchi',
    trash: 'Chiqindi tashish',
    boiler: 'Qozonchi',
    ac: 'Konditsionerchi',
    courier: 'Kuryer',
    gardener: 'Bog\'bon',
    other: 'Boshqa',
  };

  const handleOpenDetails = async (executor: Executor) => {
    // Show modal immediately with cached data
    setSelectedExecutor(executor);
    setEditForm({
      name: executor.name,
      phone: executor.phone,
      login: executor.login,
      password: executor.password || '',
      specialization: executor.specialization,
    });
    setIsEditing(false);
    setShowPassword(false);

    // Then fetch fresh data from API (including password)
    setIsLoadingDetails(true);
    try {
      const response = await executorsApi.getById(executor.id);
      if (response.executor) {
        const freshData = {
          ...executor,
          ...response.executor,
          // Map API field names to frontend field names
          createdAt: response.executor.created_at || executor.createdAt,
        };
        setSelectedExecutor(freshData);
        setEditForm({
          name: freshData.name,
          phone: freshData.phone,
          login: freshData.login,
          password: freshData.password || '',
          specialization: freshData.specialization,
        });
      }
    } catch (err) {
      console.error('Failed to fetch executor details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedExecutor(null);
    setIsEditing(false);
    setShowPassword(false);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveChanges = () => {
    if (!selectedExecutor) return;
    updateExecutor(selectedExecutor.id, editForm);

    // Save password locally if it was changed
    if (editForm.password) {
      setCreatedPasswords(prev => ({
        ...prev,
        [selectedExecutor.id]: editForm.password
      }));
    }

    setSelectedExecutor({ ...selectedExecutor, ...editForm });
    setIsEditing(false);
  };

  const handleDeleteExecutor = async () => {
    if (!selectedExecutor) return;
    if (confirm(language === 'ru' ? 'Вы уверены, что хотите удалить этого исполнителя?' : 'Ushbu ijrochini o\'chirishni xohlaysizmi?')) {
      setIsDeleting(true);
      try {
        await deleteExecutor(selectedExecutor.id);
        handleCloseDetails();
      } catch (error: any) {
        alert(error.message || (language === 'ru' ? 'Ошибка при удалении' : 'O\'chirishda xatolik'));
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge badge-done">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge badge-progress">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600">{language === 'ru' ? 'Не в сети' : 'Oflayn'}</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const handleAddExecutor = async () => {
    if (!newExecutor.name || !newExecutor.phone || !newExecutor.login || !newExecutor.password) {
      setAddError(language === 'ru' ? 'Заполните все обязательные поля' : 'Barcha majburiy maydonlarni to\'ldiring');
      return;
    }
    setIsAdding(true);
    setAddError(null);
    try {
      const result = await addExecutor(newExecutor);

      // Save password locally for this user
      if (result?.id) {
        setCreatedPasswords(prev => ({ ...prev, [result.id]: newExecutor.password }));
      }

      // Show credentials modal
      setShowCredentialsModal({
        login: newExecutor.login,
        password: newExecutor.password,
      });

      setNewExecutor({ name: '', phone: '', login: '', password: '', specialization: 'plumber', role: 'executor' });
      setShowAddModal(false);
      // Refresh the list
      fetchExecutors();
    } catch (error: any) {
      setAddError(error.message || (language === 'ru' ? 'Ошибка при добавлении исполнителя' : 'Ijrochi qo\'shishda xatolik'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isDepartmentHead
              ? (language === 'ru' ? 'Мои сотрудники' : 'Mening xodimlarim')
              : (language === 'ru' ? 'Исполнители' : 'Ijrochilar')}
          </h1>
          {isDepartmentHead && userSpecialization && (
            <p className="text-gray-500 text-sm mt-1">
              {language === 'ru' ? 'Отдел' : 'Bo\'lim'}: {specLabels[userSpecialization as ExecutorSpecialization]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchExecutors()}
            className="btn-secondary p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation active:scale-95"
            title={language === 'ru' ? 'Обновить' : 'Yangilash'}
            disabled={isLoadingExecutors}
          >
            <RefreshCw className={`w-5 h-5 ${isLoadingExecutors ? 'animate-spin' : ''}`} />
          </button>
          {/* Department heads can add executors of their department */}
          <button
            onClick={() => {
              // For department heads, pre-set specialization to their department
              if (isDepartmentHead && userSpecialization) {
                setNewExecutor(prev => ({
                  ...prev,
                  specialization: userSpecialization as ExecutorSpecialization,
                  role: 'executor' // Department heads can only add executors, not other roles
                }));
              }
              setShowAddModal(true);
            }}
            className="btn-primary min-h-[44px] touch-manipulation active:scale-95"
          >
            + {language === 'ru' ? 'Добавить исполнителя' : 'Ijrochi qo\'shish'}
          </button>
        </div>
      </div>
      {isLoadingExecutors ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filteredExecutors.map((executor) => (
          <div
            key={executor.id}
            className="glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-lg font-medium text-primary-700">
                  {executor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 className="font-semibold">{executor.name}</h3>
                  <div className="text-sm text-gray-500">{specLabels[executor.specialization] || (language === 'ru' ? 'Не указана' : 'Ko\'rsatilmagan')}</div>
                </div>
              </div>
              {getStatusBadge(executor.status)}
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                {executor.phone}
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                {executor.rating} • {executor.completedCount} {language === 'ru' ? 'выполнено' : 'bajarildi'}
              </div>
            </div>
            <button
              type="button"
              className="w-full btn-secondary text-sm py-2 min-h-[44px] touch-manipulation active:scale-95"
              onClick={() => handleOpenDetails(executor)}
            >
              {language === 'ru' ? 'Подробнее' : 'Batafsil'}
            </button>
          </div>
        ))}
      </div>
      )}

      {/* Add Executor Modal */}
      {showAddModal && (
        <div className="modal-backdrop items-end sm:items-center">
          <div className="modal-content p-4 sm:p-6 w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl">
            <h2 className="text-xl font-bold mb-4">
              {isDepartmentHead
                ? (language === 'ru' ? 'Добавить сотрудника в отдел' : 'Bo\'limga xodim qo\'shish')
                : (language === 'ru' ? 'Добавить сотрудника' : 'Xodim qo\'shish')}
            </h2>
            {isDepartmentHead && userSpecialization && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4">
                {language === 'ru' ? 'Отдел' : 'Bo\'lim'}: <strong>{specLabels[userSpecialization as ExecutorSpecialization]}</strong>
              </div>
            )}
            {addError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {addError}
              </div>
            )}
            <div className="space-y-4">
              {/* Role selector - only for admins/managers, not for department heads */}
              {!isDepartmentHead && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Роль' : 'Rol'} *</label>
                  <select
                    value={newExecutor.role}
                    onChange={(e) => setNewExecutor({ ...newExecutor, role: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="executor">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</option>
                    <option value="department_head">{language === 'ru' ? 'Начальник отдела' : 'Bo\'lim boshlig\'i'}</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.Sh'} *</label>
                <input
                  type="text"
                  value={newExecutor.name}
                  onChange={(e) => setNewExecutor({ ...newExecutor, name: e.target.value })}
                  className="input-field"
                  placeholder={language === 'ru' ? 'Фамилия Имя Отчество' : 'Familiya Ism Sharif'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Телефон' : 'Telefon'} *</label>
                <input
                  type="text"
                  value={newExecutor.phone}
                  onChange={(e) => setNewExecutor({ ...newExecutor, phone: e.target.value })}
                  className="input-field"
                  placeholder="+998 90 123 45 67"
                  maxLength={13}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Логин' : 'Login'} *</label>
                <input
                  type="text"
                  value={newExecutor.login}
                  onChange={(e) => setNewExecutor({ ...newExecutor, login: e.target.value })}
                  className="input-field"
                  placeholder="login"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Пароль' : 'Parol'} *</label>
                <input
                  type="password"
                  value={newExecutor.password}
                  onChange={(e) => setNewExecutor({ ...newExecutor, password: e.target.value })}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>
              {/* Specialization selector - only for admins/managers, not for department heads */}
              {!isDepartmentHead && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация/Отдел' : 'Mutaxassislik/Bo\'lim'} *</label>
                  <select
                    value={newExecutor.specialization}
                    onChange={(e) => setNewExecutor({ ...newExecutor, specialization: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="plumber">{specLabels.plumber}</option>
                    <option value="electrician">{specLabels.electrician}</option>
                    <option value="elevator">{specLabels.elevator}</option>
                    <option value="intercom">{specLabels.intercom}</option>
                    <option value="cleaning">{specLabels.cleaning}</option>
                    <option value="gardener">{language === 'ru' ? 'Садовник' : 'Bog\'bon'}</option>
                    <option value="security">{specLabels.security}</option>
                    <option value="trash">{specLabels.trash}</option>
                    <option value="boiler">{specLabels.boiler}</option>
                    <option value="ac">{specLabels.ac}</option>
                    <option value="courier">{specLabels.courier}</option>
                    <option value="other">{specLabels.other}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddModal(false); setAddError(null); }}
                className="btn-secondary flex-1"
                disabled={isAdding}
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={handleAddExecutor}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={isAdding}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'ru' ? 'Добавление...' : 'Qo\'shilmoqda...'}
                  </>
                ) : (
                  language === 'ru' ? 'Добавить' : 'Qo\'shish'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Executor Details Modal */}
      {selectedExecutor && (
        <div className="modal-backdrop items-end sm:items-center" onClick={handleCloseDetails}>
          <div className="modal-content p-4 sm:p-6 w-full max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-2xl font-medium text-primary-700">
                  {selectedExecutor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedExecutor.name}</h2>
                  <div className="text-gray-500">{specLabels[selectedExecutor.specialization] || (language === 'ru' ? 'Не указана' : 'Ko\'rsatilmagan')}</div>
                  {getStatusBadge(selectedExecutor.status)}
                </div>
              </div>
              <button onClick={handleCloseDetails} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
                  <Star className="w-4 h-4" />
                  <span className="font-bold text-lg">{selectedExecutor.rating}</span>
                </div>
                <div className="text-xs text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                  <Award className="w-4 h-4" />
                  <span className="font-bold text-lg">{selectedExecutor.completedCount}</span>
                </div>
                <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarildi'}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="font-bold text-lg">{selectedExecutor.activeRequests || 0}</span>
                </div>
                <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
              </div>
            </div>

            {/* Info / Edit Form */}
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'ФИО' : 'F.I.Sh'}</label>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Специализация' : 'Mutaxassislik'}</label>
                  <select
                    value={editForm.specialization}
                    onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value as ExecutorSpecialization })}
                    className="input-field"
                  >
                    <option value="plumber">{specLabels.plumber}</option>
                    <option value="electrician">{specLabels.electrician}</option>
                    <option value="elevator">{specLabels.elevator}</option>
                    <option value="intercom">{specLabels.intercom}</option>
                    <option value="cleaning">{specLabels.cleaning}</option>
                    <option value="gardener">{language === 'ru' ? 'Садовник' : 'Bog\'bon'}</option>
                    <option value="security">{specLabels.security}</option>
                    <option value="trash">{specLabels.trash}</option>
                    <option value="boiler">{specLabels.boiler}</option>
                    <option value="ac">{specLabels.ac}</option>
                    <option value="courier">{specLabels.courier}</option>
                    <option value="other">{specLabels.other}</option>
                  </select>
                </div>
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
                    <span className="font-medium">{selectedExecutor.phone}</span>
                  </div>
                </div>

                {/* Credentials */}
                <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                  <div className="text-sm font-medium text-blue-800 mb-2">{language === 'ru' ? 'Данные для входа' : 'Kirish ma\'lumotlari'}</div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}</span>
                    <div className="flex items-center gap-2">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono">{selectedExecutor.login}</code>
                      <button
                        onClick={() => handleCopy(selectedExecutor.login, 'login')}
                        className="p-1 hover:bg-blue-100 rounded"
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
                      ) : (selectedExecutor.password || createdPasswords[selectedExecutor.id]) ? (
                        <>
                          <code className="bg-white px-2 py-1 rounded text-sm font-mono">
                            {showPassword ? (selectedExecutor.password || createdPasswords[selectedExecutor.id]) : '••••••••'}
                          </code>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowPassword(!showPassword);
                            }}
                            className="p-2 hover:bg-blue-100 active:bg-blue-200 rounded touch-manipulation z-10"
                            title={showPassword ? (language === 'ru' ? 'Скрыть' : 'Yashirish') : (language === 'ru' ? 'Показать' : 'Ko\'rsatish')}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                          </button>
                          <button
                            onClick={() => handleCopy(selectedExecutor.password || createdPasswords[selectedExecutor.id] || '', 'password')}
                            className="p-1 hover:bg-blue-100 rounded"
                            title={language === 'ru' ? 'Копировать' : 'Nusxalash'}
                          >
                            {copiedField === 'password' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400 italic">
                          {language === 'ru' ? 'Сбросить через "Редактировать"' : '"Tahrirlash" orqali tiklash'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Created date */}
                <div className="text-sm text-gray-500 text-center">
                  {language === 'ru' ? 'Добавлен' : 'Qo\'shilgan'}: {new Date(selectedExecutor.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
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
                <>
                  {/* Department heads can't delete executors - only admins/managers */}
                  {!isDepartmentHead && (
                    <button
                      onClick={handleDeleteExecutor}
                      className="btn-secondary text-red-600 hover:bg-red-50 flex-1 flex items-center justify-center gap-2"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {language === 'ru' ? 'Удаление...' : 'O\'chirilmoqda...'}
                        </>
                      ) : (
                        language === 'ru' ? 'Удалить' : 'O\'chirish'
                      )}
                    </button>
                  )}
                  <button onClick={() => setIsEditing(true)} className={`btn-primary flex items-center justify-center gap-2 ${isDepartmentHead ? 'w-full' : 'flex-1'}`}>
                    <Edit3 className="w-4 h-4" />
                    {language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal - shows after creating new executor */}
      {showCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{language === 'ru' ? 'Исполнитель создан!' : 'Ijrochi yaratildi!'}</h3>
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
    </div>
  );
}
