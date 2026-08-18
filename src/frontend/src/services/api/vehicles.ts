// Vehicles API & Rentals API

import { apiRequest, cachedGet, CACHE_TTL } from './client';
import type { RentalApartment, RentalRecord } from '../../types';

export interface RentalApartmentDto extends RentalApartment {
  ownerPassword?: string;
}

export interface RentalRecordDto extends RentalRecord {
  exchangeRate?: number | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
}

export interface VehicleDto {
  id: string;
  user_id: string;
  resident_id?: string;
  owner_name?: string;
  owner_phone?: string;
  apartment?: string;
  address?: string;
  plate_number: string;
  brand?: string;
  model?: string;
  color?: string;
  year?: number;
  vehicle_type?: string;
  owner_type?: string;
  company_name?: string;
  parking_spot?: string;
  notes?: string;
  is_primary?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const vehiclesApi = {
  // Get current user's vehicles only
  getMyVehicles: async () => {
    return cachedGet<{ vehicles: VehicleDto[] }>('/api/vehicles', CACHE_TTL.MEDIUM);
  },

  // Get ALL vehicles with pagination (for staff: admin, manager, executor, department_head)
  // Оптимизировано для 5000+ пользователей
  getAll: async (options?: { page?: number; limit?: number; search?: string }) => {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', String(options.page));
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.search) params.append('search', options.search);
    const query = params.toString();
    return apiRequest<{ vehicles: VehicleDto[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/vehicles/all${query ? '?' + query : ''}`
    );
  },

  getForResident: async (residentId: string) => {
    return cachedGet<{ vehicles: Record<string, unknown>[] }>(`/api/vehicles?resident_id=${residentId}`, CACHE_TTL.MEDIUM);
  },

  create: async (vehicle: {
    plate_number: string;
    brand?: string;
    model?: string;
    color?: string;
    year?: number;
    vehicle_type?: string;
    owner_type?: string;
    company_name?: string;
    parking_spot?: string;
    notes?: string;
    is_primary?: boolean;
  }) => {
    return apiRequest<{ vehicle: VehicleDto }>('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
  },

  update: async (vehicleId: string, updates: {
    plate_number?: string;
    brand?: string;
    model?: string;
    color?: string;
    year?: number;
    vehicle_type?: string;
    owner_type?: string;
    company_name?: string;
    parking_spot?: string;
    notes?: string;
    is_primary?: boolean;
  }) => {
    return apiRequest<{ vehicle: VehicleDto }>(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (vehicleId: string) => {
    return apiRequest<{ success: boolean }>(`/api/vehicles/${vehicleId}`, {
      method: 'DELETE',
    });
  },

  search: async (plateNumber: string) => {
    return apiRequest<{ vehicles: VehicleDto[] }>(`/api/vehicles/search?plate=${encodeURIComponent(plateNumber)}`);
  },
};

// Rentals API
export const rentalsApi = {
  // Apartments
  getApartments: async () => {
    return apiRequest<{ apartments: RentalApartmentDto[] }>('/api/rentals/apartments');
  },

  // Get my apartments (for tenants/commercial_owners)
  getMyApartments: async () => {
    return apiRequest<{ apartments: RentalApartmentDto[]; records: RentalRecordDto[] }>('/api/rentals/my-apartments');
  },

  createApartment: async (data: {
    name: string;
    address: string;
    apartment?: string;
    ownerName?: string;
    ownerPhone?: string;
    ownerLogin: string;
    ownerPassword: string;
    ownerType?: 'tenant' | 'commercial_owner';
    existingUserId?: string;
  }) => {
    return apiRequest<{ apartment: RentalApartmentDto }>('/api/rentals/apartments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateApartment: async (id: string, data: { name?: string; address?: string; apartment?: string; isActive?: boolean }) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/apartments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteApartment: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/apartments/${id}`, {
      method: 'DELETE',
    });
  },

  // Records
  getRecords: async (apartmentId?: string) => {
    const url = apartmentId ? `/api/rentals/records?apartmentId=${apartmentId}` : '/api/rentals/records';
    return apiRequest<{ records: RentalRecordDto[] }>(url);
  },

  createRecord: async (data: {
    apartmentId: string;
    guestNames: string;
    passportInfo?: string;
    checkInDate: string;
    checkOutDate: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    return apiRequest<{ record: RentalRecordDto }>('/api/rentals/records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRecord: async (id: string, data: {
    guestNames?: string;
    passportInfo?: string;
    checkInDate?: string;
    checkOutDate?: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteRecord: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/rentals/records/${id}`, {
      method: 'DELETE',
    });
  },
};
