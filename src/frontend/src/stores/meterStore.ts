import { create } from 'zustand';
import type {
  Meter,
  MeterReading,
} from '../types';
import { metersApi, meterReadingsApi } from '../services/api';

const mapMeterFromApi = (m: Record<string, unknown>): Meter => ({
  id: m.id,
  apartmentId: m.apartment_id,
  buildingId: m.building_id,
  type: m.type,
  serialNumber: m.serial_number,
  model: m.model,
  brand: m.brand,
  installDate: m.install_date,
  verificationDate: m.verification_date,
  nextVerificationDate: m.next_verification_date,
  sealNumber: m.seal_number,
  location: m.install_location,
  initialValue: m.initial_value || 0,
  currentValue: m.current_value || 0,
  lastReadingDate: m.last_reading_date,
  isActive: m.is_active !== false && m.is_active !== 0,
  isCommon: !!m.is_common,
  tariffZone: m.tariff_zone,
  notes: m.notes,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
} as Meter);

const mapMeterReadingFromApi = (r: Record<string, unknown>): MeterReading => ({
  id: r.id,
  meterId: r.meter_id,
  value: r.value,
  previousValue: r.previous_value,
  consumption: r.consumption,
  readingDate: r.reading_date,
  source: r.source,
  submittedBy: r.submitted_by,
  submittedAt: r.submitted_at,
  isVerified: !!r.is_verified,
  verifiedBy: r.verified_by,
  verifiedAt: r.verified_at,
  photoUrl: r.photo_url,
  status: r.status,
  rejectionReason: r.rejection_reason,
  notes: r.notes,
  createdAt: r.created_at,
} as MeterReading);

interface MeterState {
  // Data
  meters: Meter[];
  meterReadings: MeterReading[];

  // Loading states
  isLoadingMeters: boolean;

  // API-driven meter actions
  fetchMetersByApartment: (apartmentId: string, options?: { type?: string; isActive?: boolean }) => Promise<Meter[]>;
  fetchMetersByBuilding: (buildingId: string, options?: { type?: string; isCommon?: boolean }) => Promise<Meter[]>;
  fetchMeterById: (id: string) => Promise<{ meter: Meter; readings: MeterReading[] } | null>;
  addMeter: (meter: Omit<Meter, 'id'>) => Promise<Meter | null>;
  updateMeter: (id: string, data: Partial<Meter>) => Promise<void>;
  deleteMeter: (id: string) => Promise<void>;
  decommissionMeter: (id: string, reason?: string) => Promise<void>;
  getMetersByApartment: (apartmentId: string) => Meter[];
  getCommonMetersByBuilding: (buildingId: string) => Meter[];

  // API-driven meter reading actions
  fetchMeterReadings: (meterId: string, options?: { limit?: number; offset?: number }) => Promise<MeterReading[]>;
  submitMeterReading: (meterId: string, reading: { value: number; readingDate?: string; photoUrl?: string }) => Promise<MeterReading | null>;
  verifyMeterReading: (readingId: string, approved: boolean, rejectionReason?: string) => Promise<void>;
  getMeterReadings: (meterId: string) => MeterReading[];
  getLastReading: (meterId: string) => MeterReading | undefined;
}

export const useMeterStore = create<MeterState>()(
  (set, get) => ({
    // Initialize with empty arrays
    meters: [],
    meterReadings: [],

    // Loading states
    isLoadingMeters: false,

    // ========== API-DRIVEN METER ACTIONS ==========

    fetchMetersByApartment: async (apartmentId: string, options?: { type?: string; isActive?: boolean }) => {
      set({ isLoadingMeters: true });
      try {
        const response = await metersApi.getByApartment(apartmentId, options);
        const meters = (response.meters || []).map(mapMeterFromApi);

        // Replace meters for this apartment
        set((state) => {
          const otherMeters = state.meters.filter((m) => m.apartmentId !== apartmentId);
          return { meters: [...otherMeters, ...meters], isLoadingMeters: false };
        });

        return meters;
      } catch (error) {
        console.error('Failed to fetch meters:', error);
        set({ isLoadingMeters: false });
        return [];
      }
    },

    fetchMetersByBuilding: async (buildingId: string, options?: { type?: string; isCommon?: boolean }) => {
      set({ isLoadingMeters: true });
      try {
        const response = await metersApi.getByBuilding(buildingId, options);
        const meters = (response.meters || []).map(mapMeterFromApi);

        // Replace building meters
        set((state) => {
          const otherMeters = state.meters.filter((m) => m.buildingId !== buildingId);
          return { meters: [...otherMeters, ...meters], isLoadingMeters: false };
        });

        return meters;
      } catch (error) {
        console.error('Failed to fetch building meters:', error);
        set({ isLoadingMeters: false });
        return [];
      }
    },

    fetchMeterById: async (id: string) => {
      try {
        const response = await metersApi.getById(id);
        if (!response.meter) return null;

        const meter = mapMeterFromApi(response.meter);
        const readings = (response.readings || []).map(mapMeterReadingFromApi);

        // Update local state
        set((state) => {
          const updatedMeters = state.meters.some((m) => m.id === id)
            ? state.meters.map((m) => (m.id === id ? meter : m))
            : [...state.meters, meter];

          // Replace readings for this meter
          const otherReadings = state.meterReadings.filter((r) => r.meterId !== id);
          return { meters: updatedMeters, meterReadings: [...otherReadings, ...readings] };
        });

        return { meter, readings };
      } catch (error) {
        console.error('Failed to fetch meter:', error);
        return null;
      }
    },

    addMeter: async (meterData) => {
      try {
        const response = await metersApi.create({
          apartmentId: meterData.apartmentId,
          buildingId: meterData.buildingId,
          type: meterData.type as string, // TODO: type this properly
          isCommon: meterData.isCommon,
          serialNumber: meterData.serialNumber,
          model: meterData.model,
          brand: meterData.brand,
          installDate: meterData.installDate,
          location: meterData.location,
          initialValue: meterData.initialValue,
          verificationDate: meterData.verificationDate,
          nextVerificationDate: meterData.nextVerificationDate,
          sealNumber: meterData.sealNumber,
        });
        if (response.meter) {
          const newMeter = mapMeterFromApi(response.meter);
          set((state) => ({ meters: [...state.meters, newMeter] }));
          return newMeter;
        }
        return null;
      } catch (error) {
        console.error('Failed to create meter:', error);
        return null;
      }
    },

    updateMeter: async (id, data) => {
      try {
        await metersApi.update(id, data as Record<string, unknown>); // TODO: type this properly
        set((state) => ({
          meters: state.meters.map((m) =>
            m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m
          ),
        }));
      } catch (error) {
        console.error('Failed to update meter:', error);
      }
    },

    deleteMeter: async (id) => {
      try {
        await metersApi.delete(id);
        set((state) => ({
          meters: state.meters.filter((m) => m.id !== id),
          meterReadings: state.meterReadings.filter((r) => r.meterId !== id),
        }));
      } catch (error) {
        console.error('Failed to delete meter:', error);
      }
    },

    decommissionMeter: async (id, reason) => {
      try {
        await metersApi.decommission(id, reason);
        set((state) => ({
          meters: state.meters.map((m) =>
            m.id === id ? { ...m, isActive: false } : m
          ),
        }));
      } catch (error) {
        console.error('Failed to decommission meter:', error);
      }
    },

    getMetersByApartment: (apartmentId) => {
      return get().meters.filter((m) => m.apartmentId === apartmentId);
    },

    getCommonMetersByBuilding: (buildingId) => {
      return get().meters.filter((m) => m.buildingId === buildingId && m.isCommon);
    },

    // ========== API-DRIVEN METER READING ACTIONS ==========

    fetchMeterReadings: async (meterId: string, options?: { limit?: number; offset?: number }) => {
      try {
        const response = await meterReadingsApi.getByMeter(meterId, options);
        const readings = (response.readings || []).map(mapMeterReadingFromApi);

        // Replace readings for this meter
        set((state) => {
          const otherReadings = state.meterReadings.filter((r) => r.meterId !== meterId);
          return { meterReadings: [...otherReadings, ...readings] };
        });

        return readings;
      } catch (error) {
        console.error('Failed to fetch meter readings:', error);
        return [];
      }
    },

    submitMeterReading: async (meterId, readingData) => {
      try {
        const response = await meterReadingsApi.submit(meterId, readingData);
        if (response.reading) {
          const newReading = mapMeterReadingFromApi(response.reading);

          // Update meter's current value and add reading to state
          set((state) => ({
            meterReadings: [...state.meterReadings, newReading],
            meters: state.meters.map((m) =>
              m.id === meterId
                ? {
                    ...m,
                    currentValue: readingData.value,
                    lastReadingDate: readingData.readingDate || new Date().toISOString().split('T')[0],
                  }
                : m
            ),
          }));

          return newReading;
        }
        return null;
      } catch (error) {
        console.error('Failed to submit meter reading:', error);
        return null;
      }
    },

    verifyMeterReading: async (readingId, approved, rejectionReason) => {
      try {
        await meterReadingsApi.verify(readingId, { approved, rejectionReason });

        set((state) => ({
          meterReadings: state.meterReadings.map((r) =>
            r.id === readingId
              ? { ...r, isVerified: approved, status: approved ? 'approved' : 'rejected', rejectionReason }
              : r
          ),
        }));
      } catch (error) {
        console.error('Failed to verify meter reading:', error);
      }
    },

    getMeterReadings: (meterId) => {
      return get()
        .meterReadings.filter((r) => r.meterId === meterId)
        .sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime());
    },

    getLastReading: (meterId) => {
      const readings = get().getMeterReadings(meterId);
      return readings.length > 0 ? readings[0] : undefined;
    },
  })
);
