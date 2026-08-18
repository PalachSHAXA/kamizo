// CRM APIs: Owners, Personal Accounts, CRM Residents, Meters, Meter Readings

import { apiRequest } from './client';
import type { Meter, MeterReading, Owner, PersonalAccount, Resident } from '../../types';

export interface OwnerApiResponse extends Record<string, unknown> {
  id: string;
  type?: Owner['type'];
  last_name: string;
  first_name: string;
  middle_name?: string;
  full_name: string;
  company_name?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legal_address?: string;
  director_name?: string;
  passport_series?: string;
  passport_number?: string;
  passport_issued_by?: string;
  passport_issued_date?: string;
  birth_date?: string;
  birth_place?: string;
  registration_address?: string;
  actual_address?: string;
  phone: string;
  additional_phone?: string;
  email?: string;
  preferred_contact?: Owner['preferredContact'];
  ownership_type?: Owner['ownershipType'];
  ownership_share?: number;
  ownership_document?: string;
  ownership_document_date?: string;
  apartment_ids?: string;
  personal_account_ids?: string;
  is_active?: boolean | number;
  is_verified?: boolean | number;
  verified_at?: string;
  verified_by?: string;
  bank_name?: string;
  bank_bik?: string;
  bank_account?: string;
  tags?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalAccountApiResponse extends Record<string, unknown> {
  id: string;
  number: string;
  apartment_id: string;
  building_id: string;
  primary_owner_id: string;
  owner_name: string;
  apartment_number: string;
  address: string;
  total_area?: number;
  residents_count?: number;
  registered_count?: number;
  balance?: number;
  current_debt?: number;
  penalty_amount?: number;
  last_payment_date?: string;
  last_payment_amount?: number;
  last_charge_date?: string;
  last_charge_amount?: number;
  tariff_plan_id?: string;
  has_subsidy?: boolean | number;
  subsidy_percent?: number;
  subsidy_end_date?: string;
  has_discount?: boolean | number;
  discount_percent?: number;
  discount_reason?: string;
  status?: PersonalAccount['status'];
  closed_at?: string;
  closed_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ResidentApiResponse extends Record<string, unknown> {
  id: string;
  apartment_id: string;
  owner_id?: string;
  last_name: string;
  first_name: string;
  middle_name?: string;
  full_name: string;
  birth_date?: string;
  resident_type?: Resident['residentType'];
  relation_to_owner?: string;
  registration_type?: Resident['registrationType'];
  registration_date?: string;
  registration_end_date?: string;
  phone?: string;
  additional_phone?: string;
  email?: string;
  is_active?: boolean | number;
  moved_in_date?: string;
  moved_out_date?: string;
  moved_out_reason?: string;
  passport_series?: string;
  passport_number?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

// Owners API (CRM)
export const ownersApi = {
  getAll: async <T extends Record<string, unknown> = Record<string, unknown>>(options?: { type?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.search) params.append('search', options.search);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ owners: T[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/owners${query}`
    );
  },

  getById: async <
    O extends Record<string, unknown> = Record<string, unknown>,
    A extends Record<string, unknown> = Record<string, unknown>,
  >(id: string) => {
    return apiRequest<{ owner: O; apartments: A[] }>(`/api/owners/${id}`);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(owner: {
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
    return apiRequest<{ owner: T }>('/api/owners', {
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
    return apiRequest<{ owner: OwnerApiResponse }>(`/api/owners/${id}`, {
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
    return apiRequest<{ accounts: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
      `/api/buildings/${buildingId}/accounts${query}`
    );
  },

  getById: async (id: string) => {
    return apiRequest<{ account: Record<string, unknown> }>(`/api/accounts/${id}`);
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
    return apiRequest<{ account: Record<string, unknown> }>('/api/accounts', {
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
    return apiRequest<{ account: Record<string, unknown> }>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  getDebtors: async (options?: { minDebt?: number; buildingId?: string }) => {
    const params = new URLSearchParams();
    if (options?.minDebt) params.append('min_debt', options.minDebt.toString());
    if (options?.buildingId) params.append('building_id', options.buildingId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ debtors: Record<string, unknown>[] }>(`/api/accounts/debtors${query}`);
  },
};

// CRM Residents API
export const crmResidentsApi = {
  getByApartment: async <T extends Record<string, unknown> = Record<string, unknown>>(apartmentId: string, options?: { isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ residents: T[] }>(`/api/apartments/${apartmentId}/residents${query}`);
  },

  getById: async <T extends Record<string, unknown> = Record<string, unknown>>(id: string) => {
    return apiRequest<{ resident: T }>(`/api/residents/${id}`);
  },

  create: async <T extends Record<string, unknown> = Record<string, unknown>>(apartmentId: string, resident: {
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
    return apiRequest<{ resident: T }>(`/api/apartments/${apartmentId}/residents`, {
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
    return apiRequest<{ resident: ResidentApiResponse }>(`/api/residents/${id}`, {
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
export interface MeterDto {
  id: string;
  apartment_id?: string;
  building_id?: string;
  type: Meter['type'];
  serial_number: string;
  model?: string;
  brand?: string;
  install_date: string;
  verification_date: string;
  next_verification_date: string;
  seal_number?: string;
  install_location: string;
  initial_value: number;
  current_value: number;
  last_reading_date?: string;
  is_active: boolean | number;
  is_common: boolean | number;
  tariff_zone?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MeterReadingDto {
  id: string;
  meter_id: string;
  value: number;
  previous_value: number;
  consumption: number;
  reading_date: string;
  source: MeterReading['source'];
  submitted_by?: string;
  submitted_at: string;
  is_verified: boolean | number;
  verified_by?: string;
  verified_at?: string;
  photo_url?: string;
  status?: MeterReading['status'];
  rejection_reason?: string;
  notes?: string;
  created_at?: string;
}

export const metersApi = {
  getByApartment: async (apartmentId: string, options?: { type?: string; isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isActive !== undefined) params.append('is_active', options.isActive.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: MeterDto[] }>(`/api/apartments/${apartmentId}/meters${query}`);
  },

  getByBuilding: async (buildingId: string, options?: { type?: string; isCommon?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.isCommon !== undefined) params.append('is_common', options.isCommon.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ meters: MeterDto[] }>(`/api/buildings/${buildingId}/meters${query}`);
  },

  getById: async (id: string) => {
    return apiRequest<{ meter: MeterDto; readings: MeterReadingDto[] }>(`/api/meters/${id}`);
  },

  create: async (meter: {
    apartmentId?: string;
    buildingId?: string;
    type: Meter['type'];
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
    return apiRequest<{ meter: MeterDto }>('/api/meters', {
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
    return apiRequest<{ meter: MeterDto }>(`/api/meters/${id}`, {
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
    return apiRequest<{ readings: MeterReadingDto[] }>(`/api/meters/${meterId}/readings${query}`);
  },

  getLastReading: async (meterId: string) => {
    return apiRequest<{ reading: MeterReadingDto | null }>(`/api/meters/${meterId}/last-reading`);
  },

  submit: async (meterId: string, reading: {
    value: number;
    readingDate?: string;
    photoUrl?: string;
    notes?: string;
  }) => {
    return apiRequest<{ reading: MeterReadingDto }>(`/api/meters/${meterId}/readings`, {
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
