// CRM APIs: Owners, Personal Accounts, CRM Residents, Meters, Meter Readings

import { apiRequest } from './client';

// Owners API (CRM)
export const ownersApi = {
  getAll: async (options?: { type?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.search) params.append('search', options.search);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ owners: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/owners${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ owner: any; apartments: any[] }>(`/api/owners/${id}`);
  },

  create: async (owner: {
    type?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    ownershipType?: string;
    ownershipShare?: number;
  }) => {
    return apiRequest<{ owner: any }>('/api/owners', {
      method: 'POST',
      body: JSON.stringify(owner),
    });
  },

  update: async (id: string, updates: Partial<{
    lastName: string;
    firstName: string;
    middleName: string;
    fullName: string;
    phone: string;
    email: string;
    isActive: boolean;
    isVerified: boolean;
  }>) => {
    return apiRequest<{ owner: any }>(`/api/owners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${id}`, {
      method: 'DELETE',
    });
  },

  linkToApartment: async (ownerId: string, apartmentId: string, data?: {
    ownershipShare?: number;
    isPrimary?: boolean;
    startDate?: string;
  }) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${ownerId}/apartments/${apartmentId}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  unlinkFromApartment: async (ownerId: string, apartmentId: string) => {
    return apiRequest<{ success: boolean }>(`/api/owners/${ownerId}/apartments/${apartmentId}`, {
      method: 'DELETE',
    });
  },
};

// Personal Accounts API (CRM)
export const personalAccountsApi = {
  getByBuilding: async (buildingId: string, options?: {
    status?: string;
    hasDebt?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.hasDebt) params.append('has_debt', 'true');
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ accounts: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/accounts${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ account: any }>(`/api/accounts/${id}`);
  },

  create: async (account: {
    apartmentId: string;
    buildingId: string;
    primaryOwnerId?: string;
    ownerName?: string;
    apartmentNumber?: string;
    totalArea?: number;
    residentsCount?: number;
    balance?: number;
    currentDebt?: number;
  }) => {
    return apiRequest<{ account: any }>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    });
  },

  update: async (id: string, updates: Partial<{
    ownerName: string;
    balance: number;
    currentDebt: number;
    penaltyAmount: number;
    status: string;
  }>) => {
    return apiRequest<{ account: any }>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  getDebtors: async (options?: { minDebt?: number; buildingId?: string }) => {
    const params = new URLSearchParams();
    if (options?.minDebt) params.append('min_debt', options.minDebt.toString());
    if (options?.buildingId) params.append('building_id', options.buildingId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ debtors: any[] }>(`/api/accounts/debtors${query}`);
  },
};

// CRM Residents API
export const crmResidentsApi = {
  getByApartment: async (apartmentId: string, options?: { isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ residents: any[] }>(`/api/apartments/${apartmentId}/residents${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ resident: any }>(`/api/residents/${id}`);
  },

  create: async (apartmentId: string, resident: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    fullName?: string;
    birthDate?: string;
    residentType?: string;
    relationToOwner?: string;
    registrationType?: string;
    registrationDate?: string;
    phone?: string;
    email?: string;
    movedInDate?: string;
    ownerId?: string;
  }) => {
    return apiRequest<{ resident: any }>(`/api/apartments/${apartmentId}/residents`, {
      method: 'POST',
      body: JSON.stringify(resident),
    });
  },

  update: async (id: string, updates: Partial<{
    lastName: string;
    firstName: string;
    middleName: string;
    fullName: string;
    birthDate: string;
    residentType: string;
    phone: string;
    email: string;
    isActive: boolean;
    movedOutDate: string;
    movedOutReason: string;
  }>) => {
    return apiRequest<{ resident: any }>(`/api/residents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/residents/${id}`, {
      method: 'DELETE',
    });
  },

  moveOut: async (id: string, data: { movedOutDate?: string; reason?: string }) => {
    return apiRequest<{ success: boolean }>(`/api/residents/${id}/move-out`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Meters API (CRM)
export const metersApi = {
  getByApartment: async (apartmentId: string, options?: { type?: string; isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: any[] }>(`/api/apartments/${apartmentId}/meters${query}`);
  },

  getByBuilding: async (buildingId: string, options?: { type?: string; isCommon?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isCommon !== undefined) params.append('is_common', options.isCommon.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: any[] }>(`/api/buildings/${buildingId}/meters${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ meter: any; readings: any[] }>(`/api/meters/${id}`);
  },

  create: async (meter: {
    apartmentId?: string;
    buildingId?: string;
    type: 'cold_water' | 'hot_water' | 'electricity' | 'gas' | 'heating';
    isCommon?: boolean;
    serialNumber: string;
    model?: string;
    brand?: string;
    installDate?: string;
    location?: string;
    initialValue?: number;
    verificationDate?: string;
    nextVerificationDate?: string;
    sealNumber?: string;
  }) => {
    return apiRequest<{ meter: any }>('/api/meters', {
      method: 'POST',
      body: JSON.stringify(meter),
    });
  },

  update: async (id: string, updates: Partial<{
    serialNumber: string;
    model: string;
    brand: string;
    location: string;
    verificationDate: string;
    nextVerificationDate: string;
    sealNumber: string;
    isActive: boolean;
    currentValue: number;
    lastReadingDate: string;
    notes: string;
  }>) => {
    return apiRequest<{ meter: any }>(`/api/meters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/meters/${id}`, {
      method: 'DELETE',
    });
  },

  decommission: async (id: string, reason?: string) => {
    return apiRequest<{ success: boolean }>(`/api/meters/${id}/decommission`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

// Meter Readings API
export const meterReadingsApi = {
  getByMeter: async (meterId: string, options?: { limit?: number; offset?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ readings: any[] }>(`/api/meters/${meterId}/readings${query}`);
  },

  getLastReading: async (meterId: string) => {
    return apiRequest<{ reading: any | null }>(`/api/meters/${meterId}/last-reading`);
  },

  submit: async (meterId: string, reading: {
    value: number;
    readingDate?: string;
    photoUrl?: string;
    notes?: string;
  }) => {
    return apiRequest<{ reading: any }>(`/api/meters/${meterId}/readings`, {
      method: 'POST',
      body: JSON.stringify(reading),
    });
  },

  verify: async (readingId: string, data: { approved: boolean; rejectionReason?: string }) => {
    return apiRequest<{ success: boolean }>(`/api/meter-readings/${readingId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
