import { create } from 'zustand';
import { registerSessionStore } from './sessionRegistry';
import type { Vehicle, VehicleOwnerType, VehicleType } from '../types';
import type { VehicleDto } from '../services/api/vehicles';
import { vehiclesApi } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

const isVehicleType = (value: string | undefined): value is VehicleType =>
  value === 'car' || value === 'suv' || value === 'motorcycle' || value === 'truck' || value === 'other';

const isVehicleOwnerType = (value: string | undefined): value is VehicleOwnerType =>
  value === 'individual' || value === 'legal_entity' || value === 'service' || value === 'resident';

const mapVehicle = (vehicle: VehicleDto): Vehicle => ({
  id: vehicle.id,
  ownerId: vehicle.user_id || vehicle.resident_id || '',
  ownerName: vehicle.owner_name || '',
  ownerPhone: vehicle.owner_phone || '',
  apartment: vehicle.apartment || '',
  address: vehicle.address || '',
  plateNumber: vehicle.plate_number || '',
  brand: vehicle.brand || '',
  model: vehicle.model || '',
  color: vehicle.color || '',
  year: vehicle.year || undefined,
  type: isVehicleType(vehicle.vehicle_type) ? vehicle.vehicle_type : 'car',
  ownerType: isVehicleOwnerType(vehicle.owner_type) ? vehicle.owner_type : 'individual',
  companyName: vehicle.company_name || undefined,
  parkingSpot: vehicle.parking_spot || undefined,
  notes: vehicle.notes || undefined,
  createdAt: vehicle.created_at || '',
  updatedAt: vehicle.updated_at || undefined,
});

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
        const mappedVehicles = (response.vehicles || []).map(mapVehicle);
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
        const realVehicle = mapVehicle({
          ...v,
          user_id: v.user_id || vehicleData.ownerId,
          owner_name: v.owner_name || vehicleData.ownerName,
          owner_phone: v.owner_phone || vehicleData.ownerPhone,
          apartment: v.apartment || vehicleData.apartment,
          address: v.address || vehicleData.address,
          created_at: v.created_at || now,
        });

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
          return mapVehicle(response.vehicles[0]);
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
          return response.vehicles.map(mapVehicle);
        }
        return [];
      } catch (error) {
        console.error('Failed to search vehicles:', error);
        return [];
      }
    },
  })
);

registerSessionStore(useVehicleStore);
