import { create } from 'zustand';
import type { Vehicle } from '../types';
import { vehiclesApi } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface VehicleState {
  vehicles: Vehicle[];
  isLoadingVehicles: boolean;

  fetchVehicles: (forStaff?: boolean) => Promise<void>;
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt'>) => Promise<Vehicle | null>;
  updateVehicle: (id: string, data: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehiclesByOwner: (ownerId: string) => Vehicle[];
  searchVehicleByPlate: (plateNumber: string) => Promise<Vehicle | undefined>;
  searchVehiclesByPlate: (plateNumber: string) => Promise<Vehicle[]>;
}

export const useVehicleStore = create<VehicleState>()(
  (set, get) => ({
    vehicles: [],
    isLoadingVehicles: false,

    fetchVehicles: async (forStaff = false) => {
      set({ isLoadingVehicles: true });
      try {
        // Use different endpoint based on whether we need all vehicles or just user's own
        const response = forStaff
          ? await vehiclesApi.getAll()  // /api/vehicles/all - all vehicles for staff
          : await vehiclesApi.getMyVehicles();  // /api/vehicles - only user's vehicles
        // Map API response to Vehicle type (API now returns all fields from DB + owner info)
        const mappedVehicles: Vehicle[] = (response.vehicles || []).map((v: Record<string, unknown>) => ({
          id: v.id,
          ownerId: v.user_id,
          ownerName: v.owner_name || '',
          ownerPhone: v.owner_phone || '',
          apartment: v.apartment || '',
          address: v.address || '',
          plateNumber: (v.plate_number as string) || '',
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
        set({ vehicles: mappedVehicles, isLoadingVehicles: false });
      } catch (error) {
        console.error('Failed to fetch vehicles:', error);
        set({ isLoadingVehicles: false });
      }
    },

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
          return response.vehicles.map((v: Record<string, unknown>) => ({
            id: v.id as string,
            ownerId: v.user_id as string,
            ownerName: (v.owner_name as string) || '',
            ownerPhone: (v.owner_phone as string) || '',
            apartment: (v.apartment as string) || '',
            address: (v.address as string) || '',
            plateNumber: v.plate_number as string,
            brand: (v.brand as string) || '',
            model: (v.model as string) || '',
            color: (v.color as string) || '',
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
  })
);
