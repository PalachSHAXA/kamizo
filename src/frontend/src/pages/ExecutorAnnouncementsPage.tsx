import { useEffect } from 'react';
import { Megaphone, AlertTriangle, AlertCircle, Info, Clock, Download, FileText, File } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useLanguageStore } from '../stores/languageStore';
import type { Announcement, AnnouncementPriority } from '../types';

export function ExecutorAnnouncementsPage() {
  const { user } = useAuthStore();
  const { getAnnouncementsForEmployees, markAnnouncementAsViewed, fetchAnnouncements } = useDataStore();
  const { language } = useLanguageStore();

  // Fetch announcements on component mount
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const employeeAnnouncements = getAnnouncementsForEmployees();
  const unreadCount = employeeAnnouncements.filter((a: Announcement) => !a.viewedBy.includes(user?.id || '')).length;

  const getPriorityIcon = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'important':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-primary-500" />;
    }
  };

  const getPriorityBadge = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'important':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-primary-100 text-primary-700 border-primary-200';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleView = (announcement: Announcement) => {
    if (user && !announcement.viewedBy.includes(user.id)) {
      markAnnouncementAsViewed(announcement.id, user.id);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-purple-500" />
          {language === 'ru' ? 'Объявления для сотрудников' : 'Xodimlar uchun e\'lonlar'}
        </h1>
        {unreadCount > 0 && (
          <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium">
            {unreadCount} {language === 'ru' ? 'новых' : 'yangi'}
          </span>
        )}
      </div>

      {/* Info Card */}
      <div className="glass-card p-3 sm:p-4 rounded-lg sm:rounded-xl bg-purple-50 border-purple-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-purple-700">
            {language === 'ru'
              ? 'Здесь вы найдете важную информацию от руководства. Не забывайте читать объявления регулярно.'
              : 'Bu yerda rahbariyatdan muhim ma\'lumotlarni topasiz. E\'lonlarni muntazam o\'qishni unutmang.'}
          </p>
        </div>
      </div>

      {/* Announcements List */}
      {employeeAnnouncements.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Megaphone className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">
            {language === 'ru' ? 'Нет объявлений' : 'E\'lonlar yo\'q'}
          </h3>
          <p className="text-gray-400">
            {language === 'ru' ? 'Новые объявления появятся здесь' : 'Yangi e\'lonlar bu yerda paydo bo\'ladi'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {employeeAnnouncements.map((announcement: Announcement) => {
            const isUnread = !announcement.viewedBy.includes(user?.id || '');

            return (
              <div
                key={announcement.id}
                className={`glass-card p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl cursor-pointer transition-all hover:shadow-md ${
                  isUnread ? 'ring-2 ring-purple-400 bg-purple-50/50' : ''
                }`}
                onClick={() => handleView(announcement)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {isUnread && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500 text-white text-xs font-medium">
                          {language === 'ru' ? 'Новое' : 'Yangi'}
                        </span>
                      )}
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${getPriorityBadge(announcement.priority)}`}>
                        {getPriorityIcon(announcement.priority)}
                        {announcement.priority === 'urgent'
                          ? (language === 'ru' ? 'Срочно' : 'Shoshilinch')
                          : announcement.priority === 'important'
                          ? (language === 'ru' ? 'Важно' : 'Muhim')
                          : (language === 'ru' ? 'Обычное' : 'Oddiy')}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-lg text-gray-900 mb-2">{announcement.title}</h3>

                    {/* Content */}
                    <p className="text-gray-600 whitespace-pre-wrap">{announcement.content}</p>

                    {/* Attachments */}
                    {announcement.attachments && announcement.attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {/* Image previews */}
                        {announcement.attachments.filter(a => a.type.startsWith('image/')).length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {announcement.attachments.filter(a => a.type.startsWith('image/')).map((attachment, index) => (
                              <a
                                key={`img-${index}`}
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 rounded-xl overflow-hidden border border-gray-200 hover:border-primary-400 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <img src={attachment.url} alt={attachment.name} className="h-32 w-auto max-w-[200px] object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                        {/* Non-image files */}
                        {announcement.attachments.filter(a => !a.type.startsWith('image/')).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {announcement.attachments.filter(a => !a.type.startsWith('image/')).map((attachment, index) => (
                              <a
                                key={`file-${index}`}
                                href={attachment.url}
                                download={attachment.name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors border border-gray-200"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {attachment.type.includes('pdf') ? (
                                  <FileText className="w-4 h-4 text-red-500" />
                                ) : (
                                  <File className="w-4 h-4 text-gray-500" />
                                )}
                                <span className="truncate max-w-[150px]">{attachment.name}</span>
                                <Download className="w-4 h-4 text-gray-400" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(announcement.createdAt)}
                      </span>
                      <span>
                        {language === 'ru' ? 'Автор' : 'Muallif'}: {announcement.authorName}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
