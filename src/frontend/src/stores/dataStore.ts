import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Executor, Request, ChartData, Notification, ActivityLog, CancelledBy, RentalApartment, RentalRecord, Announcement, Vehicle, GuestAccessCode, GuestAccessLog, GuestAccessStats, VisitorType, AccessType, UserRole, RescheduleRequest, RescheduleReason, RescheduleInitiator } from '../types';
import { useAuthStore } from './authStore';
import { requestsApi, executorsApi, vehiclesApi, guestCodesApi, authApi, usersApi, rentalsApi } from '../services/api';
import { pushNotifications } from '../services/pushNotifications';

// Settings interface
interface AppSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  routingMode: 'manual' | 'auto' | 'hybrid';
  workingHoursStart: string;
  workingHoursEnd: string;
  autoAssign: boolean;
  notifyOnNew: boolean;
  notifyOnComplete: boolean;
  notifyOnRating: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

interface DataState {
  executors: Executor[];
  requests: Request[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
  settings: AppSettings;
  rentalApartments: RentalApartment[];
  rentalRecords: RentalRecord[];
  announcements: Announcement[];
  vehicles: Vehicle[];
  guestAccessCodes: GuestAccessCode[];
  guestAccessLogs: GuestAccessLog[];
  rescheduleRequests: RescheduleRequest[];

  // API loading states
  isLoadingRequests: boolean;
  isLoadingExecutors: boolean;
  isLoadingVehicles: boolean;
  isLoadingGuestCodes: boolean;

  // API fetch actions
  fetchRequests: (status?: string, category?: string) => Promise<void>;
  fetchExecutors: (showAll?: boolean) => Promise<void>;
  fetchVehicles: (forStaff?: boolean) => Promise<void>;
  fetchGuestCodes: () => Promise<void>;

  // Guest Access actions
  createGuestAccessCode: (data: {
    residentId: string;
    residentName: string;
    residentPhone: string;
    residentApartment: string;
    residentAddress: string;
    visitorType: VisitorType;
    visitorName?: string;
    visitorPhone?: string;
    visitorVehiclePlate?: string;
    accessType: AccessType;
    validFrom?: string;
    validUntil?: string;
    notes?: string;
  }) => Promise<GuestAccessCode | null>;
  revokeGuestAccessCode: (id: string, revokedBy: string, revokedByName: string, revokedByRole: UserRole, reason: string) => Promise<void>;
  useGuestAccessCode: (id: string, fullCode?: GuestAccessCode) => boolean;
  validateGuestAccessCode: (qrToken: string) => { valid: boolean; code?: GuestAccessCode; error?: string };
  getGuestAccessCodesByResident: (residentId: string) => GuestAccessCode[];
  getAllGuestAccessCodes: () => GuestAccessCode[];
  addGuestAccessLog: (log: Omit<GuestAccessLog, 'id' | 'timestamp'>) => void;
  getGuestAccessLogs: (accessCodeId?: string) => GuestAccessLog[];
  getGuestAccessStats: () => GuestAccessStats;

  // Announcement actions
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'createdAt' | 'isActive' | 'viewedBy'>) => Promise<Announcement | null>;
  updateAnnouncement: (id: string, data: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => Promise<void>;
  markAnnouncementAsViewed: (announcementId: string, userId: string) => void;
  getAnnouncementsForResidents: (userLogin: string, buildingId?: string, entrance?: string, floor?: string, branch?: string) => Announcement[];
  getAnnouncementsForEmployees: () => Announcement[];
  getAnnouncementsByAuthor: (authorId: string) => Announcement[];
  fetchAnnouncements: () => Promise<void>;

  // Vehicle actions
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt'>) => Promise<Vehicle | null>;
  updateVehicle: (id: string, data: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehiclesByOwner: (ownerId: string) => Vehicle[];
  searchVehicleByPlate: (plateNumber: string) => Promise<Vehicle | undefined>;
  searchVehiclesByPlate: (plateNumber: string) => Promise<Vehicle[]>;

  // Rental actions
  fetchRentals: () => Promise<void>;
  fetchMyRentals: () => Promise<void>;  // For tenants/commercial_owners
  addRentalApartment: (apartment: Omit<RentalApartment, 'id' | 'createdAt' | 'isActive'> & { password: string; ownerType?: 'tenant' | 'commercial_owner' }) => Promise<RentalApartment | null>;
  updateRentalApartment: (id: string, data: Partial<RentalApartment>) => Promise<void>;
  deleteRentalApartment: (id: string) => Promise<void>;
  getRentalApartmentsByOwner: (ownerId: string) => RentalApartment[];
  addRentalRecord: (record: Omit<RentalRecord, 'id' | 'createdAt'>) => Promise<RentalRecord | null>;
  updateRentalRecord: (id: string, data: Partial<RentalRecord>) => Promise<void>;
  deleteRentalRecord: (id: string) => Promise<void>;
  getRentalRecordsByApartment: (apartmentId: string) => RentalRecord[];

  // Executor actions
  addExecutor: (executor: Omit<Executor, 'id' | 'createdAt' | 'rating' | 'completedCount' | 'activeRequests' | 'status' | 'totalEarnings' | 'avgCompletionTime'> & { password: string; role?: string }) => Promise<Executor | null>;
  updateExecutor: (id: string, data: Partial<Executor>) => void;
  deleteExecutor: (id: string) => Promise<void>;
  getExecutorStats: (executorId: string) => {
    totalRequests: number;
    completedRequests: number;
    avgRating: number;
    avgTime: number;
    thisWeek: number;
    thisMonth: number;
  };

  // Request actions (API-backed)
  addRequest: (request: Omit<Request, 'id' | 'number' | 'createdAt' | 'status'>) => Promise<Request | null>;
  assignRequest: (requestId: string, executorId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  startWork: (requestId: string) => Promise<void>;
  pauseWork: (requestId: string) => Promise<void>;
  resumeWork: (requestId: string) => Promise<void>;
  completeWork: (requestId: string, workDuration: number) => Promise<void>;
  approveRequest: (requestId: string, rating: number, feedback?: string) => Promise<void>;
  rejectRequest: (requestId: string, reason: string) => Promise<void>;
  cancelRequest: (requestId: string, cancelledBy: CancelledBy, reason: string) => Promise<void>;
  declineRequest: (requestId: string, reason: string) => Promise<void>; // Executor declines assigned request
  getRequestsByResident: (residentId: string) => Request[];
  getRequestsByExecutor: (executorId: string) => Request[];

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: (userId: string) => void;
  getUnreadCount: (userId: string) => number;

  // Activity log
  addActivityLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;

  // Stats
  getStats: () => {
    totalRequests: number;
    newRequests: number;
    inProgress: number;
    pendingApproval: number;
    completedToday: number;
    completedWeek: number;
    avgCompletionTime: number;
    executorsOnline: number;
    executorsTotal: number;
  };
  getChartData: () => ChartData[];

  // Settings actions
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // Reschedule actions
  fetchPendingReschedules: () => Promise<void>;
  createRescheduleRequest: (data: {
    requestId: string;
    proposedDate: string;
    proposedTime: string;
    reason: RescheduleReason;
    reasonText?: string;
  }) => Promise<RescheduleRequest | null>;
  respondToRescheduleRequest: (rescheduleId: string, accepted: boolean, responseNote?: string) => Promise<void>;
  getRescheduleRequestsByRequest: (requestId: string) => RescheduleRequest[];
  getPendingRescheduleForUser: (userId: string) => RescheduleRequest[];
  getActiveRescheduleForRequest: (requestId: string) => RescheduleRequest | undefined;
  getConfirmedRescheduleForRequest: (requestId: string) => RescheduleRequest | undefined;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// Demo QR code for testing
const createDemoGuestAccessCode = (): GuestAccessCode => {
  const now = new Date();
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Valid for 7 days

  return {
    id: 'demo-code-1',
    residentId: 'resident1',
    residentName: 'Иванов Иван Иванович',
    residentPhone: '+998901234567',
    residentApartment: '42',
    residentAddress: 'ул. Мустакиллик, 15',
    visitorType: 'guest' as VisitorType,
    visitorName: 'Демо Гость',
    visitorPhone: '+998901111111',
    accessType: 'week' as AccessType,
    qrToken: 'GA-demo-test-code123',
    status: 'active',
    validFrom: now.toISOString(),
    validUntil: validUntil.toISOString(),
    maxUses: 999,
    currentUses: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

// Default settings
const defaultSettings: AppSettings = {
  companyName: 'ТСЖ Юнусабад',
  companyInn: '305123456',
  companyAddress: 'г. Ташкент, Юнусабадский район',
  companyPhone: '+998 71 123 45 67',
  routingMode: 'hybrid',
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
  autoAssign: true,
  notifyOnNew: true,
  notifyOnComplete: true,
  notifyOnRating: true,
  smsNotifications: false,
  emailNotifications: true,
  pushNotifications: true,
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      executors: [], // Start empty, will be loaded from API
      requests: [], // Start with empty, will be loaded from API
      notifications: [],
      activityLogs: [],
      settings: defaultSettings,
      rentalApartments: [],
      rentalRecords: [],
      announcements: [],
      vehicles: [],
      guestAccessCodes: [createDemoGuestAccessCode()],
      guestAccessLogs: [],
      rescheduleRequests: [],
      isLoadingRequests: false,
      isLoadingExecutors: false,
      isLoadingVehicles: false,
      isLoadingGuestCodes: false,

      // Fetch requests from D1 database via API
      fetchRequests: async (status?: string, category?: string) => {
        set({ isLoadingRequests: true });
        try {
          const response = await requestsApi.getAll(status, category);
          // Map API response to Request type
          const requests = response.requests || [];
          const mappedRequests: Request[] = requests.map((r: any) => ({
            id: r.id,
            // Use prefixed request_number first, then number, then generate from id
            number: r.request_number || r.number || `#${r.id?.substring(0, 6).toUpperCase() || '000000'}`,
            title: r.title,
            description: r.description || '',
            category: r.category_id,
            status: r.status,
            priority: r.priority || 'medium',
            residentId: r.resident_id,
            residentName: r.resident_name || 'Неизвестный',
            residentPhone: r.resident_phone || '',
            address: r.address || '',
            apartment: r.apartment || '',
            executorId: r.executor_id,
            executorName: r.executor_name,
            executorPhone: r.executor_phone,
            accessInfo: r.access_info,
            scheduledDate: r.scheduled_at ? r.scheduled_at.split('T')[0] : undefined,
            scheduledTime: r.scheduled_at ? r.scheduled_at.split('T')[1]?.substring(0, 5) : undefined,
            createdAt: r.created_at,
            assignedAt: r.assigned_at,
            acceptedAt: r.accepted_at,
            startedAt: r.started_at,
            completedAt: r.completed_at,
            approvedAt: r.approved_at,
            rating: r.rating,
            feedback: r.feedback,
            workDuration: r.work_duration,
            buildingId: r.building_id,
            buildingName: r.building_name,
            // Pause fields from DB
            isPaused: r.is_paused === 1 || r.is_paused === true,
            pausedAt: r.paused_at,
            totalPausedTime: r.total_paused_time || 0,
          }));

          // Keep pending/optimistic requests (temp-*) that are still being created
          // This prevents losing requests that haven't been saved to API yet
          set((state) => {
            const pendingRequests = state.requests.filter(r => r.id.startsWith('temp-'));
            // Merge: API data + pending requests (that aren't already in API response)
            const mergedRequests = [
              ...pendingRequests,
              ...mappedRequests.filter(apiReq => !pendingRequests.some(p => p.id === apiReq.id))
            ];
            return { requests: mergedRequests, isLoadingRequests: false };
          });
        } catch (error) {
          console.error('Failed to fetch requests:', error);
          set({ isLoadingRequests: false });
        }
      },

      // Fetch executors from D1 database via API
      fetchExecutors: async (showAll = false) => {
        console.log('[fetchExecutors] Starting fetch... showAll:', showAll);
        set({ isLoadingExecutors: true });
        try {
          const response = await executorsApi.getAll(showAll);
          console.log('[fetchExecutors] API response:', response);
          // Map API response to Executor type
          const mappedExecutors: Executor[] = response.executors.map((e: any) => ({
            id: e.id,
            name: e.name,
            phone: e.phone,
            login: e.login,
            specialization: e.specialization,
            status: e.status || 'offline',
            rating: e.rating || 5.0,
            completedCount: e.completed_count || 0,
            activeRequests: e.active_requests || 0,
            totalEarnings: e.total_earnings || 0,
            avgCompletionTime: e.avg_completion_time || 0,
            createdAt: e.created_at,
          }));
          console.log('[fetchExecutors] Mapped executors:', mappedExecutors);
          set({ executors: mappedExecutors, isLoadingExecutors: false });
        } catch (error) {
          console.error('[fetchExecutors] Failed to fetch executors:', error);
          set({ isLoadingExecutors: false });
        }
      },

      // Fetch vehicles from D1 database via API
      fetchVehicles: async (forStaff = false) => {
        set({ isLoadingVehicles: true });
        try {
          // Use different endpoint based on whether we need all vehicles or just user's own
          const response = forStaff
            ? await vehiclesApi.getAll()  // /api/vehicles/all - all vehicles for staff
            : await vehiclesApi.getMyVehicles();  // /api/vehicles - only user's vehicles
          // Map API response to Vehicle type (API now returns all fields from DB + owner info)
          const mappedVehicles: Vehicle[] = response.vehicles.map((v: any) => ({
            id: v.id,
            ownerId: v.user_id,
            ownerName: v.owner_name || '',
            ownerPhone: v.owner_phone || '',
            apartment: v.apartment || '',
            address: v.address || '',
            plateNumber: v.plate_number,
            brand: v.brand || '',
            model: v.model || '',
            color: v.color || '',
            year: v.year || undefined,
            type: (v.vehicle_type || 'car') as Vehicle['type'],
            ownerType: (v.owner_type || 'individual') as Vehicle['ownerType'],
            companyName: v.company_name || undefined,
            parkingSpot: v.parking_spot || undefined,
            notes: v.notes || undefined,
            createdAt: v.created_at,
            updatedAt: v.updated_at || undefined,
          }));
          set({ vehicles: mappedVehicles, isLoadingVehicles: false });
        } catch (error) {
          console.error('Failed to fetch vehicles:', error);
          set({ isLoadingVehicles: false });
        }
      },

      // Fetch guest codes from D1 database via API
      fetchGuestCodes: async () => {
        set({ isLoadingGuestCodes: true });
        try {
          const response = await guestCodesApi.getAll();
          const codes = response.codes || [];
          const mappedCodes: GuestAccessCode[] = codes.map((c: any) => ({
            id: c.id,
            residentId: c.user_id,
            residentName: c.resident_name || '',
            residentPhone: c.resident_phone || '',
            residentApartment: c.resident_apartment || '',
            residentAddress: c.resident_address || '',
            visitorType: c.visitor_type as VisitorType,
            visitorName: c.visitor_name || undefined,
            visitorPhone: c.visitor_phone || undefined,
            visitorVehiclePlate: c.visitor_vehicle_plate || undefined,
            accessType: c.access_type as AccessType,
            validFrom: c.valid_from,
            validUntil: c.valid_until,
            maxUses: c.max_uses,
            currentUses: c.current_uses || 0,
            qrToken: c.qr_token,
            status: c.status as 'active' | 'used' | 'expired' | 'revoked',
            notes: c.notes || undefined,
            createdAt: c.created_at,
            updatedAt: c.updated_at || undefined,
            revokedAt: c.revoked_at || undefined,
            revokedBy: c.revoked_by || undefined,
            revocationReason: c.revoked_reason || undefined,
          }));
          set({ guestAccessCodes: mappedCodes, isLoadingGuestCodes: false });
        } catch (error) {
          console.error('Failed to fetch guest codes:', error);
          set({ isLoadingGuestCodes: false });
        }
      },

      // Guest Access actions
      createGuestAccessCode: async (data) => {
        try {
          const response = await guestCodesApi.create({
            visitor_type: data.visitorType,
            visitor_name: data.visitorName,
            visitor_phone: data.visitorPhone,
            visitor_vehicle_plate: data.visitorVehiclePlate,
            access_type: data.accessType,
            valid_from: data.validFrom,
            valid_until: data.validUntil,
            resident_name: data.residentName,
            resident_phone: data.residentPhone,
            resident_apartment: data.residentApartment,
            resident_address: data.residentAddress,
            notes: data.notes,
          });

          const c = response.code;
          const newCode: GuestAccessCode = {
            id: c.id,
            residentId: c.user_id || data.residentId,
            residentName: c.resident_name || data.residentName,
            residentPhone: c.resident_phone || data.residentPhone,
            residentApartment: c.resident_apartment || data.residentApartment,
            residentAddress: c.resident_address || data.residentAddress,
            visitorType: c.visitor_type as VisitorType,
            visitorName: c.visitor_name || undefined,
            visitorPhone: c.visitor_phone || undefined,
            visitorVehiclePlate: c.visitor_vehicle_plate || undefined,
            accessType: c.access_type as AccessType,
            validFrom: c.valid_from,
            validUntil: c.valid_until,
            maxUses: c.max_uses,
            currentUses: c.current_uses || 0,
            qrToken: c.qr_token,
            status: c.status as 'active' | 'used' | 'expired' | 'revoked',
            notes: c.notes || undefined,
            createdAt: c.created_at,
          };

          set((state) => ({
            guestAccessCodes: [newCode, ...state.guestAccessCodes],
          }));

          return newCode;
        } catch (error) {
          console.error('Failed to create guest code:', error);
          return null;
        }
      },

      revokeGuestAccessCode: async (id, revokedBy, revokedByName, revokedByRole, reason) => {
        try {
          await guestCodesApi.revoke(id, reason);
          set((state) => ({
            guestAccessCodes: state.guestAccessCodes.map((code) =>
              code.id === id
                ? {
                    ...code,
                    status: 'revoked' as const,
                    revokedAt: new Date().toISOString(),
                    revokedBy,
                    revokedByName,
                    revokedByRole,
                    revocationReason: reason,
                    updatedAt: new Date().toISOString(),
                  }
                : code
            ),
          }));
        } catch (error) {
          console.error('Failed to revoke guest code:', error);
        }
      },

      useGuestAccessCode: (id, fullCode?: GuestAccessCode) => {
        console.log('=== USING GUEST ACCESS CODE ===');
        console.log('Code ID:', id);
        console.log('Full code provided:', !!fullCode);

        const state = get();
        let code = state.guestAccessCodes.find((c) => c.id === id);

        // If code not found in local storage but fullCode provided (self-contained token)
        // Add it to local storage for tracking
        if (!code && fullCode) {
          console.log('Code not in local storage, adding from self-contained token');
          code = { ...fullCode, currentUses: 0, status: 'active' };

          // Add to state
          set((state) => ({
            guestAccessCodes: [code!, ...state.guestAccessCodes],
          }));
        }

        console.log('Found code:', code ? {
          id: code.id,
          status: code.status,
          currentUses: code.currentUses,
          maxUses: code.maxUses,
          accessType: code.accessType
        } : 'NOT FOUND');

        if (!code || code.status !== 'active') {
          console.log('Code not active or not found, returning false');
          return false;
        }

        const now = new Date();
        if (now > new Date(code.validUntil)) {
          console.log('Code has expired');
          // Code has expired
          set((state) => ({
            guestAccessCodes: state.guestAccessCodes.map((c) =>
              c.id === id ? { ...c, status: 'expired' as const, updatedAt: now.toISOString() } : c
            ),
          }));
          return false;
        }

        const newUses = code.currentUses + 1;
        const newStatus = newUses >= code.maxUses ? 'used' : 'active';

        console.log('Updating code:');
        console.log('  Old uses:', code.currentUses);
        console.log('  New uses:', newUses);
        console.log('  Max uses:', code.maxUses);
        console.log('  New status:', newStatus);

        set((state) => ({
          guestAccessCodes: state.guestAccessCodes.map((c) =>
            c.id === id
              ? {
                  ...c,
                  currentUses: newUses,
                  status: newStatus as 'active' | 'used',
                  lastUsedAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                }
              : c
          ),
        }));

        console.log('Code used successfully');
        return true;
      },

      validateGuestAccessCode: (qrToken) => {
        console.log('=== VALIDATING QR CODE ===');
        console.log('Input token:', qrToken);

        const now = new Date();

        // Check if this is a self-contained token (starts with GAPASS:)
        if (qrToken.startsWith('GAPASS:')) {
          console.log('Detected self-contained GAPASS token');
          try {
            const base64Data = qrToken.substring(7); // Remove 'GAPASS:' prefix
            // Decode base64 and then use TextDecoder to handle UTF-8 (Cyrillic, etc.)
            const decoded = atob(base64Data);
            // Convert string to Uint8Array
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
              bytes[i] = decoded.charCodeAt(i);
            }
            // Decode UTF-8 bytes to string
            const decoder = new TextDecoder('utf-8');
            const utf8Decoded = decoder.decode(bytes);
            const tokenData = JSON.parse(utf8Decoded);
            console.log('Decoded token data:', tokenData);

            // Create a GuestAccessCode object from the token data
            const code: GuestAccessCode = {
              id: tokenData.i,
              residentId: 'from-token',
              residentName: tokenData.rn,
              residentPhone: tokenData.rp,
              residentApartment: tokenData.ra,
              residentAddress: tokenData.rd,
              visitorType: tokenData.vt as VisitorType,
              visitorName: tokenData.vn || undefined,
              visitorPhone: tokenData.vp || undefined,
              visitorVehiclePlate: tokenData.vv || undefined,
              accessType: tokenData.at as AccessType,
              validFrom: new Date(tokenData.vf).toISOString(),
              validUntil: new Date(tokenData.vu).toISOString(),
              maxUses: tokenData.mx,
              currentUses: 0, // We track usage locally for self-contained tokens
              qrToken: qrToken,
              status: 'active',
              createdAt: new Date(tokenData.vf).toISOString(),
            };

            // Check if expired
            if (now.getTime() > tokenData.vu) {
              console.log('Self-contained code EXPIRED:', now.getTime(), '>', tokenData.vu);
              return { valid: false, code, error: 'expired' };
            }

            // Check if not yet valid
            if (now.getTime() < tokenData.vf) {
              console.log('Self-contained code NOT YET VALID:', now.getTime(), '<', tokenData.vf);
              return { valid: false, code, error: 'not_yet_valid' };
            }

            // Check if this code was already used (stored in local tracking)
            const state = get();
            const usedCodes = state.guestAccessCodes.filter(c => c.id === tokenData.i);
            const localCode = usedCodes.length > 0 ? usedCodes[0] : null;

            if (localCode) {
              console.log('Found local tracking for this code:', {
                id: localCode.id,
                status: localCode.status,
                currentUses: localCode.currentUses,
                maxUses: localCode.maxUses
              });

              // Use local tracking for status
              if (localCode.status === 'revoked') {
                console.log('Code REVOKED (local)');
                return { valid: false, code: { ...code, ...localCode }, error: 'revoked' };
              }

              if (localCode.status === 'used' || localCode.currentUses >= tokenData.mx) {
                console.log('Code USED (local)');
                return { valid: false, code: { ...code, ...localCode }, error: 'already_used' };
              }

              // Update code with local data
              code.currentUses = localCode.currentUses;
              code.status = localCode.status;
            }

            console.log('Self-contained code is VALID!');
            return { valid: true, code };
          } catch (err) {
            console.error('Failed to decode GAPASS token:', err);
            return { valid: false, error: 'invalid' };
          }
        }

        // Legacy: check local storage for old-style tokens (GA-xxx-xxx)
        const state = get();
        console.log('Checking legacy token in local storage');
        console.log('All codes:', state.guestAccessCodes.map(c => ({
          id: c.id,
          qrToken: c.qrToken.substring(0, 30) + '...',
          status: c.status,
          currentUses: c.currentUses,
          maxUses: c.maxUses,
          accessType: c.accessType
        })));

        const code = state.guestAccessCodes.find((c) => c.qrToken === qrToken);

        if (!code) {
          console.log('Code NOT FOUND for token:', qrToken);
          return { valid: false, error: 'invalid' };
        }

        console.log('Found code:', {
          id: code.id,
          status: code.status,
          currentUses: code.currentUses,
          maxUses: code.maxUses,
          accessType: code.accessType,
          validFrom: code.validFrom,
          validUntil: code.validUntil
        });

        // Check if expired
        if (now > new Date(code.validUntil)) {
          console.log('Code EXPIRED:', now, '>', new Date(code.validUntil));
          // Update status if needed
          if (code.status === 'active') {
            set((state) => ({
              guestAccessCodes: state.guestAccessCodes.map((c) =>
                c.id === code.id ? { ...c, status: 'expired' as const, updatedAt: now.toISOString() } : c
              ),
            }));
          }
          return { valid: false, code, error: 'expired' };
        }

        // Check if not yet valid
        if (now < new Date(code.validFrom)) {
          console.log('Code NOT YET VALID:', now, '<', new Date(code.validFrom));
          return { valid: false, code, error: 'not_yet_valid' };
        }

        // Check status
        if (code.status === 'revoked') {
          console.log('Code REVOKED');
          return { valid: false, code, error: 'revoked' };
        }

        if (code.status === 'used') {
          console.log('Code status is USED');
          return { valid: false, code, error: 'already_used' };
        }

        if (code.status === 'expired') {
          console.log('Code status is EXPIRED');
          return { valid: false, code, error: 'expired' };
        }

        // Check max uses
        if (code.currentUses >= code.maxUses) {
          console.log('Code MAX USES REACHED:', code.currentUses, '>=', code.maxUses);
          return { valid: false, code, error: 'max_uses_reached' };
        }

        console.log('Code is VALID!');
        return { valid: true, code };
      },

      getGuestAccessCodesByResident: (residentId) => {
        // Update expired codes first
        const now = new Date();
        const state = get();
        const needsUpdate = state.guestAccessCodes.some(
          (c) => c.residentId === residentId && c.status === 'active' && now > new Date(c.validUntil)
        );

        if (needsUpdate) {
          set((state) => ({
            guestAccessCodes: state.guestAccessCodes.map((c) =>
              c.residentId === residentId && c.status === 'active' && now > new Date(c.validUntil)
                ? { ...c, status: 'expired' as const, updatedAt: now.toISOString() }
                : c
            ),
          }));
        }

        return get().guestAccessCodes.filter((c) => c.residentId === residentId);
      },

      getAllGuestAccessCodes: () => {
        // Update expired codes
        const now = new Date();
        const state = get();
        const needsUpdate = state.guestAccessCodes.some(
          (c) => c.status === 'active' && now > new Date(c.validUntil)
        );

        if (needsUpdate) {
          set((state) => ({
            guestAccessCodes: state.guestAccessCodes.map((c) =>
              c.status === 'active' && now > new Date(c.validUntil)
                ? { ...c, status: 'expired' as const, updatedAt: now.toISOString() }
                : c
            ),
          }));
        }

        return get().guestAccessCodes;
      },

      addGuestAccessLog: (logData) => {
        const newLog: GuestAccessLog = {
          ...logData,
          id: generateId(),
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          guestAccessLogs: [newLog, ...state.guestAccessLogs].slice(0, 500), // Keep last 500 logs
        }));
      },

      getGuestAccessLogs: (accessCodeId) => {
        const logs = get().guestAccessLogs;
        if (accessCodeId) {
          return logs.filter((l) => l.accessCodeId === accessCodeId);
        }
        return logs;
      },

      getGuestAccessStats: () => {
        const state = get();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Update expired codes first
        const codes = state.guestAccessCodes.map((c) =>
          c.status === 'active' && now > new Date(c.validUntil)
            ? { ...c, status: 'expired' as const }
            : c
        );

        const activeCodes = codes.filter((c) => c.status === 'active');
        const usedToday = state.guestAccessLogs.filter(
          (l) => new Date(l.timestamp) >= todayStart && l.action === 'entry_allowed'
        ).length;
        const createdToday = codes.filter(
          (c) => new Date(c.createdAt) >= todayStart
        ).length;

        const byVisitorType = {
          courier: activeCodes.filter((c) => c.visitorType === 'courier').length,
          guest: activeCodes.filter((c) => c.visitorType === 'guest').length,
          taxi: activeCodes.filter((c) => c.visitorType === 'taxi').length,
          other: activeCodes.filter((c) => c.visitorType === 'other').length,
        };

        const recentScans = state.guestAccessLogs.slice(0, 10);

        return {
          totalActive: activeCodes.length,
          totalUsedToday: usedToday,
          totalCreatedToday: createdToday,
          byVisitorType,
          recentScans,
        };
      },

      // Vehicle actions (API-backed with all fields) - OPTIMISTIC UPDATES
      addVehicle: async (vehicleData) => {
        // Generate temporary ID for optimistic update
        const tempId = `temp-${generateId()}`;
        const now = new Date().toISOString();

        // Create optimistic vehicle immediately
        const optimisticVehicle: Vehicle = {
          id: tempId,
          ownerId: vehicleData.ownerId,
          ownerName: vehicleData.ownerName,
          ownerPhone: vehicleData.ownerPhone,
          apartment: vehicleData.apartment,
          address: vehicleData.address,
          plateNumber: vehicleData.plateNumber,
          brand: vehicleData.brand || '',
          model: vehicleData.model || '',
          color: vehicleData.color || '',
          year: vehicleData.year,
          type: vehicleData.type || 'car',
          ownerType: vehicleData.ownerType || 'individual',
          companyName: vehicleData.companyName,
          parkingSpot: vehicleData.parkingSpot,
          notes: vehicleData.notes,
          createdAt: now,
        };

        // Immediately add to UI (optimistic)
        set((state) => ({ vehicles: [...state.vehicles, optimisticVehicle] }));

        try {
          // Call API in background
          const response = await vehiclesApi.create({
            plate_number: vehicleData.plateNumber,
            brand: vehicleData.brand,
            model: vehicleData.model,
            color: vehicleData.color,
            year: vehicleData.year,
            vehicle_type: vehicleData.type,
            owner_type: vehicleData.ownerType,
            company_name: vehicleData.companyName,
            parking_spot: vehicleData.parkingSpot,
            notes: vehicleData.notes,
            is_primary: false,
          });

          // Replace temp with real data from server
          const v = response.vehicle;
          const realVehicle: Vehicle = {
            id: v.id,
            ownerId: v.user_id,
            ownerName: v.owner_name || vehicleData.ownerName,
            ownerPhone: v.owner_phone || vehicleData.ownerPhone,
            apartment: v.apartment || vehicleData.apartment,
            address: v.address || vehicleData.address,
            plateNumber: v.plate_number,
            brand: v.brand || '',
            model: v.model || '',
            color: v.color || '',
            year: v.year || undefined,
            type: (v.vehicle_type || 'car') as Vehicle['type'],
            ownerType: (v.owner_type || 'individual') as Vehicle['ownerType'],
            companyName: v.company_name || undefined,
            parkingSpot: v.parking_spot || undefined,
            notes: v.notes || undefined,
            createdAt: v.created_at || now,
            updatedAt: v.updated_at || undefined,
          };

          // Replace optimistic with real
          set((state) => ({
            vehicles: state.vehicles.map((veh) =>
              veh.id === tempId ? realVehicle : veh
            ),
          }));

          return realVehicle;
        } catch (error) {
          console.error('Failed to create vehicle:', error);
          // Rollback on error
          set((state) => ({
            vehicles: state.vehicles.filter((v) => v.id !== tempId),
          }));
          return null;
        }
      },

      updateVehicle: async (id, data) => {
        // Save original for rollback
        const originalVehicle = get().vehicles.find((v) => v.id === id);
        if (!originalVehicle) return;

        // Optimistic update immediately
        set((state) => ({
          vehicles: state.vehicles.map((v) =>
            v.id === id ? { ...v, ...data, updatedAt: new Date().toISOString() } : v
          ),
        }));

        try {
          // Call API in background
          await vehiclesApi.update(id, {
            plate_number: data.plateNumber,
            brand: data.brand,
            model: data.model,
            color: data.color,
            year: data.year,
            vehicle_type: data.type,
            owner_type: data.ownerType,
            company_name: data.companyName,
            parking_spot: data.parkingSpot,
            notes: data.notes,
          });
        } catch (error) {
          console.error('Failed to update vehicle:', error);
          // Rollback on error
          set((state) => ({
            vehicles: state.vehicles.map((v) =>
              v.id === id ? originalVehicle : v
            ),
          }));
        }
      },

      deleteVehicle: async (id) => {
        // Save for rollback
        const deletedVehicle = get().vehicles.find((v) => v.id === id);

        // Optimistic delete immediately
        set((state) => ({
          vehicles: state.vehicles.filter((v) => v.id !== id),
        }));

        try {
          // Call API in background
          await vehiclesApi.delete(id);
        } catch (error) {
          console.error('Failed to delete vehicle:', error);
          // Rollback on error - restore deleted vehicle
          if (deletedVehicle) {
            set((state) => ({
              vehicles: [...state.vehicles, deletedVehicle],
            }));
          }
        }
      },

      getVehiclesByOwner: (ownerId) => {
        return get().vehicles.filter((v) => v.ownerId === ownerId);
      },

      searchVehicleByPlate: async (plateNumber) => {
        try {
          // Call API to search vehicles (returns all fields + owner info)
          const response = await vehiclesApi.search(plateNumber);
          if (response.vehicles && response.vehicles.length > 0) {
            const v = response.vehicles[0];
            return {
              id: v.id,
              ownerId: v.user_id,
              ownerName: v.owner_name || '',
              ownerPhone: v.owner_phone || '',
              apartment: v.apartment || '',
              address: v.address || '',
              plateNumber: v.plate_number,
              brand: v.brand || '',
              model: v.model || '',
              color: v.color || '',
              year: v.year || undefined,
              type: (v.vehicle_type || 'car') as Vehicle['type'],
              ownerType: (v.owner_type || 'individual') as Vehicle['ownerType'],
              companyName: v.company_name || undefined,
              parkingSpot: v.parking_spot || undefined,
              notes: v.notes || undefined,
              createdAt: v.created_at,
              updatedAt: v.updated_at || undefined,
            } as Vehicle;
          }
          return undefined;
        } catch (error) {
          console.error('Failed to search vehicle:', error);
          // Fallback to local search
          const normalized = plateNumber.toUpperCase().replace(/\s+/g, '');
          return get().vehicles.find((v) =>
            v.plateNumber.toUpperCase().replace(/\s+/g, '') === normalized
          );
        }
      },

      searchVehiclesByPlate: async (plateNumber) => {
        try {
          const response = await vehiclesApi.search(plateNumber);
          if (response.vehicles && response.vehicles.length > 0) {
            return response.vehicles.map((v: any) => ({
              id: v.id,
              ownerId: v.user_id,
              ownerName: v.owner_name || '',
              ownerPhone: v.owner_phone || '',
              apartment: v.apartment || '',
              address: v.address || '',
              plateNumber: v.plate_number,
              brand: v.brand || '',
              model: v.model || '',
              color: v.color || '',
              year: v.year || undefined,
              type: (v.vehicle_type || 'car') as Vehicle['type'],
              ownerType: (v.owner_type || 'individual') as Vehicle['ownerType'],
              companyName: v.company_name || undefined,
              parkingSpot: v.parking_spot || undefined,
              notes: v.notes || undefined,
              createdAt: v.created_at,
              updatedAt: v.updated_at || undefined,
            } as Vehicle));
          }
          return [];
        } catch (error) {
          console.error('Failed to search vehicles:', error);
          return [];
        }
      },

      // Announcement actions
      addAnnouncement: async (announcementData) => {
        try {
          const { announcementsApi } = await import('../services/api');

          // Build target for API
          const target = announcementData.target;
          const apiData = {
            title: announcementData.title,
            content: announcementData.content,
            type: announcementData.type as 'residents' | 'employees' | 'all',
            priority: announcementData.priority,
            expires_at: announcementData.expiresAt,
            target_type: target?.type,
            target_branch: target?.branchId,
            target_building_id: target?.buildingId,
            target_entrance: target?.entrance,
            target_floor: target?.floor,
            target_logins: target?.customLogins?.join(','),
            attachments: announcementData.attachments,
          };

          const result = await announcementsApi.create(apiData);

          // Refetch announcements from server to avoid duplicates
          await get().fetchAnnouncements();

          // Return the created announcement info
          const newAnnouncement: Announcement = {
            ...announcementData,
            id: (result as any).id || generateId(),
            createdAt: new Date().toISOString(),
            isActive: true,
            viewedBy: [],
          };

          console.log('[DataStore] Announcement created via API:', newAnnouncement.id);
          return newAnnouncement;
        } catch (error) {
          console.error('[DataStore] Failed to create announcement via API:', error);
          // Fallback to local-only (for demo mode)
          const newAnnouncement: Announcement = {
            ...announcementData,
            id: generateId(),
            createdAt: new Date().toISOString(),
            isActive: true,
            viewedBy: [],
          };
          set((state) => ({ announcements: [newAnnouncement, ...state.announcements] }));
          return newAnnouncement;
        }
      },

      updateAnnouncement: async (id, data) => {
        // Update local state immediately
        set((state) => ({
          announcements: state.announcements.map((a) =>
            a.id === id ? { ...a, ...data } : a
          ),
        }));

        // Sync with API
        try {
          const { announcementsApi } = await import('../services/api');
          await announcementsApi.update(id, {
            title: data.title,
            content: data.content,
            type: data.type,
            priority: data.priority,
            target_type: data.target?.type,
            target_building_id: data.target?.buildingId,
            target_entrance: data.target?.entrance,
            target_floor: data.target?.floor,
            target_logins: data.target?.customLogins?.join(','),
            expires_at: data.expiresAt,
          });
          console.log('[DataStore] Announcement updated via API:', id);
        } catch (error) {
          console.error('[DataStore] Failed to update announcement via API:', error);
        }
      },

      deleteAnnouncement: async (id) => {
        try {
          const { announcementsApi } = await import('../services/api');
          await announcementsApi.delete(id);
          console.log('[DataStore] Announcement deleted via API:', id);
        } catch (error) {
          console.error('[DataStore] Failed to delete announcement via API:', error);
        }
        set((state) => ({
          announcements: state.announcements.filter((a) => a.id !== id),
        }));
      },

      markAnnouncementAsViewed: async (announcementId, userId) => {
        // Save to localStorage for persistence across page reloads (backup)
        const readAnnouncementsKey = `read_announcements_${userId}`;
        const readAnnouncements = JSON.parse(localStorage.getItem(readAnnouncementsKey) || '[]');
        if (!readAnnouncements.includes(announcementId)) {
          readAnnouncements.push(announcementId);
          localStorage.setItem(readAnnouncementsKey, JSON.stringify(readAnnouncements));
        }

        // Update local state immediately
        set((state) => ({
          announcements: state.announcements.map((a) =>
            a.id === announcementId && !a.viewedBy.includes(userId)
              ? { ...a, viewedBy: [...a.viewedBy, userId] }
              : a
          ),
        }));

        // Sync with API in background
        try {
          const { announcementsApi } = await import('../services/api');
          await announcementsApi.markAsViewed(announcementId);
          console.log('[DataStore] Announcement view synced to API:', announcementId);
        } catch (error) {
          console.error('[DataStore] Failed to sync announcement view:', error);
        }
      },

      getAnnouncementsForResidents: (userLogin: string, buildingId?: string, entrance?: string, floor?: string, branch?: string) => {
        const now = new Date();
        return get().announcements.filter((a) => {
          // Basic filters - show 'residents' and 'all' types
          if ((a.type !== 'residents' && a.type !== 'all') || !a.isActive) return false;
          if (a.expiresAt && new Date(a.expiresAt) <= now) return false;

          // If no targeting, show to all
          if (!a.target || a.target.type === 'all') return true;

          // Check targeting
          switch (a.target.type) {
            case 'building':
              // Show if user's building matches
              return buildingId && a.target.buildingId === buildingId;

            case 'entrance':
              // Show if user's building AND entrance match
              return buildingId === a.target.buildingId && entrance === a.target.entrance;

            case 'floor':
              // Show if user's building, entrance AND floor match
              return buildingId === a.target.buildingId &&
                     entrance === a.target.entrance &&
                     floor === a.target.floor;

            case 'custom':
              // Check if user's login is in the custom list
              return a.target.customLogins?.includes(userLogin) || false;

            case 'branch':
              // Branch filtering is done on the server side
              // If we got this announcement from API, it means user is in the target branch
              // Only filter locally if branch is provided (for offline mode)
              return !branch || a.target.branchId === branch;

            default:
              return true;
          }
        });
      },

      getAnnouncementsForEmployees: () => {
        const now = new Date();
        return get().announcements.filter((a) =>
          (a.type === 'employees' || a.type === 'all') &&
          a.isActive &&
          (!a.expiresAt || new Date(a.expiresAt) > now)
        );
      },

      getAnnouncementsByAuthor: (authorId) => {
        return get().announcements.filter((a) => a.authorId === authorId);
      },

      fetchAnnouncements: async () => {
        try {
          const { announcementsApi } = await import('../services/api');
          const result = await announcementsApi.getAll();
          const authState = JSON.parse(localStorage.getItem('uk-auth-storage') || '{}');
          const userId = authState?.state?.user?.id;

          const announcements: Announcement[] = (result.announcements || []).map((a: any) => {
            // Use API view_count and viewed_by_user if available
            const viewedByUser = a.viewed_by_user === true || a.viewed_by_user === 1;

            // Build viewedBy array - include current user if they viewed
            const viewedBy: string[] = [];
            if (viewedByUser && userId) {
              viewedBy.push(userId);
            }

            // Also check localStorage as fallback
            if (userId) {
              const readAnnouncementsKey = `read_announcements_${userId}`;
              const readAnnouncements: string[] = JSON.parse(localStorage.getItem(readAnnouncementsKey) || '[]');
              if (readAnnouncements.includes(a.id) && !viewedBy.includes(userId)) {
                viewedBy.push(userId);
              }
            }

            // Parse attachments from JSON string
            let attachments = undefined;
            if (a.attachments) {
              try {
                attachments = typeof a.attachments === 'string'
                  ? JSON.parse(a.attachments)
                  : a.attachments;
              } catch {
                attachments = undefined;
              }
            }

            // Map 'staff' from API back to 'employees' for UI compatibility
            const typeForUI = a.type === 'staff' ? 'employees' : a.type;
            return {
              id: a.id,
              title: a.title,
              content: a.content,
              type: typeForUI as 'residents' | 'employees' | 'all',
              priority: a.priority || 'normal',
              authorId: a.created_by || '',
              authorName: a.author_name || '',
              authorRole: 'manager' as const,
              createdAt: a.created_at,
              expiresAt: a.expires_at,
              isActive: a.is_active === 1,
              viewedBy,
              viewCount: a.view_count || 0, // Total view count from API
              attachments, // File attachments
              target: a.target_type ? {
                type: a.target_type,
                branchId: a.target_branch,
                buildingId: a.target_building_id,
                entrance: a.target_entrance,
                floor: a.target_floor,
                customLogins: a.target_logins?.split(',').filter(Boolean),
              } : undefined,
            };
          });

          set({ announcements });
          console.log('[DataStore] Fetched', announcements.length, 'announcements from API');
        } catch (error) {
          console.error('[DataStore] Failed to fetch announcements:', error);
        }
      },

      // Rental apartment actions - now using real API
      fetchRentals: async () => {
        try {
          const [apartmentsRes, recordsRes] = await Promise.all([
            rentalsApi.getApartments(),
            rentalsApi.getRecords(),
          ]);
          set({
            rentalApartments: apartmentsRes.apartments || [],
            rentalRecords: recordsRes.records || [],
          });
          console.log('[DataStore] Fetched', apartmentsRes.apartments?.length || 0, 'rental apartments from API');
        } catch (error) {
          console.error('[DataStore] Failed to fetch rentals:', error);
        }
      },

      // For tenants/commercial_owners to fetch their own apartments
      fetchMyRentals: async () => {
        try {
          const response = await rentalsApi.getMyApartments();
          set({
            rentalApartments: response.apartments || [],
            rentalRecords: response.records || [],
          });
          console.log('[DataStore] Fetched', response.apartments?.length || 0, 'my rental apartments from API');
        } catch (error) {
          console.error('[DataStore] Failed to fetch my rentals:', error);
        }
      },

      addRentalApartment: async (apartmentData) => {
        try {
          const response = await rentalsApi.createApartment({
            name: apartmentData.name,
            address: apartmentData.address,
            apartment: apartmentData.apartment,
            ownerName: apartmentData.ownerName,
            ownerPhone: apartmentData.ownerPhone,
            ownerLogin: apartmentData.ownerLogin,
            ownerPassword: apartmentData.password,
            ownerType: apartmentData.ownerType || 'tenant',
          });

          console.log('[DataStore] API response:', response);
          if (response.apartment) {
            set((state) => ({ rentalApartments: [...state.rentalApartments, response.apartment] }));
            return response.apartment;
          }
          console.error('[DataStore] No apartment in response:', response);
          return null;
        } catch (error: any) {
          console.error('[DataStore] Failed to create rental apartment:', error);
          console.error('[DataStore] Error details:', error.message, error.stack);
          throw error; // Re-throw to allow UI to show the error
        }
      },

      updateRentalApartment: async (id, data) => {
        try {
          await rentalsApi.updateApartment(id, data);
          set((state) => ({
            rentalApartments: state.rentalApartments.map((a) =>
              a.id === id ? { ...a, ...data } : a
            ),
          }));
        } catch (error) {
          console.error('[DataStore] Failed to update rental apartment:', error);
        }
      },

      deleteRentalApartment: async (id) => {
        try {
          await rentalsApi.deleteApartment(id);
          set((state) => ({
            rentalApartments: state.rentalApartments.filter((a) => a.id !== id),
            rentalRecords: state.rentalRecords.filter((r) => r.apartmentId !== id),
          }));
        } catch (error) {
          console.error('[DataStore] Failed to delete rental apartment:', error);
        }
      },

      getRentalApartmentsByOwner: (ownerId) => {
        return get().rentalApartments.filter((a) => a.ownerId === ownerId);
      },

      addRentalRecord: async (recordData) => {
        try {
          const response = await rentalsApi.createRecord({
            apartmentId: recordData.apartmentId,
            guestNames: recordData.guestNames,
            passportInfo: recordData.passportInfo,
            checkInDate: recordData.checkInDate,
            checkOutDate: recordData.checkOutDate,
            amount: recordData.amount,
            currency: recordData.currency,
            notes: recordData.notes,
          });

          if (response.record) {
            set((state) => ({ rentalRecords: [response.record, ...state.rentalRecords] }));
            return response.record;
          }
          return null;
        } catch (error) {
          console.error('[DataStore] Failed to create rental record:', error);
          return null;
        }
      },

      updateRentalRecord: async (id, data) => {
        try {
          await rentalsApi.updateRecord(id, data);
          set((state) => ({
            rentalRecords: state.rentalRecords.map((r) =>
              r.id === id ? { ...r, ...data } : r
            ),
          }));
        } catch (error) {
          console.error('[DataStore] Failed to update rental record:', error);
        }
      },

      deleteRentalRecord: async (id) => {
        try {
          await rentalsApi.deleteRecord(id);
          set((state) => ({
            rentalRecords: state.rentalRecords.filter((r) => r.id !== id),
          }));
        } catch (error) {
          console.error('[DataStore] Failed to delete rental record:', error);
        }
      },

      getRentalRecordsByApartment: (apartmentId) => {
        return get().rentalRecords.filter((r) => r.apartmentId === apartmentId);
      },

      addExecutor: async (executorData) => {
        try {
          // Call real API to register user
          const response = await authApi.register({
            login: executorData.login,
            password: executorData.password,
            name: executorData.name,
            role: executorData.role || 'executor',
            phone: executorData.phone,
            specialization: executorData.specialization,
          });

          if (response.user) {
            const newExecutor: Executor = {
              id: response.user.id,
              name: response.user.name,
              phone: response.user.phone || executorData.phone,
              login: response.user.login,
              specialization: response.user.specialization || executorData.specialization,
              createdAt: new Date().toISOString(),
              rating: 5.0,
              completedCount: 0,
              activeRequests: 0,
              totalEarnings: 0,
              avgCompletionTime: 0,
              status: 'offline',
            };

            // Add locally first for immediate UI update
            set((state) => ({ executors: [...state.executors, newExecutor] }));

            // Then refetch from server to ensure sync
            get().fetchExecutors();

            return newExecutor;
          }
          return null;
        } catch (error: any) {
          console.error('Failed to add executor:', error);
          throw error; // Re-throw so UI can show error message
        }
      },

      updateExecutor: (id, data) => {
        set((state) => ({
          executors: state.executors.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        }));
      },

      deleteExecutor: async (id) => {
        try {
          await usersApi.delete(id);
          set((state) => ({
            executors: state.executors.filter((e) => e.id !== id),
          }));
        } catch (error) {
          console.error('Failed to delete executor:', error);
          throw error;
        }
      },

      getExecutorStats: (executorId) => {
        const { requests } = get();
        const executorRequests = requests.filter(r => r.executorId === executorId);
        const completed = executorRequests.filter(r => r.status === 'completed');
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const thisWeek = completed.filter(r => r.approvedAt && new Date(r.approvedAt) >= weekAgo).length;
        const thisMonth = completed.filter(r => r.approvedAt && new Date(r.approvedAt) >= monthAgo).length;

        const ratings = completed.filter(r => r.rating).map(r => r.rating!);
        const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;

        const times = completed.filter(r => r.workDuration).map(r => r.workDuration!);
        const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : 0;

        return {
          totalRequests: executorRequests.length,
          completedRequests: completed.length,
          avgRating: Math.round(avgRating * 10) / 10,
          avgTime,
          thisWeek,
          thisMonth,
        };
      },

      addRequest: async (requestData) => {
        // Generate temp ID and number for optimistic update
        const tempId = `temp-${generateId()}`;
        const tempNumber = `#${tempId.substring(5, 11).toUpperCase()}`;
        const now = new Date().toISOString();

        // Create optimistic request immediately
        const optimisticRequest: Request = {
          id: tempId,
          number: tempNumber,
          title: requestData.title,
          description: requestData.description || '',
          category: requestData.category,
          status: 'new',
          priority: requestData.priority || 'medium',
          residentId: requestData.residentId,
          residentName: requestData.residentName,
          residentPhone: requestData.residentPhone,
          address: requestData.address,
          apartment: requestData.apartment,
          accessInfo: requestData.accessInfo,
          scheduledDate: requestData.scheduledDate,
          scheduledTime: requestData.scheduledTime,
          createdAt: now,
        };

        // Add to UI immediately (optimistic)
        set((state) => ({ requests: [optimisticRequest, ...state.requests] }));

        // Add notification for managers immediately
        get().addNotification({
          userId: 'manager',
          type: 'request_created',
          title: 'Новая заявка',
          message: `Заявка ${tempNumber}: ${requestData.title}`,
          requestId: tempId,
        });

        try {
          // Call API in background
          const response = await requestsApi.create({
            category_id: requestData.category,
            title: requestData.title,
            description: requestData.description,
            priority: requestData.priority,
            access_info: requestData.accessInfo,
            scheduled_at: requestData.scheduledDate && requestData.scheduledTime
              ? `${requestData.scheduledDate}T${requestData.scheduledTime}:00`
              : undefined,
            // For manual creation by managers - pass the resident_id
            resident_id: requestData.residentId,
          });

          // Replace temp with real data
          const apiRequest = response.request;
          const realRequest: Request = {
            id: apiRequest.id,
            number: apiRequest.request_number || apiRequest.number,
            title: apiRequest.title,
            description: apiRequest.description,
            category: apiRequest.category_id,
            status: apiRequest.status,
            priority: apiRequest.priority || 'medium',
            residentId: apiRequest.resident_id,
            residentName: apiRequest.resident_name,
            residentPhone: apiRequest.resident_phone,
            address: apiRequest.address,
            apartment: apiRequest.apartment,
            createdAt: apiRequest.created_at,
          };

          // Replace optimistic with real
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === tempId ? realRequest : r
            ),
          }));

          // Add activity log
          get().addActivityLog({
            userId: requestData.residentId,
            userName: requestData.residentName,
            userRole: 'resident',
            action: 'Создал заявку',
            details: `Заявка #${realRequest.number}: ${realRequest.title}`,
            requestId: realRequest.id,
          });

          return realRequest;
        } catch (error) {
          console.error('Failed to create request:', error);
          // Rollback on error
          set((state) => ({
            requests: state.requests.filter((r) => r.id !== tempId),
          }));
          return null;
        }
      },

      assignRequest: async (requestId, executorId) => {
        const state = get();
        const executor = state.executors.find(e => e.id === executorId);
        const request = state.requests.find(r => r.id === requestId);

        if (!request) {
          console.error('[assignRequest] Request not found in local state!');
          return;
        }

        const { user } = useAuthStore.getState();
        const isSelfAssign = user?.role === 'executor' && user?.id === executorId;
        const executorName = executor?.name || 'Исполнитель';
        const executorPhone = executor?.phone || '';

        // Save original state for rollback
        const originalRequest = { ...request };
        const originalExecutor = executor ? { ...executor } : null;

        // OPTIMISTIC UPDATE - immediately update UI
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'assigned' as const,
                  executorId,
                  executorName,
                  executorPhone,
                  executorRating: executor?.rating || 5.0,
                  assignedAt: new Date().toISOString(),
                }
              : r
          ),
          executors: state.executors.map((e) =>
            e.id === executorId
              ? { ...e, status: 'busy' as const, activeRequests: (e.activeRequests || 0) + 1 }
              : e
          ),
        }));

        // Send notifications immediately
        if (isSelfAssign) {
          get().addNotification({
            userId: 'manager1',
            type: 'request_assigned',
            title: 'Исполнитель взял заявку',
            message: `${executorName} взял заявку #${request.number}: ${request.title}`,
            requestId,
          });
          get().addActivityLog({
            userId: executorId,
            userName: executorName,
            userRole: 'executor',
            action: 'Взял заявку',
            details: `Заявка #${request.number}: ${request.title}`,
            requestId,
          });
        } else {
          get().addNotification({
            userId: executorId,
            type: 'request_assigned',
            title: 'Новая заявка назначена',
            message: `Вам назначена заявка #${request.number}: ${request.title}`,
            requestId,
          });
          get().addActivityLog({
            userId: user?.id || 'system',
            userName: user?.name || 'Система',
            userRole: user?.role || 'manager',
            action: 'Назначил исполнителя',
            details: `Заявка #${request.number} назначена ${executorName}`,
            requestId,
          });
        }

        try {
          // Call API in background
          await requestsApi.assign(requestId, executorId);
        } catch (error) {
          console.error('Failed to assign request:', error);
          // Rollback on error
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? originalRequest : r
            ),
            executors: originalExecutor
              ? state.executors.map((e) =>
                  e.id === executorId ? originalExecutor : e
                )
              : state.executors,
          }));
        }
      },

      acceptRequest: async (requestId) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        // Save original for rollback
        const originalRequest = { ...request };

        // OPTIMISTIC UPDATE - immediately update UI
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? { ...r, status: 'accepted' as const, acceptedAt: new Date().toISOString() }
              : r
          ),
        }));

        // Send notifications immediately
        get().addNotification({
          userId: request.residentId,
          type: 'request_accepted',
          title: 'Заявка принята',
          message: `Исполнитель ${request.executorName} принял вашу заявку #${request.number}`,
          requestId,
        });
        get().addNotification({
          userId: 'manager',
          type: 'request_accepted',
          title: 'Заявка принята исполнителем',
          message: `${request.executorName} принял заявку #${request.number}`,
          requestId,
        });
        get().addActivityLog({
          userId: request.executorId!,
          userName: request.executorName!,
          userRole: 'executor',
          action: 'Принял заявку',
          details: `Заявка #${request.number}`,
          requestId,
        });

        try {
          // Call API in background
          await requestsApi.accept(requestId);
        } catch (error) {
          console.error('Failed to accept request:', error);
          // Rollback on error
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? originalRequest : r
            ),
          }));
        }
      },

      startWork: async (requestId) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        // Check if executor already has a task in progress
        const executorId = request.executorId;
        if (executorId) {
          const hasActiveWork = state.requests.some(
            r => r.executorId === executorId && r.status === 'in_progress' && r.id !== requestId
          );
          if (hasActiveWork) {
            console.error('Executor already has a task in progress. Complete it first.');
            return;
          }
        }

        // Save original for rollback
        const originalRequest = { ...request };

        // OPTIMISTIC UPDATE - immediately update UI
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? { ...r, status: 'in_progress' as const, startedAt: new Date().toISOString() }
              : r
          ),
        }));

        // Send notifications immediately
        get().addNotification({
          userId: request.residentId,
          type: 'request_started',
          title: 'Работа начата',
          message: `Исполнитель ${request.executorName} начал работу по заявке #${request.number}`,
          requestId,
        });
        get().addActivityLog({
          userId: request.executorId!,
          userName: request.executorName!,
          userRole: 'executor',
          action: 'Начал работу',
          details: `Заявка #${request.number}`,
          requestId,
        });

        try {
          // Call API in background
          await requestsApi.start(requestId);
        } catch (error) {
          console.error('Failed to start work:', error);
          // Rollback on error
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? originalRequest : r
            ),
          }));
        }
      },

      pauseWork: async (requestId) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request || request.status !== 'in_progress' || request.isPaused) return;

        try {
          // Call API to pause work in D1 database
          await requestsApi.pause(requestId);

          // Update local state
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId
                ? { ...r, isPaused: true, pausedAt: new Date().toISOString() }
                : r
            ),
          }));

          // Activity log
          get().addActivityLog({
            userId: request.executorId!,
            userName: request.executorName!,
            userRole: 'executor',
            action: 'Приостановил работу',
            details: `Заявка #${request.number}`,
            requestId,
          });
        } catch (error) {
          console.error('Failed to pause work:', error);
        }
      },

      resumeWork: async (requestId) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request || request.status !== 'in_progress' || !request.isPaused) return;

        try {
          // Call API to resume work in D1 database
          const result = await requestsApi.resume(requestId);

          // Use totalPausedTime from server response for accuracy
          const totalPausedTime = result.totalPausedTime || (request.totalPausedTime || 0);

          // Update local state
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId
                ? { ...r, isPaused: false, pausedAt: undefined, totalPausedTime }
                : r
            ),
          }));

          // Activity log
          get().addActivityLog({
            userId: request.executorId!,
            userName: request.executorName!,
            userRole: 'executor',
            action: 'Возобновил работу',
            details: `Заявка #${request.number}`,
            requestId,
          });
        } catch (error) {
          console.error('Failed to resume work:', error);
        }
      },

      completeWork: async (requestId, workDuration) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        const wasRejected = !!request.rejectionReason;

        try {
          // Call API to complete work in D1 database
          await requestsApi.complete(requestId);

          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: 'pending_approval' as const,
                    completedAt: new Date().toISOString(),
                    workDuration,
                    // Clear pause and rejection info when work is completed
                    isPaused: undefined,
                    pausedAt: undefined,
                    rejectedAt: undefined,
                    rejectionReason: undefined,
                  }
                : r
            ),
          }));

          // Different message if this is a re-submission after rejection
          const notifyMessage = wasRejected
            ? `Исполнитель переделал работу по заявке #${request.number}. Пожалуйста, проверьте и подтвердите.`
            : `Исполнитель завершил работу по заявке #${request.number}. Пожалуйста, подтвердите выполнение.`;

          get().addNotification({
            userId: request.residentId,
            type: 'request_completed',
            title: wasRejected ? 'Работа переделана' : 'Работа завершена',
            message: notifyMessage,
            requestId,
          });

          // Push-уведомление для жителя (важное - требует подтверждения)
          const { user } = useAuthStore.getState();
          if (user?.id === request.residentId) {
            // Если житель сейчас онлайн - показать push
            pushNotifications.notifyRequestCompleted(
              request.number,
              request.executorName || 'Исполнитель',
              requestId
            );
          }

          get().addNotification({
            userId: 'manager',
            type: 'request_completed',
            title: 'Работа завершена',
            message: `${request.executorName} завершил заявку #${request.number}. Ожидается подтверждение жителя.`,
            requestId,
          });

          get().addActivityLog({
            userId: request.executorId!,
            userName: request.executorName!,
            userRole: 'executor',
            action: 'Завершил работу',
            details: `Заявка #${request.number}, время работы: ${Math.round(workDuration / 60)} мин`,
            requestId,
          });
        } catch (error) {
          console.error('Failed to complete work:', error);
        }
      },

      approveRequest: async (requestId, rating, feedback) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        try {
          // Call API to approve request in D1 database
          await requestsApi.approve(requestId, rating, feedback);

          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: 'completed' as const,
                    approvedAt: new Date().toISOString(),
                    rating,
                    feedback,
                  }
                : r
            ),
          }));

          // Update executor stats (local)
          if (request.executorId) {
            const executor = state.executors.find(e => e.id === request.executorId);
            if (executor) {
              const completedRequests = state.requests.filter(
                r => r.executorId === request.executorId && r.status === 'completed'
              );
              const ratings = [...completedRequests.map(r => r.rating || 5), rating];
              const newRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

              set((state) => ({
                executors: state.executors.map((e) =>
                  e.id === request.executorId
                    ? {
                        ...e,
                        completedCount: e.completedCount + 1,
                        rating: Math.round(newRating * 10) / 10,
                        totalEarnings: e.totalEarnings + 100000,
                      }
                    : e
                ),
              }));
            }
          }

          get().addNotification({
            userId: request.executorId!,
            type: 'request_approved',
            title: 'Работа подтверждена',
            message: `Заявка #${request.number} подтверждена. Оценка: ${rating}/5`,
            requestId,
          });

          get().addActivityLog({
            userId: request.residentId,
            userName: request.residentName,
            userRole: 'resident',
            action: 'Подтвердил выполнение',
            details: `Заявка #${request.number}, оценка: ${rating}/5`,
            requestId,
          });
        } catch (error) {
          console.error('Failed to approve request:', error);
        }
      },

      rejectRequest: async (requestId, reason) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        try {
          // Call API to reject request in D1 database
          await requestsApi.reject(requestId, reason);

          const newRejectionCount = (request.rejectionCount || 0) + 1;

          // Return to in_progress status but keep rejection info visible
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: 'in_progress' as const,
                    completedAt: undefined,
                    workDuration: undefined,
                    rejectedAt: new Date().toISOString(),
                    rejectionReason: reason,
                    rejectionCount: newRejectionCount,
                  }
                : r
            ),
          }));

          // Activity log
          get().addActivityLog({
            userId: request.residentId,
            userName: request.residentName,
            userRole: 'resident',
            action: 'Отклонил выполнение',
            details: `Заявка #${request.number}, причина: ${reason}`,
            requestId,
          });
        } catch (error) {
          console.error('Failed to reject request:', error);
        }
      },

      cancelRequest: async (requestId, cancelledBy, reason) => {
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        const { user } = useAuthStore.getState();
        const cancellerName = user?.name || 'Система';

        // Check if cancellation is allowed
        // Residents can cancel only before work starts (new, assigned, accepted)
        // Managers/Admins can cancel any request not completed
        const canResidentCancel = ['new', 'assigned', 'accepted'].includes(request.status);
        const canManagerCancel = request.status !== 'completed';

        if (cancelledBy === 'resident' && !canResidentCancel) {
          console.error('Resident cannot cancel request in this status');
          return;
        }

        if ((cancelledBy === 'manager' || cancelledBy === 'admin') && !canManagerCancel) {
          console.error('Cannot cancel completed request');
          return;
        }

        const previousExecutorId = request.executorId;

        // Call API to persist cancellation
        try {
          await requestsApi.cancel(requestId, reason);
        } catch (error) {
          console.error('Failed to cancel request on server:', error);
          // Continue with local update even if API fails
        }

        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'cancelled' as const,
                  cancelledAt: new Date().toISOString(),
                  cancelledBy,
                  cancellationReason: reason,
                }
              : r
          ),
        }));

        // Update executor's active request count if there was one
        if (previousExecutorId) {
          const activeCount = state.requests.filter(
            r => r.executorId === previousExecutorId && ['assigned', 'accepted', 'in_progress'].includes(r.status) && r.id !== requestId
          ).length;

          set((state) => ({
            executors: state.executors.map((e) =>
              e.id === previousExecutorId
                ? { ...e, activeRequests: activeCount, status: activeCount > 0 ? 'busy' : 'available' }
                : e
            ),
          }));
        }

        // Notifications based on who cancelled
        const cancellerLabels: Record<CancelledBy, string> = {
          resident: 'Житель',
          executor: 'Исполнитель',
          manager: 'Менеджер',
          admin: 'Администратор',
        };

        // Notify resident (if not cancelled by resident)
        if (cancelledBy !== 'resident') {
          get().addNotification({
            userId: request.residentId,
            type: 'request_cancelled',
            title: 'Заявка отменена',
            message: `Заявка #${request.number} была отменена. Причина: ${reason}`,
            requestId,
          });
        }

        // Notify executor (if assigned and not cancelled by executor)
        if (previousExecutorId && cancelledBy !== 'executor') {
          get().addNotification({
            userId: previousExecutorId,
            type: 'request_cancelled',
            title: 'Заявка отменена',
            message: `Заявка #${request.number} была отменена ${cancellerLabels[cancelledBy]}. Причина: ${reason}`,
            requestId,
          });
        }

        // Notify manager (if not cancelled by manager/admin)
        if (cancelledBy === 'resident' || cancelledBy === 'executor') {
          get().addNotification({
            userId: 'manager1',
            type: 'request_cancelled',
            title: 'Заявка отменена',
            message: `${cancellerLabels[cancelledBy]} отменил заявку #${request.number}. Причина: ${reason}`,
            requestId,
          });
        }

        // Activity log
        get().addActivityLog({
          userId: user?.id || 'system',
          userName: cancellerName,
          userRole: cancelledBy,
          action: 'Отменил заявку',
          details: `Заявка #${request.number}: ${reason}`,
          requestId,
        });
      },

      declineRequest: async (requestId, reason) => {
        // Executor declines/releases an assigned request - returns it to 'new' status
        const state = get();
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return;

        // Can decline if assigned, accepted, or in_progress (for illness, etc.)
        if (!['assigned', 'accepted', 'in_progress'].includes(request.status)) {
          console.error('Cannot decline request in this status');
          return;
        }

        const previousExecutorId = request.executorId;
        const executorName = request.executorName;

        // Save original state for rollback
        const originalRequest = { ...request };

        // OPTIMISTIC UPDATE - immediately update UI
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'new' as const,
                  executorId: undefined,
                  executorName: undefined,
                  executorPhone: undefined,
                  executorRating: undefined,
                  assignedAt: undefined,
                  acceptedAt: undefined,
                  startedAt: undefined,
                }
              : r
          ),
        }));

        // Update executor's active request count
        if (previousExecutorId) {
          const activeCount = state.requests.filter(
            r => r.executorId === previousExecutorId && ['assigned', 'accepted', 'in_progress'].includes(r.status) && r.id !== requestId
          ).length;

          set((state) => ({
            executors: state.executors.map((e) =>
              e.id === previousExecutorId
                ? { ...e, activeRequests: activeCount, status: activeCount > 0 ? 'busy' : 'available' }
                : e
            ),
          }));
        }

        // Notify resident (local notification)
        get().addNotification({
          userId: request.residentId,
          type: 'request_declined',
          title: 'Исполнитель отказался',
          message: `Исполнитель ${executorName} отказался от заявки #${request.number}. Заявка возвращена в очередь.`,
          requestId,
        });

        // Notify manager (local notification)
        get().addNotification({
          userId: 'manager1',
          type: 'request_declined',
          title: 'Исполнитель отказался от заявки',
          message: `${executorName} отказался от заявки #${request.number}. Причина: ${reason}. Заявка требует нового назначения.`,
          requestId,
        });

        // Activity log
        get().addActivityLog({
          userId: previousExecutorId || 'system',
          userName: executorName || 'Исполнитель',
          userRole: 'executor',
          action: 'Отказался от заявки',
          details: `Заявка #${request.number}: ${reason}`,
          requestId,
        });

        try {
          // Call API to persist the change
          await requestsApi.decline(requestId, reason);
        } catch (error) {
          console.error('Failed to decline request:', error);
          // Rollback on error
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? originalRequest : r
            ),
          }));
          // Re-throw to notify caller
          throw error;
        }
      },

      getRequestsByResident: (residentId) => {
        return get().requests.filter(r => r.residentId === residentId);
      },

      getRequestsByExecutor: (executorId) => {
        return get().requests.filter(r => r.executorId === executorId);
      },

      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: generateId(),
          read: false,
          createdAt: new Date().toISOString(),
        };
        // Limit notifications to 200 to prevent memory bloat
        set((state) => ({
          notifications: [newNotification, ...state.notifications].slice(0, 200),
        }));
      },

      markNotificationAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllNotificationsAsRead: (userId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.userId === userId ? { ...n, read: true } : n
          ),
        }));
      },

      getUnreadCount: (userId) => {
        return get().notifications.filter(n => n.userId === userId && !n.read).length;
      },

      addActivityLog: (log) => {
        const newLog: ActivityLog = {
          ...log,
          id: generateId(),
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          activityLogs: [newLog, ...state.activityLogs].slice(0, 100),
        }));
      },

      getStats: () => {
        const { requests, executors } = get();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const completedRequests = requests.filter(r => r.status === 'completed' && r.approvedAt);
        const completedToday = completedRequests.filter(r =>
          new Date(r.approvedAt!) >= today
        ).length;
        const completedWeek = completedRequests.filter(r =>
          new Date(r.approvedAt!) >= weekAgo
        ).length;

        let totalTime = 0;
        let count = 0;
        completedRequests.forEach(r => {
          if (r.workDuration) {
            totalTime += r.workDuration;
            count++;
          }
        });
        const avgCompletionTime = count > 0 ? Math.round(totalTime / count / 60) : 0;

        return {
          totalRequests: requests.length,
          newRequests: requests.filter(r => r.status === 'new').length,
          inProgress: requests.filter(r => ['assigned', 'accepted', 'in_progress'].includes(r.status)).length,
          pendingApproval: requests.filter(r => r.status === 'pending_approval').length,
          completedToday,
          completedWeek,
          avgCompletionTime,
          executorsOnline: executors.filter(e => e.status !== 'offline').length,
          executorsTotal: executors.length,
        };
      },

      getChartData: () => {
        const { requests } = get();
        const now = new Date();
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const chartData: ChartData[] = [];

        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

          const created = requests.filter(r => {
            const createdAt = new Date(r.createdAt);
            return createdAt >= dayStart && createdAt < dayEnd;
          }).length;

          const completed = requests.filter(r => {
            if (!r.approvedAt) return false;
            const approvedAt = new Date(r.approvedAt);
            return approvedAt >= dayStart && approvedAt < dayEnd;
          }).length;

          chartData.push({
            date: dayStart.toISOString(),
            name: days[date.getDay() === 0 ? 6 : date.getDay() - 1],
            created,
            completed,
          });
        }

        return chartData;
      },

      fetchSettings: async () => {
        try {
          const { settingsApi } = await import('../services/api');
          const response = await settingsApi.getAll();
          if (response.success && response.data?.settings) {
            const apiSettings = response.data.settings;
            // Map API settings to local format
            set((state) => ({
              settings: {
                ...state.settings,
                companyName: apiSettings.companyName ?? state.settings.companyName,
                companyInn: apiSettings.companyInn ?? state.settings.companyInn,
                companyAddress: apiSettings.companyAddress ?? state.settings.companyAddress,
                companyPhone: apiSettings.companyPhone ?? state.settings.companyPhone,
                routingMode: apiSettings.routingMode ?? state.settings.routingMode,
                workingHoursStart: apiSettings.workingHoursStart ?? state.settings.workingHoursStart,
                workingHoursEnd: apiSettings.workingHoursEnd ?? state.settings.workingHoursEnd,
                autoAssign: apiSettings.autoAssign ?? state.settings.autoAssign,
                notifyOnNew: apiSettings.notifyOnNew ?? state.settings.notifyOnNew,
                notifyOnComplete: apiSettings.notifyOnComplete ?? state.settings.notifyOnComplete,
                notifyOnRating: apiSettings.notifyOnRating ?? state.settings.notifyOnRating,
                smsNotifications: apiSettings.smsNotifications ?? state.settings.smsNotifications,
                emailNotifications: apiSettings.emailNotifications ?? state.settings.emailNotifications,
                pushNotifications: apiSettings.pushNotifications ?? state.settings.pushNotifications,
              },
            }));
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        }
      },

      updateSettings: async (newSettings) => {
        // Optimistically update local state
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));

        // Sync to API
        try {
          const { settingsApi } = await import('../services/api');
          await settingsApi.updateMany(newSettings);
        } catch (error) {
          console.error('Failed to save settings to API:', error);
          // Settings already updated locally, API will sync on next fetch
        }
      },

      // Reschedule actions - using API for cross-user sync
      fetchPendingReschedules: async () => {
        try {
          const { rescheduleApi } = await import('../services/api');
          const response = await rescheduleApi.getPending();
          const reschedules = response.reschedules || [];

          // Map API response to RescheduleRequest type
          const mappedReschedules: RescheduleRequest[] = reschedules.map((r: any) => ({
            id: r.id,
            requestId: r.request_id,
            requestNumber: r.request_number || r.request_title || `#${r.request_id?.substring(0, 6)}`,
            initiator: r.initiator as RescheduleInitiator,
            initiatorId: r.initiator_id,
            initiatorName: r.initiator_name,
            recipientId: r.recipient_id,
            recipientName: r.recipient_name,
            recipientRole: r.recipient_role as 'resident' | 'executor',
            currentDate: r.current_date,
            currentTime: r.current_time,
            proposedDate: r.proposed_date,
            proposedTime: r.proposed_time,
            reason: r.reason as RescheduleReason,
            reasonText: r.reason_text,
            status: r.status as 'pending' | 'accepted' | 'rejected' | 'expired',
            responseNote: r.response_note,
            createdAt: r.created_at,
            respondedAt: r.responded_at,
            expiresAt: r.expires_at,
          }));

          set({ rescheduleRequests: mappedReschedules });
        } catch (error) {
          console.error('Failed to fetch pending reschedules:', error);
        }
      },

      createRescheduleRequest: async (data) => {
        const state = get();
        const request = state.requests.find(r => r.id === data.requestId);
        if (!request) return null;

        const { user } = useAuthStore.getState();
        if (!user) return null;

        try {
          const { requestsApi } = await import('../services/api');
          const response = await requestsApi.createReschedule(data.requestId, {
            proposed_date: data.proposedDate,
            proposed_time: data.proposedTime,
            reason: data.reason,
            reason_text: data.reasonText,
          });

          if (response.reschedule) {
            const r = response.reschedule;
            const newReschedule: RescheduleRequest = {
              id: r.id,
              requestId: r.request_id,
              requestNumber: request.number,
              initiator: r.initiator as RescheduleInitiator,
              initiatorId: r.initiator_id,
              initiatorName: r.initiator_name,
              recipientId: r.recipient_id,
              recipientName: r.recipient_name,
              recipientRole: r.recipient_role as 'resident' | 'executor',
              currentDate: r.current_date,
              currentTime: r.current_time,
              proposedDate: r.proposed_date,
              proposedTime: r.proposed_time,
              reason: r.reason as RescheduleReason,
              reasonText: r.reason_text,
              status: 'pending',
              createdAt: r.created_at,
              expiresAt: r.expires_at,
            };

            set((state) => ({
              rescheduleRequests: [newReschedule, ...state.rescheduleRequests],
            }));

            return newReschedule;
          }
          return null;
        } catch (error) {
          console.error('Failed to create reschedule request:', error);
          return null;
        }
      },

      respondToRescheduleRequest: async (rescheduleId, accepted, responseNote) => {
        const state = get();
        const reschedule = state.rescheduleRequests.find(r => r.id === rescheduleId);
        if (!reschedule || reschedule.status !== 'pending') return;

        try {
          const { rescheduleApi } = await import('../services/api');
          const response = await rescheduleApi.respond(rescheduleId, accepted, responseNote);

          if (response.reschedule) {
            // Update local state
            set((state) => ({
              rescheduleRequests: state.rescheduleRequests.map((r) =>
                r.id === rescheduleId
                  ? {
                      ...r,
                      status: accepted ? 'accepted' as const : 'rejected' as const,
                      respondedAt: new Date().toISOString(),
                      responseNote,
                    }
                  : r
              ),
            }));

            // If accepted, update the request's scheduled date/time
            if (accepted) {
              set((state) => ({
                requests: state.requests.map((r) =>
                  r.id === reschedule.requestId
                    ? {
                        ...r,
                        scheduledDate: reschedule.proposedDate,
                        scheduledTime: reschedule.proposedTime,
                      }
                    : r
                ),
              }));

              // Refresh requests to get updated data from server
              get().fetchRequests();
            }
          }
        } catch (error) {
          console.error('Failed to respond to reschedule request:', error);
        }
      },

      getRescheduleRequestsByRequest: (requestId) => {
        return get().rescheduleRequests.filter(r => r.requestId === requestId);
      },

      getPendingRescheduleForUser: (userId) => {
        return get().rescheduleRequests.filter(
          r => r.recipientId === userId && r.status === 'pending'
        );
      },

      getActiveRescheduleForRequest: (requestId) => {
        return get().rescheduleRequests.find(
          r => r.requestId === requestId && r.status === 'pending'
        );
      },

      getConfirmedRescheduleForRequest: (requestId) => {
        // Find recently accepted reschedule (within last 24 hours)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return get().rescheduleRequests.find(
          r => r.requestId === requestId &&
               r.status === 'accepted' &&
               r.respondedAt &&
               new Date(r.respondedAt).getTime() > oneDayAgo
        );
      },
    }),
    {
      name: 'uk-data-storage',
      // MINIMAL PERSISTENCE - only settings that are truly local
      // All data now comes from API (D1 database)
      partialize: (state) => ({
        // Only persist local UI settings that don't have API endpoints yet
        settings: state.settings,
        // Keep notifications for offline display
        notifications: state.notifications.slice(0, 100),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DataState>;
        // Demo code for QR testing
        const demoCode = createDemoGuestAccessCode();

        return {
          ...currentState,
          settings: persisted.settings || currentState.settings,
          notifications: persisted.notifications || [],
          // All data starts empty - will be fetched from API
          vehicles: [],
          announcements: [],
          requests: [],
          guestAccessCodes: [demoCode],
          executors: [], // Empty - will be fetched from API
          rescheduleRequests: [],
          rentalApartments: [],
          rentalRecords: [],
        };
      },
    }
  )
);

// Cross-tab synchronization for localStorage changes
// This ensures QR code status updates are synced between guard and resident
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'uk-data-storage' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed.state?.guestAccessCodes) {
          // Update guestAccessCodes from another tab
          useDataStore.setState({ guestAccessCodes: parsed.state.guestAccessCodes });
        }
      } catch (e) {
        console.error('Failed to sync storage:', e);
      }
    }
  });
}
