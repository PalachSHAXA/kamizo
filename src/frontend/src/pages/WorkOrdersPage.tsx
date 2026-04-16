import { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Search, Plus, X, Calendar, Clock,
  AlertTriangle, CheckCircle, User, Building2,
  FileText, Play, Pause, Check, Loader2
} from 'lucide-react';
import { EmptyState, StatusBadge } from '../components/common';
import type { StatusTone } from '../theme';
import { useCRMStore } from '../stores/crmStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { workOrdersApi } from '../services/api';

type WorkOrderStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';
type WorkOrderType = 'planned' | 'preventive' | 'emergency' | 'seasonal';

interface WorkOrder {
  id: string;
  number: string;
  title: string;
  description: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;

  buildingId: string;
  apartmentId?: string;

  assignedTo?: string;
  assignedTeam?: string[];

  scheduledDate?: string;
  scheduledTime?: string;
  startedAt?: string;
  completedAt?: string;

  estimatedDuration: number; // minutes
  actualDuration?: number;

  materials?: { name: string; quantity: number; unit: string }[];
  checklist?: { item: string; completed: boolean }[];
  photos?: string[];

  requestId?: string; // связь с заявкой жильца

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Map API snake_case fields to camelCase interface
function mapWorkOrder(raw: any): WorkOrder {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    description: raw.description || '',
    type: raw.type,
    priority: raw.priority,
    status: raw.status,
    buildingId: raw.building_id || raw.buildingId || '',
    apartmentId: raw.apartment_id || raw.apartmentId,
    assignedTo: raw.assigned_to || raw.assignedTo,
    scheduledDate: raw.scheduled_date || raw.scheduledDate,
    scheduledTime: raw.scheduled_time || raw.scheduledTime,
    startedAt: raw.started_at || raw.startedAt,
    completedAt: raw.completed_at || raw.completedAt,
    estimatedDuration: raw.estimated_duration ?? raw.estimatedDuration ?? 60,
    actualDuration: raw.actual_duration ?? raw.actualDuration,
    materials: typeof raw.materials === 'string' ? JSON.parse(raw.materials || '[]') : (raw.materials || []),
    checklist: typeof raw.checklist === 'string' ? JSON.parse(raw.checklist || '[]') : (raw.checklist || []),
    notes: raw.notes,
    requestId: raw.request_id || raw.requestId,
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

export function WorkOrdersPage() {
  const { language } = useLanguageStore();
  const { buildings } = useCRMStore();
  const { executors } = useDataStore();

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch work orders from API
  const fetchWorkOrders = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterType !== 'all') filters.type = filterType;
      if (filterPriority !== 'all') filters.priority = filterPriority;
      if (filterBuilding !== 'all') filters.buildingId = filterBuilding;
      const response = await workOrdersApi.getAll(Object.keys(filters).length > 0 ? filters : undefined);
      const orders = ((response as any).workOrders || (response as any).work_orders || []).map(mapWorkOrder);
      setWorkOrders(orders);
    } catch (error) {
      console.error('Failed to fetch work orders:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, filterType, filterPriority, filterBuilding]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  // Filter work orders
  const filteredOrders = workOrders.filter(order => {
    const matchesSearch = searchQuery === '' ||
      order.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    const matchesType = filterType === 'all' || order.type === filterType;
    const matchesPriority = filterPriority === 'all' || order.priority === filterPriority;
    const matchesBuilding = filterBuilding === 'all' || order.buildingId === filterBuilding;

    return matchesSearch && matchesStatus && matchesType && matchesPriority && matchesBuilding;
  });

  // Stats
  const stats = {
    total: workOrders.length,
    pending: workOrders.filter(o => o.status === 'pending').length,
    inProgress: workOrders.filter(o => o.status === 'in_progress').length,
    completed: workOrders.filter(o => o.status === 'completed').length,
    urgent: workOrders.filter(o => o.priority === 'urgent' && o.status !== 'completed').length,
  };

  const getStatusTone = (status: WorkOrderStatus): StatusTone => {
    switch (status) {
      case 'pending': return 'expired';
      case 'scheduled': return 'info';
      case 'in_progress': return 'pending';
      case 'completed': return 'active';
      case 'cancelled': return 'critical';
    }
  };

  const getStatusLabel = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return language === 'ru' ? 'Ожидает' : 'Kutilmoqda';
      case 'scheduled': return language === 'ru' ? 'Запланирован' : 'Rejalashtirilgan';
      case 'in_progress': return language === 'ru' ? 'Выполняется' : 'Bajarilmoqda';
      case 'completed': return language === 'ru' ? 'Завершен' : 'Yakunlangan';
      case 'cancelled': return language === 'ru' ? 'Отменен' : 'Bekor qilingan';
    }
  };

  const getPriorityColor = (priority: WorkOrderPriority) => {
    switch (priority) {
      case 'low': return 'text-gray-500';
      case 'medium': return 'text-blue-500';
      case 'high': return 'text-orange-500';
      case 'urgent': return 'text-red-500';
    }
  };

  const getPriorityLabel = (priority: WorkOrderPriority) => {
    switch (priority) {
      case 'low': return language === 'ru' ? 'Низкий' : 'Past';
      case 'medium': return language === 'ru' ? 'Средний' : 'O\'rta';
      case 'high': return language === 'ru' ? 'Высокий' : 'Yuqori';
      case 'urgent': return language === 'ru' ? 'Срочный' : 'Shoshilinch';
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return language === 'ru' ? `${hours}ч ${mins}м` : `${hours}s ${mins}d`;
    }
    return language === 'ru' ? `${mins}м` : `${mins}d`;
  };

  const updateOrderStatus = async (orderId: string, newStatus: WorkOrderStatus) => {
    // Optimistic update
    setWorkOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const updates: Partial<WorkOrder> = { status: newStatus, updatedAt: new Date().toISOString() };
        if (newStatus === 'in_progress' && !order.startedAt) {
          updates.startedAt = new Date().toISOString();
        }
        if (newStatus === 'completed' && !order.completedAt) {
          updates.completedAt = new Date().toISOString();
          if (order.startedAt) {
            updates.actualDuration = Math.round((Date.now() - new Date(order.startedAt).getTime()) / 60000);
          }
        }
        return { ...order, ...updates };
      }
      return order;
    }));
    try {
      await workOrdersApi.updateStatus(orderId, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
      fetchWorkOrders(); // Revert on error
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold text-gray-900">{language === 'ru' ? 'Наряды на работы' : 'Ish buyurtmalari'}</h1>
          <p className="text-gray-500 mt-1">{language === 'ru' ? 'Управление плановыми и аварийными работами' : 'Rejalashtirilgan va favqulodda ishlarni boshqarish'}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 min-h-[44px] touch-manipulation"
        >
          <Plus className="w-4 h-4" />
          {language === 'ru' ? 'Создать наряд' : 'Buyurtma yaratish'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-4">
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Всего' : 'Jami'}</p>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Ожидают' : 'Kutilmoqda'}</p>
              <p className="text-xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Play className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{language === 'ru' ? 'В работе' : 'Bajarilmoqda'}</p>
              <p className="text-xl font-bold text-yellow-600">{stats.inProgress}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Завершено' : 'Yakunlangan'}</p>
              <p className="text-xl font-bold text-green-600">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Срочных' : 'Shoshilinch'}</p>
              <p className="text-xl font-bold text-red-600">{stats.urgent}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 sm:p-4">
        <div className="flex flex-wrap gap-3 sm:gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={language === 'ru' ? 'Поиск по номеру/названию' : 'Raqam/nomi bo\'yicha'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{language === 'ru' ? 'Все статусы' : 'Barcha statuslar'}</option>
            <option value="pending">{language === 'ru' ? 'Ожидает' : 'Kutilmoqda'}</option>
            <option value="scheduled">{language === 'ru' ? 'Запланирован' : 'Rejalashtirilgan'}</option>
            <option value="in_progress">{language === 'ru' ? 'Выполняется' : 'Bajarilmoqda'}</option>
            <option value="completed">{language === 'ru' ? 'Завершен' : 'Yakunlangan'}</option>
            <option value="cancelled">{language === 'ru' ? 'Отменен' : 'Bekor qilingan'}</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{language === 'ru' ? 'Все типы' : 'Barcha turlar'}</option>
            <option value="planned">{language === 'ru' ? 'Плановый' : 'Rejalashtirilgan'}</option>
            <option value="preventive">{language === 'ru' ? 'Профилактика' : 'Profilaktika'}</option>
            <option value="emergency">{language === 'ru' ? 'Аварийный' : 'Favqulodda'}</option>
            <option value="seasonal">{language === 'ru' ? 'Сезонный' : 'Mavsumiy'}</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{language === 'ru' ? 'Приоритет: все' : 'Ustuvorlik: barchasi'}</option>
            <option value="low">{language === 'ru' ? 'Низкий' : 'Past'}</option>
            <option value="medium">{language === 'ru' ? 'Средний' : 'O\'rta'}</option>
            <option value="high">{language === 'ru' ? 'Высокий' : 'Yuqori'}</option>
            <option value="urgent">{language === 'ru' ? 'Срочный' : 'Shoshilinch'}</option>
          </select>

          <select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className="px-4 py-2 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{language === 'ru' ? 'Все дома' : 'Barcha uylar'}</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Work Orders List */}
      <div className="space-y-3">
        {filteredOrders.map((order) => {
          const building = buildings.find(b => b.id === order.buildingId);
          const executor = executors.find(e => e.id === order.assignedTo);

          return (
            <div
              key={order.id}
              className="glass-card p-3 sm:p-4 md:p-5 hover:shadow-md transition-shadow cursor-pointer touch-manipulation"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    order.type === 'emergency' ? 'bg-red-100' :
                    order.type === 'seasonal' ? 'bg-orange-100' :
                    order.type === 'preventive' ? 'bg-purple-100' :
                    'bg-blue-100'
                  }`}>
                    <Wrench className={`w-6 h-6 ${
                      order.type === 'emergency' ? 'text-red-600' :
                      order.type === 'seasonal' ? 'text-orange-600' :
                      order.type === 'preventive' ? 'text-purple-600' :
                      'text-blue-600'
                    }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-gray-500">{order.number}</span>
                      <StatusBadge status={getStatusTone(order.status)} size="sm">
                        {getStatusLabel(order.status)}
                      </StatusBadge>
                      <span className={`text-xs font-medium ${getPriorityColor(order.priority)}`}>
                        {getPriorityLabel(order.priority)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{order.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1">{order.description}</p>

                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{building?.name || (language === 'ru' ? 'Не указано' : 'Ko\'rsatilmagan')}</span>
                      </div>
                      {order.scheduledDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(order.scheduledDate)} {order.scheduledTime || ''}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{formatDuration(order.estimatedDuration)}</span>
                      </div>
                      {executor && (
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>{executor.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'scheduled')}
                      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-primary-600 hover:bg-primary-50 active:bg-primary-100 rounded-lg transition-colors touch-manipulation"
                      title={language === 'ru' ? 'Запланировать' : 'Rejalashtirish'}
                    >
                      <Calendar className="w-5 h-5" />
                    </button>
                  )}
                  {order.status === 'scheduled' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'in_progress')}
                      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors touch-manipulation"
                      title={language === 'ru' ? 'Начать выполнение' : 'Bajarishni boshlash'}
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  {order.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'scheduled')}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-yellow-600 hover:bg-yellow-50 active:bg-yellow-100 rounded-lg transition-colors touch-manipulation"
                        title={language === 'ru' ? 'Приостановить' : 'To\'xtatib turish'}
                      >
                        <Pause className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'completed')}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors touch-manipulation"
                        title={language === 'ru' ? 'Завершить' : 'Yakunlash'}
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-gray-400 animate-spin" />
            <p className="text-gray-500">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</p>
          </div>
        )}

        {!isLoading && filteredOrders.length === 0 && (
          <EmptyState
            icon={<Wrench className="w-12 h-12" />}
            title={language === 'ru' ? 'Наряды не найдены' : 'Buyurtmalar topilmadi'}
            description={language === 'ru' ? 'Создайте новый рабочий наряд' : 'Yangi ish buyurtmasini yarating'}
          />
        )}
      </div>

      {/* Work Order Detail Modal */}
      {selectedOrder && (
        <WorkOrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={(status) => {
            updateOrderStatus(selectedOrder.id, status);
            setSelectedOrder({ ...selectedOrder, status });
          }}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <WorkOrderFormModal
          onClose={() => setShowAddModal(false)}
          onSave={async (order) => {
            try {
              await workOrdersApi.create({
                title: order.title,
                description: order.description,
                type: order.type,
                priority: order.priority,
                building_id: order.buildingId,
                apartment_id: order.apartmentId || undefined,
                assigned_to: order.assignedTo || undefined,
                scheduled_date: order.scheduledDate || undefined,
                scheduled_time: order.scheduledTime || undefined,
                estimated_duration: order.estimatedDuration,
              });
              setShowAddModal(false);
              fetchWorkOrders();
            } catch (error) {
              console.error('Failed to create work order:', error);
            }
          }}
        />
      )}
    </div>
  );
}

function WorkOrderDetailModal({
  order,
  onClose,
  onUpdateStatus
}: {
  order: WorkOrder;
  onClose: () => void;
  onUpdateStatus: (status: WorkOrderStatus) => void;
}) {
  const { language } = useLanguageStore();
  const { buildings, apartments } = useCRMStore();
  const { executors } = useDataStore();

  const building = buildings.find(b => b.id === order.buildingId);
  const apartment = apartments.find(a => a.id === order.apartmentId);
  const executor = executors.find(e => e.id === order.assignedTo);

  const getStatusTone = (status: WorkOrderStatus): StatusTone => {
    switch (status) {
      case 'pending': return 'expired';
      case 'scheduled': return 'info';
      case 'in_progress': return 'pending';
      case 'completed': return 'active';
      case 'cancelled': return 'critical';
    }
  };

  const getStatusLabel = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return language === 'ru' ? 'Ожидает' : 'Kutilmoqda';
      case 'scheduled': return language === 'ru' ? 'Запланирован' : 'Rejalashtirilgan';
      case 'in_progress': return language === 'ru' ? 'Выполняется' : 'Bajarilmoqda';
      case 'completed': return language === 'ru' ? 'Завершен' : 'Yakunlangan';
      case 'cancelled': return language === 'ru' ? 'Отменен' : 'Bekor qilingan';
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return language === 'ru' ? `${hours}ч ${mins}м` : `${hours}s ${mins}d`;
    }
    return language === 'ru' ? `${mins}м` : `${mins}d`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[110]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-gray-500">{order.number}</span>
                <StatusBadge status={getStatusTone(order.status)} size="sm">
                  {getStatusLabel(order.status)}
                </StatusBadge>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{order.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation" aria-label="Закрыть">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">{language === 'ru' ? 'Описание' : 'Tavsif'}</h3>
            <p className="text-gray-600">{order.description}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Объект' : 'Obyekt'}</p>
              <p className="font-medium">{building?.name || '-'}</p>
              {apartment && <p className="text-sm text-gray-500">{language === 'ru' ? 'Кв.' : 'Kv.'} {apartment.number}</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</p>
              <p className="font-medium">{executor?.name || (language === 'ru' ? 'Не назначен' : 'Tayinlanmagan')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Запланировано' : 'Rejalashtirilgan'}</p>
              <p className="font-medium">{order.scheduledDate ? `${order.scheduledDate} ${order.scheduledTime || ''}` : '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Длительность' : 'Davomiyligi'}</p>
              <p className="font-medium">{formatDuration(order.estimatedDuration)}</p>
              {order.actualDuration && (
                <p className="text-sm text-gray-500">{language === 'ru' ? 'Факт:' : 'Haqiqiy:'} {formatDuration(order.actualDuration)}</p>
              )}
            </div>
          </div>

          {/* Timeline */}
          {(order.startedAt || order.completedAt) && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Хронология' : 'Tarix'}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-sm text-gray-600">{language === 'ru' ? 'Создан:' : 'Yaratilgan:'} {formatDate(order.createdAt)}</span>
                </div>
                {order.startedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full" />
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Начат:' : 'Boshlangan:'} {formatDate(order.startedAt)}</span>
                  </div>
                )}
                {order.completedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Завершен:' : 'Yakunlangan:'} {formatDate(order.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist */}
          {order.checklist && order.checklist.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Чек-лист' : 'Nazorat ro\'yxati'}</h3>
              <div className="space-y-2">
                {order.checklist.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <div className={`w-5 h-5 rounded flex items-center justify-center ${
                      item.completed ? 'bg-green-500 text-white' : 'bg-gray-200'
                    }`}>
                      {item.completed && <Check className="w-3 h-3" />}
                    </div>
                    <span className={item.completed ? 'text-gray-500 line-through' : 'text-gray-700'}>
                      {item.item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials */}
          {order.materials && order.materials.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Материалы' : 'Materiallar'}</h3>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">{language === 'ru' ? 'Наименование' : 'Nomi'}</th>
                      <th className="px-4 py-2 text-right text-gray-600">{language === 'ru' ? 'Количество' : 'Miqdori'}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{language === 'ru' ? 'Ед.' : 'O\'lch.'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.materials.map((material, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        <td className="px-4 py-2">{material.name}</td>
                        <td className="px-4 py-2 text-right">{material.quantity}</td>
                        <td className="px-4 py-2">{material.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            {order.status === 'pending' && (
              <button
                onClick={() => onUpdateStatus('scheduled')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Запланировать' : 'Rejalashtirish'}
              </button>
            )}
            {order.status === 'scheduled' && (
              <button
                onClick={() => onUpdateStatus('in_progress')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Начать выполнение' : 'Bajarishni boshlash'}
              </button>
            )}
            {order.status === 'in_progress' && (
              <button
                onClick={() => onUpdateStatus('completed')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Завершить' : 'Yakunlash'}
              </button>
            )}
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={() => onUpdateStatus('cancelled')}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                {language === 'ru' ? 'Отменить' : 'Bekor qilish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkOrderFormModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (order: Omit<WorkOrder, 'id' | 'number' | 'status' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const { language } = useLanguageStore();
  const { buildings, apartments } = useCRMStore();
  const { executors } = useDataStore();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'planned' as WorkOrderType,
    priority: 'medium' as WorkOrderPriority,
    buildingId: '',
    apartmentId: '',
    assignedTo: '',
    scheduledDate: '',
    scheduledTime: '',
    estimatedDuration: 60,
  });

  const filteredApartments = apartments.filter(a => a.buildingId === formData.buildingId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      description: formData.description,
      type: formData.type,
      priority: formData.priority,
      buildingId: formData.buildingId,
      apartmentId: formData.apartmentId || undefined,
      assignedTo: formData.assignedTo || undefined,
      scheduledDate: formData.scheduledDate || undefined,
      scheduledTime: formData.scheduledTime || undefined,
      estimatedDuration: formData.estimatedDuration,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[110]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{language === 'ru' ? 'Новый наряд' : 'Yangi buyurtma'}</h2>
            <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation" aria-label="Закрыть">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Название *' : 'Nomi *'}</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={language === 'ru' ? 'Краткое описание работы' : 'Ishning qisqacha tavsifi'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Описание' : 'Tavsif'}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={language === 'ru' ? 'Подробное описание работ' : 'Ishlarning batafsil tavsifi'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Тип работы' : 'Ish turi'}</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as WorkOrderType })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="planned">{language === 'ru' ? 'Плановый' : 'Rejalashtirilgan'}</option>
                <option value="preventive">{language === 'ru' ? 'Профилактика' : 'Profilaktika'}</option>
                <option value="emergency">{language === 'ru' ? 'Аварийный' : 'Favqulodda'}</option>
                <option value="seasonal">{language === 'ru' ? 'Сезонный' : 'Mavsumiy'}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Приоритет' : 'Ustuvorlik'}</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as WorkOrderPriority })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="low">{language === 'ru' ? 'Низкий' : 'Past'}</option>
                <option value="medium">{language === 'ru' ? 'Средний' : 'O\'rta'}</option>
                <option value="high">{language === 'ru' ? 'Высокий' : 'Yuqori'}</option>
                <option value="urgent">{language === 'ru' ? 'Срочный' : 'Shoshilinch'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Дом *' : 'Uy *'}</label>
              <select
                required
                value={formData.buildingId}
                onChange={(e) => setFormData({ ...formData, buildingId: e.target.value, apartmentId: '' })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{language === 'ru' ? 'Выберите дом' : 'Binoni tanlang'}</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Квартира' : 'Kvartira'}</label>
              <select
                value={formData.apartmentId}
                onChange={(e) => setFormData({ ...formData, apartmentId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!formData.buildingId}
              >
                <option value="">{language === 'ru' ? 'Общедомовые работы' : 'Umumuy ishlar'}</option>
                {filteredApartments.map(a => (
                  <option key={a.id} value={a.id}>{language === 'ru' ? 'Кв.' : 'Kv.'} {a.number}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</label>
            <select
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{language === 'ru' ? 'Не назначен' : 'Tayinlanmagan'}</option>
              {executors.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Дата' : 'Sana'}</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'}</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Длительность (мин)' : 'Davomiyligi (daq)'}</label>
              <input
                type="number"
                min="15"
                step="15"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary">
              {language === 'ru' ? 'Создать' : 'Yaratish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
