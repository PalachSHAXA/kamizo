import { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Users,
  Star,
  User,
  MapPin,
  Link as LinkIcon,
  MessageSquare,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLanguageStore } from '../../stores/languageStore';
import {
  useTrainingStore,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_COLORS,
  FORMAT_LABELS,
  TIME_SLOT_LABELS,
  PARTICIPATION_LABELS,
  PARTICIPATION_COLORS,
} from '../../stores/trainingStore';
import type { TrainingProposal } from '../../types';

export const ProposalDetailModal = ({
  isOpen,
  onClose,
  proposal,
}: {
  isOpen: boolean;
  onClose: () => void;
  proposal: TrainingProposal | null;
}) => {
  const { user } = useAuthStore();
  const {
    getVotesForDisplay,
    getDisplayName,
    hasVoted,
    isRegistered,
    registerForTraining,
    unregisterFromTraining,
    getAverageRating,
    hasFeedback,
    addFeedback,
    settings,
  } = useTrainingStore();
  const { language } = useLanguageStore();

  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isFeedbackAnonymous, setIsFeedbackAnonymous] = useState(false);

  const isAdmin = user?.role === 'admin';

  if (!isOpen || !proposal) return null;

  const votes = getVotesForDisplay(proposal.id, isAdmin);
  const userHasVoted = user ? hasVoted(proposal.id, user.id) : false;
  const userIsRegistered = user ? isRegistered(proposal.id, user.id) : false;
  const userHasFeedback = user ? hasFeedback(proposal.id, user.id) : false;
  const avgRating = getAverageRating(proposal.id);

  const handleRegister = () => {
    if (!user) return;
    if (userIsRegistered) {
      unregisterFromTraining(proposal.id);
    } else {
      registerForTraining(proposal.id);
    }
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    addFeedback(proposal.id, {
      isAnonymous: isFeedbackAnonymous,
      rating,
      comment,
    });

    setShowFeedbackForm(false);
    setRating(5);
    setComment('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-3xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">
              {proposal.topic}
            </h2>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                TRAINING_STATUS_COLORS[proposal.status]
              }`}
            >
              {TRAINING_STATUS_LABELS[proposal.status]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Основная информация */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Автор' : 'Muallif'}</p>
              <p className="font-medium text-gray-900">
                {getDisplayName(proposal.authorName, proposal.isAuthorAnonymous, isAdmin)}
                {isAdmin && proposal.isAuthorAnonymous && (
                  <span className="ml-2 text-xs text-gray-500">({language === 'ru' ? 'анонимно' : 'anonim'})</span>
                )}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Лектор' : 'Lektor'}</p>
              <p className="font-medium text-gray-900">{proposal.partnerName}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Формат' : 'Format'}</p>
              <p className="font-medium text-gray-900">{FORMAT_LABELS[proposal.format]}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">{language === 'ru' ? 'Голосов' : 'Ovozlar'}</p>
              <p className="font-medium text-gray-900">{proposal.votes.length} / {proposal.voteThreshold}</p>
            </div>
          </div>

          {proposal.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Описание' : 'Tavsif'}</h3>
              <p className="text-gray-600">{proposal.description}</p>
            </div>
          )}

          {proposal.preferredTimeSlots.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {language === 'ru' ? 'Удобное время' : 'Qulay vaqt'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {proposal.preferredTimeSlots.map((slot) => (
                  <span key={slot} className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full">
                    {TIME_SLOT_LABELS[slot]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled training info */}
          {proposal.status === 'scheduled' && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-900 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {language === 'ru' ? 'Тренинг запланирован' : 'Trening rejalashtirilgan'}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span>{proposal.scheduledDate} {language === 'ru' ? 'в' : 'da'} {proposal.scheduledTime}</span>
                </div>
                {proposal.scheduledLocation && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-600" />
                    <span>{proposal.scheduledLocation}</span>
                  </div>
                )}
                {proposal.scheduledLink && (
                  <div className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-purple-600" />
                    <a href={proposal.scheduledLink} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                      {language === 'ru' ? 'Ссылка на онлайн' : 'Onlayn havola'}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span>{proposal.registeredParticipants?.length || 0} {language === 'ru' ? 'участников' : 'ishtirokchi'}</span>
                </div>
              </div>
              {user && (
                <button
                  onClick={handleRegister}
                  className={`mt-4 w-full py-2 rounded-lg font-medium transition-colors ${
                    userIsRegistered
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {userIsRegistered
                    ? (language === 'ru' ? 'Отменить регистрацию' : 'Ro\'yxatdan chiqish')
                    : (language === 'ru' ? 'Зарегистрироваться' : 'Ro\'yxatdan o\'tish')}
                </button>
              )}
            </div>
          )}

          {/* Votes list */}
          {votes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {language === 'ru' ? 'Голоса' : 'Ovozlar'} ({votes.length})
              </h3>
              <div className="space-y-2">
                {votes.map((vote) => (
                  <div key={vote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {vote.voterName}
                        {isAdmin && vote.isAnonymous && (
                          <span className="ml-2 text-xs text-gray-500">({language === 'ru' ? 'анонимно' : 'anonim'})</span>
                        )}
                      </span>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${PARTICIPATION_COLORS[vote.participationIntent]}`}>
                      {PARTICIPATION_LABELS[vote.participationIntent]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback for completed trainings */}
          {proposal.status === 'completed' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  {language === 'ru' ? 'Отзывы' : 'Sharhlar'} ({proposal.feedback?.length || 0})
                </h3>
                {avgRating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {proposal.feedback && proposal.feedback.length > 0 && (
                <div className="space-y-3 mb-4">
                  {proposal.feedback.map((fb) => (
                    <div key={fb.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {getDisplayName(fb.reviewerName, fb.isAnonymous, isAdmin)}
                          {isAdmin && fb.isAnonymous && (
                            <span className="ml-2 text-xs text-gray-500">({language === 'ru' ? 'анонимно' : 'anonim'})</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`w-4 h-4 ${i < fb.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      </div>
                      {fb.comment && <p className="text-sm text-gray-600">{fb.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              {user && !userHasFeedback && !showFeedbackForm && (
                <button
                  onClick={() => setShowFeedbackForm(true)}
                  className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  {language === 'ru' ? 'Оставить отзыв' : 'Sharh qoldirish'}
                </button>
              )}

              {showFeedbackForm && (
                <form onSubmit={handleFeedbackSubmit} className="p-4 border border-gray-200 rounded-lg space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'ru' ? 'Оценка' : 'Baho'}
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button key={r} type="button" onClick={() => setRating(r)} className="p-1">
                          <Star className={`w-8 h-8 transition-colors ${r <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === 'ru' ? 'Комментарий' : 'Izoh'}
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder={language === 'ru' ? 'Поделитесь впечатлениями...' : 'Taassurotlaringizni baham ko\'ring...'}
                    />
                  </div>
                  {settings.allowAnonymousFeedback && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="feedbackAnonymous"
                        checked={isFeedbackAnonymous}
                        onChange={(e) => setIsFeedbackAnonymous(e.target.checked)}
                        className="w-4 h-4 text-primary-600"
                      />
                      <label htmlFor="feedbackAnonymous" className="text-sm text-gray-700">
                        {language === 'ru' ? 'Оставить анонимно' : 'Anonim qoldirish'}
                      </label>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackForm(false)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                    </button>
                    <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                      {language === 'ru' ? 'Отправить' : 'Yuborish'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {proposal.status === 'voting' && user && !userHasVoted && (
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 mb-3">
                {language === 'ru' ? 'Вы ещё не голосовали за это предложение' : 'Siz hali bu taklifga ovoz bermadingiz'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
