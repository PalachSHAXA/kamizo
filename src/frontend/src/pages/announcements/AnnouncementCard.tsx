// Sprint 20: extracted from AnnouncementsPage. One card in the
// announcement list. Owns its own viewers-modal state (the popover
// that shows who has read the announcement) and lazily fetches the
// viewer list when opened. All page-level helpers (formatDate,
// getPriorityIcon, t, etc) come in as props so the parent stays
// the single source of truth for those labels.

import { useState } from 'react';
import { Clock, Download, Eye, File, FileText, Image, Target, Trash2, X } from 'lucide-react';
import { StatusBadge } from '../../components/common';
import type { StatusTone } from '../../theme';
import type { Announcement, AnnouncementPriority } from '../../types';
import type { ReactNode } from 'react';

export function AnnouncementCard({
  announcement,
  onDelete,
  onEdit,
  formatDate,
  getPriorityIcon,
  getPriorityTone,
  t,
  canDelete,
  canEdit,
  language,
}: {
  announcement: Announcement;
  onDelete: () => void;
  onEdit: () => void;
  formatDate: (date: string) => string;
  getPriorityIcon: (priority: AnnouncementPriority) => ReactNode;
  getPriorityBadge: (priority: AnnouncementPriority) => string;
  getPriorityTone: (priority: AnnouncementPriority) => StatusTone;
  t: (key: string) => string;
  canDelete: boolean;
  canEdit?: boolean;
  language: string;
}) {
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<{ id: string; name: string; apartment?: string; address?: string; viewed_at: string }[]>([]);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [viewStats, setViewStats] = useState<{ count: number; targetAudienceSize: number; viewPercentage: number } | null>(null);

  const viewCount = announcement.viewCount ?? announcement.viewedBy.length;

  const handleViewClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    setShowViewers(true);
    setIsLoadingViewers(true);

    try {
      const { announcementsApi } = await import('../../services/api');
      const result = await announcementsApi.getViews(announcement.id);
      setViewers(result.viewers || []);
      setViewStats({
        count: result.count,
        targetAudienceSize: result.targetAudienceSize,
        viewPercentage: result.viewPercentage
      });
    } catch (error) {
      console.error('Failed to load viewers:', error);
    } finally {
      setIsLoadingViewers(false);
    }
  };

  return (
    <>
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-white/60 p-5 active:scale-[0.99] transition-all touch-manipulation">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusBadge status={getPriorityTone(announcement.priority)} size="sm" className="gap-1">
                {getPriorityIcon(announcement.priority)}
                {t(`announcements.priority${announcement.priority.charAt(0).toUpperCase() + announcement.priority.slice(1)}`)}
              </StatusBadge>
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                announcement.type === 'residents'
                  ? 'bg-green-100 text-green-700'
                  : announcement.type === 'employees'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {announcement.type === 'residents'
                  ? t('announcements.forResidents')
                  : announcement.type === 'employees'
                  ? t('announcements.forStaff')
                  : (language === 'ru' ? 'Для всех' : 'Hammasi uchun')}
              </span>
              {/* Targeting info */}
              {announcement.target && announcement.target.type !== 'all' && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                  <Target className="w-3 h-3 inline mr-1" />
                  {announcement.target.type === 'building' && (language === 'ru' ? 'Комплекс' : 'Kompleks')}
                  {announcement.target.type === 'entrance' && (language === 'ru' ? 'Подъезд' : 'Kirish')}
                  {announcement.target.type === 'floor' && (language === 'ru' ? 'Этаж' : 'Qavat')}
                  {announcement.target.type === 'custom' && (language === 'ru' ? 'Список' : 'Ro\'yxat')}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-lg text-gray-900 mb-2">{announcement.title}</h3>

            {/* Content */}
            <p className="text-gray-600 whitespace-pre-wrap">{announcement.content}</p>

            {/* Attachments */}
            {announcement.attachments && announcement.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {announcement.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment.url}
                    download={attachment.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {attachment.type.startsWith('image/') ? (
                      <Image className="w-4 h-4 text-blue-500" />
                    ) : attachment.type.includes('pdf') ? (
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

            {/* Meta */}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDate(announcement.createdAt)}
              </span>
              {announcement.authorName && (
                <span>
                  {t('announcements.author')}: {announcement.authorName}
                </span>
              )}
              {/* Clickable view count */}
              <button
                onClick={handleViewClick}
                className={`flex items-center gap-1 ${viewCount > 0 ? 'text-primary-600 hover:text-primary-800 cursor-pointer hover:underline' : 'text-gray-400 cursor-default'}`}
                disabled={viewCount === 0}
              >
                <Eye className="w-4 h-4" />
                {viewCount} {plural(
                  language === 'ru' ? 'ru' : 'uz',
                  viewCount,
                  { one: 'просмотр', few: 'просмотра', many: 'просмотров' },
                  { one: "ko'rish", other: "ko'rish" }
                )}
              </button>
            </div>
          </div>

          {/* Actions - only show for users with edit/delete permissions */}
          {(canEdit || canDelete) && (
            <div className="flex flex-col gap-1">
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-2 text-primary-500 hover:bg-primary-50 rounded-xl transition-colors"
                  title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                  aria-label={language === 'ru' ? 'Редактировать объявление' : 'E\'lonni tahrirlash'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                  aria-label={language === 'ru' ? 'Удалить объявление' : 'E\'lonni o\'chirish'}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Viewers Modal with Statistics */}
      {showViewers && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4" onClick={() => setShowViewers(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                {language === 'ru' ? 'Статистика просмотров' : 'Ko\'rishlar statistikasi'}
              </h3>
              <button onClick={() => setShowViewers(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60dvh] overflow-y-auto space-y-4">
              {isLoadingViewers ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                </div>
              ) : (
                <>
                  {/* Statistics Summary */}
                  {viewStats && (
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-blue-700">
                          {language === 'ru' ? 'Просмотрели' : 'Ko\'rganlar'}
                        </span>
                        <span className="font-bold text-blue-900">
                          {viewStats.count} / {viewStats.targetAudienceSize}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-blue-200 rounded-full h-3">
                        <div
                          className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(viewStats.viewPercentage, 100)}%` }}
                        />
                      </div>
                      <div className="text-center">
                        <span className="text-2xl font-bold text-blue-900">{viewStats.viewPercentage}%</span>
                        <span className="text-sm text-blue-600 ml-2">
                          {language === 'ru' ? 'от целевой аудитории' : 'maqsadli auditoriyadan'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Viewers List */}
                  {viewers.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      {language === 'ru' ? 'Пока никто не просмотрел' : 'Hali hech kim ko\'rmagan'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-600">
                        {language === 'ru' ? 'Кто просмотрел:' : 'Kim ko\'rgan:'}
                      </h4>
                      {viewers.map((viewer) => (
                        <div key={viewer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-medium text-gray-900">{viewer.name}</p>
                            <p className="text-sm text-gray-500">
                              {viewer.apartment && `${language === 'ru' ? 'Кв.' : 'Xon.'} ${viewer.apartment}`}
                              {viewer.address && ` • ${viewer.address}`}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(viewer.viewed_at).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
