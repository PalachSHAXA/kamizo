import { useState, useEffect } from 'react';
import {
  Users, Calendar, AlertCircle,
  FileText,
  ThumbsUp, ThumbsDown, Minus,
  X, Download,
  MessageSquare, Send, Phone
} from 'lucide-react';
import { useMeetingStore } from '../stores/meetingStore';
import { useToastStore } from '../stores/toastStore';
import { generateProtocolDocx } from '../utils/protocolGenerator';
import type { Meeting } from '../types';
import { MEETING_STATUS_LABELS, DECISION_THRESHOLD_LABELS } from '../types';

export interface MeetingDetailsModalProps {
  meeting: Meeting;
  onClose: () => void;
  language: string;
  calculateResult: (meetingId: string, agendaItemId: string) => {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    totalVotes: number;
    percentFor: number;
    isApproved: boolean;
    thresholdMet: boolean;
  };
  calculateQuorum: () => { participated: number; total: number; percent: number; quorumReached: boolean };
}

export function MeetingDetailsModal({
  meeting,
  onClose,
  language,
  calculateResult,
  calculateQuorum,
}: MeetingDetailsModalProps) {
  const quorum = calculateQuorum();
  const addToast = useToastStore(s => s.addToast);
  const [downloadingProtocol, setDownloadingProtocol] = useState(false);
  const [activeTab, setActiveTab] = useState<'agenda' | 'against'>('agenda');
  const [selectedAgendaItem, setSelectedAgendaItem] = useState<string | null>(null);
  const [againstVotes, setAgainstVotes] = useState<any[]>([]);
  const [loadingAgainstVotes, setLoadingAgainstVotes] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState<{ voterId: string; voterName: string } | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [reconsiderationStats, setReconsiderationStats] = useState<any>(null);

  const { fetchAgainstVotes, sendReconsiderationRequest, fetchReconsiderationStats } = useMeetingStore();

  // Load against votes when tab or agenda item changes
  useEffect(() => {
    if (activeTab === 'against' && selectedAgendaItem) {
      setLoadingAgainstVotes(true);
      fetchAgainstVotes(meeting.id, selectedAgendaItem).then(votes => {
        setAgainstVotes(votes);
        setLoadingAgainstVotes(false);
      });
    }
  }, [activeTab, selectedAgendaItem, meeting.id, fetchAgainstVotes]);

  // Load stats when on against tab
  useEffect(() => {
    if (activeTab === 'against') {
      fetchReconsiderationStats(meeting.id).then(stats => {
        setReconsiderationStats(stats);
      });
    }
  }, [activeTab, meeting.id, fetchReconsiderationStats]);

  // Auto-select first agenda item when switching to against tab
  useEffect(() => {
    if (activeTab === 'against' && !selectedAgendaItem && meeting.agendaItems.length > 0) {
      setSelectedAgendaItem(meeting.agendaItems[0].id);
    }
  }, [activeTab, selectedAgendaItem, meeting.agendaItems]);

  const handleSendReconsiderationRequest = async () => {
    if (!showSendModal || !selectedAgendaItem || !requestReason) return;

    setSendingRequest(showSendModal.voterId);
    const result = await sendReconsiderationRequest(meeting.id, {
      agendaItemId: selectedAgendaItem,
      residentId: showSendModal.voterId,
      reason: requestReason,
      messageToResident: requestMessage || undefined,
    });

    if (result.success) {
      // Refresh the against votes list
      const votes = await fetchAgainstVotes(meeting.id, selectedAgendaItem);
      setAgainstVotes(votes);
      setShowSendModal(null);
      setRequestReason('');
      setRequestMessage('');
    } else {
      addToast('error', result.error || (language === 'ru' ? 'Ошибка при отправке запроса' : 'So\'rovni yuborishda xatolik'));
    }
    setSendingRequest(null);
  };

  const reasonOptions = [
    { value: 'discussed_personally', label: language === 'ru' ? 'Обсудили лично' : 'Shaxsan muhokama qildik' },
    { value: 'new_information', label: language === 'ru' ? 'Появилась новая информация' : 'Yangi ma\'lumot paydo bo\'ldi' },
    { value: 'clarification_needed', label: language === 'ru' ? 'Требуется уточнение' : 'Aniqlik kiritish kerak' },
    { value: 'other', label: language === 'ru' ? 'Другое' : 'Boshqa' },
  ];

  // Download protocol as DOCX file (official format)
  const handleDownloadProtocol = async () => {
    setDownloadingProtocol(true);
    try {
      // Fetch protocol data from backend
      const response = await fetch(`/api/meetings/${meeting.id}/protocol/data`);

      if (!response.ok) {
        throw new Error('Failed to fetch protocol data');
      }

      const data = await response.json();

      // Generate DOCX using the protocol generator
      await generateProtocolDocx({
        meeting: {
          ...data.meeting,
          buildingAddress: meeting.buildingAddress || data.meeting.building_address,
        },
        agendaItems: data.agendaItems,
        voteRecords: data.voteRecords,
        votesByItem: data.votesByItem,
        protocolHash: data.protocolHash,
      });
    } catch (error) {
      console.error('Failed to download protocol:', error);
      addToast('error', language === 'ru' ? 'Ошибка при скачивании протокола' : 'Bayonnomani yuklashda xato');
    } finally {
      setDownloadingProtocol(false);
    }
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold">
              {language === 'ru' ? `Собрание #${meeting.number}` : `Yig'ilish #${meeting.number}`}
            </h2>
            <p className="text-sm text-gray-500">{meeting.buildingAddress}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download protocol button - show for completed meetings */}
            {['protocol_generated', 'protocol_approved'].includes(meeting.status) && (
              <button
                onClick={handleDownloadProtocol}
                disabled={downloadingProtocol}
                className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloadingProtocol
                  ? (language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...')
                  : (language === 'ru' ? 'Скачать протокол' : 'Bayonnomani yuklab olish')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status & Quorum */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
              MEETING_STATUS_LABELS[meeting.status]?.color === 'green' ? 'bg-green-100 text-green-700' :
              MEETING_STATUS_LABELS[meeting.status]?.color === 'blue' ? 'bg-blue-100 text-blue-700' :
              MEETING_STATUS_LABELS[meeting.status]?.color === 'yellow' ? 'bg-yellow-100 text-orange-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {language === 'ru'
                ? MEETING_STATUS_LABELS[meeting.status]?.label
                : MEETING_STATUS_LABELS[meeting.status]?.labelUz}
            </span>

            {meeting.status !== 'draft' && meeting.status !== 'pending_moderation' && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {quorum.participated}/{quorum.total} ({quorum.percent.toFixed(1)}%)
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  quorum.quorumReached ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {quorum.quorumReached
                    ? (language === 'ru' ? 'Кворум' : 'Kvorum')
                    : (language === 'ru' ? 'Нет кворума' : 'Kvorum yo\'q')}
                </span>
              </div>
            )}
          </div>

          {/* Confirmed Date */}
          {meeting.confirmedDateTime && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-5 h-5" />
              <span>
                {new Date(meeting.confirmedDateTime).toLocaleDateString(
                  language === 'ru' ? 'ru-RU' : 'uz-UZ',
                  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                )}
              </span>
            </div>
          )}

          {/* Tabs - show against votes tab only during voting_open */}
          {meeting.status === 'voting_open' && (
            <div className="flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('agenda')}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'agenda'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'}
              </button>
              <button
                onClick={() => setActiveTab('against')}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'against'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                {language === 'ru' ? 'Голоса против' : 'Qarshi ovozlar'}
              </button>
            </div>
          )}

          {/* Against Votes Tab Content */}
          {activeTab === 'against' && meeting.status === 'voting_open' && (
            <div className="space-y-4">
              {/* Stats summary */}
              {reconsiderationStats && reconsiderationStats.total > 0 && (
                <div className="p-3 bg-blue-50 rounded-xl">
                  <div className="text-sm font-medium text-blue-800 mb-2">
                    {language === 'ru' ? 'Статистика запросов на пересмотр' : 'Qayta ko\'rib chiqish so\'rovlari statistikasi'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-blue-600">{language === 'ru' ? 'Отправлено:' : 'Yuborildi:'}</span> {reconsiderationStats.total}
                    </div>
                    <div>
                      <span className="text-green-600">{language === 'ru' ? 'Изменили:' : 'O\'zgartirildi:'}</span> {reconsiderationStats.voteChanged}
                    </div>
                    <div>
                      <span className="text-gray-600">{language === 'ru' ? 'Конверсия:' : 'Konversiya:'}</span> {reconsiderationStats.conversionRate}%
                    </div>
                  </div>
                </div>
              )}

              {/* Agenda item selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Выберите вопрос:' : 'Savolni tanlang:'}
                </label>
                <select
                  value={selectedAgendaItem || ''}
                  onChange={(e) => setSelectedAgendaItem(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {meeting.agendaItems.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {index + 1}. {item.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Against votes list */}
              {loadingAgainstVotes ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}
                </div>
              ) : againstVotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {language === 'ru' ? 'Нет голосов против по этому вопросу' : 'Bu savol bo\'yicha qarshi ovozlar yo\'q'}
                </div>
              ) : (
                <div className="space-y-3">
                  {againstVotes.map((vote) => (
                    <div key={vote.voteId} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium">{vote.voterName}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-4">
                            <span>{language === 'ru' ? 'Кв.' : 'Kv.'} {vote.apartmentNumber}</span>
                            <span>{vote.voteWeight} {language === 'ru' ? 'кв.м' : 'kv.m'}</span>
                            {vote.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {vote.phone}
                              </span>
                            )}
                          </div>
                          {vote.comment && (
                            <div className="mt-2 p-2 bg-white rounded-lg text-sm text-gray-600">
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {vote.comment}
                            </div>
                          )}
                          {vote.requestCount > 0 && (
                            <div className="mt-2 text-xs text-orange-600">
                              {language === 'ru'
                                ? `Отправлено запросов: ${vote.requestCount}/2`
                                : `Yuborilgan so'rovlar: ${vote.requestCount}/2`}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setShowSendModal({ voterId: vote.voterId, voterName: vote.voterName })}
                          disabled={!vote.canSendRequest || sendingRequest === vote.voterId}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            vote.canSendRequest
                              ? 'bg-primary-500 text-white hover:bg-primary-600'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Send className="w-4 h-4" />
                          {language === 'ru' ? 'Запросить' : 'So\'rash'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agenda Items with Results - show when not on against tab or when voting not open */}
          {(activeTab === 'agenda' || meeting.status !== 'voting_open') && (
          <div>
            <h3 className="font-medium mb-3">
              {language === 'ru' ? 'Повестка дня' : 'Kun tartibi'}
            </h3>
            <div className="space-y-4">
              {meeting.agendaItems.map((item, index) => {
                const result = calculateResult(meeting.id, item.id);

                return (
                  <div key={item.id} className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium">
                          {index + 1}. {item.title}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{item.description}</p>

                        {/* Agenda item attachments */}
                        {(item as any).attachments && (item as any).attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(item as any).attachments.map((att: { name: string; url: string; type: string; size: number }, ai: number) => (
                              <div key={ai}>
                                {att.type.startsWith('image/') ? (
                                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                                    <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                  </a>
                                ) : (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                                  >
                                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="max-w-[120px] truncate">{att.name}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Voting results */}
                        {['voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved'].includes(meeting.status) && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div className="flex items-center gap-1">
                                <ThumbsUp className="w-4 h-4 text-green-500" />
                                <span>{result.votesFor} ({result.percentFor.toFixed(0)}%)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <ThumbsDown className="w-4 h-4 text-red-500" />
                                <span>{result.votesAgainst}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Minus className="w-4 h-4 text-gray-400" />
                                <span>{result.votesAbstain}</span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${result.thresholdMet ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${result.percentFor}%` }}
                              />
                            </div>

                            {/* Threshold line */}
                            <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                              <span>0%</span>
                              <span>
                                {language === 'ru' ? 'Порог:' : 'Chegara:'} {DECISION_THRESHOLD_LABELS[item.threshold].percent}%
                              </span>
                              <span>100%</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Result badge */}
                      {item.isApproved !== undefined && (
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          item.isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.isApproved
                            ? (language === 'ru' ? 'Принято' : 'Qabul')
                            : (language === 'ru' ? 'Не принято' : 'Rad')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Send Reconsideration Request Modal */}
        {/* TODO: migrate to <Modal> component */}
        {showSendModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
              <h3 className="text-base sm:text-lg font-bold mb-4">
                {language === 'ru' ? 'Запрос на пересмотр голоса' : 'Ovozni qayta ko\'rib chiqish so\'rovi'}
              </h3>

              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">
                  {language === 'ru' ? 'Получатель:' : 'Qabul qiluvchi:'}
                </div>
                <div className="font-medium">{showSendModal.voterName}</div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Причина запроса:' : 'So\'rov sababi:'}
                </label>
                <select
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">
                    {language === 'ru' ? 'Выберите причину...' : 'Sababni tanlang...'}
                  </option>
                  {reasonOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Сообщение (необязательно):' : 'Xabar (ixtiyoriy):'}
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder={language === 'ru' ? 'Личное сообщение жителю...' : 'Aholiga shaxsiy xabar...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                  maxLength={500}
                />
                <div className="text-xs text-gray-400 text-right mt-1">
                  {requestMessage.length}/500
                </div>
              </div>

              <div className="p-3 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                {language === 'ru'
                  ? 'Это только просьба. Житель сам решает, менять голос или нет.'
                  : 'Bu faqat iltimos. Aholi ovozni o\'zgartirish yoki o\'zgartirmaslikni o\'zi hal qiladi.'}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSendModal(null);
                    setRequestReason('');
                    setRequestMessage('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  onClick={handleSendReconsiderationRequest}
                  disabled={!requestReason || !!sendingRequest}
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingRequest
                    ? (language === 'ru' ? 'Отправка...' : 'Yuborilmoqda...')
                    : (language === 'ru' ? 'Отправить' : 'Yuborish')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
