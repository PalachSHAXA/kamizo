import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Partner,
  TrainingProposal,
  TrainingVote,
  TrainingFeedback,
  TrainingNotification,
  TrainingSettings,
  TrainingProposalStatus,
  TrainingFormat,
  TrainingTimeSlot,
  ParticipationIntent,
} from '../types';
import {
  trainingPartnersApi,
  trainingProposalsApi,
  trainingVotesApi,
  trainingRegistrationsApi,
  trainingFeedbackApi,
  trainingNotificationsApi,
  trainingSettingsApi,
} from '../services/api';

// ==================== Mappers (snake_case -> camelCase) ====================

const mapPartnerFromApi = (p: any): Partner => ({
  id: p.id,
  name: p.name,
  position: p.position,
  specialization: p.specialization,
  email: p.email,
  phone: p.phone,
  bio: p.bio,
  avatarUrl: p.avatar_url,
  isActive: p.is_active === 1 || p.is_active === true,
  trainingsСonducted: p.trainings_conducted,
  averageRating: p.average_rating,
});

const mapVoteFromApi = (v: any): TrainingVote => ({
  id: v.id,
  proposalId: v.proposal_id,
  voterId: v.voter_id,
  voterName: v.voter_name,
  participationIntent: v.participation_intent as ParticipationIntent,
  isAnonymous: v.is_anonymous === 1 || v.is_anonymous === true,
  votedAt: v.voted_at,
});

const mapFeedbackFromApi = (f: any): TrainingFeedback => ({
  id: f.id,
  proposalId: f.proposal_id,
  reviewerId: f.reviewer_id,
  reviewerName: f.reviewer_name,
  isAnonymous: f.is_anonymous === 1 || f.is_anonymous === true,
  rating: f.rating,
  contentRating: f.content_rating,
  presenterRating: f.presenter_rating,
  usefulnessRating: f.usefulness_rating,
  comment: f.comment,
  createdAt: f.created_at,
});

const mapProposalFromApi = (p: any): TrainingProposal => ({
  id: p.id,
  topic: p.topic,
  description: p.description,
  authorId: p.author_id,
  authorName: p.author_name,
  isAuthorAnonymous: p.is_author_anonymous === 1 || p.is_author_anonymous === true,
  partnerId: p.partner_id,
  partnerName: p.partner_name,
  format: p.format as TrainingFormat,
  preferredTimeSlots: Array.isArray(p.preferred_time_slots)
    ? p.preferred_time_slots
    : p.preferred_time_slots ? JSON.parse(p.preferred_time_slots) : [],
  votes: p.votes ? p.votes.map(mapVoteFromApi) : [],
  voteThreshold: p.vote_threshold || 5,
  status: p.status as TrainingProposalStatus,
  partnerResponse: p.partner_response,
  partnerResponseAt: p.partner_response_at,
  partnerResponseNote: p.partner_response_note,
  scheduledDate: p.scheduled_date,
  scheduledTime: p.scheduled_time,
  scheduledLocation: p.scheduled_location,
  scheduledLink: p.scheduled_link,
  maxParticipants: p.max_participants,
  registeredParticipants: p.registrations
    ? p.registrations.map((r: any) => r.user_id)
    : [],
  feedback: p.feedback ? p.feedback.map(mapFeedbackFromApi) : [],
  completedAt: p.completed_at,
  actualParticipantsCount: p.actual_participants_count,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  // Computed fields from API
  voteCount: p.vote_count,
  registeredCount: p.registered_count,
});

const mapNotificationFromApi = (n: any): TrainingNotification => ({
  id: n.id,
  type: n.type,
  proposalId: n.proposal_id,
  recipientId: n.recipient_id,
  recipientRole: n.recipient_role,
  title: n.title,
  message: n.message,
  isRead: n.is_read === 1 || n.is_read === true,
  createdAt: n.created_at,
});

const mapSettingsFromApi = (s: Record<string, any>): TrainingSettings => ({
  voteThreshold: s.vote_threshold ?? 5,
  allowAnonymousProposals: s.allow_anonymous_proposals ?? true,
  allowAnonymousVotes: s.allow_anonymous_votes ?? true,
  allowAnonymousFeedback: s.allow_anonymous_feedback ?? true,
  notifyAllOnNewProposal: s.notify_all_on_new_proposal ?? true,
  autoCloseAfterDays: s.auto_close_after_days ?? 30,
});

// ==================== State Interface ====================

interface TrainingState {
  // Data
  partners: Partner[];
  proposals: TrainingProposal[];
  notifications: TrainingNotification[];
  settings: TrainingSettings;

  // Loading states
  isLoadingPartners: boolean;
  isLoadingProposals: boolean;
  isLoadingNotifications: boolean;

  // Partners (async)
  fetchPartners: (activeOnly?: boolean) => Promise<void>;
  addPartner: (partner: Omit<Partner, 'id'>) => Promise<Partner>;
  updatePartner: (id: string, partner: Partial<Partner>) => Promise<void>;
  deletePartner: (id: string) => Promise<void>;
  getActivePartners: () => Partner[];

  // Proposals (async)
  fetchProposals: (options?: { status?: string; partnerId?: string; authorId?: string }) => Promise<void>;
  fetchProposalById: (id: string) => Promise<TrainingProposal | null>;
  addProposal: (proposal: {
    topic: string;
    description?: string;
    partnerId: string;
    format: TrainingFormat;
    preferredTimeSlots: TrainingTimeSlot[];
    isAuthorAnonymous?: boolean;
  }) => Promise<TrainingProposal>;
  updateProposal: (id: string, proposal: Partial<TrainingProposal>) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  getProposalById: (id: string) => TrainingProposal | undefined;
  getProposalsByStatus: (status: TrainingProposalStatus) => TrainingProposal[];
  getMyProposals: (userId: string) => TrainingProposal[];

  // Voting (async)
  addVote: (
    proposalId: string,
    vote: {
      participationIntent: ParticipationIntent;
      isAnonymous: boolean;
    }
  ) => Promise<void>;
  removeVote: (proposalId: string) => Promise<void>;
  hasVoted: (proposalId: string, voterId: string) => boolean;
  getVoteCount: (proposalId: string) => number;
  getDefinitelyCount: (proposalId: string) => number;

  // Partner response (async)
  setPartnerResponse: (
    proposalId: string,
    response: 'accepted' | 'rejected',
    note?: string
  ) => Promise<void>;

  // Scheduling (async)
  scheduleTraining: (
    proposalId: string,
    data: {
      scheduledDate: string;
      scheduledTime: string;
      scheduledLocation?: string;
      scheduledLink?: string;
      maxParticipants?: number;
    }
  ) => Promise<void>;

  // Complete training (async)
  completeTraining: (proposalId: string, actualParticipantsCount?: number) => Promise<void>;

  // Registration (async)
  registerForTraining: (proposalId: string) => Promise<void>;
  unregisterFromTraining: (proposalId: string) => Promise<void>;
  isRegistered: (proposalId: string, userId: string) => boolean;
  getRegisteredCount: (proposalId: string) => number;

  // Feedback (async)
  addFeedback: (
    proposalId: string,
    feedback: {
      rating: number;
      contentRating?: number;
      presenterRating?: number;
      usefulnessRating?: number;
      comment?: string;
      isAnonymous?: boolean;
    }
  ) => Promise<void>;
  hasFeedback: (proposalId: string, reviewerId: string) => boolean;
  getAverageRating: (proposalId: string) => number;

  // Status (sync helpers)
  changeStatus: (proposalId: string, status: TrainingProposalStatus) => Promise<void>;
  checkThreshold: (proposalId: string) => boolean;

  // Notifications (async)
  fetchNotifications: (unreadOnly?: boolean) => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  getUnreadNotifications: (recipientId: string) => TrainingNotification[];
  getNotificationsByRecipient: (recipientId: string) => TrainingNotification[];

  // Settings (async)
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<TrainingSettings>) => Promise<void>;

  // Stats (sync - computed from local state)
  getStats: () => {
    totalProposals: number;
    votingProposals: number;
    scheduledTrainings: number;
    completedTrainings: number;
    totalVotes: number;
    totalParticipants: number;
    averageRating: number;
  };

  // Anonymity helpers (sync)
  getDisplayName: (name: string, isAnonymous: boolean, isAdmin: boolean) => string;
  getVotesForDisplay: (proposalId: string, isAdmin: boolean) => TrainingVote[];
}

// ==================== Default Settings ====================

const defaultSettings: TrainingSettings = {
  voteThreshold: 5,
  allowAnonymousProposals: true,
  allowAnonymousVotes: true,
  allowAnonymousFeedback: true,
  notifyAllOnNewProposal: true,
  autoCloseAfterDays: 30,
};

// ==================== Store ====================

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      // Initial state
      partners: [],
      proposals: [],
      notifications: [],
      settings: defaultSettings,
      isLoadingPartners: false,
      isLoadingProposals: false,
      isLoadingNotifications: false,

      // Partners
      fetchPartners: async (activeOnly?: boolean) => {
        set({ isLoadingPartners: true });
        try {
          const response = await trainingPartnersApi.getAll(activeOnly);
          set({ partners: response.partners.map(mapPartnerFromApi) });
        } catch (error) {
          console.error('Failed to fetch partners:', error);
        } finally {
          set({ isLoadingPartners: false });
        }
      },

      addPartner: async (partnerData) => {
        const response = await trainingPartnersApi.create(partnerData);
        const newPartner = mapPartnerFromApi(response.partner);
        set((state) => ({ partners: [...state.partners, newPartner] }));
        return newPartner;
      },

      updatePartner: async (id, partnerData) => {
        await trainingPartnersApi.update(id, partnerData);
        set((state) => ({
          partners: state.partners.map((p) =>
            p.id === id ? { ...p, ...partnerData } : p
          ),
        }));
      },

      deletePartner: async (id) => {
        await trainingPartnersApi.delete(id);
        set((state) => ({
          partners: state.partners.filter((p) => p.id !== id),
        }));
      },

      getActivePartners: () => {
        return get().partners.filter((p) => p.isActive);
      },

      // Proposals
      fetchProposals: async (options) => {
        set({ isLoadingProposals: true });
        try {
          const response = await trainingProposalsApi.getAll(options);
          set({ proposals: response.proposals.map(mapProposalFromApi) });
        } catch (error) {
          console.error('Failed to fetch proposals:', error);
        } finally {
          set({ isLoadingProposals: false });
        }
      },

      fetchProposalById: async (id) => {
        try {
          const response = await trainingProposalsApi.getById(id);
          const proposal = mapProposalFromApi(response.proposal);
          // Update in local state
          set((state) => ({
            proposals: state.proposals.some((p) => p.id === id)
              ? state.proposals.map((p) => (p.id === id ? proposal : p))
              : [...state.proposals, proposal],
          }));
          return proposal;
        } catch (error) {
          console.error('Failed to fetch proposal:', error);
          return null;
        }
      },

      addProposal: async (proposalData) => {
        const response = await trainingProposalsApi.create({
          topic: proposalData.topic,
          description: proposalData.description,
          partnerId: proposalData.partnerId,
          format: proposalData.format,
          preferredTimeSlots: proposalData.preferredTimeSlots,
          isAuthorAnonymous: proposalData.isAuthorAnonymous,
        });
        const newProposal = mapProposalFromApi(response.proposal);
        set((state) => ({ proposals: [...state.proposals, newProposal] }));
        return newProposal;
      },

      updateProposal: async (id, proposalData) => {
        await trainingProposalsApi.update(id, proposalData);
        set((state) => ({
          proposals: state.proposals.map((p) =>
            p.id === id ? { ...p, ...proposalData, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      deleteProposal: async (id) => {
        await trainingProposalsApi.delete(id);
        set((state) => ({
          proposals: state.proposals.filter((p) => p.id !== id),
        }));
      },

      getProposalById: (id) => {
        return get().proposals.find((p) => p.id === id);
      },

      getProposalsByStatus: (status) => {
        return get().proposals.filter((p) => p.status === status);
      },

      getMyProposals: (userId) => {
        return get().proposals.filter((p) => p.authorId === userId);
      },

      // Voting
      addVote: async (proposalId, voteData) => {
        await trainingVotesApi.vote(proposalId, voteData);
        // Refresh the proposal to get updated vote count
        await get().fetchProposalById(proposalId);
      },

      removeVote: async (proposalId) => {
        await trainingVotesApi.removeVote(proposalId);
        // Refresh the proposal
        await get().fetchProposalById(proposalId);
      },

      hasVoted: (proposalId, voterId) => {
        const proposal = get().getProposalById(proposalId);
        return proposal?.votes.some((v) => v.voterId === voterId) ?? false;
      },

      getVoteCount: (proposalId) => {
        const proposal = get().getProposalById(proposalId);
        return proposal?.votes.length ?? proposal?.voteCount ?? 0;
      },

      getDefinitelyCount: (proposalId) => {
        const proposal = get().getProposalById(proposalId);
        return (
          proposal?.votes.filter((v) => v.participationIntent === 'definitely').length ?? 0
        );
      },

      // Partner response
      setPartnerResponse: async (proposalId, response, note) => {
        await trainingProposalsApi.update(proposalId, {
          partnerResponse: response,
          partnerResponseNote: note,
          status: response === 'accepted' ? 'approved' : 'rejected',
        });
        set((state) => ({
          proposals: state.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  partnerResponse: response,
                  partnerResponseAt: new Date().toISOString(),
                  partnerResponseNote: note,
                  status: response === 'accepted' ? 'approved' : 'rejected',
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
      },

      // Scheduling
      scheduleTraining: async (proposalId, data) => {
        await trainingProposalsApi.schedule(proposalId, data);
        set((state) => ({
          proposals: state.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  ...data,
                  status: 'scheduled' as TrainingProposalStatus,
                  registeredParticipants: [],
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
      },

      // Complete training
      completeTraining: async (proposalId, actualParticipantsCount) => {
        await trainingProposalsApi.complete(proposalId, { actualParticipantsCount });
        set((state) => ({
          proposals: state.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  status: 'completed' as TrainingProposalStatus,
                  completedAt: new Date().toISOString(),
                  actualParticipantsCount,
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
      },

      // Registration
      registerForTraining: async (proposalId) => {
        await trainingRegistrationsApi.register(proposalId);
        // Refresh proposal to get updated registrations
        await get().fetchProposalById(proposalId);
      },

      unregisterFromTraining: async (proposalId) => {
        await trainingRegistrationsApi.unregister(proposalId);
        // Refresh proposal
        await get().fetchProposalById(proposalId);
      },

      isRegistered: (proposalId, userId) => {
        const proposal = get().getProposalById(proposalId);
        return proposal?.registeredParticipants?.includes(userId) ?? false;
      },

      getRegisteredCount: (proposalId) => {
        const proposal = get().getProposalById(proposalId);
        return proposal?.registeredParticipants?.length ?? proposal?.registeredCount ?? 0;
      },

      // Feedback
      addFeedback: async (proposalId, feedbackData) => {
        await trainingFeedbackApi.submit(proposalId, feedbackData);
        // Refresh proposal to get updated feedback
        await get().fetchProposalById(proposalId);
      },

      hasFeedback: (proposalId, reviewerId) => {
        const proposal = get().getProposalById(proposalId);
        return proposal?.feedback?.some((f) => f.reviewerId === reviewerId) ?? false;
      },

      getAverageRating: (proposalId) => {
        const proposal = get().getProposalById(proposalId);
        if (!proposal?.feedback?.length) return 0;
        const sum = proposal.feedback.reduce((acc, f) => acc + f.rating, 0);
        return sum / proposal.feedback.length;
      },

      // Status
      changeStatus: async (proposalId, status) => {
        await trainingProposalsApi.update(proposalId, { status });
        set((state) => ({
          proposals: state.proposals.map((p) =>
            p.id === proposalId
              ? { ...p, status, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      checkThreshold: (proposalId) => {
        const proposal = get().getProposalById(proposalId);
        if (!proposal) return false;
        const voteCount = proposal.votes?.length ?? proposal.voteCount ?? 0;
        return voteCount >= proposal.voteThreshold;
      },

      // Notifications
      fetchNotifications: async (unreadOnly) => {
        set({ isLoadingNotifications: true });
        try {
          const response = await trainingNotificationsApi.getAll(unreadOnly);
          set({ notifications: response.notifications.map(mapNotificationFromApi) });
        } catch (error) {
          console.error('Failed to fetch notifications:', error);
        } finally {
          set({ isLoadingNotifications: false });
        }
      },

      markNotificationAsRead: async (id) => {
        await trainingNotificationsApi.markAsRead(id);
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        }));
      },

      markAllNotificationsAsRead: async () => {
        await trainingNotificationsApi.markAllAsRead();
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        }));
      },

      getUnreadNotifications: (recipientId) => {
        return get().notifications.filter(
          (n) =>
            (n.recipientId === recipientId || n.recipientId === 'all') && !n.isRead
        );
      },

      getNotificationsByRecipient: (recipientId) => {
        return get().notifications.filter(
          (n) => n.recipientId === recipientId || n.recipientId === 'all'
        );
      },

      // Settings
      fetchSettings: async () => {
        try {
          const response = await trainingSettingsApi.getAll();
          set({ settings: mapSettingsFromApi(response.settings) });
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      },

      updateSettings: async (settingsData) => {
        // Convert camelCase to snake_case for API
        const apiSettings: Record<string, any> = {};
        if (settingsData.voteThreshold !== undefined) apiSettings.vote_threshold = settingsData.voteThreshold;
        if (settingsData.allowAnonymousProposals !== undefined) apiSettings.allow_anonymous_proposals = settingsData.allowAnonymousProposals;
        if (settingsData.allowAnonymousVotes !== undefined) apiSettings.allow_anonymous_votes = settingsData.allowAnonymousVotes;
        if (settingsData.allowAnonymousFeedback !== undefined) apiSettings.allow_anonymous_feedback = settingsData.allowAnonymousFeedback;
        if (settingsData.notifyAllOnNewProposal !== undefined) apiSettings.notify_all_on_new_proposal = settingsData.notifyAllOnNewProposal;
        if (settingsData.autoCloseAfterDays !== undefined) apiSettings.auto_close_after_days = settingsData.autoCloseAfterDays;

        await trainingSettingsApi.update(apiSettings);
        set((state) => ({
          settings: { ...state.settings, ...settingsData },
        }));
      },

      // Stats (sync - computed from local state)
      getStats: () => {
        const proposals = get().proposals;
        const completedProposals = proposals.filter((p) => p.status === 'completed');

        let totalRating = 0;
        let ratingCount = 0;
        completedProposals.forEach((p) => {
          if (p.feedback?.length) {
            p.feedback.forEach((f) => {
              totalRating += f.rating;
              ratingCount++;
            });
          }
        });

        return {
          totalProposals: proposals.length,
          votingProposals: proposals.filter((p) => p.status === 'voting').length,
          scheduledTrainings: proposals.filter((p) => p.status === 'scheduled').length,
          completedTrainings: completedProposals.length,
          totalVotes: proposals.reduce((acc, p) => acc + (p.votes?.length ?? 0), 0),
          totalParticipants: proposals.reduce(
            (acc, p) => acc + (p.registeredParticipants?.length ?? 0),
            0
          ),
          averageRating: ratingCount > 0 ? totalRating / ratingCount : 0,
        };
      },

      // Anonymity helpers
      getDisplayName: (name, isAnonymous, isAdmin) => {
        if (isAdmin) return name;
        return isAnonymous ? 'Аноним' : name;
      },

      getVotesForDisplay: (proposalId, isAdmin) => {
        const proposal = get().getProposalById(proposalId);
        if (!proposal) return [];

        if (isAdmin) return proposal.votes;

        return proposal.votes.map((vote) => ({
          ...vote,
          voterName: vote.isAnonymous ? 'Аноним' : vote.voterName,
        }));
      },
    }),
    {
      name: 'training-storage',
      partialize: (state) => ({
        // Only persist settings locally for offline fallback
        settings: state.settings,
      }),
    }
  )
);

// ==================== Constants for UI ====================

export const TRAINING_STATUS_LABELS: Record<TrainingProposalStatus, string> = {
  voting: 'Голосование',
  review: 'На рассмотрении',
  approved: 'Одобрено',
  scheduled: 'Запланировано',
  completed: 'Завершено',
  rejected: 'Отклонено',
};

export const TRAINING_STATUS_COLORS: Record<TrainingProposalStatus, string> = {
  voting: 'bg-blue-100 text-blue-800',
  review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  scheduled: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
};

export const FORMAT_LABELS: Record<TrainingFormat, string> = {
  online: 'Онлайн',
  offline: 'Офлайн',
  any: 'Любой формат',
};

export const TIME_SLOT_LABELS: Record<TrainingTimeSlot, string> = {
  morning: 'Утро (9:00-12:00)',
  afternoon: 'День (12:00-17:00)',
  evening: 'Вечер (17:00-20:00)',
  weekend: 'Выходные',
};

export const PARTICIPATION_LABELS: Record<ParticipationIntent, string> = {
  definitely: 'Точно приду',
  maybe: 'Возможно приду',
  support_only: 'Поддерживаю идею',
};

export const PARTICIPATION_COLORS: Record<ParticipationIntent, string> = {
  definitely: 'bg-green-100 text-green-800',
  maybe: 'bg-yellow-100 text-yellow-800',
  support_only: 'bg-gray-100 text-gray-600',
};
