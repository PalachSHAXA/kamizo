/**
 * meetingReconsiderationStore.ts — Sub-store for vote reconsideration logic
 *
 * Handles: fetching against votes, sending reconsideration requests,
 * viewing/ignoring requests, and reconsideration statistics.
 *
 * This is NOT consumed directly by components — it's used internally
 * by the main meetingStore.ts facade.
 */

import { create } from 'zustand';
import { meetingReconsiderationApi } from '../services/api';

// ============ Types ============

export interface AgainstVote {
  voteId: string;
  voterId: string;
  voterName: string;
  apartmentNumber: string;
  voteWeight: number;
  votedAt: string;
  phone?: string;
  apartmentArea?: number;
  comment?: string;
  requestCount: number;
  canSendRequest: boolean;
}

export interface ReconsiderationRequest {
  id: string;
  meetingId: string;
  agendaItemId: string;
  residentId: string;
  apartmentId: string;
  requestedByUserId: string;
  requestedByRole: string;
  reason: string;
  messageToResident?: string;
  voteAtRequestTime: string;
  status: 'pending' | 'viewed' | 'vote_changed' | 'ignored' | 'expired';
  viewedAt?: string;
  respondedAt?: string;
  newVote?: string;
  createdAt: string;
  expiredAt?: string;
  // Joined fields
  meetingStatus?: string;
  agendaItemTitle?: string;
  agendaItemDescription?: string;
  requestedByName?: string;
}

export interface ReconsiderationStats {
  total: number;
  pending: number;
  viewed: number;
  voteChanged: number;
  ignored: number;
  expired: number;
  conversionRate: string;
}

interface AgainstVoteApiData {
  vote_id: string;
  voter_id: string;
  voter_name: string;
  apartment_number: string | null;
  vote_weight: number;
  voted_at: string;
  phone?: string | null;
  total_area?: number | null;
  comment?: string | null;
  request_count: number;
  can_send_request: boolean;
}

interface ReconsiderationRequestApiData {
  id: string;
  meeting_id: string;
  agenda_item_id: string;
  resident_id: string;
  apartment_id: string;
  requested_by_user_id: string;
  requested_by_role: string;
  reason: string;
  message_to_resident?: string | null;
  vote_at_request_time: string;
  status: ReconsiderationRequest['status'];
  viewed_at?: string | null;
  responded_at?: string | null;
  new_vote?: string | null;
  created_at: string;
  expired_at?: string | null;
  meeting_status?: string | null;
  agenda_item_title?: string | null;
  agenda_item_description?: string | null;
  requested_by_name?: string | null;
}

interface ReconsiderationStatsApiData {
  total: number | null;
  pending: number | null;
  viewed: number | null;
  vote_changed: number | null;
  ignored: number | null;
  expired: number | null;
  conversion_rate: string;
}

const reconsiderationStatuses: ReconsiderationRequest['status'][] = [
  'pending', 'viewed', 'vote_changed', 'ignored', 'expired',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAgainstVoteApiData = (value: unknown): value is AgainstVoteApiData =>
  isRecord(value) &&
  typeof value.vote_id === 'string' &&
  typeof value.voter_id === 'string' &&
  typeof value.voter_name === 'string' &&
  (typeof value.apartment_number === 'string' || value.apartment_number === null) &&
  typeof value.vote_weight === 'number' &&
  typeof value.voted_at === 'string' &&
  typeof value.request_count === 'number' &&
  typeof value.can_send_request === 'boolean';

const isReconsiderationRequestApiData = (value: unknown): value is ReconsiderationRequestApiData =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.meeting_id === 'string' &&
  typeof value.agenda_item_id === 'string' &&
  typeof value.resident_id === 'string' &&
  typeof value.apartment_id === 'string' &&
  typeof value.requested_by_user_id === 'string' &&
  typeof value.requested_by_role === 'string' &&
  typeof value.reason === 'string' &&
  typeof value.vote_at_request_time === 'string' &&
  reconsiderationStatuses.includes(value.status as ReconsiderationRequest['status']) &&
  typeof value.created_at === 'string';

const isReconsiderationStatsApiData = (value: unknown): value is ReconsiderationStatsApiData =>
  isRecord(value) &&
  (typeof value.total === 'number' || value.total === null) &&
  (typeof value.pending === 'number' || value.pending === null) &&
  (typeof value.viewed === 'number' || value.viewed === null) &&
  (typeof value.vote_changed === 'number' || value.vote_changed === null) &&
  (typeof value.ignored === 'number' || value.ignored === null) &&
  (typeof value.expired === 'number' || value.expired === null) &&
  typeof value.conversion_rate === 'string';

const isSendRequestApiData = (value: unknown): value is { requestId: string } =>
  isRecord(value) && typeof value.requestId === 'string';

const optionalString = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

// ============ Store Interface ============

export interface MeetingReconsiderationState {
  fetchAgainstVotes: (meetingId: string, agendaItemId: string) => Promise<AgainstVote[]>;
  sendReconsiderationRequest: (meetingId: string, data: {
    agendaItemId: string;
    residentId: string;
    reason: string;
    messageToResident?: string;
  }) => Promise<{ success: boolean; requestId?: string; error?: string }>;
  fetchMyReconsiderationRequests: () => Promise<ReconsiderationRequest[]>;
  markReconsiderationRequestViewed: (requestId: string) => Promise<void>;
  ignoreReconsiderationRequest: (requestId: string) => Promise<void>;
  fetchReconsiderationStats: (meetingId: string) => Promise<ReconsiderationStats | null>;
}

// ============ Store Implementation ============

export const useMeetingReconsiderationStore = create<MeetingReconsiderationState>()(
  () => ({
    fetchAgainstVotes: async (meetingId, agendaItemId) => {
      try {
        const response = await meetingReconsiderationApi.getAgainstVotes(meetingId, agendaItemId);
        if (response.success && response.data) {
          // Map from snake_case to camelCase
          return response.data.filter(isAgainstVoteApiData).map((v) => ({
            voteId: v.vote_id,
            voterId: v.voter_id,
            voterName: v.voter_name,
            apartmentNumber: v.apartment_number || '',
            voteWeight: v.vote_weight,
            votedAt: v.voted_at,
            phone: optionalString(v.phone),
            apartmentArea: v.total_area ?? undefined,
            comment: optionalString(v.comment),
            requestCount: v.request_count,
            canSendRequest: v.can_send_request,
          }));
        }
        return [];
      } catch (error) {
        console.error('Failed to fetch against votes:', error);
        return [];
      }
    },

    sendReconsiderationRequest: async (meetingId, data) => {
      try {
        const response = await meetingReconsiderationApi.sendRequest(meetingId, {
          agenda_item_id: data.agendaItemId,
          resident_id: data.residentId,
          reason: data.reason,
          message_to_resident: data.messageToResident,
        });
        if (response.success && isSendRequestApiData(response.data)) {
          return { success: true, requestId: response.data.requestId };
        }
        return { success: false, error: response.error || 'Failed to send request' };
      } catch (err: unknown) {
        console.error('Failed to send reconsideration request:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Network error' };
      }
    },

    fetchMyReconsiderationRequests: async () => {
      try {
        const response = await meetingReconsiderationApi.getMyRequests();
        if (response.success && response.data) {
          // Map from snake_case to camelCase
          return response.data.filter(isReconsiderationRequestApiData).map((r) => ({
            id: r.id,
            meetingId: r.meeting_id,
            agendaItemId: r.agenda_item_id,
            residentId: r.resident_id,
            apartmentId: r.apartment_id,
            requestedByUserId: r.requested_by_user_id,
            requestedByRole: r.requested_by_role,
            reason: r.reason,
            messageToResident: optionalString(r.message_to_resident),
            voteAtRequestTime: r.vote_at_request_time,
            status: r.status,
            viewedAt: optionalString(r.viewed_at),
            respondedAt: optionalString(r.responded_at),
            newVote: optionalString(r.new_vote),
            createdAt: r.created_at,
            expiredAt: optionalString(r.expired_at),
            meetingStatus: optionalString(r.meeting_status),
            agendaItemTitle: optionalString(r.agenda_item_title),
            agendaItemDescription: optionalString(r.agenda_item_description),
            requestedByName: optionalString(r.requested_by_name),
          }));
        }
        return [];
      } catch (error) {
        console.error('Failed to fetch reconsideration requests:', error);
        return [];
      }
    },

    markReconsiderationRequestViewed: async (requestId) => {
      try {
        await meetingReconsiderationApi.markViewed(requestId);
      } catch (error) {
        console.error('Failed to mark request as viewed:', error);
      }
    },

    ignoreReconsiderationRequest: async (requestId) => {
      try {
        await meetingReconsiderationApi.ignoreRequest(requestId);
      } catch (error) {
        console.error('Failed to ignore request:', error);
      }
    },

    fetchReconsiderationStats: async (meetingId) => {
      try {
        const response = await meetingReconsiderationApi.getStats(meetingId);
        if (response.success && isReconsiderationStatsApiData(response.data)) {
          const s = response.data;
          return {
            total: s.total || 0,
            pending: s.pending || 0,
            viewed: s.viewed || 0,
            voteChanged: s.vote_changed || 0,
            ignored: s.ignored || 0,
            expired: s.expired || 0,
            conversionRate: s.conversion_rate || '0',
          };
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch reconsideration stats:', error);
        return null;
      }
    },
  })
);
