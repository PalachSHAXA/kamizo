import { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Search, Plus, X, Calendar, Clock,
  AlertTriangle, CheckCircle, User, Building2,
  FileText, Play, Pause, Check, Loader2
} from 'lucide-react';
import { EmptyState, StatusBadge } from '../components/common';
import type { StatusTone } from '../theme';
import { useCRMStore } from '../stores/crmStore';
import { useExecutorStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import { workOrdersApi } from '../services/api';
import { WorkOrderDetailModal } from './work-orders/WorkOrderDetailModal';
import { WorkOrderFormModal } from './work-orders/WorkOrderFormModal';
import type { WorkOrder, WorkOrderStatus } from './work-orders/types';

// Map API snake_case fields to camelCase interface
interface WorkOrderRaw {
  id: string;
  number: string;
  title: string;
  description?: string;
  type: WorkOrder['type'];
  priority: WorkOrder['priority'];
  status: WorkOrder['status'];
  building_id?: string;
  buildingId?: string;
  apartment_id?: string;
  apartmentId?: string;
  assigned_to?: string;
  assignedTo?: string;
  scheduled_date?: string;
  scheduledDate?: string;
  scheduled_time?: string;
  scheduledTime?: string;
  started_at?: string;
  startedAt?: string;
  completed_at?: string;
  completedAt?: string;
  estimated_duration?: number;
  estimatedDuration?: number;
  actual_duration?: number;
  actualDuration?: number;
  materials?: string | { name: string; quantity: number; cost: number }[];
  checklist?: string | { item: string; completed: boolean }[];
  notes?: string;
  request_id?: string;
  requestId?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

function mapWorkOrder(raw: Record<string, unknown>): WorkOrder {
  const r = raw as unknown as WorkOrderRaw;
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description || '',
    type: r.type,
    priority: r.priority,
    status: r.status,
    buildingId: r.building_id || r.buildingId || '',
    apartmentId: r.apartment_id || r.apartmentId,
    assignedTo: r.assigned_to || r.assignedTo,
    scheduledDate: r.scheduled_date || r.scheduledDate,
    scheduledTime: r.scheduled_time || r.scheduledTime,
    startedAt: r.started_at || r.startedAt,
    completedAt: r.completed_at || r.completedAt,
    estimatedDuration: r.estimated_duration ?? r.estimatedDuration ?? 60,
    actualDuration: r.actual_duration ?? r.actualDuration,
    materials: typeof r.materials === 'string' ? JSON.parse(r.materials || '[]') : (r.materials || []),
    checklist: typeof r.checklist === 'string' ? JSON.parse(r.checklist || '[]') : (r.checklist || []),
    notes: r.notes,
    requestId: r.request_id || r.requestId,
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || new Date().toISOString(),
  };
}

export function WorkOrdersPage() {
  const { language } = useLanguageStore();
  const { buildings } = useCRMStore();
  const executors = useExecutorStore(s => s.executors);

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
      const resp = response as Record<string, unknown>;
      const orders = ((resp.workOrders || resp.work_orders || []) as Record<string, unknown>[]).map(mapWorkOrder);
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

