import { useState } from 'react';
import { X, CheckCircle, Settings } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useTrainingStore } from '../../stores/trainingStore';
import type { TrainingProposal } from '../../types';

export const AdminPanel = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const {
    getProposalsByStatus,
    setPartnerResponse,
    scheduleTraining,
    settings,
    updateSettings,
    getStats,
  } = useTrainingStore();
  const { language } = useLanguageStore();

  const [selectedProposal, setSelectedProposal] = useState<TrainingProposal | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleLink, setScheduleLink] = useState('');
  const [activeTab, setActiveTab] = useState<'review' | 'settings' | 'stats'>('review');

  const reviewProposals = getProposalsByStatus('review');
  const approvedProposals = getProposalsByStatus('approved');
  const stats = getStats();

  const handleSchedule = () => {
    if (!selectedProposal || !scheduleDate || !scheduleTime) return;

    scheduleTraining(selectedProposal.id, {
      scheduledDate: scheduleDate,
      scheduledTime: scheduleTime,
      scheduledLocation: scheduleLocation || undefined,
      scheduledLink: scheduleLink || undefined,
    });

    setSelectedProposal(null);
    setScheduleDate('');
    setScheduleTime('');
    setScheduleLocation('');
    setScheduleLink('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {language === 'ru' ? 'Управление тренингами' : 'Treninglarni boshqarish'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('review')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'review' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {language === 'ru' ? 'На расс��отрении' : 'Ko\'rib chiqishda'} ({reviewProposals.length + approvedProposals.length})
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'stats' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {language === 'ru' ? 'Статистика' : 'Statistika'}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'settings' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {language === 'ru' ? 'Настройки' : 'Sozlamalar'}
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'review' && (
            <div className="space-y-6">
              {reviewProposals.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {language === 'ru' ? 'Ожидают ответа партнёра' : 'Hamkor javobini kutmoqda'}
                  </h3>
                  <div className="space-y-3">
                    {reviewProposals.map((p) => (
                      <div key={p.id} className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{p.topic}</h4>
                            <p className="text-sm text-gray-600 mt-1">{language === 'ru' ? 'Лектор' : 'Lektor'}: {p.partnerName}</p>
                            <p className="text-sm text-gray-500">{language === 'ru' ? 'Голосов' : 'Ovozlar'}: {p.votes.length}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setPartnerResponse(p.id, 'accepted')} className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                              {language === 'ru' ? 'Принять' : 'Qabul qilish'}
                            </button>
                            <button onClick={() => setPartnerResponse(p.id, 'rejected')} className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                              {language === 'ru' ? 'Отклонить' : 'Rad etish'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {approvedProposals.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {language === 'ru' ? 'Требуют планирования' : 'Rejalashtirish kerak'}
                  </h3>
                  <div className="space-y-3">
                    {approvedProposals.map((p) => (
                      <div key={p.id} className="p-4 border border-green-200 bg-green-50 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{p.topic}</h4>
                            <p className="text-sm text-gray-600 mt-1">{language === 'ru' ? 'Лектор' : 'Lektor'}: {p.partnerName}</p>
                          </div>
                          <button onClick={() => setSelectedProposal(p)} className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">
                            {language === 'ru' ? 'Запланировать' : 'Rejalashtirish'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProposal && (
                <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg">
                  <h3 className="font-medium text-purple-900 mb-4">
                    {language === 'ru' ? 'Планирование' : 'Rejalashtirish'}: {selectedProposal.topic}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Дата *' : 'Sana *'}</label>
                      <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Время *' : 'Vaqt *'}</label>
                      <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Место (офлайн)' : 'Joy (oflayn)'}</label>
                      <input type="text" value={scheduleLocation} onChange={(e) => setScheduleLocation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={language === 'ru' ? 'Конференц-зал' : 'Konferentsiya zali'} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Ссылка (онлайн)' : 'Havola (onlayn)'}</label>
                      <input type="url" value={scheduleLink} onChange={(e) => setScheduleLink(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="https://meet.google.com/..." />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setSelectedProposal(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                      {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                    </button>
                    <button onClick={handleSchedule} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                      {language === 'ru' ? 'Запланировать' : 'Rejalashtirish'}
                    </button>
                  </div>
                </div>
              )}

              {reviewProposals.length === 0 && approvedProposals.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p>{language === 'ru' ? 'Нет предложений на рассмотрении' : 'Ko\'rib chiqish uchun takliflar yo\'q'}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 bg-primary-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-primary-600">{stats.totalProposals}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Всего предложений' : 'Jami takliflar'}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-600">{stats.scheduledTrainings}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Запланировано' : 'Rejalashtirilgan'}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-purple-600">{stats.completedTrainings}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Проведено' : 'O\'tkazilgan'}</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-yellow-600">{stats.averageRating.toFixed(1)}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Средняя оценка' : 'O\'rtacha baho'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{stats.totalVotes}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Всего голосов' : 'Jami ovozlar'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">{stats.totalParticipants}</p>
                  <p className="text-sm text-gray-600">{language === 'ru' ? 'Участников' : 'Ishtirokchilar'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Порог голосов для рассмотрения' : 'Ko\'rib chiqish uchun ovoz chegarasi'}
                </label>
                <input type="number" value={settings.voteThreshold} onChange={(e) => updateSettings({ voteThreshold: parseInt(e.target.value) })} min={1} max={50} className="w-32 px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={settings.allowAnonymousProposals} onChange={(e) => updateSettings({ allowAnonymousProposals: e.target.checked })} className="w-4 h-4 text-primary-600" />
                  <span className="text-sm text-gray-700">{language === 'ru' ? 'Разрешить анонимные предложения' : 'Anonim takliflarga ruxsat berish'}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={settings.allowAnonymousVotes} onChange={(e) => updateSettings({ allowAnonymousVotes: e.target.checked })} className="w-4 h-4 text-primary-600" />
                  <span className="text-sm text-gray-700">{language === 'ru' ? 'Разрешить анонимное голосование' : 'Anonim ovoz berishga ruxsat berish'}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={settings.allowAnonymousFeedback} onChange={(e) => updateSettings({ allowAnonymousFeedback: e.target.checked })} className="w-4 h-4 text-primary-600" />
                  <span className="text-sm text-gray-700">{language === 'ru' ? 'Разрешить анонимные отзывы' : 'Anonim sharhlarga ruxsat berish'}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={settings.notifyAllOnNewProposal} onChange={(e) => updateSettings({ notifyAllOnNewProposal: e.target.checked })} className="w-4 h-4 text-primary-600" />
                  <span className="text-sm text-gray-700">{language === 'ru' ? 'Уведомлять всех о новых предложениях' : 'Yangi takliflar haqida barchaga xabar berish'}</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Автозакрытие через (дней, 0 = выкл)' : 'Avtomatik yopish (kun, 0 = o\'chiq)'}
                </label>
                <input type="number" value={settings.autoCloseAfterDays || 0} onChange={(e) => updateSettings({ autoCloseAfterDays: parseInt(e.target.value) || undefined })} min={0} max={365} className="w-32 px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
