/**
 * meetingVotingStore.ts — Sub-store for voting-related logic
 *
 * Handles: agenda voting, schedule voting, OTP management, vote records,
 * results calculation, and voting units.
 *
 * This is NOT consumed directly by components — it's used internally
 * by the main meetingStore.ts facade.
 */

import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import { useToastStore } from './toastStore';
import type {
  Meeting,
  VoteRecord,
  VoteChoice,
  OTPRecord,
  VotingUnit,
} from '../types';
import {
  meetingScheduleVotesApi,
  meetingAgendaVotesApi,
  meetingOtpApi,
  meetingVotingUnitsApi,
} from '../services/api';

// ============ Mappers ============

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface VoteRecordApiData extends Record<string, unknown> {
  id: string;
  meeting_id: string;
  agenda_item_id: string;
  voter_id: string;
  voter_name: string;
  apartment_id?: string;
  apartment_number?: string;
  ownership_share?: number;
  choice: VoteChoice;
  verification_method: VoteRecord['verificationMethod'];
  otp_verified: number;
  voted_at: string;
  vote_hash: string;
  is_revote: number;
  previous_vote_id?: string;
}

const voteChoices: VoteChoice[] = ['for', 'against', 'abstain', 'not_voted'];

const isVoteRecordApiData = (value: unknown): value is VoteRecordApiData =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.meeting_id === 'string' &&
  typeof value.agenda_item_id === 'string' &&
  typeof value.voter_id === 'string' &&
  typeof value.voter_name === 'string' &&
  voteChoices.includes(value.choice as VoteChoice) &&
  typeof value.verification_method === 'string' &&
  typeof value.otp_verified === 'number' &&
  typeof value.voted_at === 'string' &&
  typeof value.vote_hash === 'string' &&
  typeof value.is_revote === 'number';

export const mapVoteRecordFromApi = (data: VoteRecordApiData): VoteRecord => ({
  id: data.id,
  meetingId: data.meeting_id,
  agendaItemId: data.agenda_item_id,
  voterId: data.voter_id,
  voterName: data.voter_name,
  apartmentId: data.apartment_id,
  apartmentNumber: data.apartment_number,
  ownershipShare: data.ownership_share,
  choice: data.choice,
  verificationMethod: data.verification_method,
  otpVerified: Boolean(data.otp_verified),
  votedAt: data.voted_at,
  voteHash: data.vote_hash,
  isRevote: Boolean(data.is_revote),
  previousVoteId: data.previous_vote_id,
});

interface OTPRequestApiData {
  otpId: string;
  expiresAt: string;
}

const isOTPRequestApiData = (value: unknown): value is OTPRequestApiData =>
  isRecord(value) && typeof value.otpId === 'string' && typeof value.expiresAt === 'string';

interface VotingUnitApiData extends Record<string, unknown> {
  id: string;
  building_id: string;
  apartment_id?: string;
  apartment_number: string;
  total_area: number | null;
  ownership_share: number;
  owner_id: string | null;
  owner_name?: string | null;
  co_owner_ids: string;
  is_verified: number;
  verified_at?: string;
  verified_by?: string;
}

const isVotingUnitApiData = (value: unknown): value is VotingUnitApiData =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.building_id === 'string' &&
  typeof value.apartment_number === 'string' &&
  (typeof value.total_area === 'number' || value.total_area === null) &&
  typeof value.ownership_share === 'number' &&
  (typeof value.owner_id === 'string' || value.owner_id === null) &&
  typeof value.co_owner_ids === 'string' &&
  typeof value.is_verified === 'number';

export const mapVotingUnitFromApi = (data: VotingUnitApiData): VotingUnit => ({
  id: data.id,
  buildingId: data.building_id,
  apartmentId: data.apartment_id,
  apartmentNumber: data.apartment_number,
  totalArea: data.total_area ?? undefined,
  ownershipShare: data.ownership_share,
  ownerId: data.owner_id || '',
  ownerName: data.owner_name ?? undefined,
  coOwnerIds: JSON.parse(data.co_owner_ids || '[]'),
  isVerified: Boolean(data.is_verified),
  verifiedAt: data.verified_at,
  verifiedBy: data.verified_by,
});

// ============ Store Interface ============

export interface MeetingVotingState {
  voteRecords: VoteRecord[];
  otpRecords: OTPRecord[];
  votingUnits: VotingUnit[];

  // Schedule voting
  voteForSchedule: (meetingId: string, optionId: string, refetchMeetings: () => Promise<void>) => Promise<{ success: boolean; error?: string }>;
  getScheduleVoteByUser: (meetingId: string) => Promise<string | null>;

  // Agenda voting
  voteOnAgendaItem: (
    meetingId: string,
    agendaItemId: string,
    voterId: string,
    voterName: string,
    choice: VoteChoice,
    verificationData: {
      method: VoteRecord['verificationMethod'];
      otpVerified: boolean;
      apartmentId?: string;
      apartmentNumber?: string;
      ownershipShare?: number;
    },
    comment?: string,
    counterProposal?: string,
    // Callback to update meetings in the parent store
    updateMeetingParticipation?: (meetingId: string, voterId: string) => void,
  ) => Promise<VoteRecord>;

  getVoteByUser: (meetingId: string, agendaItemId: string, voterId: string) => VoteRecord | undefined;
  getUserVotesForMeeting: (meetingId: string, voterId: string) => Promise<VoteRecord[]>;

  // OTP Management
  requestOTP: (userId: string, phone: string, purpose: OTPRecord['purpose'], meetingId?: string, agendaItemId?: string) => Promise<OTPRecord>;
  verifyOTP: (otpId: string, code: string) => Promise<boolean>;
  getActiveOTP: (userId: string, purpose: OTPRecord['purpose']) => OTPRecord | undefined;

  // Results calculation
  calculateAgendaItemResult: (getMeeting: (id: string) => Meeting | undefined, meetingId: string, agendaItemId: string) => {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    totalVotes: number;
    percentFor: number;
    isApproved: boolean;
    thresholdMet: boolean;
  };

  calculateMeetingQuorum: (getMeeting: (id: string) => Meeting | undefined, meetingId: string) => {
    participated: number;
    total: number;
    percent: number;
    quorumReached: boolean;
  };

  // Voting units
  fetchVotingUnitsByBuilding: (buildingId: string) => Promise<void>;
  addVotingUnit: (unit: Omit<VotingUnit, 'id'>) => Promise<VotingUnit>;
  updateVotingUnit: (id: string, data: Partial<VotingUnit>) => Promise<void>;
  getVotingUnitsByBuilding: (buildingId: string) => VotingUnit[];
  getVotingUnitByOwner: (ownerId: string) => VotingUnit | undefined;
  verifyVotingUnit: (id: string, verifiedBy: string) => Promise<void>;

  // Audit & Evidence
  getVoteRecordsForMeeting: (meetingId: string) => VoteRecord[];
  fetchVoteRecordsForMeeting: (meetingId: string) => Promise<VoteRecord[]>;
}

// ============ Store Implementation ============

export const useMeetingVotingStore = create<MeetingVotingState>()(
  (set, get) => ({
    voteRecords: [],
    otpRecords: [],
    votingUnits: [],

    // ========== Schedule Voting ==========

    voteForSchedule: async (meetingId, optionId, refetchMeetings) => {
      try {
        const response = await meetingScheduleVotesApi.vote(meetingId, optionId);
        // Was: `return { success: true }` unconditionally — that masked
        // every server-side failure (e.g. the INSERT 500 that dropped the
        // vote) and showed the user a false "Голос принят!". Surface the
        // real result so the modal can show the error toast instead.
        if (!response.success) {
          return {
            success: false,
            error: response.error || 'Не удалось проголосовать. Проверьте что указана площадь квартиры.',
          };
        }
        // Refetch meetings to get accurate vote counts from server.
        await refetchMeetings();
        return { success: true };
      } catch (err: unknown) {
        console.error('Failed to vote for schedule:', err);
        const errorMessage = err instanceof Error ? err.message : 'Не удалось проголосовать. Проверьте что указана площадь квартиры.';
        return { success: false, error: errorMessage };
      }
    },

    getScheduleVoteByUser: async (meetingId) => {
      try {
        const response = await meetingScheduleVotesApi.getMyVote(meetingId);
        if (response.success && response.data) {
          return response.data.optionId || null;
        }
        return null;
      } catch (error) {
        console.error('Failed to get schedule vote:', error);
        return null;
      }
    },

    // ========== Agenda Voting ==========

    voteOnAgendaItem: async (meetingId, agendaItemId, voterId, voterName, choice, verificationData, comment, counterProposal, updateMeetingParticipation) => {
      try {
        // Validate choice - API only accepts 'for', 'against', 'abstain'
        if (choice === 'not_voted') {
          throw new Error('Cannot submit "not_voted" as a vote choice');
        }

        // Map verification method to API format
        const apiMethod = verificationData.method === 'otp' ? 'otp' :
                         verificationData.method === 'in_person' ? 'in_person' :
                         verificationData.method === 'proxy' ? 'proxy' : 'login';

        const response = await meetingAgendaVotesApi.vote(meetingId, agendaItemId, {
          voterId,
          voterName,
          choice: choice as 'for' | 'against' | 'abstain',
          verificationMethod: apiMethod,
          otpVerified: verificationData.otpVerified,
          apartmentId: verificationData.apartmentId,
          apartmentNumber: verificationData.apartmentNumber,
          ownershipShare: verificationData.ownershipShare,
          comment,
          counter_proposal: counterProposal,
        });

        if (!response.success) {
          throw new Error(response.error || 'Ошибка при голосовании');
        }

        // Create a temporary vote record based on the response
        const voteRecord: VoteRecord = {
          id: crypto.randomUUID(),
          meetingId,
          agendaItemId,
          voterId,
          voterName,
          choice,
          verificationMethod: apiMethod,
          otpVerified: verificationData.otpVerified,
          apartmentId: verificationData.apartmentId,
          apartmentNumber: verificationData.apartmentNumber,
          ownershipShare: verificationData.ownershipShare,
          votedAt: new Date().toISOString(),
          voteHash: isRecord(response.data) && typeof response.data.voteHash === 'string'
            ? response.data.voteHash
            : '',
          isRevote: false,
        };

        set((state) => ({
          voteRecords: [...state.voteRecords, voteRecord],
        }));

        // Update meeting's participatedVoters in parent store
        if (updateMeetingParticipation) {
          updateMeetingParticipation(meetingId, voterId);
        }

        return voteRecord;
      } catch (error) {
        console.error('Failed to vote on agenda item:', error);
        throw error;
      }
    },

    getVoteByUser: (meetingId, agendaItemId, voterId) => {
      return get().voteRecords
        .filter(v => v.meetingId === meetingId && v.agendaItemId === agendaItemId && v.voterId === voterId)
        .sort((a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime())[0];
    },

    getUserVotesForMeeting: async (meetingId: string) => {
      try {
        const response = await meetingAgendaVotesApi.getMyVotes(meetingId);
        if (response.success && response.data) {
          const votes = Array.isArray(response.data)
            ? response.data.filter(isVoteRecordApiData).map(mapVoteRecordFromApi)
            : [];

          // Update store with fetched votes (merge with existing, avoiding duplicates)
          set((state) => {
            const existingIds = new Set(state.voteRecords.map(v => v.id));
            const newVotes = votes.filter(v => !existingIds.has(v.id));
            return {
              voteRecords: [...state.voteRecords, ...newVotes]
            };
          });

          return votes;
        }
        return [];
      } catch (error) {
        console.error('Failed to get user votes:', error);
        return [];
      }
    },

    // ========== OTP Management ==========

    requestOTP: async (userId, phone, purpose, meetingId, agendaItemId) => {
      try {
        // Map purpose to API format
        const apiPurpose = purpose === 'meeting_vote' ? 'agenda_vote' : purpose;
        const response = await meetingOtpApi.request({
          userId, phone,
          purpose: apiPurpose as 'schedule_vote' | 'agenda_vote' | 'protocol_sign',
          meetingId, agendaItemId
        });
        if (response.success && isOTPRequestApiData(response.data)) {
          const otpRecord: OTPRecord = {
            id: response.data.otpId,
            userId,
            phone,
            code: '',
            purpose,
            meetingId,
            agendaItemId,
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date().toISOString(),
            expiresAt: response.data.expiresAt,
            isUsed: false,
          };
          set((state) => ({ otpRecords: [...state.otpRecords, otpRecord] }));
          return otpRecord;
        }
        throw new Error('Failed to request OTP');
      } catch (error) {
        console.error('Failed to request OTP:', error);
        throw error;
      }
    },

    verifyOTP: async (otpId, code) => {
      try {
        const response = await meetingOtpApi.verify(otpId, code);
        if (response.success && response.data?.verified) {
          set((state) => ({
            otpRecords: state.otpRecords.map(o =>
              o.id === otpId ? { ...o, isUsed: true, verifiedAt: new Date().toISOString() } : o
            )
          }));
          return true;
        }
        // Update attempts on failed verify
        set((state) => ({
          otpRecords: state.otpRecords.map(o =>
            o.id === otpId ? { ...o, attempts: o.attempts + 1 } : o
          )
        }));
        return false;
      } catch (error) {
        console.error('Failed to verify OTP:', error);
        return false;
      }
    },

    getActiveOTP: (userId, purpose) => {
      const now = new Date();
      return get().otpRecords.find(
        o =>
          o.userId === userId &&
          o.purpose === purpose &&
          !o.isUsed &&
          new Date(o.expiresAt) > now &&
          o.attempts < o.maxAttempts
      );
    },

    // ========== Results Calculation ==========

    calculateAgendaItemResult: (getMeeting, meetingId, agendaItemId) => {
      const meeting = getMeeting(meetingId);
      if (!meeting) {
        return {
          votesFor: 0, votesAgainst: 0, votesAbstain: 0,
          totalVotes: 0, percentFor: 0, isApproved: false, thresholdMet: false,
        };
      }

      const item = meeting.agendaItems.find(i => i.id === agendaItemId);
      if (!item) {
        return {
          votesFor: 0, votesAgainst: 0, votesAbstain: 0,
          totalVotes: 0, percentFor: 0, isApproved: false, thresholdMet: false,
        };
      }

      // votesFor/Against/Abstain are now numbers (area in sq.m), not arrays
      const votesFor = typeof item.votesFor === 'number' ? item.votesFor : (item.votesFor as unknown as unknown[] | undefined)?.length || 0;
      const votesAgainst = typeof item.votesAgainst === 'number' ? item.votesAgainst : (item.votesAgainst as unknown as unknown[] | undefined)?.length || 0;
      const votesAbstain = typeof item.votesAbstain === 'number' ? item.votesAbstain : (item.votesAbstain as unknown as unknown[] | undefined)?.length || 0;
      const totalVotes = votesFor + votesAgainst + votesAbstain;

      const percentFor = totalVotes > 0 ? (votesFor / totalVotes) * 100 : 0;

      const thresholdPercent = {
        simple_majority: 50,
        qualified_majority: 60,
        two_thirds: 66.67,
        three_quarters: 75,
        unanimous: 100,
      }[item.threshold];

      const thresholdMet = percentFor > thresholdPercent;
      const isApproved = thresholdMet && meeting.quorumReached;

      return {
        votesFor, votesAgainst, votesAbstain,
        totalVotes, percentFor, isApproved, thresholdMet,
      };
    },

    calculateMeetingQuorum: (getMeeting, meetingId) => {
      const meeting = getMeeting(meetingId);
      if (!meeting) {
        return { participated: 0, total: 0, percent: 0, quorumReached: false };
      }

      // Deduplicate participatedVoters (table may have duplicates without UNIQUE constraint)
      const uniqueVoters = new Set(meeting.participatedVoters || []);
      const participated = uniqueVoters.size;
      const total = meeting.totalEligibleCount || meeting.eligibleVoters?.length || 0;
      // Use server-provided area-based participationPercent if available,
      // otherwise fall back to count-based calculation (capped at 100%)
      const percent = meeting.participationPercent > 0
        ? Math.min(meeting.participationPercent, 100)
        : total > 0 ? Math.min((participated / total) * 100, 100) : 0;
      const quorumPercent = meeting.votingSettings?.quorumPercent || 50;
      const quorumReached = meeting.quorumReached ?? (percent >= quorumPercent);

      return { participated, total, percent, quorumReached };
    },

    // ========== Voting Units ==========

    fetchVotingUnitsByBuilding: async (buildingId) => {
      try {
        const response = await meetingVotingUnitsApi.getByBuilding(buildingId);
        if (response.success && response.data) {
          const newUnits = Array.isArray(response.data)
            ? response.data.filter(isVotingUnitApiData).map(mapVotingUnitFromApi)
            : [];
          set((state) => {
            const otherUnits = state.votingUnits.filter(u => u.buildingId !== buildingId);
            return { votingUnits: [...otherUnits, ...newUnits] };
          });
        }
      } catch (error) {
        // Sprint 81: was silent. Manager opened the wizard and saw nothing
        // — couldn't tell if there were no units or if the fetch failed.
        console.error('Failed to fetch voting units:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Не удалось загрузить голосующих');
        throw error;
      }
    },

    addVotingUnit: async (unit) => {
      try {
        const response = await meetingVotingUnitsApi.create({
          buildingId: unit.buildingId,
          apartmentId: unit.apartmentId,
          apartmentNumber: unit.apartmentNumber,
          totalArea: unit.totalArea,
          ownershipShare: unit.ownershipShare,
          ownerId: unit.ownerId,
          ownerName: unit.ownerName,
          coOwnerIds: unit.coOwnerIds || [],
        });
        if (response.success && isVotingUnitApiData(response.data)) {
          const votingUnit = mapVotingUnitFromApi(response.data);
          set((state) => ({ votingUnits: [...state.votingUnits, votingUnit] }));
          return votingUnit;
        }
        // Sprint 81: surface response.error if API returned !success.
        const msg = (response as { error?: string }).error || 'Failed to create voting unit';
        useToastStore.getState().addToast('error', msg);
        throw new Error(msg);
      } catch (error) {
        console.error('Failed to add voting unit:', error);
        // toast only once — addToast above already handled the non-throw branch
        if (!(error instanceof Error && error.message === 'Failed to create voting unit')) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Не удалось добавить голосующего');
        }
        throw error;
      }
    },

    updateVotingUnit: async (id, data) => {
      // This would require a PATCH endpoint - for now, use local update
      set((state) => ({
        votingUnits: state.votingUnits.map(u => u.id === id ? { ...u, ...data } : u)
      }));
    },

    getVotingUnitsByBuilding: (buildingId) => {
      return get().votingUnits.filter(u => u.buildingId === buildingId);
    },

    getVotingUnitByOwner: (ownerId) => {
      return get().votingUnits.find(
        u => u.ownerId === ownerId || u.coOwnerIds?.includes(ownerId)
      );
    },

    verifyVotingUnit: async (id, verifiedBy) => {
      // Sprint 80 P0 #2: was silently swallowing. Voting unit stayed
      // unverified on server but UI showed no error. Now: toast + throw.
      try {
        const response = await meetingVotingUnitsApi.verify(id, verifiedBy);
        if (response.success && isVotingUnitApiData(response.data)) {
          const votingUnit = mapVotingUnitFromApi(response.data);
          set((state) => ({
            votingUnits: state.votingUnits.map(u => u.id === id ? votingUnit : u)
          }));
        } else {
          const msg = response.error || 'Failed to verify voting unit';
          useToastStore.getState().addToast('error', msg);
          throw new Error(msg);
        }
      } catch (error) {
        console.error('Failed to verify voting unit:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Не удалось верифицировать голосующего');
        throw error;
      }
    },

    // ========== Audit & Evidence ==========

    getVoteRecordsForMeeting: (meetingId) => {
      return get().voteRecords.filter(v => v.meetingId === meetingId);
    },

    fetchVoteRecordsForMeeting: async (meetingId) => {
      // Sprint 80 P0 #3: was silently returning [] on failure — protocol
      // UI then displayed "no votes" identically to a successful fetch
      // that genuinely had zero votes. Surface the error via toast so
      // managers know to retry rather than ship a blank protocol.
      try {
        const response = await meetingAgendaVotesApi.getVoteRecords(meetingId);
        if (response.success && response.data) {
          const records = Array.isArray(response.data)
            ? response.data.filter(isVoteRecordApiData).map(mapVoteRecordFromApi)
            : [];
          set((state) => {
            const otherRecords = state.voteRecords.filter(v => v.meetingId !== meetingId);
            return { voteRecords: [...otherRecords, ...records] };
          });
          return records;
        }
        return [];
      } catch (error) {
        console.error('Failed to fetch vote records:', error);
        useToastStore.getState().addToast('error', (error as Error).message || 'Не удалось загрузить голоса');
        throw error;
      }
    },
  })
);

registerSessionStore(useMeetingVotingStore);
