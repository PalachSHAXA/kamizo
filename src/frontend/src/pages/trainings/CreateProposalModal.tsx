import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import {
  useTrainingStore,
  FORMAT_LABELS,
  TIME_SLOT_LABELS,
} from '../../stores/trainingStore';
import type { TrainingFormat, TrainingTimeSlot } from '../../types';

export const CreateProposalModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { user } = useAuthStore();
  const { addProposal, getActivePartners, settings } = useTrainingStore();
  const { language } = useLanguageStore();

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [format, setFormat] = useState<TrainingFormat>('any');
  const [timeSlots, setTimeSlots] = useState<TrainingTimeSlot[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const partners = getActivePartners();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !partnerId) return;

    const partner = partners.find((p) => p.id === partnerId);
    if (!partner) return;

    addProposal({
      topic,
      description,
      isAuthorAnonymous: isAnonymous,
      partnerId,
      format,
      preferredTimeSlots: timeSlots,
    });

    setTopic('');
    setDescription('');
    setPartnerId('');
    setFormat('any');
    setTimeSlots([]);
    setIsAnonymous(false);
    onClose();
  };

  const toggleTimeSlot = (slot: TrainingTimeSlot) => {
    setTimeSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {language === 'ru' ? 'Предложить тренинг' : 'Trening taklif qilish'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Тема тренинга *' : 'Trening mavzusi *'}
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder={language === 'ru' ? 'Введите тему тренинга' : 'Trening mavzusini kiriting'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Описание' : 'Tavsif'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder={language === 'ru' ? 'Опишите, чему хотели бы научиться' : 'Nimani o\'rganmoqchi ekanligingizni yozing'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Предпочтительный лектор *' : 'Afzal ko\'rilgan lektor *'}
            </label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            >
              <option value="">{language === 'ru' ? 'Выберите партнёра' : 'Hamkorni tanlang'}</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}{' '}
                  {partner.specialization && `(${partner.specialization})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Предпочтительный формат' : 'Afzal ko\'rilgan format'}
            </label>
            <div className="flex gap-4">
              {(Object.keys(FORMAT_LABELS) as TrainingFormat[]).map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{FORMAT_LABELS[f]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Удобное время' : 'Qulay vaqt'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TIME_SLOT_LABELS) as TrainingTimeSlot[]).map(
                (slot) => (
                  <label
                    key={slot}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      timeSlots.includes(slot)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={timeSlots.includes(slot)}
                      onChange={() => toggleTimeSlot(slot)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      {TIME_SLOT_LABELS[slot]}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          {settings.allowAnonymousProposals && (
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer active:bg-gray-100 touch-manipulation">
              <input
                type="checkbox"
                id="anonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-5 h-5 md:w-4 md:h-4 text-primary-600 focus:ring-primary-500 rounded"
              />
              <span className="text-sm text-gray-700">
                {language === 'ru'
                  ? 'Предложить анонимно (ваше имя не будет отображаться для других сотрудников)'
                  : 'Anonim taklif qilish (ismingiz boshqa xodimlarga ko\'rinmaydi)'}
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {language === 'ru' ? 'Предложить' : 'Taklif qilish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
