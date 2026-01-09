import { useState, useEffect } from 'react';
import { Megaphone, AlertTriangle, AlertCircle, Info, ChevronRight, Check } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Announcement, AnnouncementPriority } from '../types';

export function ResidentAnnouncementsPage() {
  const { user } = useAuthStore();
  const { getAnnouncementsForResidents, markAnnouncementAsViewed, fetchAnnouncements } = useDataStore();
  const { language } = useLanguageStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Fetch announcements on component mount
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Get user's targeting info
  const userLogin = user?.login || '';
  const userBuilding = user?.buildingId || '';
  const userEntrance = user?.entrance || '';
  const userFloor = user?.floor || '';
  const userBranch = user?.branch || '';

  const announcements = getAnnouncementsForResidents(userLogin, userBuilding, userEntrance, userFloor, userBranch);

  const filteredAnnouncements = filter === 'unread'
    ? announcements.filter(a => !a.viewedBy.includes(user?.id || ''))
    : announcements;

  const unreadCount = announcements.filter(a => !a.viewedBy.includes(user?.id || '')).length;

  const handleExpand = (announcement: Announcement) => {
    if (expandedId === announcement.id) {
      setExpandedId(null);
    } else {
      setExpandedId(announcement.id);
      // Mark as viewed when expanded
      if (user?.id && !announcement.viewedBy.includes(user.id)) {
        markAnnouncementAsViewed(announcement.id, user.id);
      }
    }
  };

  const getPriorityStyles = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return {
          bg: 'bg-red-50 border-red-200',
          badge: 'bg-red-100 text-red-700',
          icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
          label: language === 'ru' ? 'Срочно' : 'Shoshilinch'
        };
      case 'important':
        return {
          bg: 'bg-amber-50 border-amber-200',
          badge: 'bg-amber-100 text-amber-700',
          icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
          label: language === 'ru' ? 'Важно' : 'Muhim'
        };
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          badge: 'bg-blue-100 text-blue-700',
          icon: <Info className="w-5 h-5 text-blue-500" />,
          label: language === 'ru' ? 'Информация' : 'Ma\'lumot'
        };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-primary-500" />
          {language === 'ru' ? 'Объявления' : 'E\'lonlar'}
        </h1>

        {unreadCount > 0 && (
          <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">
            {unreadCount} {language === 'ru' ? 'новых' : 'yangi'}
          </span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
            filter === 'all'
              ? 'bg-primary-500 text-gray-900'
              : 'bg-white/60 text-gray-600 hover:bg-white/80'
          }`}
        >
          {language === 'ru' ? 'Все' : 'Hammasi'} ({announcements.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
            filter === 'unread'
              ? 'bg-primary-500 text-gray-900'
              : 'bg-white/60 text-gray-600 hover:bg-white/80'
          }`}
        >
          {language === 'ru' ? 'Непрочитанные' : 'O\'qilmagan'} ({unreadCount})
        </button>
      </div>

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {filter === 'unread'
              ? (language === 'ru' ? 'Нет новых объявлений' : 'Yangi e\'lonlar yo\'q')
              : (language === 'ru' ? 'Объявлений пока нет' : 'E\'lonlar yo\'q')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnnouncements.map((announcement) => {
            const isUnread = !announcement.viewedBy.includes(user?.id || '');
            const isExpanded = expandedId === announcement.id;
            const styles = getPriorityStyles(announcement.priority);

            return (
              <div
                key={announcement.id}
                className={`glass-card p-4 border-2 cursor-pointer transition-all ${styles.bg} ${
                  isUnread ? 'ring-2 ring-yellow-400 ring-offset-2' : ''
                }`}
                onClick={() => handleExpand(announcement)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {styles.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {isUnread && (
                        <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900 text-xs font-medium">
                          {language === 'ru' ? 'Новое' : 'Yangi'}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${styles.badge}`}>
                        {styles.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-base text-gray-900 mb-1">
                      {announcement.title}
                    </h3>

                    {/* Content */}
                    <p className={`text-gray-600 text-sm ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {announcement.content}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                      <span>{formatDate(announcement.createdAt)}</span>
                      <span>{announcement.authorName}</span>
                      {!isUnread && (
                        <span className="flex items-center gap-1 text-green-600">
                          <Check className="w-3 h-3" />
                          {language === 'ru' ? 'Прочитано' : 'O\'qilgan'}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
