import { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Vote,
  CheckCircle,
  Calendar,
  Star,
  ThumbsUp,
  Eye,
  User,
  Settings,
  UserCheck,
} from 'lucide-react';
import { EmptyState } from '../components/common';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import {
  useTrainingStore,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_COLORS,
  FORMAT_LABELS,
} from '../stores/trainingStore';
import type {
  TrainingProposal,
  TrainingProposalStatus,
} from '../types';

import { StatCard } from './trainings/StatCard';
import { CreateProposalModal } from './trainings/CreateProposalModal';
import { VoteModal } from './trainings/VoteModal';
import { ProposalDetailModal } from './trainings/ProposalDetailModal';
import { AdminPanel } from './trainings/AdminPanel';

// Главный компонент страницы
export default function TrainingsPage() {
  const { user } = useAuthStore();
  const {
    proposals,
    getProposalsByStatus,
    hasVoted,
    getStats,
  } = useTrainingStore();
  const { language } = useLanguageStore();

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
            <GraduationCap className="w-8 h-8 text-primary-600" />
            {language === 'ru' ? 'Тренинги' : 'Treninglar'}
          </h1>
          <p className="text-gray-600 mt-1">
            {language === 'ru'
              ? 'Предлагайте темы, голосуйте и развивайтесь вместе'
              : 'Mavzular taklif qiling, ovoz bering va birga rivojlaning'}
          </p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              {language === 'ru' ? 'Управление' : 'Boshqarish'}
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {language === 'ru' ? 'Предложить тренинг' : 'Trening taklif qilish'}
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Vote} label={language === 'ru' ? 'На голосовании' : 'Ovoz berishda'} value={stats.votingProposals} color="bg-primary-500" />
        <StatCard icon={Calendar} label={language === 'ru' ? 'Запланировано' : 'Rejalashtirilgan'} value={stats.scheduledTrainings} color="bg-purple-500" />
        <StatCard icon={CheckCircle} label={language === 'ru' ? 'Проведено' : 'O\'tkazilgan'} value={stats.completedTrainings} color="bg-green-500" />
        <StatCard icon={Star} label={language === 'ru' ? 'Средняя оценка' : 'O\'rtacha baho'} value={stats.averageRating.toFixed(1)} color="bg-orange-500" />
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filterStatus === 'all'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {language === 'ru' ? 'Все' : 'Hammasi'} ({proposals.length})
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
                  ? 'bg-primary-600 text-white'
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
          <EmptyState
            icon={<GraduationCap className="w-12 h-12" />}
            title={language === 'ru' ? 'Нет предложений' : 'Takliflar yo\'q'}
            description={language === 'ru'
              ? 'Будьте первым, кто предложит тему для тренинга!'
              : 'Trening mavzusini birinchi bo\'lib taklif qiling!'}
          />
        ) : (
          filteredProposals.map((proposal) => {
            const userHasVoted = user ? hasVoted(proposal.id, user.id) : false;
            const progress = (proposal.votes.length / proposal.voteThreshold) * 100;

            return (
              <div
                key={proposal.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{proposal.topic}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${TRAINING_STATUS_COLORS[proposal.status]}`}>
                        {TRAINING_STATUS_LABELS[proposal.status]}
                      </span>
                    </div>

                    {proposal.description && (
                      <p className="text-gray-600 mb-3">{proposal.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {language === 'ru' ? 'Лектор' : 'Lektor'}: {proposal.partnerName}
                      </span>
                      <span className="flex items-center gap-1">{FORMAT_LABELS[proposal.format]}</span>
                      {proposal.status === 'scheduled' && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Calendar className="w-4 h-4" />
                          {proposal.scheduledDate} {language === 'ru' ? 'в' : 'da'} {proposal.scheduledTime}
                        </span>
                      )}
                    </div>

                    {proposal.status === 'voting' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            {language === 'ru' ? 'Голосов' : 'Ovozlar'}: {proposal.votes.length} / {proposal.voteThreshold}
                          </span>
                          <span className="text-gray-500">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                        </div>
                      </div>
                    )}

                    {proposal.status === 'scheduled' && (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <UserCheck className="w-4 h-4 text-green-600" />
                        <span className="text-gray-600">
                          {language === 'ru' ? 'Зарегистрировано' : 'Ro\'yxatdan o\'tgan'}: {proposal.registeredParticipants?.length || 0}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleViewDetail(proposal)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title={language === 'ru' ? 'Подробнее' : 'Batafsil'}
                    >
                      <Eye className="w-5 h-5" />
                    </button>

                    {proposal.status === 'voting' && user && !userHasVoted && (
                      <button
                        onClick={() => handleVote(proposal)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        {language === 'ru' ? 'Голосовать' : 'Ovoz berish'}
                      </button>
                    )}

                    {proposal.status === 'voting' && user && userHasVoted && (
                      <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {language === 'ru' ? 'Вы проголосовали' : 'Siz ovoz berdingiz'}
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
      <CreateProposalModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <VoteModal isOpen={showVoteModal} onClose={() => { setShowVoteModal(false); setSelectedProposal(null); }} proposal={selectedProposal} />
      <ProposalDetailModal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedProposal(null); }} proposal={selectedProposal} />
      <AdminPanel isOpen={showAdminPanel} onClose={() => setShowAdminPanel(false)} />
    </div>
  );
}
