// Training System API

import { apiRequest } from './client';

// Training Partners API
export const trainingPartnersApi = {
  getAll: async (activeOnly?: boolean) => {
    const query = activeOnly ? '?active=true' : '';
    return apiRequest<{ partners: any[] }>(`/api/training/partners${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ partner: any }>(`/api/training/partners/${id}`);
  },

  create: async (partner: {
    name: string;
    position?: string;
    specialization?: string;
    email?: string;
    phone?: string;
    bio?: string;
    avatarUrl?: string;
    isActive?: boolean;
  }) => {
    return apiRequest<{ partner: any }>('/api/training/partners', {
      method: 'POST',
      body: JSON.stringify(partner),
    });
  },

  update: async (id: string, updates: Partial<{
    name: string;
    position: string;
    specialization: string;
    email: string;
    phone: string;
    bio: string;
    avatarUrl: string;
    isActive: boolean;
  }>) => {
    return apiRequest<{ partner: any }>(`/api/training/partners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/partners/${id}`, {
      method: 'DELETE',
    });
  },
};

// Training Proposals API
export const trainingProposalsApi = {
  getAll: async (options?: {
    status?: string;
    partnerId?: string;
    authorId?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.partnerId) params.append('partner_id', options.partnerId);
    if (options?.authorId) params.append('author_id', options.authorId);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ proposals: any[] }>(`/api/training/proposals${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}`);
  },

  create: async (proposal: {
    topic: string;
    description?: string;
    partnerId: string;
    format?: 'online' | 'offline' | 'any';
    preferredTimeSlots?: string[];
    isAuthorAnonymous?: boolean;
  }) => {
    return apiRequest<{ proposal: any }>('/api/training/proposals', {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
  },

  update: async (id: string, updates: Partial<{
    topic: string;
    description: string;
    format: string;
    status: string;
    preferredTimeSlots: string[];
    partnerResponse: 'accepted' | 'rejected';
    partnerResponseNote: string;
  }>) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${id}`, {
      method: 'DELETE',
    });
  },

  schedule: async (id: string, data: {
    scheduledDate: string;
    scheduledTime: string;
    scheduledLocation?: string;
    scheduledLink?: string;
    maxParticipants?: number;
  }) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  complete: async (id: string, data?: { actualParticipantsCount?: number }) => {
    return apiRequest<{ proposal: any }>(`/api/training/proposals/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },
};

// Training Votes API
export const trainingVotesApi = {
  getForProposal: async (proposalId: string) => {
    return apiRequest<{ votes: any[] }>(`/api/training/proposals/${proposalId}/votes`);
  },

  vote: async (proposalId: string, data: {
    participationIntent?: 'definitely' | 'maybe' | 'support_only';
    isAnonymous?: boolean;
  }) => {
    return apiRequest<{ vote: any }>(`/api/training/proposals/${proposalId}/votes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeVote: async (proposalId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/votes`, {
      method: 'DELETE',
    });
  },
};

// Training Registrations API
export const trainingRegistrationsApi = {
  register: async (proposalId: string) => {
    return apiRequest<{ registration: any }>(`/api/training/proposals/${proposalId}/register`, {
      method: 'POST',
    });
  },

  unregister: async (proposalId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/register`, {
      method: 'DELETE',
    });
  },

  confirmAttendance: async (proposalId: string, userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/proposals/${proposalId}/attendance/${userId}`, {
      method: 'POST',
    });
  },
};

// Training Feedback API
export const trainingFeedbackApi = {
  getForProposal: async (proposalId: string) => {
    return apiRequest<{ feedback: any[] }>(`/api/training/proposals/${proposalId}/feedback`);
  },

  submit: async (proposalId: string, feedback: {
    rating: number;
    contentRating?: number;
    presenterRating?: number;
    usefulnessRating?: number;
    comment?: string;
    isAnonymous?: boolean;
  }) => {
    return apiRequest<{ feedback: any }>(`/api/training/proposals/${proposalId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  },
};

// Training Notifications API
export const trainingNotificationsApi = {
  getAll: async (unreadOnly?: boolean) => {
    const query = unreadOnly ? '?unread=true' : '';
    return apiRequest<{ notifications: any[] }>(`/api/training/notifications${query}`);
  },

  markAsRead: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/training/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  markAllAsRead: async () => {
    return apiRequest<{ success: boolean }>('/api/training/notifications/read-all', {
      method: 'POST',
    });
  },
};

// Training Settings API
export const trainingSettingsApi = {
  getAll: async () => {
    return apiRequest<{ settings: Record<string, any> }>('/api/training/settings');
  },

  update: async (settings: Record<string, any>) => {
    return apiRequest<{ success: boolean }>('/api/training/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },
};

// Training Stats API
export const trainingStatsApi = {
  get: async () => {
    return apiRequest<{ stats: {
      totalProposals: number;
      votingProposals: number;
      scheduledTrainings: number;
      completedTrainings: number;
      totalVotes: number;
      totalParticipants: number;
      averageRating: number;
    } }>('/api/training/stats');
  },
};
