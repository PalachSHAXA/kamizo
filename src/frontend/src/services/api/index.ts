// Barrel re-export for all API modules

// Core client infrastructure
export { apiRequest, invalidateCache, cachedGet, apiRequestWrapped, transformUser, CACHE_TTL, API_URL, getToken } from './client';
export type { ApiResponse } from './client';

// Auth
export { authApi } from './auth';

// Users & Team
export { usersApi, teamApi } from './users';

// Vehicles & Rentals
export { vehiclesApi, rentalsApi } from './vehicles';

// Guest Codes
export { guestCodesApi } from './guests';

// Chat
export { chatApi } from './chat';

// Announcements & Upload
export { announcementsApi, uploadApi } from './announcements';

// Buildings, Branches, Entrances, Building Documents, Apartments (CRM)
export { buildingsApi, branchesApi, entrancesApi, buildingDocumentsApi, apartmentsApi } from './buildings';

// CRM: Owners, Personal Accounts, Residents, Meters, Meter Readings
export { ownersApi, personalAccountsApi, crmResidentsApi, metersApi, meterReadingsApi } from './crm';

// Executors
export { executorsApi } from './executors';

// Requests, Reschedule, Ratings, UK Ratings, Categories, Stats, Work Orders
export { requestsApi, rescheduleApi, ratingsApi, ukRatingsApi, categoriesApi, statsApi, workOrdersApi } from './requests';

// Meetings (simple + full OSS workflow + all sub-APIs)
export {
  meetingsApi,
  meetingsFullApi,
  meetingScheduleVotesApi,
  meetingAgendaVotesApi,
  meetingReconsiderationApi,
  meetingOtpApi,
  meetingBuildingSettingsApi,
  meetingVotingUnitsApi,
  meetingEligibleVotersApi,
  meetingAgendaCommentsApi,
} from './meetings';

// Training system
export {
  trainingPartnersApi,
  trainingProposalsApi,
  trainingVotesApi,
  trainingRegistrationsApi,
  trainingFeedbackApi,
  trainingNotificationsApi,
  trainingSettingsApi,
  trainingStatsApi,
} from './training';

// Payments
export { paymentsApi } from './payments';

// Settings, Notifications, Tenant
export { settingsApi, notificationsApi, tenantApi } from './settings';
export type { AppSettings, Notification } from './settings';
