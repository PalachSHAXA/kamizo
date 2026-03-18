import type { BuildingFull } from '../../../../types';

// Branch type (from API)
export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  buildings_count: number;
  residents_count: number;
}

// Entrance type
export interface Entrance {
  id: string;
  building_id: string;
  number: number;
  floors_from?: number;
  floors_to?: number;
  apartments_from?: number;
  apartments_to?: number;
  has_elevator?: number;
  intercom_type?: string;
  intercom_code?: string;
}

// Navigation levels
export type ViewLevel = 'branches' | 'buildings' | 'entrances' | 'residents';

// Resident from API
export interface ApiResident {
  id: string;
  login: string;
  name: string;
  phone?: string;
  address?: string;
  apartment?: string;
  building_id?: string;
  entrance?: string;
  floor?: string;
  created_at?: string;
  contract_signed_at?: string;
  password_changed_at?: string;
  last_login_at?: string;
  vehicle_count?: number;
}

// Excel parser interface
export interface ExcelRow {
  personalAccount: string;
  fullName: string;
  address: string;
  totalArea?: number;
  entrance?: string;
  floor?: string;
}

// Mapped resident for UI
export interface MappedResident {
  id?: string;
  login: string;
  name: string;
  phone?: string;
  address?: string;
  apartment?: string;
  buildingId?: string;
  entrance?: string;
  floor?: string;
  createdAt?: string;
  contract_signed_at?: string;
  password_changed_at?: string;
  last_login_at?: string;
  vehicle_count?: number;
  password?: string;
  branch?: string;
  building?: string;
}

// Resident card data
export interface ResidentCardData {
  id?: string;
  login: string;
  name: string;
  address?: string;
  apartment?: string;
  phone?: string;
  branch?: string;
  building?: string;
}

export type { BuildingFull };
