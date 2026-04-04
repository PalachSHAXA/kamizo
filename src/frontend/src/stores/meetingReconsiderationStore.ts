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
          return response.data.map((v: Record<string, unknown>) => ({
            voteId: v.vote_id,
            voterId: v.voter_id,
            voterName: v.voter_name,
            apartmentNumber: v.apartment_number,
            voteWeight: v.vote_weight,
            votedAt: v.voted_at,
            phone: v.phone,
            apartmentArea: v.apartment_area,
            comment: v.comment,
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
        if (response.success && response.data) {
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
          return response.data.map((r: Record<string, unknown>) => ({
            id: r.id,
            meetingId: r.meeting_id,
            agendaItemId: r.agenda_item_id,
            residentId: r.resident_id,
            apartmentId: r.apartment_id,
            requestedByUserId: r.requested_by_user_id,
            requestedByRole: r.requested_by_role,
            reason: r.reason,
            messageToResident: r.message_to_resident,
            voteAtRequestTime: r.vote_at_request_time,
            status: r.status,
            viewedAt: r.viewed_at,
            respondedAt: r.responded_at,
            newVote: r.new_vote,
            createdAt: r.created_at,
            expiredAt: r.expired_at,
            meetingStatus: r.meeting_status,
            agendaItemTitle: r.agenda_item_title,
            agendaItemDescription: r.agenda_item_description,
            requestedByName: r.requested_by_name,
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
        if (response.success && response.data) {
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
