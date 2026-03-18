import { create } from 'zustand';
import type { RentalApartment, RentalRecord } from '../types';
import { rentalsApi } from '../services/api';

interface RentalState {
  rentalApartments: RentalApartment[];
  rentalRecords: RentalRecord[];

  fetchRentals: () => Promise<void>;
  fetchMyRentals: () => Promise<void>;
  addRentalApartment: (apartment: Omit<RentalApartment, 'id' | 'createdAt' | 'isActive'> & { password: string; ownerType?: 'tenant' | 'commercial_owner'; existingUserId?: string }) => Promise<RentalApartment | null>;
  updateRentalApartment: (id: string, data: Partial<RentalApartment>) => Promise<void>;
  deleteRentalApartment: (id: string) => Promise<void>;
  getRentalApartmentsByOwner: (ownerId: string) => RentalApartment[];
  addRentalRecord: (record: Omit<RentalRecord, 'id' | 'createdAt'>) => Promise<RentalRecord | null>;
  updateRentalRecord: (id: string, data: Partial<RentalRecord>) => Promise<void>;
  deleteRentalRecord: (id: string) => Promise<void>;
  getRentalRecordsByApartment: (apartmentId: string) => RentalRecord[];
}

export const useRentalStore = create<RentalState>()(
  (set, get) => ({
    rentalApartments: [],
    rentalRecords: [],

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
      } catch (error) {
        console.error('[DataStore] Failed to fetch rentals:', error);
      }
    },

    fetchMyRentals: async () => {
      try {
        const response = await rentalsApi.getMyApartments();
        set({
          rentalApartments: response.apartments || [],
          rentalRecords: response.records || [],
        });
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
          existingUserId: (apartmentData as Record<string, unknown>).existingUserId as string | undefined,
        });

        if (response.apartment) {
          set((state) => ({ rentalApartments: [...state.rentalApartments, response.apartment] }));
          return response.apartment;
        }
        return null;
      } catch (err: unknown) {
        console.error('Failed to create rental apartment:', err);
        throw err; // Re-throw to allow UI to show the error
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
  })
);
