import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, MapPin, Loader2, Plus, X, ChevronRight, User, Building2, GitBranch } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { SPECIALIZATION_LABELS } from '../../types';
import { branchesApi, buildingsApi, usersApi } from '../../services/api';
import { formatAddress } from '../../utils/formatAddress';
import type { ExecutorSpecialization, RequestPriority } from '../../types';

export function RequestsPage() {
  const { user } = useAuthStore();
  const { requests, executors, assignRequest, addRequest, fetchRequests, fetchExecutors, isLoadingRequests } = useDataStore();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || 'all';
  const [filter, setFilter] = useState(statusFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check if user can create requests (manager, admin, director)
  const canCreateRequest = ['manager', 'admin', 'director'].includes(user?.role || '');

  // Update filter when URL changes
  useEffect(() => {
    setFilter(statusFilter);
  }, [statusFilter]);

  // Check if user is department head - they can only see their department's requests
  const isDepartmentHead = user?.role === 'department_head';
  const userSpecialization = user?.specialization;

  // Filter requests by department if user is department head
  const departmentRequests = useMemo(() => {
    if (isDepartmentHead && userSpecialization) {
      return requests.filter(r => r.category === userSpecialization);
    }
    return requests;
  }, [requests, isDepartmentHead, userSpecialization]);

  // Filter executors by department if user is department head
  const departmentExecutors = useMemo(() => {
    if (isDepartmentHead && userSpecialization) {
      return executors.filter(e => e.specialization === userSpecialization);
    }
    return executors;
  }, [executors, isDepartmentHead, userSpecialization]);

  // Fetch requests and executors from D1 database on mount
  useEffect(() => {
    fetchRequests();
    fetchExecutors();
  }, [fetchRequests, fetchExecutors]);

  // Refetch executors when assignment modal opens to ensure fresh data
  useEffect(() => {
    if (showAssignModal) {
      fetchExecutors();
    }
  }, [showAssignModal, fetchExecutors]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new': return <span className="badge badge-new">Новая</span>;
      case 'assigned': return <span className="badge bg-indigo-100 text-indigo-700">Назначена</span>;
      case 'accepted': return <span className="badge bg-cyan-100 text-cyan-700">Принята</span>;
      case 'in_progress': return <span className="badge badge-progress">В работе</span>;
      case 'pending_approval': return <span className="badge bg-purple-100 text-purple-700">Ожидает подтверждения</span>;
      case 'completed': return <span className="badge badge-done">Выполнена</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  // Filter by status and search query
  const filteredRequests = departmentRequests.filter(r => {
    let matchesStatus = false;

    if (filter === 'all') {
      matchesStatus = true;
    } else if (filter === 'in_progress') {
      // "В работе" includes assigned, accepted, and in_progress statuses
      matchesStatus = ['assigned', 'accepted', 'in_progress'].includes(r.status);
    } else {
      matchesStatus = r.status === filter;
    }

    const matchesSearch = searchQuery === '' ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.residentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.number.toString().includes(searchQuery) ||
      r.address?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isDepartmentHead ? 'Заявки отдела' : 'Заявки'}
          </h1>
          {isDepartmentHead && userSpecialization && (
            <p className="text-gray-500 text-sm mt-1">
              Отдел: {SPECIALIZATION_LABELS[userSpecialization as ExecutorSpecialization]}
            </p>
          )}
        </div>
        {canCreateRequest && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Создать заявку</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по номеру, названию, адресу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pl-10"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="glass-input w-48"
        >
          <option value="all">Все статусы</option>
          <option value="new">Новые</option>
          <option value="assigned">Назначенные</option>
          <option value="accepted">Принятые</option>
          <option value="in_progress">В работе</option>
          <option value="pending_approval">Ожидают подтверждения</option>
          <option value="completed">Выполненные</option>
        </select>
      </div>

      {/* Requests List */}
      {isLoadingRequests ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="ml-3 text-gray-600">Загрузка заявок...</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="glass-card p-8 text-center text-gray-500">
          Заявки не найдены
        </div>
      ) : (
      <div className="space-y-3">
        {filteredRequests.map((req) => (
          <div key={req.id} className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <div className={`w-3 h-3 mt-1.5 rounded-full ${req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-orange-500' : req.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-400'}`}></div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">#{req.number}</span>
                    <h3 className="font-semibold text-lg">{req.title}</h3>
                    {getStatusBadge(req.status)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{SPECIALIZATION_LABELS[req.category]}</span> • {req.residentName}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {formatAddress(req.address, req.apartment)}
                    </span>
                  </div>
                  {req.executorName && (
                    <div className="mt-2 text-sm text-primary-600">
                      Исполнитель: {req.executorName}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {req.status === 'new' && (
                  <button
                    onClick={() => setShowAssignModal(req.id)}
                    className="btn-primary text-sm py-2 px-4"
                  >
                    Назначить
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Назначить исполнителя</h2>
            <div className="space-y-3">
              {departmentExecutors.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Загрузка исполнителей...</p>
              ) : (
                departmentExecutors.map((executor) => (
                  <button
                    key={executor.id}
                    onClick={() => {
                      assignRequest(showAssignModal, executor.id);
                      setShowAssignModal(null);
                    }}
                    className="w-full p-4 bg-white/30 hover:bg-white/50 rounded-xl text-left transition-colors"
                  >
                    <div className="font-medium">{executor.name}</div>
                    <div className="text-sm text-gray-500">
                      {SPECIALIZATION_LABELS[executor.specialization]} • {executor.activeRequests} активных заявок
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowAssignModal(null)}
              className="btn-secondary w-full mt-4"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateModal && (
        <CreateRequestModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (data) => {
            await addRequest(data);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// Types for resident selection
interface Branch {
  id: string;
  code: string;
  name: string;
}

interface Building {
  id: string;
  name: string;
  address: string;
  branch_code: string;
}

interface Resident {
  id: string;
  name: string;
  phone: string;
  address: string;
  apartment: string;
  building_id: string;
}

// Create Request Modal for managers/admins
function CreateRequestModal({
  onClose,
  onSubmit
}: {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    category: ExecutorSpecialization;
    priority: RequestPriority;
    residentId: string;
    residentName: string;
    residentPhone: string;
    address: string;
    apartment: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExecutorSpecialization>('plumber');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cascading selection state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);

  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingResidents, setLoadingResidents] = useState(false);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const data = await branchesApi.getAll();
        setBranches(data.branches || []);
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, []);

  // Load buildings when branch changes
  useEffect(() => {
    if (!selectedBranch) {
      setBuildings([]);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadBuildings = async () => {
      setLoadingBuildings(true);
      setSelectedBuilding('');
      setResidents([]);
      setSelectedResident(null);
      try {
        const data = await buildingsApi.getAll();
        const filteredBuildings = (data.buildings || []).filter(
          (b: Building) => b.branch_code === selectedBranch
        );
        setBuildings(filteredBuildings);
      } catch (error) {
        console.error('Failed to load buildings:', error);
      } finally {
        setLoadingBuildings(false);
      }
    };
    loadBuildings();
  }, [selectedBranch]);

  // Load residents when building changes
  useEffect(() => {
    if (!selectedBuilding) {
      setResidents([]);
      setSelectedResident(null);
      return;
    }

    const loadResidents = async () => {
      setLoadingResidents(true);
      setSelectedResident(null);
      try {
        const data = await usersApi.getAll({ role: 'resident', building_id: selectedBuilding, limit: 500 });
        setResidents(data.users || []);
      } catch (error) {
        console.error('Failed to load residents:', error);
      } finally {
        setLoadingResidents(false);
      }
    };
    loadResidents();
  }, [selectedBuilding]);

  const categories: { value: ExecutorSpecialization; label: string }[] = [
    { value: 'plumber', label: 'Сантехник' },
    { value: 'electrician', label: 'Электрик' },
    { value: 'security', label: 'Охрана' },
    { value: 'cleaning', label: 'Уборка' },
    { value: 'elevator', label: 'Лифт' },
    { value: 'intercom', label: 'Домофон' },
    { value: 'carpenter', label: 'Плотник' },
    { value: 'boiler', label: 'Котёл' },
    { value: 'other', label: 'Другое' },
  ];

  const timeSlots = [
    { value: '09:00-11:00', label: '09:00 - 11:00' },
    { value: '11:00-13:00', label: '11:00 - 13:00' },
    { value: '13:00-15:00', label: '13:00 - 15:00' },
    { value: '15:00-17:00', label: '15:00 - 17:00' },
    { value: '17:00-19:00', label: '17:00 - 19:00' },
  ];

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  };

  const handleResidentSelect = (residentId: string) => {
    const resident = residents.find(r => r.id === residentId);
    setSelectedResident(resident || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !selectedResident) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        description,
        category,
        priority,
        residentId: selectedResident.id,
        residentName: selectedResident.name,
        residentPhone: selectedResident.phone || 'Не указан',
        address: selectedResident.address || buildings.find(b => b.id === selectedBuilding)?.address || '',
        apartment: selectedResident.apartment || '0',
        scheduledDate: scheduledDate || undefined,
        scheduledTime: scheduledTime || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBranchName = branches.find(b => b.code === selectedBranch)?.name;
  const selectedBuildingData = buildings.find(b => b.id === selectedBuilding);

  return (
    <div className="modal-backdrop">
      <div className="modal-content p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Создать заявку</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Категория *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExecutorSpecialization)}
              className="glass-input w-full"
              required
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Заголовок *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full"
              placeholder="Кратко опишите проблему"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full min-h-[100px] resize-none"
              placeholder="Подробное описание проблемы"
              required
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Приоритет
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white' :
                        p === 'high' ? 'bg-orange-500 text-white' :
                        p === 'medium' ? 'bg-amber-500 text-white' :
                        'bg-gray-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p === 'low' ? 'Низкий' : p === 'medium' ? 'Средний' : p === 'high' ? 'Высокий' : 'Срочный'}
                </button>
              ))}
            </div>
          </div>

          {/* Resident Selection - Cascading */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              Выбор жителя
            </h3>

            {/* Branch Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <GitBranch className="w-4 h-4" />
                Филиал *
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="glass-input w-full"
                disabled={loadingBranches}
              >
                <option value="">
                  {loadingBranches ? 'Загрузка...' : 'Выберите филиал'}
                </option>
                {branches.map(branch => (
                  <option key={branch.code} value={branch.code}>{branch.name}</option>
                ))}
              </select>
            </div>

            {/* Building Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                Дом *
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBranch || loadingBuildings}
              >
                <option value="">
                  {loadingBuildings ? 'Загрузка...' : !selectedBranch ? 'Сначала выберите филиал' : 'Выберите дом'}
                </option>
                {buildings.map(building => (
                  <option key={building.id} value={building.id}>
                    {building.name} - {building.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Resident Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <User className="w-4 h-4" />
                Житель *
              </label>
              <select
                value={selectedResident?.id || ''}
                onChange={(e) => handleResidentSelect(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBuilding || loadingResidents}
              >
                <option value="">
                  {loadingResidents ? 'Загрузка...' : !selectedBuilding ? 'Сначала выберите дом' : 'Выберите жителя'}
                </option>
                {residents.map(resident => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} {resident.apartment ? `- кв. ${resident.apartment}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Resident Info */}
            {selectedResident && (
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mt-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{selectedResident.name}</p>
                    <p className="text-sm text-gray-600">
                      {selectedResident.phone || 'Телефон не указан'}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {selectedBuildingData?.address || selectedResident.address}
                      {selectedResident.apartment && `, кв. ${selectedResident.apartment}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Selection Path Display */}
            {(selectedBranchName || selectedBuildingData) && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-2 flex-wrap">
                {selectedBranchName && (
                  <>
                    <span className="bg-gray-100 px-2 py-1 rounded">{selectedBranchName}</span>
                    {selectedBuildingData && <ChevronRight className="w-3 h-3" />}
                  </>
                )}
                {selectedBuildingData && (
                  <>
                    <span className="bg-gray-100 px-2 py-1 rounded">{selectedBuildingData.name}</span>
                    {selectedResident && <ChevronRight className="w-3 h-3" />}
                  </>
                )}
                {selectedResident && (
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded">
                    {selectedResident.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-3">Желаемое время (опционально)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="glass-input w-full"
                  min={getMinDate()}
                  max={getMaxDate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Время
                </label>
                <select
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="glass-input w-full"
                >
                  <option value="">Любое время</option>
                  {timeSlots.map(slot => (
                    <option key={slot.value} value={slot.value}>{slot.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !description.trim() || !selectedResident}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Создание...' : 'Создать заявку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
