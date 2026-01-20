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
  meetingScheduleVotesApi,
  meetingAgendaVotesApi,
  meetingOtpApi,
  meetingBuildingSettingsApi,
  meetingVotingUnitsApi,
  meetingEligibleVotersApi,
  meetingReconsiderationApi,
} from '../services/api';

// ============ Mappers: snake_case (API) <-> camelCase (Frontend) ============

const mapMeetingFromApi = (data: any): Meeting => {
  // Helper to safely parse JSON or return as-is if already parsed
  const parseJson = (value: any, defaultValue: any = []) => {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return defaultValue; }
    }
    return value; // Already an object/array
  };

  // Map agenda items from snake_case to camelCase
  const mapAgendaItem = (item: any) => ({
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
  const mapScheduleOption = (opt: any) => ({
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
    participatedVoters: parseJson(data.participated_voters || data.participatedVoters, []),
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

interface VoteRecordApiData {
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

const mapVoteRecordFromApi = (data: VoteRecordApiData): VoteRecord => ({
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

interface OTPRecordApiData {
  id: string;
  user_id: string;
  phone: string;
  code: string;
  purpose: OTPRecord['purpose'];
  meeting_id?: string;
  agenda_item_id?: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  expires_at: string;
  is_used: number;
  verified_at?: string;
}

const mapOTPRecordFromApi = (data: OTPRecordApiData): OTPRecord => ({
  id: data.id,
  userId: data.user_id,
  phone: data.phone,
  code: data.code,
  purpose: data.purpose,
  meetingId: data.meeting_id,
  agendaItemId: data.agenda_item_id,
  attempts: data.attempts,
  maxAttempts: data.max_attempts,
  createdAt: data.created_at,
  expiresAt: data.expires_at,
  isUsed: Boolean(data.is_used),
  verifiedAt: data.verified_at,
});

interface VotingUnitApiData {
  id: string;
  building_id: string;
  apartment_id?: string;
  apartment_number: string;
  total_area: number;
  ownership_share: number;
  owner_id: string;
  owner_name: string;
  co_owner_ids: string;
  is_verified: number;
  verified_at?: string;
  verified_by?: string;
}

const mapVotingUnitFromApi = (data: VotingUnitApiData): VotingUnit => ({
  id: data.id,
  buildingId: data.building_id,
  apartmentId: data.apartment_id,
  apartmentNumber: data.apartment_number,
  totalArea: data.total_area,
  ownershipShare: data.ownership_share,
  ownerId: data.owner_id,
  ownerName: data.owner_name,
  coOwnerIds: JSON.parse(data.co_owner_ids || '[]'),
  isVerified: Boolean(data.is_verified),
  verifiedAt: data.verified_at,
  verifiedBy: data.verified_by,
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
    comment?: string // Комментарий/обоснование к голосу
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

// Types for Vote Reconsideration
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

// ============ Store Implementation ============

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      meetings: [],
      voteRecords: [],
      protocols: [],
      otpRecords: [],
      votingUnits: [],
      buildingSettings: [],
      loading: false,
      error: null,

      // ========== Data Fetching ==========

      fetchMeetings: async () => {
        set({ loading: true, error: null });
        try {
          // ✅ OPTIMIZED: Fetch only active meetings (reduces payload by ~90%)
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
              // Update only meetings for this building
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

      fetchVotingUnitsByBuilding: async (buildingId) => {
        try {
          const response = await meetingVotingUnitsApi.getByBuilding(buildingId);
          if (response.success && response.data) {
            const newUnits = Array.isArray(response.data) ? response.data.map(mapVotingUnitFromApi) : [];
            set((state) => {
              const otherUnits = state.votingUnits.filter(u => u.buildingId !== buildingId);
              return { votingUnits: [...otherUnits, ...newUnits] };
            });
          }
        } catch (error) {
          console.error('Failed to fetch voting units:', error);
        }
      },

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
          // Convert camelCase to snake_case for API
          const apiData: Record<string, unknown> = {};
          if (data.location !== undefined) apiData.location = data.location;
          if (data.agendaItems !== undefined) apiData.agenda_items = JSON.stringify(data.agendaItems);
          if (data.materials !== undefined) apiData.materials = JSON.stringify(data.materials);
          if (data.votingSettings !== undefined) apiData.voting_settings = JSON.stringify(data.votingSettings);

          const response = await meetingsFullApi.update(id, apiData);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === id ? meeting : m),
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
            voteRecords: state.voteRecords.filter(v => v.meetingId !== id),
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
          // Check status first
          if (!['schedule_poll_open', 'schedule_confirmed', 'voting_open'].includes(m.status)) {
            return false;
          }

          // If eligibleVoters is empty, it means all residents of the building are eligible (general meeting)
          // In this case, we can't filter by eligibleVoters, so we just show all active meetings
          if (m.eligibleVoters.length === 0) {
            return true;
          }

          // If eligibleVoters has entries, check if user is in the list
          return m.eligibleVoters.includes(userId);
        });
      },

      // ========== Status Transitions ==========

      submitForModeration: async (meetingId) => {
        try {
          const response = await meetingsFullApi.submit(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to submit for moderation:', error);
        }
      },

      approveMeeting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.approve(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to approve meeting:', error);
        }
      },

      rejectMeeting: async (meetingId, reason) => {
        try {
          const response = await meetingsFullApi.reject(meetingId, reason);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to reject meeting:', error);
        }
      },

      openSchedulePoll: async (meetingId) => {
        try {
          const response = await meetingsFullApi.openSchedulePoll(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to open schedule poll:', error);
        }
      },

      confirmSchedule: async (meetingId, selectedOptionId) => {
        try {
          const response = await meetingsFullApi.confirmSchedule(meetingId, selectedOptionId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to confirm schedule:', error);
        }
      },

      openVoting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.openVoting(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to open voting:', error);
        }
      },

      closeVoting: async (meetingId) => {
        try {
          const response = await meetingsFullApi.closeVoting(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to close voting:', error);
        }
      },

      publishResults: async (meetingId) => {
        try {
          const response = await meetingsFullApi.publishResults(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to publish results:', error);
        }
      },

      generateProtocol: async (meetingId) => {
        try {
          const response = await meetingsFullApi.generateProtocol(meetingId);
          if (response.success && response.data) {
            const protocol = mapProtocolFromApi(response.data);
            set((state) => ({
              protocols: [...state.protocols, protocol]
            }));
            return protocol;
          }
          throw new Error('Failed to generate protocol');
        } catch (error) {
          console.error('Failed to generate protocol:', error);
          throw error;
        }
      },

      approveProtocol: async (meetingId) => {
        try {
          const response = await meetingsFullApi.approveProtocol(meetingId);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to approve protocol:', error);
        }
      },

      cancelMeeting: async (meetingId, reason) => {
        try {
          const response = await meetingsFullApi.cancel(meetingId, reason);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to cancel meeting:', error);
        }
      },

      // ========== Schedule Voting ==========

      voteForSchedule: async (meetingId, optionId) => {
        try {
          const response = await meetingScheduleVotesApi.vote(meetingId, optionId);
          if (response.success) {
            // Refetch meetings to get accurate vote counts from server
            await get().fetchMeetings();
          }
          return { success: true };
        } catch (error: any) {
          console.error('Failed to vote for schedule:', error);
          const errorMessage = error?.message || 'Не удалось проголосовать. Проверьте что указана площадь квартиры.';
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

      voteOnAgendaItem: async (meetingId, agendaItemId, voterId, voterName, choice, verificationData, comment) => {
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
            comment, // Комментарий к голосу
          });

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
            voteHash: response.data?.voteHash || '',
            isRevote: false,
          };

          set((state) => ({
            voteRecords: [...state.voteRecords, voteRecord],
            // Also update the meeting's participatedVoters list locally
            meetings: state.meetings.map(m => {
              if (m.id === meetingId && !m.participatedVoters.includes(voterId)) {
                return {
                  ...m,
                  participatedVoters: [...m.participatedVoters, voterId]
                };
              }
              return m;
            })
          }));

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
            const votes = (response.data as any[]).map(mapVoteRecordFromApi);

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
          if (response.success && response.data) {
            const otpRecord = mapOTPRecordFromApi(response.data);
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

      calculateAgendaItemResult: (meetingId, agendaItemId) => {
        const meeting = get().getMeeting(meetingId);
        if (!meeting) {
          return {
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            totalVotes: 0,
            percentFor: 0,
            isApproved: false,
            thresholdMet: false,
          };
        }

        const item = meeting.agendaItems.find(i => i.id === agendaItemId);
        if (!item) {
          return {
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            totalVotes: 0,
            percentFor: 0,
            isApproved: false,
            thresholdMet: false,
          };
        }

        // votesFor/Against/Abstain are now numbers (area in sq.m), not arrays
        const votesFor = typeof item.votesFor === 'number' ? item.votesFor : (item.votesFor as any)?.length || 0;
        const votesAgainst = typeof item.votesAgainst === 'number' ? item.votesAgainst : (item.votesAgainst as any)?.length || 0;
        const votesAbstain = typeof item.votesAbstain === 'number' ? item.votesAbstain : (item.votesAbstain as any)?.length || 0;
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
          votesFor,
          votesAgainst,
          votesAbstain,
          totalVotes,
          percentFor,
          isApproved,
          thresholdMet,
        };
      },

      calculateMeetingQuorum: (meetingId) => {
        const meeting = get().getMeeting(meetingId);
        if (!meeting) {
          return { participated: 0, total: 0, percent: 0, quorumReached: false };
        }

        const participated = meeting.participatedVoters?.length || 0;
        const total = meeting.totalEligibleCount || meeting.eligibleVoters?.length || 0;
        const percent = total > 0 ? (participated / total) * 100 : 0;
        // Use quorumReached from server if available, otherwise calculate from votingSettings
        const quorumPercent = meeting.votingSettings?.quorumPercent || 50;
        const quorumReached = meeting.quorumReached ?? (percent >= quorumPercent);

        return { participated, total, percent, quorumReached };
      },

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
          // Convert to API format
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

      // ========== Voting Units ==========

      addVotingUnit: async (unit) => {
        try {
          // API already handles camelCase -> snake_case conversion
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
          if (response.success && response.data) {
            const votingUnit = mapVotingUnitFromApi(response.data);
            set((state) => ({ votingUnits: [...state.votingUnits, votingUnit] }));
            return votingUnit;
          }
          throw new Error('Failed to create voting unit');
        } catch (error) {
          console.error('Failed to add voting unit:', error);
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
        try {
          const response = await meetingVotingUnitsApi.verify(id, verifiedBy);
          if (response.success && response.data) {
            const votingUnit = mapVotingUnitFromApi(response.data);
            set((state) => ({
              votingUnits: state.votingUnits.map(u => u.id === id ? votingUnit : u)
            }));
          }
        } catch (error) {
          console.error('Failed to verify voting unit:', error);
        }
      },

      // ========== Eligible Voters ==========

      setEligibleVoters: async (meetingId, voterIds, totalCount) => {
        try {
          const response = await meetingEligibleVotersApi.set(meetingId, voterIds, totalCount);
          if (response.success && response.data) {
            const meeting = mapMeetingFromApi(response.data);
            set((state) => ({
              meetings: state.meetings.map(m => m.id === meetingId ? meeting : m)
            }));
          }
        } catch (error) {
          console.error('Failed to set eligible voters:', error);
        }
      },

      // ========== Audit & Evidence ==========

      getVoteRecordsForMeeting: (meetingId) => {
        return get().voteRecords.filter(v => v.meetingId === meetingId);
      },

      fetchVoteRecordsForMeeting: async (meetingId) => {
        try {
          const response = await meetingAgendaVotesApi.getVoteRecords(meetingId);
          if (response.success && response.data) {
            const dataArray = Array.isArray(response.data) ? response.data : [];
            const records = dataArray.map(mapVoteRecordFromApi);
            // Merge with existing records
            set((state) => {
              const otherRecords = state.voteRecords.filter(v => v.meetingId !== meetingId);
              return { voteRecords: [...otherRecords, ...records] };
            });
            return records;
          }
          return [];
        } catch (error) {
          console.error('Failed to fetch vote records:', error);
          return [];
        }
      },

      generateEvidenceReport: (meetingId) => {
        const meeting = get().getMeeting(meetingId);
        if (!meeting) throw new Error('Meeting not found');

        const votes = get().getVoteRecordsForMeeting(meetingId);
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

      // ========== Vote Reconsideration Requests ==========

      fetchAgainstVotes: async (meetingId, agendaItemId) => {
        try {
          const response = await meetingReconsiderationApi.getAgainstVotes(meetingId, agendaItemId);
          if (response.success && response.data) {
            // Map from snake_case to camelCase
            return response.data.map((v: any) => ({
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
        } catch (error: any) {
          console.error('Failed to send reconsideration request:', error);
          return { success: false, error: error?.message || 'Network error' };
        }
      },

      fetchMyReconsiderationRequests: async () => {
        try {
          const response = await meetingReconsiderationApi.getMyRequests();
          if (response.success && response.data) {
            // Map from snake_case to camelCase
            return response.data.map((r: any) => ({
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
