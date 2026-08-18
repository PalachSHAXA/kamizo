import { useState, useEffect, useMemo, useRef } from 'react';
import { Phone, Star, Copy, Check, Edit3, Save, Clock, Award, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { EmptyState } from '../../components/common';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { useExecutorStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useToastStore } from '../../stores/toastStore';
import { executorsApi } from '../../services/api';
import type { Executor, ExecutorSpecialization } from '../../types';
import { DemoReadOnlyBanner } from '../../components/demo/DemoReadOnlyBanner';

export function ExecutorsPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const executors = useExecutorStore(s => s.executors);
  const addExecutor = useExecutorStore(s => s.addExecutor);
  const updateExecutor = useExecutorStore(s => s.updateExecutor);
  const deleteExecutor = useExecutorStore(s => s.deleteExecutor);
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);
  const isLoadingExecutors = useExecutorStore(s => s.isLoadingExecutors);

  // Check if user is department head - they can only see and manage their department's executors
  const isDepartmentHead = user?.role === 'department_head';
  const isDemoSession = user?.demoSession === true;
  const canAddExecutor = user?.role !== 'dispatcher' && !isDemoSession;
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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState<{ login: string; password: string } | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    login: '',
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const addTriggerRef = useRef<HTMLButtonElement>(null);

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
      specialization: executor.specialization,
    });
    setIsEditing(false);

    // Then fetch fresh profile data from the API.
    try {
      const response = await executorsApi.getById(executor.id);
      if (response.executor) {
        const freshData: Executor = {
          id: response.executor.id,
          name: response.executor.name,
          phone: response.executor.phone,
          login: response.executor.login,
          specialization: response.executor.specialization,
          status: response.executor.status ?? executor.status,
          rating: response.executor.rating ?? executor.rating,
          completedCount: response.executor.completed_count ?? executor.completedCount,
          activeRequests: response.executor.active_requests ?? executor.activeRequests,
          totalEarnings: response.executor.total_earnings ?? executor.totalEarnings,
          avgCompletionTime: response.executor.avg_completion_time ?? executor.avgCompletionTime,
          createdAt: response.executor.created_at ?? executor.createdAt,
        };
        setSelectedExecutor(freshData);
        setEditForm({
          name: freshData.name,
          phone: freshData.phone,
          login: freshData.login,
          specialization: freshData.specialization,
        });
      }
    } catch (err) {
      console.error('Failed to fetch executor details:', err);
    }
  };

  const handleCloseDetails = () => {
    setShowDeleteConfirm(false);
    setSelectedExecutor(null);
    setIsEditing(false);
  };

  const handleSaveChanges = () => {
    if (isDemoSession || !selectedExecutor) return;
    updateExecutor(selectedExecutor.id, editForm);

    setSelectedExecutor({ ...selectedExecutor, ...editForm });
    setIsEditing(false);
  };

  const handleDeleteExecutor = async () => {
    if (isDemoSession || !selectedExecutor) return;
    setIsDeleting(true);
    try {
      await deleteExecutor(selectedExecutor.id);
      handleCloseDetails();
    } catch (error: unknown) {
      addToast('error', (error instanceof Error ? error.message : null) || (language === 'ru' ? 'Ошибка при удалении' : 'O\'chirishda xatolik'));
    } finally {
      setIsDeleting(false);
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
    if (isDemoSession) return;
    if (!newExecutor.name || !newExecutor.phone || !newExecutor.login || !newExecutor.password) {
      setAddError(language === 'ru' ? 'Заполните все обязательные поля' : 'Barcha majburiy maydonlarni to\'ldiring');
      return;
    }
    setIsAdding(true);
    setAddError(null);
    try {
      await addExecutor(newExecutor);

      // Show credentials modal
      setShowCredentialsModal({
        login: newExecutor.login,
        password: newExecutor.password,
      });

      setNewExecutor({ name: '', phone: '', login: '', password: '', specialization: 'plumber', role: 'executor' });
      setShowAddModal(false);
      // Refresh the list
      fetchExecutors();
    } catch (error: unknown) {
      setAddError((error instanceof Error ? error.message : null) || (language === 'ru' ? 'Ошибка при добавлении исполнителя' : 'Ijrochi qo\'shishda xatolik'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-clip pb-24 md:pb-0">
      <div className="flex flex-col min-[361px]:flex-row min-[361px]:items-center min-[361px]:justify-between gap-3">
        <div className="min-w-0">
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
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => fetchExecutors()}
            className="btn-secondary p-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation active:scale-95"
            title={language === 'ru' ? 'Обновить' : 'Yangilash'}
            aria-label={language === 'ru' ? 'Обновить список исполнителей' : 'Ijrochilar ro\'yxatini yangilash'}
            disabled={isLoadingExecutors}
          >
            <RefreshCw className={`w-5 h-5 ${isLoadingExecutors ? 'animate-spin' : ''}`} />
          </button>
          {/* Department heads can add executors of their department. Dispatchers are read-only. */}
          {canAddExecutor && <button
            ref={addTriggerRef}
            type="button"
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
            className="btn-primary min-h-[44px] min-w-0 max-w-full touch-manipulation active:scale-95 whitespace-nowrap"
            aria-label={language === 'ru' ? 'Добавить исполнителя' : 'Ijrochi qo\'shish'}
          >
            + {language === 'ru' ? 'Добавить исполнителя' : 'Ijrochi qo\'shish'}
          </button>}
        </div>
      </div>
      {isDemoSession && <DemoReadOnlyBanner />}
      {isLoadingExecutors ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : filteredExecutors.length === 0 ? (
        <EmptyState
          icon={<Wrench className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет исполнителей' : 'Ijrochilar yo\'q'}
          description={language === 'ru' ? 'Добавьте первого исполнителя' : 'Birinchi ijrochini qo\'shing'}
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filteredExecutors.map((executor) => (
          <div
            key={executor.id}
            className="glass-card min-w-0 max-w-full overflow-hidden p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl hover:shadow-lg transition-shadow"
          >
            <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-lg font-medium text-primary-700">
                  {executor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold" title={executor.name}>{executor.name}</h3>
                  <div className="truncate text-sm text-gray-500">{specLabels[executor.specialization] || (language === 'ru' ? 'Не указана' : 'Ko\'rsatilmagan')}</div>
                </div>
              </div>
              <div className="shrink-0">{getStatusBadge(executor.status)}</div>
            </div>
            <div className="space-y-2 text-sm text-gray-600 mb-3">
              <a
                href={`tel:${executor.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:text-primary-600 active:text-primary-700 touch-manipulation"
                aria-label={language === 'ru' ? `Позвонить: ${executor.phone}` : `Qo'ng'iroq: ${executor.phone}`}
              >
                <Phone className="w-4 h-4" />
                {executor.phone}
              </a>
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
      <Modal
        open={showAddModal}
        onClose={() => {
          if (isAdding) return;
          setShowAddModal(false);
          setAddError(null);
        }}
        title={isDepartmentHead
          ? (language === 'ru' ? 'Добавить сотрудника в отдел' : 'Bo\'limga xodim qo\'shish')
          : (language === 'ru' ? 'Добавить сотрудника' : 'Xodim qo\'shish')}
        size="md"
        returnFocus={addTriggerRef.current}
        panelClassName="flex flex-col !overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                    onChange={(e) => setNewExecutor({ ...newExecutor, role: e.target.value as 'executor' | 'department_head' })}
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
                    onChange={(e) => setNewExecutor({ ...newExecutor, specialization: e.target.value as ExecutorSpecialization })}
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
        </div>
        {!isDemoSession && (
          <div
            className="flex gap-3 border-t border-gray-100 bg-white px-4 pt-3 sm:px-6"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
          >
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
        )}
      </Modal>

      {/* Executor Details Modal */}
      {selectedExecutor && (
        <Modal
          open
          onClose={handleCloseDetails}
          title={selectedExecutor.name}
          size="lg"
          panelClassName="flex flex-col !overflow-hidden sm:!max-w-lg"
        >
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-start mb-6">
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
                    <a
                      href={`tel:${selectedExecutor.phone}`}
                      className="font-medium hover:text-primary-600 active:text-primary-700 underline decoration-dotted underline-offset-2"
                    >
                      {selectedExecutor.phone}
                    </a>
                  </div>
                </div>

                {/* Created date */}
                <div className="text-sm text-gray-500 text-center">
                  {language === 'ru' ? 'Добавлен' : 'Qo\'shilgan'}: {new Date(selectedExecutor.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                </div>
              </div>
            )}

          </div>
          {/* Actions */}
          {!isDemoSession && (
            <div
              className="flex gap-3 border-t border-gray-100 bg-white px-4 pt-3 sm:px-6"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
            >
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
                      onClick={() => setShowDeleteConfirm(true)}
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
          )}
        </Modal>
      )}

      {/* Credentials Modal - shows after creating new executor */}
      {showCredentialsModal && (
        <Modal
          open
          onClose={() => setShowCredentialsModal(null)}
          ariaLabel={language === 'ru' ? 'Исполнитель создан!' : 'Ijrochi yaratildi!'}
          size="md"
          hideCloseButton
          returnFocus={addTriggerRef.current}
          panelClassName="flex flex-col !overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                    type="button"
                    aria-label={language === 'ru' ? 'Копировать логин' : 'Loginni nusxalash'}
                    onClick={() => {
                      navigator.clipboard.writeText(showCredentialsModal.login);
                      setCopiedField('cred-login');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-gray-200"
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
                    type="button"
                    aria-label={language === 'ru' ? 'Копировать пароль' : 'Parolni nusxalash'}
                    onClick={() => {
                      navigator.clipboard.writeText(showCredentialsModal.password);
                      setCopiedField('cred-password');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="staff-primary-control inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-gray-200"
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
          </div>
          <div
            className="border-t border-gray-100 bg-white px-4 pt-3 sm:px-6"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <button
              type="button"
              onClick={() => setShowCredentialsModal(null)}
              className="btn-primary w-full"
            >
              {language === 'ru' ? 'Готово' : 'Tayyor'}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm && Boolean(selectedExecutor)}
        title={language === 'ru' ? 'Удалить исполнителя?' : 'Ijrochini o\'chirasizmi?'}
        description={language === 'ru'
          ? 'Это действие нельзя отменить.'
          : 'Bu amalni bekor qilib bo\'lmaydi.'}
        confirmLabel={language === 'ru' ? 'Удалить исполнителя' : 'Ijrochini o\'chirish'}
        cancelLabel={language === 'ru' ? 'Отмена' : 'Bekor qilish'}
        onConfirm={handleDeleteExecutor}
        onClose={() => {
          if (!isDeleting) setShowDeleteConfirm(false);
        }}
        confirmDisabled={isDeleting}
      />
    </div>
  );
}
