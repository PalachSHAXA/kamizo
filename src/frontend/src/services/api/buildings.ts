// Buildings API, Branches API, Entrances API, Building Documents API, Apartments API (CRM)

import { apiRequest, cachedGet, invalidateCache, CACHE_TTL } from './client';
import type { Apartment, BuildingDocument, BuildingFull, Entrance } from '../../types';

export interface BuildingApiResponse extends Record<string, unknown> {
  id: string;
  name: string;
  address: string;
  zone?: string;
  cadastral_number?: string;
  branch_code?: string;
  building_number?: string;
  floors?: number;
  entrances_actual?: number;
  entrances_count?: number;
  apartments_actual?: number;
  apartments_count?: number;
  total_area?: number;
  living_area?: number;
  common_area?: number;
  land_area?: number;
  year_built?: number;
  year_renovated?: number;
  building_type?: BuildingFull['buildingType'];
  roof_type?: BuildingFull['roofType'];
  wall_material?: string;
  foundation_type?: string;
  has_elevator?: boolean | number;
  elevator_count?: number;
  has_gas?: boolean | number;
  heating_type?: BuildingFull['heatingType'];
  has_hot_water?: boolean | number;
  water_supply_type?: BuildingFull['waterSupplyType'];
  sewerage_type?: BuildingFull['sewerageType'];
  has_intercom?: boolean | number;
  has_video_surveillance?: boolean | number;
  has_concierge?: boolean | number;
  has_parking_lot?: boolean | number;
  parking_spaces?: number;
  has_playground?: boolean | number;
  manager_id?: string;
  manager_name?: string;
  management_start_date?: string;
  contract_number?: string;
  contract_end_date?: string;
  monthly_budget?: number;
  reserve_fund?: number;
  total_debt?: number;
  collection_rate?: number;
  residents_count?: number;
  owners_count?: number;
  tenants_count?: number;
  vacant_apartments?: number;
  active_requests_count?: number;
  created_at: string;
  updated_at: string;
}

export interface BranchApiResponse extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
}

export interface EntranceApiResponse extends Record<string, unknown> {
  id: string;
  building_id: string;
  number: number;
  floors_from?: number;
  floors_to: number;
  apartments_from: number;
  apartments_to: number;
  has_elevator?: boolean | number;
  elevator_id?: string;
  intercom_type?: Entrance['intercomType'];
  intercom_code?: string;
  cleaning_schedule?: string;
  responsible_id?: string;
  last_inspection?: string;
  notes?: string;
}

export interface BuildingDocumentApiResponse extends Record<string, unknown> {
  id: string;
  building_id: string;
  name: string;
  type: BuildingDocument['type'];
  file_url: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string;
  expires_at?: string;
  is_active: boolean | number;
}

export interface ApartmentApiResponse extends Record<string, unknown> {
  id: string;
  building_id: string;
  entrance_id: string;
  number: string;
  floor?: number;
  rooms?: number;
  total_area?: number;
  living_area?: number;
  kitchen_area?: number;
  balcony_area?: number;
  loggia_area?: number;
  ceiling_height?: number;
  has_balcony?: boolean | number;
  has_loggia?: boolean | number;
  has_storage?: boolean | number;
  has_parking?: boolean | number;
  parking_number?: string;
  ownership_type?: Apartment['ownershipType'];
  ownership_share?: number;
  registration_number?: string;
  registration_date?: string;
  status?: Apartment['status'];
  is_commercial?: boolean | number;
  commercial_type?: string;
  personal_account_id?: string;
  primary_owner_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Branches API (CRM)
export const branchesApi = {
  getAll: async () => {
    return cachedGet<{ branches: BranchApiResponse[] }>('/api/branches', CACHE_TTL.LONG);
  },

  getById: async (id: string) => {
    return apiRequest<{ branch: Record<string, unknown> }>(`/api/branches/${id}`);
  },
};

// Buildings API (CRM)
export const buildingsApi = {
  getAll: async <T extends Record<string, unknown> = Record<string, unknown>>() => {
    // Buildings rarely change - use long cache
    return cachedGet<{ buildings: T[] }>('/api/buildings', CACHE_TTL.LONG);
  },

  getById: async <
    B extends Record<string, unknown> = Record<string, unknown>,
    E extends Record<string, unknown> = Record<string, unknown>,
    D extends Record<string, unknown> = Record<string, unknown>,
  >(id: string) => {
    return cachedGet<{ building: B; entrances: E[]; documents: D[] }>(`/api/buildings/${id}`, CACHE_TTL.LONG);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(building: {
    name: string;
    address: string;
    zone?: string;
    cadastralNumber?: string;
    branchCode?: string;
    buildingNumber?: string;
    floors?: number;
    entrances?: number;
    totalApartments?: number;
    totalArea?: number;
    livingArea?: number;
    commonArea?: number;
    landArea?: number;
    yearBuilt?: number;
    yearRenovated?: number;
    buildingType?: string;
    roofType?: string;
    wallMaterial?: string;
    foundationType?: string;
    hasElevator?: boolean;
    elevatorCount?: number;
    hasGas?: boolean;
    heatingType?: string;
    hasHotWater?: boolean;
    waterSupplyType?: string;
    sewerageType?: string;
    hasIntercom?: boolean;
    hasVideoSurveillance?: boolean;
    hasConcierge?: boolean;
    hasParkingLot?: boolean;
    parkingSpaces?: number;
    hasPlayground?: boolean;
    managerId?: string;
    managerName?: string;
    monthlyBudget?: number;
    reserveFund?: number;
  }) => {
    const result = await apiRequest<{ building: T }>('/api/buildings', {
      method: 'POST',
      body: JSON.stringify(building),
    });
    // Invalidate buildings cache after creation
    invalidateCache('/api/buildings');
    return result;
  },

  update: async (id: string, updates: Partial<{
    name: string;
    address: string;
    zone: string;
    cadastralNumber: string;
    branchCode: string;
    buildingNumber: string;
    floors: number;
    entrances: number;
    totalApartments: number;
    totalArea: number;
    livingArea: number;
    commonArea: number;
    landArea: number;
    yearBuilt: number;
    yearRenovated: number;
    buildingType: string;
    roofType: string;
    wallMaterial: string;
    foundationType: string;
    hasElevator: boolean;
    elevatorCount: number;
    hasGas: boolean;
    heatingType: string;
    hasHotWater: boolean;
    waterSupplyType: string;
    sewerageType: string;
    hasIntercom: boolean;
    hasVideoSurveillance: boolean;
    hasConcierge: boolean;
    hasParkingLot: boolean;
    parkingSpaces: number;
    hasPlayground: boolean;
    managerId: string;
    managerName: string;
    monthlyBudget: number;
    reserveFund: number;
    totalDebt: number;
    collectionRate: number;
  }>) => {
    const result = await apiRequest<{ building: BuildingApiResponse }>(`/api/buildings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    // Invalidate buildings cache after update
    invalidateCache('/api/buildings');
    return result;
  },

  delete: async (id: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/buildings/${id}`, {
      method: 'DELETE',
    });
    // Invalidate buildings cache after deletion
    invalidateCache('/api/buildings');
    return result;
  },
};

// Entrances API (CRM)
export const entrancesApi = {
  getByBuilding: async <T extends Record<string, unknown> = Record<string, unknown>>(buildingId: string) => {
    return apiRequest<{ entrances: T[] }>(`/api/buildings/${buildingId}/entrances`);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(buildingId: string, entrance: {
    number: number;
    floorsFrom?: number;
    floorsTo?: number;
    apartmentsFrom?: number;
    apartmentsTo?: number;
    hasElevator?: boolean;
    elevatorId?: string;
    intercomType?: string;
    intercomCode?: string;
    cleaningSchedule?: string;
    responsibleId?: string;
    notes?: string;
  }) => {
    return apiRequest<{ entrance: T }>(`/api/buildings/${buildingId}/entrances`, {
      method: 'POST',
      body: JSON.stringify(entrance),
    });
  },

  update: async (id: string, updates: Partial<{
    number: number;
    floorsFrom: number;
    floorsTo: number;
    apartmentsFrom: number;
    apartmentsTo: number;
    hasElevator: boolean;
    elevatorId: string;
    intercomType: string;
    intercomCode: string;
    cleaningSchedule: string;
    responsibleId: string;
    lastInspection: string;
    notes: string;
  }>) => {
    return apiRequest<{ entrance: EntranceApiResponse }>(`/api/entrances/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/entrances/${id}`, {
      method: 'DELETE',
    });
  },
};

// Building Documents API (CRM)
export const buildingDocumentsApi = {
  getByBuilding: async (buildingId: string) => {
    return apiRequest<{ documents: BuildingDocumentApiResponse[] }>(`/api/buildings/${buildingId}/documents`);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(buildingId: string, document: {
    name: string;
    type?: string;
    fileUrl: string;
    fileSize?: number;
    expiresAt?: string;
  }) => {
    return apiRequest<{ document: T }>(`/api/buildings/${buildingId}/documents`, {
      method: 'POST',
      body: JSON.stringify(document),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/building-documents/${id}`, {
      method: 'DELETE',
    });
  },
};

// Apartments API (CRM)
export const apartmentsApi = {
  getByBuilding: async <T extends Record<string, unknown> = Record<string, unknown>>(buildingId: string, options?: {
    entranceId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.entranceId) params.append('entrance_id', options.entranceId);
    if (options?.status) params.append('status', options.status);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ apartments: T[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/apartments${query}`
    );
  },

  getById: async <
    A extends Record<string, unknown> = Record<string, unknown>,
    O extends Record<string, unknown> = Record<string, unknown>,
    P extends Record<string, unknown> = Record<string, unknown>,
  >(id: string) => {
    return apiRequest<{ apartment: A; owners: O[]; personalAccount: P | null }>(`/api/apartments/${id}`);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(buildingId: string, apartment: {
    number: string;
    entranceId?: string;
    floor?: number;
    totalArea?: number;
    livingArea?: number;
    kitchenArea?: number;
    rooms?: number;
    hasBalcony?: boolean;
    hasLoggia?: boolean;
    status?: string;
  }) => {
    return apiRequest<{ apartment: T }>(`/api/buildings/${buildingId}/apartments`, {
      method: 'POST',
      body: JSON.stringify(apartment),
    });
  },

  update: async (id: string, updates: Partial<{
    entranceId: string;
    number: string;
    floor: number;
    totalArea: number;
    livingArea: number;
    rooms: number;
    status: string;
    primaryOwnerId: string;
    personalAccountId: string;
  }>) => {
    return apiRequest<{ apartment: ApartmentApiResponse }>(`/api/apartments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/apartments/${id}`, {
      method: 'DELETE',
    });
  },
};
