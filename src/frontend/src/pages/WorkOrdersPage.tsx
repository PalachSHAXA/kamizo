import { useState } from 'react';
import {
  Wrench, Search, Plus, X, Calendar, Clock,
  AlertTriangle, CheckCircle, User, Building2,
  FileText, Play, Pause, Check
} from 'lucide-react';
import { useCRMStore } from '../stores/crmStore';
import { useDataStore } from '../stores/dataStore';

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

// Mock data for work orders
const mockWorkOrders: WorkOrder[] = [
  {
    id: 'wo-1',
    number: 'НР-2024-001',
    title: 'Плановая проверка лифтового оборудования',
    description: 'Ежемесячная проверка и обслуживание лифтов в доме',
    type: 'planned',
    priority: 'medium',
    status: 'scheduled',
    buildingId: 'building-1',
    assignedTo: 'executor-1',
    scheduledDate: '2024-12-25',
    scheduledTime: '09:00',
    estimatedDuration: 180,
    checklist: [
      { item: 'Проверка тросов', completed: false },
      { item: 'Проверка дверей', completed: false },
      { item: 'Проверка кнопок', completed: false },
      { item: 'Смазка механизмов', completed: false },
    ],
    createdAt: '2024-12-20T10:00:00Z',
    updatedAt: '2024-12-20T10:00:00Z',
  },
  {
    id: 'wo-2',
    number: 'НР-2024-002',
    title: 'Замена счетчика холодной воды',
    description: 'Плановая замена ИПУ по истечении срока поверки',
    type: 'planned',
    priority: 'low',
    status: 'pending',
    buildingId: 'building-1',
    apartmentId: 'apt-1',
    assignedTo: 'executor-2',
    scheduledDate: '2024-12-26',
    estimatedDuration: 60,
    materials: [
      { name: 'Счетчик ИПУ', quantity: 1, unit: 'шт' },
      { name: 'Прокладка', quantity: 2, unit: 'шт' },
    ],
    createdAt: '2024-12-20T11:00:00Z',
    updatedAt: '2024-12-20T11:00:00Z',
  },
  {
    id: 'wo-3',
    number: 'АВ-2024-003',
    title: 'Устранение течи в подвале',
    description: 'Аварийный вызов - течь в подвальном помещении',
    type: 'emergency',
    priority: 'urgent',
    status: 'in_progress',
    buildingId: 'building-2',
    assignedTo: 'executor-1',
    startedAt: '2024-12-21T08:30:00Z',
    estimatedDuration: 120,
    createdAt: '2024-12-21T08:00:00Z',
    updatedAt: '2024-12-21T08:30:00Z',
  },
  {
    id: 'wo-4',
    number: 'СЕЗ-2024-004',
    title: 'Подготовка отопительной системы к зиме',
    description: 'Сезонные работы по подготовке системы отопления',
    type: 'seasonal',
    priority: 'high',
    status: 'completed',
    buildingId: 'building-1',
    assignedTeam: ['executor-1', 'executor-2'],
    scheduledDate: '2024-10-15',
    startedAt: '2024-10-15T09:00:00Z',
    completedAt: '2024-10-15T17:00:00Z',
    estimatedDuration: 480,
    actualDuration: 450,
    checklist: [
      { item: 'Проверка котла', completed: true },
      { item: 'Промывка системы', completed: true },
      { item: 'Опрессовка', completed: true },
      { item: 'Запуск отопления', completed: true },
    ],
    createdAt: '2024-10-10T10:00:00Z',
    updatedAt: '2024-10-15T17:00:00Z',
  },
];

export function WorkOrdersPage() {
  const { buildings } = useCRMStore();
  const { executors } = useDataStore();

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(mockWorkOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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

  const getStatusColor = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'in_progress': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
    }
  };

  const getStatusLabel = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return 'Ожидает';
      case 'scheduled': return 'Запланирован';
      case 'in_progress': return 'Выполняется';
      case 'completed': return 'Завершен';
      case 'cancelled': return 'Отменен';
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
      case 'low': return 'Низкий';
      case 'medium': return 'Средний';
      case 'high': return 'Высокий';
      case 'urgent': return 'Срочный';
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}ч ${mins}м`;
    }
    return `${mins}м`;
  };

  const updateOrderStatus = (orderId: string, newStatus: WorkOrderStatus) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Наряды на работы</h1>
          <p className="text-gray-500 mt-1">Управление плановыми и аварийными работами</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Создать наряд
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Всего</p>
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
              <p className="text-sm text-gray-500">Ожидают</p>
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
              <p className="text-sm text-gray-500">В работе</p>
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
              <p className="text-sm text-gray-500">Завершено</p>
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
              <p className="text-sm text-gray-500">Срочных</p>
              <p className="text-xl font-bold text-red-600">{stats.urgent}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по номеру или названию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="scheduled">Запланирован</option>
            <option value="in_progress">Выполняется</option>
            <option value="completed">Завершен</option>
            <option value="cancelled">Отменен</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все типы</option>
            <option value="planned">Плановый</option>
            <option value="preventive">Профилактика</option>
            <option value="emergency">Аварийный</option>
            <option value="seasonal">Сезонный</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все приоритеты</option>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
            <option value="urgent">Срочный</option>
          </select>

          <select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все дома</option>
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
              className="glass-card p-4 hover:shadow-md transition-shadow cursor-pointer"
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                      <span className={`text-xs font-medium ${getPriorityColor(order.priority)}`}>
                        {getPriorityLabel(order.priority)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{order.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1">{order.description}</p>

                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{building?.name || 'Не указано'}</span>
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
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Запланировать"
                    >
                      <Calendar className="w-5 h-5" />
                    </button>
                  )}
                  {order.status === 'scheduled' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'in_progress')}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Начать выполнение"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  {order.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'scheduled')}
                        className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                        title="Приостановить"
                      >
                        <Pause className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'completed')}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Завершить"
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

        {filteredOrders.length === 0 && (
          <div className="glass-card p-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">Наряды не найдены</p>
          </div>
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
          onSave={(order) => {
            const newOrder: WorkOrder = {
              ...order,
              id: `wo-${Date.now()}`,
              number: `НР-2024-${String(workOrders.length + 1).padStart(3, '0')}`,
              status: 'pending',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setWorkOrders([...workOrders, newOrder]);
            setShowAddModal(false);
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
  const { buildings, apartments } = useCRMStore();
  const { executors } = useDataStore();

  const building = buildings.find(b => b.id === order.buildingId);
  const apartment = apartments.find(a => a.id === order.apartmentId);
  const executor = executors.find(e => e.id === order.assignedTo);

  const getStatusColor = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'in_progress': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
    }
  };

  const getStatusLabel = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return 'Ожидает';
      case 'scheduled': return 'Запланирован';
      case 'in_progress': return 'Выполняется';
      case 'completed': return 'Завершен';
      case 'cancelled': return 'Отменен';
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
      return `${hours}ч ${mins}м`;
    }
    return `${mins}м`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-gray-500">{order.number}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{order.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Описание</h3>
            <p className="text-gray-600">{order.description}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Объект</p>
              <p className="font-medium">{building?.name || '-'}</p>
              {apartment && <p className="text-sm text-gray-500">Кв. {apartment.number}</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Исполнитель</p>
              <p className="font-medium">{executor?.name || 'Не назначен'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Запланировано</p>
              <p className="font-medium">{order.scheduledDate ? `${order.scheduledDate} ${order.scheduledTime || ''}` : '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Длительность</p>
              <p className="font-medium">{formatDuration(order.estimatedDuration)}</p>
              {order.actualDuration && (
                <p className="text-sm text-gray-500">Факт: {formatDuration(order.actualDuration)}</p>
              )}
            </div>
          </div>

          {/* Timeline */}
          {(order.startedAt || order.completedAt) && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Хронология</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-sm text-gray-600">Создан: {formatDate(order.createdAt)}</span>
                </div>
                {order.startedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full" />
                    <span className="text-sm text-gray-600">Начат: {formatDate(order.startedAt)}</span>
                  </div>
                )}
                {order.completedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-sm text-gray-600">Завершен: {formatDate(order.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist */}
          {order.checklist && order.checklist.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Чек-лист</h3>
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
              <h3 className="font-semibold text-gray-900 mb-3">Материалы</h3>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">Наименование</th>
                      <th className="px-4 py-2 text-right text-gray-600">Количество</th>
                      <th className="px-4 py-2 text-left text-gray-600">Ед.</th>
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
                Запланировать
              </button>
            )}
            {order.status === 'scheduled' && (
              <button
                onClick={() => onUpdateStatus('in_progress')}
                className="btn-primary"
              >
                Начать выполнение
              </button>
            )}
            {order.status === 'in_progress' && (
              <button
                onClick={() => onUpdateStatus('completed')}
                className="btn-primary"
              >
                Завершить
              </button>
            )}
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={() => onUpdateStatus('cancelled')}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Отменить
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Новый наряд</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Краткое описание работы"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Подробное описание работ"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тип работы</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as WorkOrderType })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="planned">Плановый</option>
                <option value="preventive">Профилактика</option>
                <option value="emergency">Аварийный</option>
                <option value="seasonal">Сезонный</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Приоритет</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as WorkOrderPriority })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочный</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дом *</label>
              <select
                required
                value={formData.buildingId}
                onChange={(e) => setFormData({ ...formData, buildingId: e.target.value, apartmentId: '' })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Выберите дом</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Квартира</label>
              <select
                value={formData.apartmentId}
                onChange={(e) => setFormData({ ...formData, apartmentId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!formData.buildingId}
              >
                <option value="">Общедомовые работы</option>
                {filteredApartments.map(a => (
                  <option key={a.id} value={a.id}>Кв. {a.number}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label>
            <select
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Не назначен</option>
              {executors.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Время</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Длительность (мин)</label>
              <input
                type="number"
                min="15"
                step="15"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button type="submit" className="btn-primary">
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
