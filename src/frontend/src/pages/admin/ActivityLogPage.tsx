import { FileText, User, CheckCircle, Clock, Star, Calendar, Download, List } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';

export function ActivityLogPage() {
  const { requests } = useDataStore();
  const { language } = useLanguageStore();

  // Generate activity log from requests
  const activityLog = requests.flatMap(req => {
    const activities = [];

    // Created
    activities.push({
      id: `${req.id}-created`,
      type: 'request_created',
      requestNumber: req.number,
      requestTitle: req.title,
      user: req.residentName,
      timestamp: req.createdAt,
      description: language === 'ru' ? `Создана заявка #${req.number}: ${req.title}` : `Ariza yaratildi #${req.number}: ${req.title}`,
    });

    // Assigned
    if (req.assignedAt) {
      activities.push({
        id: `${req.id}-assigned`,
        type: 'request_assigned',
        requestNumber: req.number,
        requestTitle: req.title,
        user: language === 'ru' ? 'Менеджер' : 'Menejer',
        executor: req.executorName,
        timestamp: req.assignedAt,
        description: language === 'ru' ? `Заявка #${req.number} назначена исполнителю ${req.executorName}` : `Ariza #${req.number} ijrochiga tayinlandi ${req.executorName}`,
      });
    }

    // Accepted
    if (req.acceptedAt) {
      activities.push({
        id: `${req.id}-accepted`,
        type: 'request_accepted',
        requestNumber: req.number,
        requestTitle: req.title,
        user: req.executorName,
        timestamp: req.acceptedAt,
        description: language === 'ru' ? `${req.executorName} принял заявку #${req.number}` : `${req.executorName} arizani qabul qildi #${req.number}`,
      });
    }

    // Started
    if (req.startedAt) {
      activities.push({
        id: `${req.id}-started`,
        type: 'request_started',
        requestNumber: req.number,
        requestTitle: req.title,
        user: req.executorName,
        timestamp: req.startedAt,
        description: language === 'ru' ? `${req.executorName} начал работу над заявкой #${req.number}` : `${req.executorName} ariza ustida ishni boshladi #${req.number}`,
      });
    }

    // Completed
    if (req.completedAt) {
      activities.push({
        id: `${req.id}-completed`,
        type: 'request_completed',
        requestNumber: req.number,
        requestTitle: req.title,
        user: req.executorName,
        timestamp: req.completedAt,
        description: language === 'ru' ? `${req.executorName} завершил работу над заявкой #${req.number}` : `${req.executorName} ariza ustida ishni yakunladi #${req.number}`,
      });
    }

    // Approved
    if (req.approvedAt) {
      activities.push({
        id: `${req.id}-approved`,
        type: 'request_approved',
        requestNumber: req.number,
        requestTitle: req.title,
        user: req.residentName,
        timestamp: req.approvedAt,
        description: language === 'ru' ? `${req.residentName} подтвердил выполнение заявки #${req.number}` : `${req.residentName} ariza bajarilishini tasdiqladi #${req.number}`,
        rating: req.rating,
      });
    }

    return activities;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Export activity log to CSV
  const handleExportActivityLog = () => {
    const headers = language === 'ru'
      ? ['Дата/Время', 'Тип', '№ Заявки', 'Пользователь', 'Описание']
      : ['Sana/Vaqt', 'Turi', 'Ariza №', 'Foydalanuvchi', 'Tavsif'];
    const typeLabels: Record<string, string> = language === 'ru'
      ? {
          request_created: 'Создание',
          request_assigned: 'Назначение',
          request_accepted: 'Принятие',
          request_started: 'Начало работы',
          request_completed: 'Завершение',
          request_approved: 'Подтверждение'
        }
      : {
          request_created: 'Yaratish',
          request_assigned: 'Tayinlash',
          request_accepted: 'Qabul qilish',
          request_started: 'Ishni boshlash',
          request_completed: 'Yakunlash',
          request_approved: 'Tasdiqlash'
        };

    const rows = activityLog.map(activity => [
      new Date(activity.timestamp).toLocaleString('ru-RU'),
      typeLabels[activity.type] || activity.type,
      activity.requestNumber,
      activity.user,
      activity.description
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = language === 'ru'
      ? `журнал_действий_${new Date().toLocaleDateString('ru-RU')}.csv`
      : `harakatlar_jurnali_${new Date().toLocaleDateString('ru-RU')}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'request_created': return <FileText className="w-4 h-4" />;
      case 'request_assigned': return <User className="w-4 h-4" />;
      case 'request_accepted': return <CheckCircle className="w-4 h-4" />;
      case 'request_started': return <Clock className="w-4 h-4" />;
      case 'request_completed': return <CheckCircle className="w-4 h-4" />;
      case 'request_approved': return <Star className="w-4 h-4" />;
      default: return <List className="w-4 h-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'request_created': return 'bg-blue-100 text-blue-600';
      case 'request_assigned': return 'bg-indigo-100 text-indigo-600';
      case 'request_accepted': return 'bg-cyan-100 text-cyan-600';
      case 'request_started': return 'bg-amber-100 text-amber-600';
      case 'request_completed': return 'bg-green-100 text-green-600';
      case 'request_approved': return 'bg-yellow-100 text-yellow-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  // Group activities by date
  const groupedActivities = activityLog.reduce((groups, activity) => {
    const date = new Date(activity.timestamp).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, typeof activityLog>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{language === 'ru' ? 'Журнал действий' : 'Harakatlar jurnali'}</h1>
          <p className="text-gray-500 mt-1">{language === 'ru' ? 'История всех операций в системе' : 'Tizimdagi barcha operatsiyalar tarixi'}</p>
        </div>
        <button onClick={handleExportActivityLog} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" />
          {language === 'ru' ? 'Экспорт CSV' : 'CSV eksport'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{requests.length}</div>
              <div className="text-sm text-gray-500">{language === 'ru' ? 'Всего заявок' : 'Jami arizalar'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{requests.filter(r => r.status === 'completed').length}</div>
              <div className="text-sm text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarildi'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{requests.filter(r => r.status === 'in_progress').length}</div>
              <div className="text-sm text-gray-500">{language === 'ru' ? 'В работе' : 'Ishda'}</div>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <List className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{activityLog.length}</div>
              <div className="text-sm text-gray-500">{language === 'ru' ? 'Действий' : 'Harakatlar'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="glass-card p-6">
        <div className="space-y-8">
          {Object.entries(groupedActivities).map(([date, activities]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{formatDate(activities[0].timestamp)}</span>
              </div>
              <div className="space-y-3 ml-2 border-l-2 border-gray-200 pl-6">
                {activities.map((activity) => (
                  <div key={activity.id} className="relative">
                    <div className={`absolute -left-8 w-4 h-4 rounded-full ${getActivityColor(activity.type)} flex items-center justify-center`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="glass-card p-4 hover:bg-white/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{activity.description}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {formatDateTime(activity.timestamp)}
                          </p>
                        </div>
                        {(activity as any).rating && (
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${star <= (activity as any).rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {activityLog.length === 0 && (
            <div className="text-center py-12">
              <List className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600">{language === 'ru' ? 'Нет действий' : 'Harakatlar yo\'q'}</h3>
              <p className="text-gray-400 mt-1">{language === 'ru' ? 'История действий пуста' : 'Harakatlar tarixi bo\'sh'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
