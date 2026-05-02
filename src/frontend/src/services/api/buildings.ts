// Buildings API, Branches API, Entrances API, Building Documents API, Apartments API (CRM)

import { apiRequest, cachedGet, invalidateCache, CACHE_TTL } from './client';

// Branches API (CRM)
export const branchesApi = {
  getAll: async () => {
    return cachedGet<{ branches: Record<string, unknown>[] }>('/api/branches', CACHE_TTL.LONG);
  },

  getById: async (id: string) => {
    return apiRequest<{ branch: Record<string, unknown> }>(`/api/branches/${id}`);
  },
};

// Buildings API (CRM)
export const buildingsApi = {
  getAll: async () => {
    // Buildings rarely change - use long cache
    return cachedGet<{ buildings: Record<string, unknown>[] }>('/api/buildings', CACHE_TTL.LONG);
  },

  getById: async (id: string) => {
    return cachedGet<{ building: Record<string, unknown>; entrances: Record<string, unknown>[]; documents: Record<string, unknown>[] }>(`/api/buildings/${id}`, CACHE_TTL.LONG);
  },

  create: async (building: {
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
    const result = await apiRequest<{ building: Record<string, unknown> }>('/api/buildings', {
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
    const result = await apiRequest<{ building: Record<string, unknown> }>(`/api/buildings/${id}`, {
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
  getByBuilding: async (buildingId: string) => {
    return apiRequest<{ entrances: Record<string, unknown>[] }>(`/api/buildings/${buildingId}/entrances`);
  },

  create: async (buildingId: string, entrance: {
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
    return apiRequest<{ entrance: Record<string, unknown> }>(`/api/buildings/${buildingId}/entrances`, {
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
    return apiRequest<{ entrance: Record<string, unknown> }>(`/api/entrances/${id}`, {
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
    return apiRequest<{ documents: Record<string, unknown>[] }>(`/api/buildings/${buildingId}/documents`);
  },

  create: async (buildingId: string, document: {
    name: string;
    type?: string;
    fileUrl: string;
    fileSize?: number;
    expiresAt?: string;
  }) => {
    return apiRequest<{ document: Record<string, unknown> }>(`/api/buildings/${buildingId}/documents`, {
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
  getByBuilding: async (buildingId: string, options?: {
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
    return apiRequest<{ apartments: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/apartments${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ apartment: Record<string, unknown>; owners: Record<string, unknown>[]; personalAccount: Record<string, unknown> }>(`/api/apartments/${id}`);
  },

  create: async (buildingId: string, apartment: {
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
    return apiRequest<{ apartment: Record<string, unknown> }>(`/api/buildings/${buildingId}/apartments`, {
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
    return apiRequest<{ apartment: Record<string, unknown> }>(`/api/apartments/${id}`, {
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
