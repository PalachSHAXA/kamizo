// Meetings API (simple + full OSS workflow), Schedule Votes, Agenda Votes,
// Reconsideration, OTP, Building Settings, Voting Units, Eligible Voters, Agenda Comments

import { apiRequest, apiRequestWrapped, cachedGet, invalidateCache, CACHE_TTL } from './client';

// Meetings API (simple)
export const meetingsApi = {
  getAll: async () => {
    return cachedGet<{ meetings: any[] }>('/api/meetings', CACHE_TTL.MEDIUM);
  },

  create: async (meeting: {
    title: string;
    description?: string;
    date: string;
    time: string;
    location?: string;
    type?: 'general' | 'emergency' | 'committee';
    target_building_id?: string;
  }) => {
    return apiRequest<{ meeting: any }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(meeting),
    });
  },

  createVote: async (meetingId: string, vote: {
    question: string;
    options: string[];
  }) => {
    return apiRequest<{ vote: any }>(`/api/meetings/${meetingId}/votes`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
  },

  submitVote: async (voteId: string, optionIndex: number) => {
    return apiRequest<{ response: any }>(`/api/votes/${voteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ option_index: optionIndex }),
    });
  },
};

// Meetings API (Full OSS workflow) - Uses wrapped responses for meetingStore compatibility
export const meetingsFullApi = {
  getAll: async (options?: {
    buildingId?: string;
    status?: string;
    organizerId?: string;
    onlyActive?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (options?.buildingId) params.append('building_id', options.buildingId);
    if (options?.status) params.append('status', options.status);
    if (options?.organizerId) params.append('organizer_id', options.organizerId);
    if (options?.onlyActive) params.append('only_active', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequestWrapped<{ meetings?: any[] }>(`/api/meetings${query}`).then(r => ({
      success: r.success,
      data: r.data?.meetings || r.data,
      error: r.error
    }));
  },

  getById: async (id: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}`).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  create: async (meeting: {
    buildingId: string;
    buildingAddress?: string;
    organizerType?: 'uk' | 'resident' | 'initiative_group';
    format?: 'online' | 'offline' | 'hybrid';
    location?: string;
    description?: string;
    meetingTime?: string;
    agendaItems: { title: string; description?: string; threshold?: string }[];
    materials?: any[];
  }) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(meeting),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  update: async (id: string, updates: any) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  delete: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<{ success: boolean }>(`/api/meetings/${id}`, {
      method: 'DELETE',
    });
  },

  // Status transitions
  submit: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/submit`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  approve: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/approve`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  reject: async (id: string, reason: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  openSchedulePoll: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/open-schedule-poll`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  confirmSchedule: async (id: string, optionId?: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/confirm-schedule`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  openVoting: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/open-voting`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  closeVoting: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/close-voting`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  publishResults: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/publish-results`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  generateProtocol: async (id: string) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/generate-protocol`, { method: 'POST' }).then(r => ({
      success: r.success,
      data: r.data?.protocol || r.data,
      error: r.error
    }));
  },

  approveProtocol: async (id: string, signerData?: { signerId: string; signerName: string; signerRole: string }) => {
    invalidateCache('/api/meetings');
    return apiRequestWrapped<any>(`/api/meetings/${id}/approve-protocol`, {
      method: 'POST',
      body: signerData ? JSON.stringify(signerData) : undefined,
    }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  cancel: async (id: string, reason: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  getProtocol: async (meetingId: string) => {
    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/protocol`).then(r => ({
      success: r.success,
      data: r.data?.protocol || r.data,
      error: r.error
    }));
  },

  // Get protocol as HTML (for PDF export)
  getProtocolHtml: async (meetingId: string): Promise<string> => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/meetings/${meetingId}/protocol/html`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    return response.text();
  },

  // Open protocol in new tab for printing/PDF
  openProtocolForPrint: (meetingId: string) => {
    window.open(`/api/meetings/${meetingId}/protocol/html`, '_blank');
  },

  // Download protocol as PDF (uses browser print dialog)
  downloadProtocolPdf: async (meetingId: string) => {
    const html = await meetingsFullApi.getProtocolHtml(meetingId);

    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content to load then print
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Remove iframe after printing dialog closes
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  },
};

// Meeting Schedule Votes API
export const meetingScheduleVotesApi = {
  vote: async (meetingId: string, optionId: string) => {
    // Invalidate meetings cache to force fresh data after vote
    invalidateCache('/api/meetings');

    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/schedule-votes`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId }), // API expects snake_case
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },

  getMyVote: async (meetingId: string) => {
    return apiRequestWrapped<{ optionId: string | null }>(`/api/meetings/${meetingId}/schedule-votes/me`);
  },
};

// Meeting Agenda Votes API
export const meetingAgendaVotesApi = {
  vote: async (meetingId: string, agendaItemId: string, data: {
    voterId: string;
    voterName: string;
    choice: 'for' | 'against' | 'abstain';
    apartmentId?: string;
    apartmentNumber?: string;
    ownershipShare?: number;
    verificationMethod?: 'login' | 'otp' | 'in_person' | 'proxy';
    otpVerified?: boolean;
    comment?: string;
    counter_proposal?: string;
  }) => {
    return apiRequestWrapped<any>(
      `/api/meetings/${meetingId}/agenda/${agendaItemId}/vote`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  getMyVotes: async (meetingId: string, voterId?: string) => {
    const query = voterId ? `?voter_id=${voterId}` : '';
    return apiRequestWrapped<{ votes?: any[] }>(`/api/meetings/${meetingId}/votes/me${query}`).then(r => ({
      success: r.success,
      data: r.data?.votes || r.data || [],
      error: r.error
    }));
  },

  getVoteRecords: async (meetingId: string) => {
    return apiRequestWrapped<{ voteRecords?: any[] }>(`/api/meetings/${meetingId}/vote-records`).then(r => ({
      success: r.success,
      data: r.data?.voteRecords || r.data || [],
      error: r.error
    }));
  },
};

// Meeting Vote Reconsideration API
export const meetingReconsiderationApi = {
  // Get "against" votes for an agenda item (for managers)
  getAgainstVotes: async (meetingId: string, agendaItemId: string) => {
    return apiRequestWrapped<{ votes: any[] }>(
      `/api/meetings/${meetingId}/agenda/${agendaItemId}/votes/against`
    ).then(r => ({
      success: r.success,
      data: r.data?.votes || [],
      error: r.error
    }));
  },

  // Send reconsideration request to a resident
  sendRequest: async (meetingId: string, data: {
    agenda_item_id: string;
    resident_id: string;
    reason: string;
    message_to_resident?: string;
  }) => {
    return apiRequestWrapped<{ success: boolean; requestId: string }>(
      `/api/meetings/${meetingId}/reconsideration-requests`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get resident's pending reconsideration requests
  getMyRequests: async () => {
    return apiRequestWrapped<{ requests: any[] }>(
      '/api/meetings/reconsideration-requests/me'
    ).then(r => ({
      success: r.success,
      data: r.data?.requests || [],
      error: r.error
    }));
  },

  // Mark request as viewed
  markViewed: async (requestId: string) => {
    return apiRequestWrapped<{ success: boolean }>(
      `/api/meetings/reconsideration-requests/${requestId}/view`,
      { method: 'POST' }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Ignore/dismiss request
  ignoreRequest: async (requestId: string) => {
    return apiRequestWrapped<{ success: boolean }>(
      `/api/meetings/reconsideration-requests/${requestId}/ignore`,
      { method: 'POST' }
    ).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get reconsideration statistics for a meeting
  getStats: async (meetingId: string) => {
    return apiRequestWrapped<{ stats: any }>(
      `/api/meetings/${meetingId}/reconsideration-requests/stats`
    ).then(r => ({
      success: r.success,
      data: r.data?.stats || null,
      error: r.error
    }));
  },
};

// Meeting OTP API
export const meetingOtpApi = {
  request: async (data: {
    userId: string;
    phone: string;
    purpose: 'schedule_vote' | 'agenda_vote' | 'protocol_sign';
    meetingId?: string;
    agendaItemId?: string;
  }) => {
    return apiRequestWrapped<any>('/api/meetings/otp/request', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  verify: async (otpId: string, code: string) => {
    return apiRequestWrapped<{ verified: boolean; error?: string }>('/api/meetings/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ otpId, code }),
    }).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },
};

// Meeting Building Settings API
export const meetingBuildingSettingsApi = {
  get: async (buildingId: string) => {
    return apiRequestWrapped<any>(`/api/meetings/building-settings/${buildingId}`).then(r => ({
      success: r.success,
      data: r.data?.settings || r.data,
      error: r.error
    }));
  },

  update: async (buildingId: string, settings: any) => {
    return apiRequestWrapped<any>(`/api/meetings/building-settings/${buildingId}`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }).then(r => ({
      success: r.success,
      data: r.data?.settings || r.data,
      error: r.error
    }));
  },
};

// Meeting Voting Units API
export const meetingVotingUnitsApi = {
  getByBuilding: async (buildingId: string) => {
    return apiRequestWrapped<{ votingUnits?: any[] }>(`/api/meetings/voting-units?building_id=${buildingId}`).then(r => ({
      success: r.success,
      data: r.data?.votingUnits || r.data || [],
      error: r.error
    }));
  },

  create: async (unit: {
    buildingId: string;
    apartmentId?: string;
    apartmentNumber: string;
    ownerId?: string;
    ownerName?: string;
    coOwnerIds?: string[];
    ownershipShare?: number;
    totalArea?: number;
  }) => {
    return apiRequestWrapped<any>('/api/meetings/voting-units', {
      method: 'POST',
      body: JSON.stringify({
        building_id: unit.buildingId,
        apartment_id: unit.apartmentId,
        apartment_number: unit.apartmentNumber,
        owner_id: unit.ownerId,
        owner_name: unit.ownerName,
        co_owner_ids: unit.coOwnerIds ? JSON.stringify(unit.coOwnerIds) : '[]',
        ownership_share: unit.ownershipShare || 100,
        total_area: unit.totalArea || 0,
      }),
    }).then(r => ({
      success: r.success,
      data: r.data?.votingUnit || r.data,
      error: r.error
    }));
  },

  verify: async (id: string, verifiedBy: string) => {
    return apiRequestWrapped<any>(`/api/meetings/voting-units/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verified_by: verifiedBy }),
    }).then(r => ({
      success: r.success,
      data: r.data?.votingUnit || r.data,
      error: r.error
    }));
  },
};

// Meeting Eligible Voters API
export const meetingEligibleVotersApi = {
  set: async (meetingId: string, voterIds: string[], totalCount: number) => {
    return apiRequestWrapped<any>(`/api/meetings/${meetingId}/eligible-voters`, {
      method: 'POST',
      body: JSON.stringify({ voterIds, totalCount }),
    }).then(r => ({
      success: r.success,
      data: r.data?.meeting || r.data,
      error: r.error
    }));
  },
};

// Meeting Agenda Comments API
export const meetingAgendaCommentsApi = {
  getByAgendaItem: async (agendaItemId: string) => {
    return apiRequestWrapped<{ comments: any[] }>(`/api/agenda/${agendaItemId}/comments`).then(r => ({
      success: r.success,
      data: r.data?.comments || [],
      error: r.error
    }));
  },

  create: async (agendaItemId: string, data: {
    content: string;
    apartmentNumber?: string;
    includeInProtocol?: boolean;
  }) => {
    return apiRequestWrapped<any>(`/api/agenda/${agendaItemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content: data.content,
        apartment_number: data.apartmentNumber,
        include_in_protocol: data.includeInProtocol !== false
      }),
    }).then(r => ({
      success: r.success,
      data: r.data?.comment || r.data,
      error: r.error
    }));
  },

  delete: async (commentId: string) => {
    return apiRequestWrapped<{ success: boolean }>(`/api/comments/${commentId}`, {
      method: 'DELETE',
    });
  },
};
