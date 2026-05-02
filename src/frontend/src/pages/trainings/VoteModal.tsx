import { useState } from 'react';
import { X, ThumbsUp } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import {
  useTrainingStore,
  PARTICIPATION_LABELS,
} from '../../stores/trainingStore';
import type { TrainingProposal, ParticipationIntent } from '../../types';

export const VoteModal = ({
  isOpen,
  onClose,
  proposal,
}: {
  isOpen: boolean;
  onClose: () => void;
  proposal: TrainingProposal | null;
}) => {
  const { user } = useAuthStore();
  const { addVote, settings } = useTrainingStore();
  const { language } = useLanguageStore();

  const [intent, setIntent] = useState<ParticipationIntent>('definitely');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !proposal) return;

    addVote(proposal.id, {
      participationIntent: intent,
      isAnonymous,
    });

    onClose();
  };

  if (!isOpen || !proposal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{language === 'ru' ? 'Голосование' : 'Ovoz berish'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900">{proposal.topic}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {language === 'ru' ? 'Лектор' : 'Lektor'}: {proposal.partnerName}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {language === 'ru' ? 'Ваше участие' : 'Sizning ishtirokingiz'}
            </label>
            <div className="space-y-2">
              {(Object.keys(PARTICIPATION_LABELS) as ParticipationIntent[]).map(
                (i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      intent === i
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="intent"
                      value={i}
                      checked={intent === i}
                      onChange={() => setIntent(i)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      {PARTICIPATION_LABELS[i]}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          {settings.allowAnonymousVotes && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="voteAnonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="voteAnonymous" className="text-sm text-gray-700">
                {language === 'ru' ? 'Голосовать анонимно' : 'Anonim ovoz berish'}
              </label>
            </div>
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
              <ThumbsUp className="w-4 h-4" />
              {language === 'ru' ? 'Проголосовать' : 'Ovoz berish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
