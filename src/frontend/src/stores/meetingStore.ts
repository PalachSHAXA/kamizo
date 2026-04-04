/**
 * meetingStore.ts — FACADE store for meetings
 *
 * This is the PUBLIC interface consumed by all components.
 * Internally delegates to sub-stores:
 *   - meetingVotingStore.ts — voting, OTP, vote records, results, voting units
 *   - meetingReconsiderationStore.ts — reconsideration requests & stats
 *
 * The MeetingState interface and useMeetingStore export are IDENTICAL
 * to the original monolith — no consumer changes needed.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Meeting,
  MeetingFormat,
  MeetingOrganizerType,
  AgendaItem,
  VoteRecord,
  VoteChoice,
  MeetingProtocol,
  OTPRecord,
  VotingUnit,
  BuildingMeetingSettings,
} from '../types';
import {
  meetingsFullApi,
  meetingBuildingSettingsApi,
  meetingEligibleVotersApi,
} from '../services/api';
import { useToastStore } from './toastStore';
import { useMeetingVotingStore } from './meetingVotingStore';
import { useMeetingReconsiderationStore } from './meetingReconsiderationStore';

// Re-export types for backward compatibility
export type { AgainstVote, ReconsiderationRequest, ReconsiderationStats } from './meetingReconsiderationStore';

// ============ Mappers: snake_case (API) <-> camelCase (Frontend) ============

const mapMeetingFromApi = (data: Record<string, unknown>): Meeting => {
  // Helper to safely parse JSON or return as-is if already parsed
  const parseJson = (value: unknown, defaultValue: unknown = []) => {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return defaultValue; }
    }
    return value; // Already an object/array
  };

  // Map agenda items from snake_case to camelCase
  const mapAgendaItem = (item: Record<string, unknown>) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    threshold: item.threshold,
    votesFor: item.votes_for_area || item.votesFor || 0,
    votesAgainst: item.votes_against_area || item.votesAgainst || 0,
    votesAbstain: item.votes_abstain_area || item.votesAbstain || 0,
    order: item.item_order || item.order || 0,
    isApproved: item.is_approved,
    decision: item.decision,
    materials: parseJson(item.materials, []),
  });

  // Map schedule options from snake_case to camelCase
  const mapScheduleOption = (opt: Record<string, unknown>) => ({
    id: opt.id,
    dateTime: opt.date_time || opt.dateTime,
    votesByShare: opt.vote_weight || opt.voteWeight || opt.votes_by_share || opt.votesByShare || 0,
    voteWeight: opt.vote_weight || opt.voteWeight || 0,
    voteCount: opt.vote_count || opt.voteCount || (opt.votes?.length ?? 0),
    voters: opt.voters || [],
    votes: opt.votes || opt.voters || [], // For backward compatibility with UI
  });

  return {
    id: data.id,
    number: data.number,
    buildingId: data.building_id || data.buildingId,
    buildingAddress: data.building_address || data.buildingAddress,
    organizerType: data.organizer_type || data.organizerType,
    organizerId: data.organizer_id || data.organizerId,
    organizerName: data.organizer_name || data.organizerName,
    format: data.format,
    status: data.status,
    scheduleOptions: parseJson(data.schedule_options || data.scheduleOptions, []).map(mapScheduleOption),
    schedulePollEndsAt: data.schedule_poll_ends_at || data.schedulePollEndsAt,
    confirmedDateTime: data.confirmed_date_time || data.confirmedDateTime,
    location: data.location,
    agendaItems: (data.agendaItems || parseJson(data.agenda_items, [])).map(mapAgendaItem),
    materials: parseJson(data.materials, []),
    votingSettings: parseJson(data.voting_settings || data.votingSettings, {}),
    eligibleVoters: parseJson(data.eligible_voters || data.eligibleVoters, []),
    totalEligibleCount: data.total_eligible_count || data.totalEligibleCount || 0,
    participatedVoters: [...new Set(parseJson(data.participated_voters || data.participatedVoters, []))] as string[],
    quorumReached: Boolean(data.quorum_reached || data.quorumReached),
    participationPercent: data.participation_percent || data.participationPercent || 0,
    moderatedAt: data.moderated_at || data.moderatedAt,
    moderationComment: data.moderation_comment || data.moderationComment,
    schedulePollOpenedAt: data.schedule_poll_opened_at || data.schedulePollOpenedAt,
    scheduleConfirmedAt: data.schedule_confirmed_at || data.scheduleConfirmedAt,
    votingOpenedAt: data.voting_opened_at || data.votingOpenedAt,
    votingClosedAt: data.voting_closed_at || data.votingClosedAt,
    resultsPublishedAt: data.results_published_at || data.resultsPublishedAt,
    protocolId: data.protocol_id || data.protocolId,
    protocolGeneratedAt: data.protocol_generated_at || data.protocolGeneratedAt,
    protocolApprovedAt: data.protocol_approved_at || data.protocolApprovedAt,
    cancelledAt: data.cancelled_at || data.cancelledAt,
    cancellationReason: data.cancellation_reason || data.cancellationReason,
    remindersSent: parseJson(data.reminders_sent || data.remindersSent, []),
    notificationLogs: parseJson(data.notification_logs || data.notificationLogs, []),
    createdAt: data.created_at || data.createdAt,
  };
};

// Merge partial API response (base meeting fields) with existing full meeting (preserving sub-data)
const mergeMeetingUpdate = (existing: Meeting, updated: Meeting): Meeting => ({
  ...existing,
  ...updated,
  scheduleOptions: updated.scheduleOptions.length > 0 ? updated.scheduleOptions : existing.scheduleOptions,
  agendaItems: updated.agendaItems.length > 0 ? updated.agendaItems : existing.agendaItems,
  participatedVoters: updated.participatedVoters.length > 0 ? updated.participatedVoters : existing.participatedVoters,
  eligibleVoters: updated.eligibleVoters.length > 0 ? updated.eligibleVoters : existing.eligibleVoters,
  materials: updated.materials.length > 0 ? updated.materials : existing.materials,
});

interface ProtocolApiData {
  id: string;
  meeting_id: string;
  number: string;
  generated_at: string;
  content: string;
  protocol_hash: string;
  signed_by_uk_user_id?: string;
  signed_by_uk_name?: string;
  signed_by_uk_role?: string;
  signed_by_uk_at?: string;
  signed_by_uk_hash?: string;
  attachments: string;
}

const mapProtocolFromApi = (data: ProtocolApiData): MeetingProtocol => ({
  id: data.id,
  meetingId: data.meeting_id,
  number: data.number,
  generatedAt: data.generated_at,
  content: data.content,
  protocolHash: data.protocol_hash,
  signedByUK: data.signed_by_uk_user_id ? {
    userId: data.signed_by_uk_user_id,
    name: data.signed_by_uk_name || '',
    role: data.signed_by_uk_role || '',
    signedAt: data.signed_by_uk_at || '',
    signatureHash: data.signed_by_uk_hash || '',
  } : undefined,
  attachments: JSON.parse(data.attachments || '[]'),
});

interface BuildingSettingsApiData {
  id: string;
  building_id: string;
  voting_unit: BuildingMeetingSettings['votingUnit'];
  default_quorum_percent: number;
  schedule_poll_duration_days: number;
  voting_duration_hours: number;
  allow_resident_initiative: number;
  require_moderation: number;
  default_meeting_time: string;
  reminder_hours_before: string;
  notification_channels: string;
}

const mapBuildingSettingsFromApi = (data: BuildingSettingsApiData): BuildingMeetingSettings => ({
  buildingId: data.building_id,
  votingUnit: data.voting_unit,
  defaultQuorumPercent: data.default_quorum_percent,
  schedulePollDurationDays: data.schedule_poll_duration_days,
  votingDurationHours: data.voting_duration_hours,
  allowResidentInitiative: Boolean(data.allow_resident_initiative),
  requireModeration: Boolean(data.require_moderation),
  defaultMeetingTime: data.default_meeting_time,
  reminderHoursBefore: JSON.parse(data.reminder_hours_before || '[48, 2]'),
  notificationChannels: JSON.parse(data.notification_channels || '["in_app", "push"]'),
});

// Default building meeting settings
const defaultBuildingSettings: Omit<BuildingMeetingSettings, 'buildingId'> = {
  votingUnit: 'apartment',
  defaultQuorumPercent: 50,
  schedulePollDurationDays: 3,
  votingDurationHours: 48,
  allowResidentInitiative: true,
  requireModeration: true,
  defaultMeetingTime: '19:00',
  reminderHoursBefore: [48, 2],
  notificationChannels: ['in_app', 'push'],
};

// ============ Store Interface ============
// IMPORTANT: This interface is the PUBLIC contract. Do NOT change it.

// Import types from sub-stores for use in the interface
import type { AgainstVote, ReconsiderationRequest, ReconsiderationStats } from './meetingReconsiderationStore';

interface MeetingState {
  meetings: Meeting[];
  voteRecords: VoteRecord[];
  protocols: MeetingProtocol[];
  otpRecords: OTPRecord[];
  votingUnits: VotingUnit[];
  buildingSettings: BuildingMeetingSettings[];
  loading: boolean;
  error: string | null;

  // Data fetching
  _silentRefetch: () => Promise<void>;
  fetchMeetings: () => Promise<void>;
  fetchMeetingsByBuilding: (buildingId: string) => Promise<void>;
  fetchVotingUnitsByBuilding: (buildingId: string) => Promise<void>;

  // Meeting CRUD
  createMeeting: (data: {
    buildingId: string;
    buildingAddress: string;
    organizerType: MeetingOrganizerType;
    organizerId: string;
    organizerName: string;
    format: MeetingFormat;
    agendaItems: Omit<AgendaItem, 'id' | 'votesFor' | 'votesAgainst' | 'votesAbstain' | 'order'>[];
    location?: string;
    description?: string;
    meetingTime?: string;
  }) => Promise<Meeting>;

  updateMeeting: (id: string, data: Partial<Meeting>) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;
  getMeeting: (id: string) => Meeting | undefined;
  getMeetingsByBuilding: (buildingId: string) => Meeting[];
  getMeetingsByOrganizer: (organizerId: string) => Meeting[];
  getActiveMeetingsForResident: (userId: string) => Meeting[];

  // Status transitions (state machine)
  submitForModeration: (meetingId: string) => Promise<void>;
  approveMeeting: (meetingId: string) => Promise<void>;
  rejectMeeting: (meetingId: string, reason: string) => Promise<void>;
  openSchedulePoll: (meetingId: string) => Promise<void>;
  confirmSchedule: (meetingId: string, selectedOptionId?: string) => Promise<void>;
  openVoting: (meetingId: string) => Promise<void>;
  closeVoting: (meetingId: string) => Promise<void>;
  publishResults: (meetingId: string) => Promise<void>;
  generateProtocol: (meetingId: string) => Promise<MeetingProtocol>;
  approveProtocol: (meetingId: string) => Promise<void>;
  cancelMeeting: (meetingId: string, reason: string) => Promise<void>;

  // Schedule voting
  voteForSchedule: (meetingId: string, optionId: string) => Promise<{ success: boolean; error?: string }>;
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
    counterProposal?: string
  ) => Promise<VoteRecord>;

  getVoteByUser: (meetingId: string, agendaItemId: string, voterId: string) => VoteRecord | undefined;
  getUserVotesForMeeting: (meetingId: string, voterId: string) => Promise<VoteRecord[]>;

  // OTP Management
  requestOTP: (userId: string, phone: string, purpose: OTPRecord['purpose'], meetingId?: string, agendaItemId?: string) => Promise<OTPRecord>;
  verifyOTP: (otpId: string, code: string) => Promise<boolean>;
  getActiveOTP: (userId: string, purpose: OTPRecord['purpose']) => OTPRecord | undefined;

  // Results calculation (local, based on cached data)
  calculateAgendaItemResult: (meetingId: string, agendaItemId: string) => {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    totalVotes: number;
    percentFor: number;
    isApproved: boolean;
    thresholdMet: boolean;
  };

  calculateMeetingQuorum: (meetingId: string) => {
    participated: number;
    total: number;
    percent: number;
    quorumReached: boolean;
  };

  // Building settings
  getBuildingSettings: (buildingId: string) => BuildingMeetingSettings;
  fetchBuildingSettings: (buildingId: string) => Promise<BuildingMeetingSettings>;
  updateBuildingSettings: (buildingId: string, settings: Partial<BuildingMeetingSettings>) => Promise<void>;

  // Voting units (apartments)
  addVotingUnit: (unit: Omit<VotingUnit, 'id'>) => Promise<VotingUnit>;
  updateVotingUnit: (id: string, data: Partial<VotingUnit>) => Promise<void>;
  getVotingUnitsByBuilding: (buildingId: string) => VotingUnit[];
  getVotingUnitByOwner: (ownerId: string) => VotingUnit | undefined;
  verifyVotingUnit: (id: string, verifiedBy: string) => Promise<void>;

  // Eligible voters
  setEligibleVoters: (meetingId: string, voterIds: string[], totalCount: number) => Promise<void>;

  // Audit & Evidence
  getVoteRecordsForMeeting: (meetingId: string) => VoteRecord[];
  fetchVoteRecordsForMeeting: (meetingId: string) => Promise<VoteRecord[]>;
  generateEvidenceReport: (meetingId: string) => {
    meeting: Meeting;
    votes: VoteRecord[];
    protocol?: MeetingProtocol;
    verificationSummary: {
      totalVotes: number;
      otpVerified: number;
      uniqueVoters: number;
    };
  };

  // Vote Reconsideration Requests
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

// ============ Store Implementation (Facade) ============

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      // State — meetings, protocols, buildingSettings are owned here.
      // voteRecords, otpRecords, votingUnits live in meetingVotingStore;
      // these empty arrays satisfy the MeetingState interface.
      // All actions that read/write them delegate to the voting sub-store.
      meetings: [],
      voteRecords: [],
      protocols: [],
      otpRecords: [],
      votingUnits: [],
      buildingSettings: [],
      loading: false,
      error: null,

      // ========== Data Fetching ==========

      _silentRefetch: async () => {
        try {
          const response = await meetingsFullApi.getAll({ onlyActive: true });
          if (response.success && response.data) {
            const meetings = Array.isArray(response.data) ? response.data.map(mapMeetingFromApi) : [];
            set({ meetings });
          }
        } catch {}
      },

      fetchMeetings: async () => {
        set({ loading: true, error: null });
        try {
          const response = await meetingsFullApi.getAll({ onlyActive: true });
          if (response.success && response.data) {
            const meetings = Array.isArray(response.data) ? response.data.map(mapMeetingFromApi) : [];
            set({ meetings, loading: false });
          } else {
            set({ error: response.error || 'Failed to fetch meetings', loading: false });
          }
        } catch (error) {
          set({ error: 'Network error', loading: false });
        }
      },

      fetchMeetingsByBuilding: async (buildingId) => {
        set({ loading: true, error: null });
        try {
          const response = await meetingsFullApi.getAll({ buildingId });
          if (response.success && response.data) {
            const newMeetings = Array.isArray(response.data) ? response.data.map(mapMeetingFromApi) : [];
            set((state) => {
              const otherMeetings = state.meetings.filter(m => m.buildingId !== buildingId);
              return { meetings: [...otherMeetings, ...newMeetings], loading: false };
            });
          } else {
            set({ error: response.error || 'Failed to fetch meetings', loading: false });
          }
        } catch (error) {
          set({ error: 'Network error', loading: false });
        }
      },

      // Delegate to voting sub-store
      fetchVotingUnitsByBuilding: (buildingId) =>
        useMeetingVotingStore.getState().fetchVotingUnitsByBuilding(buildingId),

      // ========== Meeting CRUD ==========

      createMeeting: async (data) => {
        set({ loading: true, error: null });
        try {
          const response = await meetingsFullApi.create({
            buildingId: data.buildingId,
            buildingAddress: data.buildingAddress,
            organizerType: data.organizerType === 'management' ? 'uk' : data.organizerType,
            format: data.format,
            location: data.location,
            description: data.description,
            meetingTime: data.meetingTime,
            agendaItems: data.agendaItems.map(item => ({
              title: item.title,
              description: item.description,
              threshold: item.threshold,
            })),
          });
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({ meetings: [...state.meetings, meeting], loading: false }));
            return meeting;
          } else {
            set({ error: response.error || 'Failed to create meeting', loading: false });
            throw new Error(response.error || 'Failed to create meeting');
          }
        } catch (error) {
          set({ error: 'Network error', loading: false });
          throw error;
        }
      },

      updateMeeting: async (id, data) => {
        set({ loading: true, error: null });
        try {
          const apiData: Record<string, unknown> = {};
          if (data.location !== undefined) apiData.location = data.location;
          if (data.agendaItems !== undefined) apiData.agenda_items = JSON.stringify(data.agendaItems);
          if (data.materials !== undefined) apiData.materials = JSON.stringify(data.materials);
          if (data.votingSettings !== undefined) apiData.voting_settings = JSON.stringify(data.votingSettings);

          const response = await meetingsFullApi.update(id, apiData);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === id ? mergeMeetingUpdate(m, updated) : m),
              loading: false
            }));
          } else {
            set({ error: response.error || 'Failed to update meeting', loading: false });
          }
        } catch (error) {
          set({ error: 'Network error', loading: false });
        }
      },

      deleteMeeting: async (id) => {
        set({ loading: true, error: null });
        try {
          await meetingsFullApi.delete(id);
          set((state) => ({
            meetings: state.meetings.filter(m => m.id !== id),
            loading: false
          }));
        } catch (error) {
          set({ error: 'Network error', loading: false });
        }
      },

      getMeeting: (id) => {
        return get().meetings.find(m => m.id === id);
      },

      getMeetingsByBuilding: (buildingId) => {
        return get().meetings.filter(m => m.buildingId === buildingId);
      },

      getMeetingsByOrganizer: (organizerId) => {
        return get().meetings.filter(m => m.organizerId === organizerId);
      },

      getActiveMeetingsForResident: (userId) => {
        return get().meetings.filter(m => {
          if (!['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)) {
            return false;
          }
          if (m.eligibleVoters.length === 0) {
            return true;
          }
          return m.eligibleVoters.includes(userId);
        });
      },

      // ========== Status Transitions ==========

      submitForModeration: async (meetingId) => {
        try {
          const response = await meetingsFullApi.submit(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to submit for moderation:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to submit for moderation');
        }
      },

      approveMeeting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.approve(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to approve meeting:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to approve meeting');
        }
      },

      rejectMeeting: async (meetingId, reason) => {
        try {
          const response = await meetingsFullApi.reject(meetingId, reason);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to reject meeting:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to reject meeting');
        }
      },

      openSchedulePoll: async (meetingId) => {
        try {
          const response = await meetingsFullApi.openSchedulePoll(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to open schedule poll:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to open schedule poll');
        }
      },

      confirmSchedule: async (meetingId, selectedOptionId) => {
        try {
          const response = await meetingsFullApi.confirmSchedule(meetingId, selectedOptionId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to confirm schedule:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to confirm schedule');
        }
      },

      openVoting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.openVoting(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to open voting:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to open voting');
        }
      },

      closeVoting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.closeVoting(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to close voting:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to close voting');
        }
      },

      publishResults: async (meetingId) => {
        try {
          const response = await meetingsFullApi.publishResults(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to publish results:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to publish results');
        }
      },

      generateProtocol: async (meetingId) => {
        try {
          const response = await meetingsFullApi.generateProtocol(meetingId);
          if (response.success && response.data) {
            const protocol = mapProtocolFromApi(response.data);
            set((state) => ({
              protocols: [...state.protocols, protocol],
              meetings: state.meetings.map(m =>
                m.id === meetingId ? { ...m, status: 'protocol_generated' as const } : m
              )
            }));
            get()._silentRefetch();
            return protocol;
          }
          throw new Error('Failed to generate protocol');
        } catch (error) {
          console.error('Failed to generate protocol:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to generate protocol');
          throw error;
        }
      },

      approveProtocol: async (meetingId) => {
        try {
          const response = await meetingsFullApi.approveProtocol(meetingId);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to approve protocol:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to approve protocol');
        }
      },

      cancelMeeting: async (meetingId, reason) => {
        try {
          const response = await meetingsFullApi.cancel(meetingId, reason);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
            get()._silentRefetch();
          }
        } catch (error) {
          console.error('Failed to cancel meeting:', error);
          useToastStore.getState().addToast('error', (error as Error).message || 'Failed to cancel meeting');
        }
      },

      // ========== Schedule Voting (delegated) ==========

      voteForSchedule: (meetingId, optionId) =>
        useMeetingVotingStore.getState().voteForSchedule(meetingId, optionId, get().fetchMeetings),

      getScheduleVoteByUser: (meetingId) =>
        useMeetingVotingStore.getState().getScheduleVoteByUser(meetingId),

      // ========== Agenda Voting (delegated) ==========

      voteOnAgendaItem: (meetingId, agendaItemId, voterId, voterName, choice, verificationData, comment, counterProposal) =>
        useMeetingVotingStore.getState().voteOnAgendaItem(
          meetingId, agendaItemId, voterId, voterName, choice, verificationData, comment, counterProposal,
          // Callback to update meeting participation in this store
          (mId, vId) => {
            set((state) => ({
              meetings: state.meetings.map(m => {
                if (m.id === mId && !m.participatedVoters.includes(vId)) {
                  return { ...m, participatedVoters: [...m.participatedVoters, vId] };
                }
                return m;
              })
            }));
          }
        ),

      getVoteByUser: (meetingId, agendaItemId, voterId) =>
        useMeetingVotingStore.getState().getVoteByUser(meetingId, agendaItemId, voterId),

      getUserVotesForMeeting: (meetingId, voterId) =>
        useMeetingVotingStore.getState().getUserVotesForMeeting(meetingId, voterId),

      // ========== OTP Management (delegated) ==========

      requestOTP: (userId, phone, purpose, meetingId, agendaItemId) =>
        useMeetingVotingStore.getState().requestOTP(userId, phone, purpose, meetingId, agendaItemId),

      verifyOTP: (otpId, code) =>
        useMeetingVotingStore.getState().verifyOTP(otpId, code),

      getActiveOTP: (userId, purpose) =>
        useMeetingVotingStore.getState().getActiveOTP(userId, purpose),

      // ========== Results Calculation (delegated) ==========

      calculateAgendaItemResult: (meetingId, agendaItemId) =>
        useMeetingVotingStore.getState().calculateAgendaItemResult(get().getMeeting, meetingId, agendaItemId),

      calculateMeetingQuorum: (meetingId) =>
        useMeetingVotingStore.getState().calculateMeetingQuorum(get().getMeeting, meetingId),

      // ========== Building Settings ==========

      getBuildingSettings: (buildingId) => {
        const existing = get().buildingSettings.find(s => s.buildingId === buildingId);
        if (existing) return existing;
        return { ...defaultBuildingSettings, buildingId };
      },

      fetchBuildingSettings: async (buildingId) => {
        try {
          const response = await meetingBuildingSettingsApi.get(buildingId);
          if (response.success && response.data) {
            const settings = mapBuildingSettingsFromApi(response.data);
            set((state) => {
              const existing = state.buildingSettings.find(s => s.buildingId === buildingId);
              if (existing) {
                return {
                  buildingSettings: state.buildingSettings.map(s =>
                    s.buildingId === buildingId ? settings : s
                  )
                };
              }
              return { buildingSettings: [...state.buildingSettings, settings] };
            });
            return settings;
          }
          return { ...defaultBuildingSettings, buildingId };
        } catch (error) {
          console.error('Failed to fetch building settings:', error);
          return { ...defaultBuildingSettings, buildingId };
        }
      },

      updateBuildingSettings: async (buildingId, settings) => {
        try {
          const apiData: Record<string, unknown> = {};
          if (settings.votingUnit !== undefined) apiData.voting_unit = settings.votingUnit;
          if (settings.defaultQuorumPercent !== undefined) apiData.default_quorum_percent = settings.defaultQuorumPercent;
          if (settings.schedulePollDurationDays !== undefined) apiData.schedule_poll_duration_days = settings.schedulePollDurationDays;
          if (settings.votingDurationHours !== undefined) apiData.voting_duration_hours = settings.votingDurationHours;
          if (settings.allowResidentInitiative !== undefined) apiData.allow_resident_initiative = settings.allowResidentInitiative;
          if (settings.requireModeration !== undefined) apiData.require_moderation = settings.requireModeration;
          if (settings.defaultMeetingTime !== undefined) apiData.default_meeting_time = settings.defaultMeetingTime;
          if (settings.reminderHoursBefore !== undefined) apiData.reminder_hours_before = JSON.stringify(settings.reminderHoursBefore);
          if (settings.notificationChannels !== undefined) apiData.notification_channels = JSON.stringify(settings.notificationChannels);

          const response = await meetingBuildingSettingsApi.update(buildingId, apiData);
          if (response.success && response.data) {
            const updatedSettings = mapBuildingSettingsFromApi(response.data);
            set((state) => {
              const existing = state.buildingSettings.find(s => s.buildingId === buildingId);
              if (existing) {
                return {
                  buildingSettings: state.buildingSettings.map(s =>
                    s.buildingId === buildingId ? updatedSettings : s
                  )
                };
              }
              return { buildingSettings: [...state.buildingSettings, updatedSettings] };
            });
          }
        } catch (error) {
          console.error('Failed to update building settings:', error);
        }
      },

      // ========== Voting Units (delegated) ==========

      addVotingUnit: (unit) =>
        useMeetingVotingStore.getState().addVotingUnit(unit),

      updateVotingUnit: (id, data) =>
        useMeetingVotingStore.getState().updateVotingUnit(id, data),

      getVotingUnitsByBuilding: (buildingId) =>
        useMeetingVotingStore.getState().getVotingUnitsByBuilding(buildingId),

      getVotingUnitByOwner: (ownerId) =>
        useMeetingVotingStore.getState().getVotingUnitByOwner(ownerId),

      verifyVotingUnit: (id, verifiedBy) =>
        useMeetingVotingStore.getState().verifyVotingUnit(id, verifiedBy),

      // ========== Eligible Voters ==========

      setEligibleVoters: async (meetingId, voterIds, totalCount) => {
        try {
          const response = await meetingEligibleVotersApi.set(meetingId, voterIds, totalCount);
          if (response.success && response.data) {
            const updated = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? mergeMeetingUpdate(m, updated) : m)
            }));
          }
        } catch (error) {
          console.error('Failed to set eligible voters:', error);
        }
      },

      // ========== Audit & Evidence (delegated) ==========

      getVoteRecordsForMeeting: (meetingId) =>
        useMeetingVotingStore.getState().getVoteRecordsForMeeting(meetingId),

      fetchVoteRecordsForMeeting: (meetingId) =>
        useMeetingVotingStore.getState().fetchVoteRecordsForMeeting(meetingId),

      generateEvidenceReport: (meetingId) => {
        const meeting = get().getMeeting(meetingId);
        if (!meeting) throw new Error('Meeting not found');

        const votingStore = useMeetingVotingStore.getState();
        const votes = votingStore.getVoteRecordsForMeeting(meetingId);
        const protocol = get().protocols.find(p => p.meetingId === meetingId);

        const uniqueVoters = new Set(votes.map(v => v.voterId)).size;
        const otpVerified = votes.filter(v => v.otpVerified).length;

        return {
          meeting,
          votes,
          protocol,
          verificationSummary: {
            totalVotes: votes.length,
            otpVerified,
            uniqueVoters,
          },
        };
      },

      // ========== Vote Reconsideration (delegated) ==========

      fetchAgainstVotes: (meetingId, agendaItemId) =>
        useMeetingReconsiderationStore.getState().fetchAgainstVotes(meetingId, agendaItemId),

      sendReconsiderationRequest: (meetingId, data) =>
        useMeetingReconsiderationStore.getState().sendReconsiderationRequest(meetingId, data),

      fetchMyReconsiderationRequests: () =>
        useMeetingReconsiderationStore.getState().fetchMyReconsiderationRequests(),

      markReconsiderationRequestViewed: (requestId) =>
        useMeetingReconsiderationStore.getState().markReconsiderationRequestViewed(requestId),

      ignoreReconsiderationRequest: (requestId) =>
        useMeetingReconsiderationStore.getState().ignoreReconsiderationRequest(requestId),

      fetchReconsiderationStats: (meetingId) =>
        useMeetingReconsiderationStore.getState().fetchReconsiderationStats(meetingId),
    }),
    {
      name: 'uk-meeting-storage',
      partialize: (state) => ({
        // Only persist locally cached data for offline support
        otpRecords: state.otpRecords,
        buildingSettings: state.buildingSettings,
      }),
    }
  )
);
