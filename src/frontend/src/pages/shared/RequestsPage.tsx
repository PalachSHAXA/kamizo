import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, MapPin, Loader2, Plus, X, ChevronRight, User, Building2, GitBranch, Pause } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import { SPECIALIZATION_LABELS, PAUSE_REASON_LABELS } from '../../types';
import { branchesApi, buildingsApi, usersApi } from '../../services/api';
import { formatAddress } from '../../utils/formatAddress';
import type { ExecutorSpecialization, RequestPriority } from '../../types';

export function RequestsPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
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

  const getStatusBadge = (req: { status: string; isPaused?: boolean; pauseReason?: string }) => {
    // Show paused badge if request is paused (regardless of underlying status)
    if (req.isPaused) {
      const reasonLabel = req.pauseReason && PAUSE_REASON_LABELS[req.pauseReason]
        ? PAUSE_REASON_LABELS[req.pauseReason].label
        : req.pauseReason || (language === 'ru' ? 'На паузе' : 'Pauzada');
      return (
        <span className="badge bg-gray-200 text-gray-700 flex items-center gap-1" title={reasonLabel}>
          <Pause className="w-3 h-3" />
          {language === 'ru' ? 'На паузе' : 'Pauzada'}
        </span>
      );
    }
    switch (req.status) {
      case 'new': return <span className="badge badge-new">{language === 'ru' ? 'Новая' : 'Yangi'}</span>;
      case 'assigned': return <span className="badge bg-indigo-100 text-indigo-700">{language === 'ru' ? 'Назначена' : 'Tayinlandi'}</span>;
      case 'accepted': return <span className="badge bg-cyan-100 text-cyan-700">{language === 'ru' ? 'Принята' : 'Qabul qilindi'}</span>;
      case 'in_progress': return <span className="badge badge-progress">{language === 'ru' ? 'В работе' : 'Jarayonda'}</span>;
      case 'pending_approval': return <span className="badge bg-purple-100 text-purple-700">{language === 'ru' ? 'Ожидает подтверждения' : 'Tasdiqlash kutilmoqda'}</span>;
      case 'completed': return <span className="badge badge-done">{language === 'ru' ? 'Выполнена' : 'Bajarildi'}</span>;
      default: return <span className="badge">{req.status}</span>;
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
            {isDepartmentHead
              ? (language === 'ru' ? 'Заявки отдела' : 'Bo\'lim arizalari')
              : (language === 'ru' ? 'Заявки' : 'Arizalar')}
          </h1>
          {isDepartmentHead && userSpecialization && (
            <p className="text-gray-500 text-sm mt-1">
              {language === 'ru' ? 'Отдел' : 'Bo\'lim'}: {SPECIALIZATION_LABELS[userSpecialization as ExecutorSpecialization]}
            </p>
          )}
        </div>
        {canCreateRequest && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">{language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск по номеру, названию, адресу...' : 'Raqam, nom, manzil bo\'yicha qidirish...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pl-10"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="glass-input w-full sm:w-48"
        >
          <option value="all">{language === 'ru' ? 'Все статусы' : 'Barcha holatlar'}</option>
          <option value="new">{language === 'ru' ? 'Новые' : 'Yangilar'}</option>
          <option value="assigned">{language === 'ru' ? 'Назначенные' : 'Tayinlanganlar'}</option>
          <option value="accepted">{language === 'ru' ? 'Принятые' : 'Qabul qilinganlar'}</option>
          <option value="in_progress">{language === 'ru' ? 'В работе' : 'Jarayonda'}</option>
          <option value="pending_approval">{language === 'ru' ? 'Ожидают подтверждения' : 'Tasdiqlash kutilmoqda'}</option>
          <option value="completed">{language === 'ru' ? 'Выполненные' : 'Bajarilganlar'}</option>
        </select>
      </div>

      {/* Requests List */}
      {isLoadingRequests ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="ml-3 text-gray-600">{language === 'ru' ? 'Загрузка заявок...' : 'Arizalar yuklanmoqda...'}</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="glass-card p-8 text-center text-gray-500">
          {language === 'ru' ? 'Заявки не найдены' : 'Arizalar topilmadi'}
        </div>
      ) : (
      <div className="space-y-3">
        {filteredRequests.map((req) => (
          <div key={req.id} className="glass-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex gap-3 sm:gap-4 min-w-0">
                <div className={`w-3 h-3 mt-1.5 rounded-full flex-shrink-0 ${req.priority === 'urgent' ? 'bg-red-500' : req.priority === 'high' ? 'bg-orange-500' : req.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-400'}`}></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">#{req.number}</span>
                    <h3 className="font-semibold text-base sm:text-lg">{req.title}</h3>
                    {getStatusBadge(req)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{SPECIALIZATION_LABELS[req.category]}</span> • {req.residentName}
                  </div>
                  {/* Show trash type and volume badges */}
                  {req.category === 'trash' && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {req.title.includes(': ') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          {TRASH_TYPES.find(t => req.title.endsWith(t.label))?.icon || '🗑️'} {req.title.split(': ').slice(1).join(': ')}
                        </span>
                      )}
                      {req.description?.includes('Объём: ') && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          📦 {req.description.split('Объём: ')[1].split('\n')[0]}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {formatAddress(req.address, req.apartment)}
                    </span>
                  </div>
                  {req.executorName && (
                    <div className="mt-2 text-sm text-primary-600">
                      {language === 'ru' ? 'Исполнитель' : 'Ijrochi'}: {req.executorName}
                    </div>
                  )}
                  {/* Show pause reason if request is paused */}
                  {req.isPaused && req.pauseReason && (
                    <div className="mt-2 p-2 bg-gray-100 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Pause className="w-4 h-4" />
                        <span className="font-medium">{language === 'ru' ? 'Причина паузы:' : 'Pauza sababi:'}</span>
                        <span>
                          {PAUSE_REASON_LABELS[req.pauseReason]?.label || req.pauseReason}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {req.status === 'new' && (
                <div className="flex sm:flex-shrink-0">
                  <button
                    onClick={() => setShowAssignModal(req.id)}
                    className="btn-primary text-sm py-2 px-4 w-full sm:w-auto"
                  >
                    {language === 'ru' ? 'Назначить' : 'Tayinlash'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">{language === 'ru' ? 'Назначить исполнителя' : 'Ijrochini tayinlash'}</h2>
            <div className="space-y-3">
              {departmentExecutors.length === 0 ? (
                <p className="text-gray-500 text-center py-4">{language === 'ru' ? 'Загрузка исполнителей...' : 'Ijrochilar yuklanmoqda...'}</p>
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
                      {SPECIALIZATION_LABELS[executor.specialization]} • {executor.activeRequests} {language === 'ru' ? 'активных заявок' : 'faol arizalar'}
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowAssignModal(null)}
              className="btn-secondary w-full mt-4"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
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
// Trash type options
const TRASH_TYPES = [
  { value: 'construction', label: 'Строительный мусор', icon: '🧱', description: 'Кирпич, бетон, штукатурка' },
  { value: 'furniture', label: 'Старая мебель', icon: '🛋️', description: 'Диваны, шкафы, кровати' },
  { value: 'household', label: 'Бытовой мусор', icon: '🗑️', description: 'Обычные бытовые отходы' },
  { value: 'appliances', label: 'Бытовая техника', icon: '📺', description: 'Холодильники, стиральные машины' },
  { value: 'garden', label: 'Садовый мусор', icon: '🌿', description: 'Ветки, листья, трава' },
  { value: 'mixed', label: 'Смешанный', icon: '📦', description: 'Разные виды мусора' },
];

// Trash volume options
const TRASH_VOLUME = [
  { value: 'small', label: 'До 1 м³', description: '1-2 мешка, небольшие предметы', icon: '📦' },
  { value: 'medium', label: '1-3 м³', description: 'Несколько мешков, мелкая мебель', icon: '📦📦' },
  { value: 'large', label: '3-5 м³', description: 'Много мусора, крупная мебель', icon: '🚛' },
  { value: 'truck', label: 'Более 5 м³', description: 'Полная машина, капремонт', icon: '🚚' },
];

// Uzbek translations for trash types
const TRASH_TYPES_UZ: Record<string, { label: string; description: string }> = {
  construction: { label: 'Qurilish axlati', description: 'G\'isht, beton, suvoq' },
  furniture: { label: 'Eski mebel', description: 'Divan, shkaf, karavot' },
  household: { label: 'Maishiy axlat', description: 'Oddiy maishiy chiqindilar' },
  appliances: { label: 'Maishiy texnika', description: 'Muzlatgich, kir yuvish mashinalari' },
  garden: { label: 'Bog\' axlati', description: 'Shoxlar, barglar, o\'t' },
  mixed: { label: 'Aralash', description: 'Turli xil axlatlar' },
};

// Uzbek translations for trash volume
const TRASH_VOLUME_UZ: Record<string, { label: string; description: string }> = {
  small: { label: '1 m³ gacha', description: '1-2 qop, kichik narsalar' },
  medium: { label: '1-3 m³', description: 'Bir nechta qop, kichik mebel' },
  large: { label: '3-5 m³', description: 'Ko\'p axlat, katta mebel' },
  truck: { label: '5 m³ dan ko\'p', description: 'To\'liq mashina, kapital ta\'mir' },
};

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
  const { language } = useLanguageStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExecutorSpecialization>('plumber');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Trash-specific fields
  const [trashType, setTrashType] = useState('');
  const [trashVolume, setTrashVolume] = useState('');
  const [trashDetails, setTrashDetails] = useState('');

  // Reset trash fields when category changes
  useEffect(() => {
    if (category !== 'trash') {
      setTrashType('');
      setTrashVolume('');
      setTrashDetails('');
    }
  }, [category]);

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

  const categories: { value: ExecutorSpecialization; label: string }[] = language === 'ru' ? [
    { value: 'plumber', label: 'Сантехник' },
    { value: 'electrician', label: 'Электрик' },
    { value: 'security', label: 'Охрана' },
    { value: 'cleaning', label: 'Уборка' },
    { value: 'elevator', label: 'Лифт' },
    { value: 'intercom', label: 'Домофон' },
    { value: 'trash', label: 'Вывоз мусора' },
    { value: 'boiler', label: 'Котёл' },
    { value: 'ac', label: 'Кондиционер' },
    { value: 'other', label: 'Другое' },
  ] : [
    { value: 'plumber', label: 'Santexnik' },
    { value: 'electrician', label: 'Elektrik' },
    { value: 'security', label: 'Qorovul' },
    { value: 'cleaning', label: 'Tozalash' },
    { value: 'elevator', label: 'Lift' },
    { value: 'intercom', label: 'Domofon' },
    { value: 'trash', label: 'Axlat chiqarish' },
    { value: 'boiler', label: 'Qozon' },
    { value: 'ac', label: 'Konditsioner' },
    { value: 'other', label: 'Boshqa' },
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
    if (!selectedResident) return;

    // For trash category, validate trash-specific fields
    if (category === 'trash') {
      if (!trashType || !trashVolume || !scheduledDate || !scheduledTime) return;
    } else {
      if (!title.trim() || !description.trim()) return;
    }

    setIsSubmitting(true);
    try {
      // Build title and description for trash category
      let finalTitle = title;
      let finalDescription = description;

      if (category === 'trash') {
        const typeInfo = TRASH_TYPES.find(t => t.value === trashType);
        const volumeInfo = TRASH_VOLUME.find(v => v.value === trashVolume);

        finalTitle = `Вывоз мусора: ${typeInfo?.label || trashType}`;
        finalDescription = `Тип мусора: ${typeInfo?.label || trashType}\nОбъём: ${volumeInfo?.label || trashVolume}`;
        if (trashDetails.trim()) {
          finalDescription += `\n\nДополнительно: ${trashDetails.trim()}`;
        }
      }

      await onSubmit({
        title: finalTitle,
        description: finalDescription,
        category,
        priority,
        residentId: selectedResident.id,
        residentName: selectedResident.name,
        residentPhone: selectedResident.phone || (language === 'ru' ? 'Не указан' : 'Ko\'rsatilmagan'),
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
          <h2 className="text-xl font-bold">{language === 'ru' ? 'Создать заявку' : 'Ariza yaratish'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Категория' : 'Kategoriya'} *
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

          {/* Conditional fields based on category */}
          {category === 'trash' ? (
            <>
              {/* Trash Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Тип мусора' : 'Axlat turi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setTrashType(type.value)}
                      className={`p-3 rounded-xl text-left transition-all border ${
                        trashType === type.value
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{type.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{language === 'ru' ? type.label : (TRASH_TYPES_UZ[type.value]?.label || type.label)}</div>
                          <div className="text-xs text-gray-500">{language === 'ru' ? type.description : (TRASH_TYPES_UZ[type.value]?.description || type.description)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Volume Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Объём мусора' : 'Axlat hajmi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_VOLUME.map((vol) => (
                    <button
                      key={vol.value}
                      type="button"
                      onClick={() => setTrashVolume(vol.value)}
                      className={`p-3 rounded-xl text-left transition-all border ${
                        trashVolume === vol.value
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{vol.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{language === 'ru' ? vol.label : (TRASH_VOLUME_UZ[vol.value]?.label || vol.label)}</div>
                          <div className="text-xs text-gray-500">{language === 'ru' ? vol.description : (TRASH_VOLUME_UZ[vol.value]?.description || vol.description)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Details for Trash */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дополнительная информация' : 'Qo\'shimcha ma\'lumot'}
                </label>
                <textarea
                  value={trashDetails}
                  onChange={(e) => setTrashDetails(e.target.value)}
                  className="glass-input w-full min-h-[80px] resize-none"
                  placeholder={language === 'ru' ? 'Особые указания, этаж, подъезд и т.д.' : 'Maxsus ko\'rsatmalar, qavat, kirish va h.k.'}
                />
              </div>
            </>
          ) : (
            <>
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Заголовок' : 'Sarlavha'} *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="glass-input w-full"
                  placeholder={language === 'ru' ? 'Кратко опишите проблему' : 'Muammoni qisqacha tavsiflang'}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Описание' : 'Tavsif'} *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="glass-input w-full min-h-[100px] resize-none"
                  placeholder={language === 'ru' ? 'Подробное описание проблемы' : 'Muammoning batafsil tavsifi'}
                  required
                />
              </div>
            </>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Приоритет' : 'Ustuvorlik'}
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
                  {p === 'low'
                    ? (language === 'ru' ? 'Низкий' : 'Past')
                    : p === 'medium'
                    ? (language === 'ru' ? 'Средний' : 'O\'rta')
                    : p === 'high'
                    ? (language === 'ru' ? 'Высокий' : 'Yuqori')
                    : (language === 'ru' ? 'Срочный' : 'Shoshilinch')}
                </button>
              ))}
            </div>
          </div>

          {/* Resident Selection - Cascading */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              {language === 'ru' ? 'Выбор жителя' : 'Yashovchini tanlash'}
            </h3>

            {/* Branch Selection */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <GitBranch className="w-4 h-4" />
                {language === 'ru' ? 'Филиал' : 'Filial'} *
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="glass-input w-full"
                disabled={loadingBranches}
              >
                <option value="">
                  {loadingBranches
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : (language === 'ru' ? 'Выберите филиал' : 'Filialni tanlang')}
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
                {language === 'ru' ? 'Дом' : 'Uy'} *
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBranch || loadingBuildings}
              >
                <option value="">
                  {loadingBuildings
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : !selectedBranch
                    ? (language === 'ru' ? 'Сначала выберите филиал' : 'Avval filialni tanlang')
                    : (language === 'ru' ? 'Выберите дом' : 'Uyni tanlang')}
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
                {language === 'ru' ? 'Житель' : 'Yashovchi'} *
              </label>
              <select
                value={selectedResident?.id || ''}
                onChange={(e) => handleResidentSelect(e.target.value)}
                className="glass-input w-full"
                disabled={!selectedBuilding || loadingResidents}
              >
                <option value="">
                  {loadingResidents
                    ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                    : !selectedBuilding
                    ? (language === 'ru' ? 'Сначала выберите дом' : 'Avval uyni tanlang')
                    : (language === 'ru' ? 'Выберите жителя' : 'Yashovchini tanlang')}
                </option>
                {residents.map(resident => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} {resident.apartment ? `- ${language === 'ru' ? 'кв.' : 'kv.'} ${resident.apartment}` : ''}
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
                      {selectedResident.phone || (language === 'ru' ? 'Телефон не указан' : 'Telefon ko\'rsatilmagan')}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {selectedBuildingData?.address || selectedResident.address}
                      {selectedResident.apartment && `, ${language === 'ru' ? 'кв.' : 'kv.'} ${selectedResident.apartment}`}
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
            <h3 className="font-medium text-gray-900 mb-3">
              {category === 'trash'
                ? (language === 'ru' ? 'Дата и время вывоза *' : 'Chiqarish sanasi va vaqti *')
                : (language === 'ru' ? 'Желаемое время (опционально)' : 'Istalgan vaqt (ixtiyoriy)')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дата' : 'Sana'} {category === 'trash' && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="glass-input w-full"
                  min={getMinDate()}
                  max={getMaxDate()}
                  required={category === 'trash'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Время' : 'Vaqt'} {category === 'trash' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="glass-input w-full"
                  required={category === 'trash'}
                >
                  <option value="">{category === 'trash'
                    ? (language === 'ru' ? 'Выберите время' : 'Vaqtni tanlang')
                    : (language === 'ru' ? 'Любое время' : 'Istalgan vaqt')}</option>
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
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedResident ||
                (category === 'trash'
                  ? !trashType || !trashVolume || !scheduledDate || !scheduledTime
                  : !title.trim() || !description.trim())
              }
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                : (language === 'ru' ? 'Создать заявку' : 'Ariza yaratish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
