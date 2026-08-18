import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import type { GuestAccessCode, GuestAccessLog, GuestAccessStats, GuestAccessStatus, VisitorType, AccessType, UserRole } from '../types';
import type { GuestAccessCodeDto } from '../services/api/guests';
import { guestCodesApi } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

const isVisitorType = (value: string): value is VisitorType =>
  value === 'courier' || value === 'guest' || value === 'taxi' || value === 'other';

const isAccessType = (value: string): value is AccessType =>
  value === 'single_use' || value === 'day' || value === 'week' || value === 'custom';

const isGuestAccessStatus = (value: string): value is GuestAccessStatus =>
  value === 'active' || value === 'expired' || value === 'used' || value === 'revoked';

const mapGuestAccessCode = (code: GuestAccessCodeDto): GuestAccessCode => ({
  id: code.id,
  residentId: code.user_id,
  residentName: code.resident_name || '',
  residentPhone: code.resident_phone || '',
  residentApartment: code.resident_apartment || '',
  residentAddress: code.resident_address || '',
  visitorType: isVisitorType(code.visitor_type) ? code.visitor_type : 'guest',
  visitorName: code.visitor_name || undefined,
  visitorPhone: code.visitor_phone || undefined,
  visitorVehiclePlate: code.visitor_vehicle_plate || undefined,
  accessType: isAccessType(code.access_type) ? code.access_type : 'single_use',
  validFrom: code.valid_from,
  validUntil: code.valid_until,
  maxUses: code.max_uses,
  currentUses: code.current_uses || 0,
  qrToken: code.qr_token,
  status: isGuestAccessStatus(code.status) ? code.status : 'active',
  notes: code.notes || undefined,
  createdAt: code.created_at,
  updatedAt: code.updated_at || undefined,
  revokedAt: code.revoked_at || undefined,
  revokedBy: code.revoked_by || undefined,
  revocationReason: code.revoked_reason || undefined,
  creatorName: code.creator_name || undefined,
  creatorApartment: code.creator_apartment || undefined,
  creatorPhone: code.creator_phone || undefined,
});

interface GuestPassTokenDto {
  i: string;
  rn?: string;
  rp?: string;
  ra?: string;
  rd?: string;
  vt: VisitorType;
  vn?: string;
  vp?: string;
  vv?: string;
  at: AccessType;
  vf: number;
  vu: number;
  mx: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const isGuestPassToken = (value: unknown): value is GuestPassTokenDto => {
  if (!isRecord(value)) return false;
  return typeof value.i === 'string'
    && typeof value.vt === 'string' && isVisitorType(value.vt)
    && typeof value.at === 'string' && isAccessType(value.at)
    && typeof value.vf === 'number' && Number.isFinite(value.vf)
    && typeof value.vu === 'number' && Number.isFinite(value.vu)
    && typeof value.mx === 'number' && Number.isFinite(value.mx);
};

interface GuestAccessState {
  guestAccessCodes: GuestAccessCode[];
  guestAccessLogs: GuestAccessLog[];
  isLoadingGuestCodes: boolean;

  fetchGuestCodes: () => Promise<void>;
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
}

export const useGuestAccessStore = create<GuestAccessState>()(
  (set, get) => ({
    guestAccessCodes: [],
    guestAccessLogs: [],
    isLoadingGuestCodes: false,

    fetchGuestCodes: async () => {
      set({ isLoadingGuestCodes: true });
      try {
        const response = await guestCodesApi.getAll();
        const mappedCodes = (response.codes || []).map(mapGuestAccessCode);
        set({ guestAccessCodes: mappedCodes, isLoadingGuestCodes: false });
      } catch (error) {
        console.error('Failed to fetch guest codes:', error);
        set({ isLoadingGuestCodes: false });
      }
    },

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
        if (!c) {
          console.error('Guest access API returned no code data');
          return null;
        }
        const newCode = mapGuestAccessCode({
          ...c,
          user_id: c.user_id || data.residentId,
          resident_name: c.resident_name || data.residentName,
          resident_phone: c.resident_phone || data.residentPhone,
          resident_apartment: c.resident_apartment || data.residentApartment,
          resident_address: c.resident_address || data.residentAddress,
        });

        set((state) => ({
          guestAccessCodes: [newCode, ...state.guestAccessCodes],
        }));

        // Refetch from API to ensure sync
        setTimeout(() => get().fetchGuestCodes(), 500);

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
      const state = get();
      let code = state.guestAccessCodes.find((c) => c.id === id);

      // If code not found in local storage but fullCode provided (self-contained token)
      // Add it to local storage for tracking
      if (!code && fullCode) {
        code = { ...fullCode, currentUses: 0, status: 'active' };

        // Add to state
        set((state) => ({
          guestAccessCodes: [code!, ...state.guestAccessCodes],
        }));
      }

      if (!code || code.status !== 'active') {
        return false;
      }

      const now = new Date();
      if (now > new Date(code.validUntil)) {
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

      return true;
    },

    validateGuestAccessCode: (qrToken) => {
      // Sprint 84 LAYER 2 — security role guard. Offline-fallback
      // validation of a GAPASS payload has NO tenant awareness (the
      // payload doesn't carry tenant_id, and re-issuing every existing
      // token to add it is out of scope). For a security guard who is
      // offline, "I decoded the token and the dates look fine" is NOT
      // a sufficient basis to admit a guest — the pass could belong to
      // any УК, and admitting cross-tenant guests is a real security
      // incident.
      //
      // The guard's job is to admit or refuse. Without server
      // confirmation they have NO basis to admit. Recommended UX flow
      // when this hits: radio dispatch, call the resident, or wait for
      // connectivity. Layer 1 in GuardQRScannerPage.tsx maps this
      // error code to a yellow/orange "Нет связи" banner with no
      // allow-entry button.
      //
      // We read the role directly from localStorage (auth-storage's
      // persisted shape) instead of importing useAuthStore to avoid
      // a require cycle (api/client → store → api). This mirrors how
      // pickErrorMessage reads language-storage in api/client.ts.
      try {
        const raw = localStorage.getItem('uk-auth-storage');
        if (raw) {
          const role = (JSON.parse(raw)?.state?.user?.role ?? '') as string;
          if (role === 'security') {
            return { valid: false, error: 'offline_not_allowed_for_security' };
          }
        }
      } catch { /* private mode / blocked storage — fall through; non-security paths are unchanged */ }

      const now = new Date();

      // Check if this is a self-contained token (starts with GAPASS:)
      if (qrToken.startsWith('GAPASS:')) {
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
          const parsedToken: unknown = JSON.parse(utf8Decoded);
          if (!isGuestPassToken(parsedToken)) {
            return { valid: false, error: 'invalid' };
          }
          const tokenData = parsedToken;

          // Create a GuestAccessCode object from the token data
          const code: GuestAccessCode = {
            id: tokenData.i,
            residentId: 'from-token',
            residentName: optionalString(tokenData.rn) || '',
            residentPhone: optionalString(tokenData.rp) || '',
            residentApartment: optionalString(tokenData.ra) || '',
            residentAddress: optionalString(tokenData.rd) || '',
            visitorType: tokenData.vt,
            visitorName: optionalString(tokenData.vn),
            visitorPhone: optionalString(tokenData.vp),
            visitorVehiclePlate: optionalString(tokenData.vv),
            accessType: tokenData.at,
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
            return { valid: false, code, error: 'expired' };
          }

          // Check if not yet valid
          if (now.getTime() < tokenData.vf) {
            return { valid: false, code, error: 'not_yet_valid' };
          }

          // Check if this code was already used (stored in local tracking)
          const state = get();
          const usedCodes = state.guestAccessCodes.filter(c => c.id === tokenData.i);
          const localCode = usedCodes.length > 0 ? usedCodes[0] : null;

          if (localCode) {
            // Use local tracking for status
            if (localCode.status === 'revoked') {
              return { valid: false, code: { ...code, ...localCode }, error: 'revoked' };
            }

            if (localCode.status === 'used' || localCode.currentUses >= tokenData.mx) {
              return { valid: false, code: { ...code, ...localCode }, error: 'already_used' };
            }

            // Update code with local data
            code.currentUses = localCode.currentUses;
            code.status = localCode.status;
          }

          return { valid: true, code };
        } catch (err) {
          console.error('Failed to decode GAPASS token:', err);
          return { valid: false, error: 'invalid' };
        }
      }

      // Legacy: check local storage for old-style tokens (GA-xxx-xxx)
      const state = get();
      const code = state.guestAccessCodes.find((c) => c.qrToken === qrToken);

      if (!code) {
        return { valid: false, error: 'invalid' };
      }

      // Check if expired
      if (now > new Date(code.validUntil)) {
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
        return { valid: false, code, error: 'not_yet_valid' };
      }

      // Check status
      if (code.status === 'revoked') {
        return { valid: false, code, error: 'revoked' };
      }

      if (code.status === 'used') {
        return { valid: false, code, error: 'already_used' };
      }

      if (code.status === 'expired') {
        return { valid: false, code, error: 'expired' };
      }

      // Check max uses
      if (code.currentUses >= code.maxUses) {
        return { valid: false, code, error: 'max_uses_reached' };
      }

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
  })
);

registerSessionStore(useGuestAccessStore);
