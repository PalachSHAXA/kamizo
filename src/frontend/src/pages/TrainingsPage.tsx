import { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Vote,
  Clock,
  CheckCircle,
  Calendar,
  Users,
  Star,
  ThumbsUp,
  Eye,
  X,
  Send,
  User,
  MapPin,
  Link as LinkIcon,
  MessageSquare,
  Settings,
  UserCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import {
  useTrainingStore,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_COLORS,
  FORMAT_LABELS,
  TIME_SLOT_LABELS,
  PARTICIPATION_LABELS,
  PARTICIPATION_COLORS,
} from '../stores/trainingStore';
import type {
  TrainingProposal,
  TrainingProposalStatus,
  TrainingFormat,
  TrainingTimeSlot,
  ParticipationIntent,
} from '../types';

// Компонент карточки статистики
const StatCard = ({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  </div>
);

// Модальное окно создания предложения
const CreateProposalModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { user } = useAuthStore();
  const { addProposal, getActivePartners, settings } = useTrainingStore();

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

    // Сброс формы
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Предложить тренинг
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Тема */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тема тренинга *
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Введите тему тренинга"
              required
            />
          </div>

          {/* Описание */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Опишите, чему хотели бы научиться"
            />
          </div>

          {/* Выбор лектора */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Предпочтительный лектор *
            </label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Выберите партнёра</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}{' '}
                  {partner.specialization && `(${partner.specialization})`}
                </option>
              ))}
            </select>
          </div>

          {/* Формат */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Предпочтительный формат
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
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{FORMAT_LABELS[f]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Время */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Удобное время
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TIME_SLOT_LABELS) as TrainingTimeSlot[]).map(
                (slot) => (
                  <label
                    key={slot}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      timeSlots.includes(slot)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={timeSlots.includes(slot)}
                      onChange={() => toggleTimeSlot(slot)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {TIME_SLOT_LABELS[slot]}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Анонимность */}
          {settings.allowAnonymousProposals && (
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer active:bg-gray-100 touch-manipulation">
              <input
                type="checkbox"
                id="anonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-5 h-5 md:w-4 md:h-4 text-blue-600 focus:ring-blue-500 rounded"
              />
              <span className="text-sm text-gray-700">
                Предложить анонимно (ваше имя не будет отображаться для других
                сотрудников)
              </span>
            </label>
          )}

          {/* Кнопки */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Предложить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Модальное окно голосования
const VoteModal = ({
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Голосование</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900">{proposal.topic}</h3>
            <p className="text-sm text-gray-500 mt-1">
              Лектор: {proposal.partnerName}
            </p>
          </div>

          {/* Выбор намерения */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Ваше участие
            </label>
            <div className="space-y-2">
              {(Object.keys(PARTICIPATION_LABELS) as ParticipationIntent[]).map(
                (i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      intent === i
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="intent"
                      value={i}
                      checked={intent === i}
                      onChange={() => setIntent(i)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {PARTICIPATION_LABELS[i]}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Анонимность */}
          {settings.allowAnonymousVotes && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="voteAnonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="voteAnonymous" className="text-sm text-gray-700">
                Голосовать анонимно
              </label>
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <ThumbsUp className="w-4 h-4" />
              Проголосовать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Модальное окно деталей предложения
const ProposalDetailModal = ({
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Основная информация */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Автор</p>
              <p className="font-medium text-gray-900">
                {getDisplayName(
                  proposal.authorName,
                  proposal.isAuthorAnonymous,
                  isAdmin
                )}
                {isAdmin && proposal.isAuthorAnonymous && (
                  <span className="ml-2 text-xs text-gray-500">(анонимно)</span>
                )}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Лектор</p>
              <p className="font-medium text-gray-900">{proposal.partnerName}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Формат</p>
              <p className="font-medium text-gray-900">
                {FORMAT_LABELS[proposal.format]}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Голосов</p>
              <p className="font-medium text-gray-900">
                {proposal.votes.length} / {proposal.voteThreshold}
              </p>
            </div>
          </div>

          {/* Описание */}
          {proposal.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Описание</h3>
              <p className="text-gray-600">{proposal.description}</p>
            </div>
          )}

          {/* Предпочтительное время */}
          {proposal.preferredTimeSlots.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Удобное время
              </h3>
              <div className="flex flex-wrap gap-2">
                {proposal.preferredTimeSlots.map((slot) => (
                  <span
                    key={slot}
                    className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                  >
                    {TIME_SLOT_LABELS[slot]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Информация о запланированном тренинге */}
          {proposal.status === 'scheduled' && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-900 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Тренинг запланирован
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span>
                    {proposal.scheduledDate} в {proposal.scheduledTime}
                  </span>
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
                    <a
                      href={proposal.scheduledLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:underline"
                    >
                      Ссылка на онлайн
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span>
                    {proposal.registeredParticipants?.length || 0} участников
                  </span>
                </div>
              </div>

              {/* Кнопка регистрации */}
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
                    ? 'Отменить регистрацию'
                    : 'Зарегистрироваться'}
                </button>
              )}
            </div>
          )}

          {/* Список голосов */}
          {votes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Голоса ({votes.length})
              </h3>
              <div className="space-y-2">
                {votes.map((vote) => (
                  <div
                    key={vote.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {vote.voterName}
                        {isAdmin && vote.isAnonymous && (
                          <span className="ml-2 text-xs text-gray-500">
                            (анонимно)
                          </span>
                        )}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        PARTICIPATION_COLORS[vote.participationIntent]
                      }`}
                    >
                      {PARTICIPATION_LABELS[vote.participationIntent]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Обратная связь для завершённых тренингов */}
          {proposal.status === 'completed' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Отзывы ({proposal.feedback?.length || 0})
                </h3>
                {avgRating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <span className="text-sm font-medium">
                      {avgRating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              {/* Список отзывов */}
              {proposal.feedback && proposal.feedback.length > 0 && (
                <div className="space-y-3 mb-4">
                  {proposal.feedback.map((fb) => (
                    <div key={fb.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {getDisplayName(fb.reviewerName, fb.isAnonymous, isAdmin)}
                          {isAdmin && fb.isAnonymous && (
                            <span className="ml-2 text-xs text-gray-500">
                              (анонимно)
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < fb.rating
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {fb.comment && (
                        <p className="text-sm text-gray-600">{fb.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Форма отзыва */}
              {user && !userHasFeedback && !showFeedbackForm && (
                <button
                  onClick={() => setShowFeedbackForm(true)}
                  className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Оставить отзыв
                </button>
              )}

              {showFeedbackForm && (
                <form
                  onSubmit={handleFeedbackSubmit}
                  className="p-4 border border-gray-200 rounded-lg space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Оценка
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRating(r)}
                          className="p-1"
                        >
                          <Star
                            className={`w-8 h-8 transition-colors ${
                              r <= rating
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Комментарий
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Поделитесь впечатлениями..."
                    />
                  </div>
                  {settings.allowAnonymousFeedback && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="feedbackAnonymous"
                        checked={isFeedbackAnonymous}
                        onChange={(e) => setIsFeedbackAnonymous(e.target.checked)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <label
                        htmlFor="feedbackAnonymous"
                        className="text-sm text-gray-700"
                      >
                        Оставить анонимно
                      </label>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackForm(false)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Отправить
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Кнопка голосования */}
          {proposal.status === 'voting' && user && !userHasVoted && (
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 mb-3">
                Вы ещё не голосовали за это предложение
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Модальное окно админ-панели
const AdminPanel = ({
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

  const [selectedProposal, setSelectedProposal] =
    useState<TrainingProposal | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [scheduleLink, setScheduleLink] = useState('');
  const [activeTab, setActiveTab] = useState<'review' | 'settings' | 'stats'>(
    'review'
  );

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Управление тренингами
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Вкладки */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('review')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'review'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            На рассмотрении ({reviewProposals.length + approvedProposals.length})
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Статистика
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Настройки
          </button>
        </div>

        <div className="p-6">
          {/* Вкладка рассмотрения */}
          {activeTab === 'review' && (
            <div className="space-y-6">
              {/* Предложения на рассмотрении */}
              {reviewProposals.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Ожидают ответа партнёра
                  </h3>
                  <div className="space-y-3">
                    {reviewProposals.map((p) => (
                      <div
                        key={p.id}
                        className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {p.topic}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Лектор: {p.partnerName}
                            </p>
                            <p className="text-sm text-gray-500">
                              Голосов: {p.votes.length}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setPartnerResponse(p.id, 'accepted')
                              }
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                            >
                              Принять
                            </button>
                            <button
                              onClick={() =>
                                setPartnerResponse(p.id, 'rejected')
                              }
                              className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                            >
                              Отклонить
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Одобренные - нужно запланировать */}
              {approvedProposals.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Требуют планирования
                  </h3>
                  <div className="space-y-3">
                    {approvedProposals.map((p) => (
                      <div
                        key={p.id}
                        className="p-4 border border-green-200 bg-green-50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {p.topic}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Лектор: {p.partnerName}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedProposal(p)}
                            className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                          >
                            Запланировать
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Форма планирования */}
              {selectedProposal && (
                <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg">
                  <h3 className="font-medium text-purple-900 mb-4">
                    Планирование: {selectedProposal.topic}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Дата *
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Время *
                      </label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Место (офлайн)
                      </label>
                      <input
                        type="text"
                        value={scheduleLocation}
                        onChange={(e) => setScheduleLocation(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Конференц-зал"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ссылка (онлайн)
                      </label>
                      <input
                        type="url"
                        value={scheduleLink}
                        onChange={(e) => setScheduleLink(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="https://meet.google.com/..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setSelectedProposal(null)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleSchedule}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Запланировать
                    </button>
                  </div>
                </div>
              )}

              {reviewProposals.length === 0 && approvedProposals.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p>Нет предложений на рассмотрении</p>
                </div>
              )}
            </div>
          )}

          {/* Вкладка статистики */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-blue-600">
                    {stats.totalProposals}
                  </p>
                  <p className="text-sm text-gray-600">Всего предложений</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-600">
                    {stats.scheduledTrainings}
                  </p>
                  <p className="text-sm text-gray-600">Запланировано</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-purple-600">
                    {stats.completedTrainings}
                  </p>
                  <p className="text-sm text-gray-600">Проведено</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-yellow-600">
                    {stats.averageRating.toFixed(1)}
                  </p>
                  <p className="text-sm text-gray-600">Средняя оценка</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalVotes}
                  </p>
                  <p className="text-sm text-gray-600">Всего голосов</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalParticipants}
                  </p>
                  <p className="text-sm text-gray-600">Участников</p>
                </div>
              </div>
            </div>
          )}

          {/* Вкладка настроек */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Порог голосов для рассмотрения
                </label>
                <input
                  type="number"
                  value={settings.voteThreshold}
                  onChange={(e) =>
                    updateSettings({ voteThreshold: parseInt(e.target.value) })
                  }
                  min={1}
                  max={50}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.allowAnonymousProposals}
                    onChange={(e) =>
                      updateSettings({
                        allowAnonymousProposals: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    Разрешить анонимные предложения
                  </span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.allowAnonymousVotes}
                    onChange={(e) =>
                      updateSettings({ allowAnonymousVotes: e.target.checked })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    Разрешить анонимное голосование
                  </span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.allowAnonymousFeedback}
                    onChange={(e) =>
                      updateSettings({
                        allowAnonymousFeedback: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    Разрешить анонимные отзывы
                  </span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.notifyAllOnNewProposal}
                    onChange={(e) =>
                      updateSettings({
                        notifyAllOnNewProposal: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    Уведомлять всех о новых предложениях
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Автозакрытие через (дней, 0 = выкл)
                </label>
                <input
                  type="number"
                  value={settings.autoCloseAfterDays || 0}
                  onChange={(e) =>
                    updateSettings({
                      autoCloseAfterDays:
                        parseInt(e.target.value) || undefined,
                    })
                  }
                  min={0}
                  max={365}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Главный компонент страницы
export default function TrainingsPage() {
  const { user } = useAuthStore();
  const {
    proposals,
    getProposalsByStatus,
    hasVoted,
    getStats,
  } = useTrainingStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedProposal, setSelectedProposal] =
    useState<TrainingProposal | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    TrainingProposalStatus | 'all'
  >('all');

  const isAdmin = user?.role === 'admin';
  const stats = getStats();

  const filteredProposals =
    filterStatus === 'all'
      ? proposals
      : getProposalsByStatus(filterStatus);

  const handleVote = (proposal: TrainingProposal) => {
    setSelectedProposal(proposal);
    setShowVoteModal(true);
  };

  const handleViewDetail = (proposal: TrainingProposal) => {
    setSelectedProposal(proposal);
    setShowDetailModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-blue-600" />
            Тренинги
          </h1>
          <p className="text-gray-600 mt-1">
            Предлагайте темы, голосуйте и развивайтесь вместе
          </p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Управление
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Предложить тренинг
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={Vote}
          label="На голосовании"
          value={stats.votingProposals}
          color="bg-blue-500"
        />
        <StatCard
          icon={Calendar}
          label="Запланировано"
          value={stats.scheduledTrainings}
          color="bg-purple-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Проведено"
          value={stats.completedTrainings}
          color="bg-green-500"
        />
        <StatCard
          icon={Star}
          label="Средняя оценка"
          value={stats.averageRating.toFixed(1)}
          color="bg-orange-500"
        />
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filterStatus === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Все ({proposals.length})
        </button>
        {(
          ['voting', 'review', 'scheduled', 'completed', 'rejected'] as TrainingProposalStatus[]
        ).map((status) => {
          const count = getProposalsByStatus(status).length;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {TRAINING_STATUS_LABELS[status]} ({count})
            </button>
          );
        })}
      </div>

      {/* Список предложений */}
      <div className="space-y-4">
        {filteredProposals.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
            <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">Нет предложений</p>
            <p className="text-gray-400 mt-1">
              Будьте первым, кто предложит тему для тренинга!
            </p>
          </div>
        ) : (
          filteredProposals.map((proposal) => {
            const userHasVoted = user ? hasVoted(proposal.id, user.id) : false;
            const progress =
              (proposal.votes.length / proposal.voteThreshold) * 100;

            return (
              <div
                key={proposal.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {proposal.topic}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          TRAINING_STATUS_COLORS[proposal.status]
                        }`}
                      >
                        {TRAINING_STATUS_LABELS[proposal.status]}
                      </span>
                    </div>

                    {proposal.description && (
                      <p className="text-gray-600 mb-3">{proposal.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Лектор: {proposal.partnerName}
                      </span>
                      <span className="flex items-center gap-1">
                        {FORMAT_LABELS[proposal.format]}
                      </span>
                      {proposal.status === 'scheduled' && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Calendar className="w-4 h-4" />
                          {proposal.scheduledDate} в {proposal.scheduledTime}
                        </span>
                      )}
                    </div>

                    {/* Прогресс голосования */}
                    {proposal.status === 'voting' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            Голосов: {proposal.votes.length} /{' '}
                            {proposal.voteThreshold}
                          </span>
                          <span className="text-gray-500">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Участники для запланированных */}
                    {proposal.status === 'scheduled' && (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <UserCheck className="w-4 h-4 text-green-600" />
                        <span className="text-gray-600">
                          Зарегистрировано:{' '}
                          {proposal.registeredParticipants?.length || 0}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleViewDetail(proposal)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Подробнее"
                    >
                      <Eye className="w-5 h-5" />
                    </button>

                    {proposal.status === 'voting' && user && !userHasVoted && (
                      <button
                        onClick={() => handleVote(proposal)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Голосовать
                      </button>
                    )}

                    {proposal.status === 'voting' && user && userHasVoted && (
                      <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Вы проголосовали
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Модальные окна */}
      <CreateProposalModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <VoteModal
        isOpen={showVoteModal}
        onClose={() => {
          setShowVoteModal(false);
          setSelectedProposal(null);
        }}
        proposal={selectedProposal}
      />

      <ProposalDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedProposal(null);
        }}
        proposal={selectedProposal}
      />

      <AdminPanel
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
      />
    </div>
  );
}
