import type { Vehicle, VehicleOwnerType, VehicleType } from '../../../../types';
import type { ApiResident } from './types';

export interface BranchItem {
  id: string;
  code: string;
  name: string;
  district?: string;
  buildings_count?: number;
  residents_count?: number;
}

export interface BuildingItem {
  id: string;
  name: string;
  branch_code: string;
  building_number: string;
}

export interface EntranceItem {
  id: string;
  building_id: string;
  number: number;
}

export interface ApartmentItem {
  id: string;
  number: string;
  status: string;
  entrance_id: string;
}

export interface ResidentSearchItem {
  id: string;
  name: string;
  phone?: string;
  apartment?: string;
  address?: string;
}

export interface ChangeLogItem {
  id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  reason: string;
  document_number?: string;
  document_date?: string;
  comment?: string;
  changed_by_name?: string;
  created_at: string;
}

const vehicleTypes: readonly VehicleType[] = ['car', 'suv', 'motorcycle', 'truck', 'other'];
const vehicleOwnerTypes: readonly VehicleOwnerType[] = ['individual', 'legal_entity', 'service', 'resident'];

function isVehicleType(value: string | undefined): value is VehicleType {
  return value !== undefined && vehicleTypes.some(type => type === value);
}

function isVehicleOwnerType(value: string | undefined): value is VehicleOwnerType {
  return value !== undefined && vehicleOwnerTypes.some(type => type === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : undefined;
}

function compact<T>(values: unknown[], mapper: (value: Record<string, unknown>) => T | null): T[] {
  return values.flatMap(value => {
    if (!isRecord(value)) return [];
    const mapped = mapper(value);
    return mapped ? [mapped] : [];
  });
}

export function mapBranchDtos(values: unknown[]): BranchItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const code = stringValue(value, 'code');
    const name = stringValue(value, 'name');
    if (!id || !code || !name) return null;
    return {
      id, code, name,
      ...(stringValue(value, 'district') !== undefined && { district: stringValue(value, 'district') }),
      ...(numberValue(value, 'buildings_count') !== undefined && { buildings_count: numberValue(value, 'buildings_count') }),
      ...(numberValue(value, 'residents_count') !== undefined && { residents_count: numberValue(value, 'residents_count') }),
    };
  });
}

export function mapBuildingDtos(values: unknown[]): BuildingItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const name = stringValue(value, 'name');
    const branchCode = stringValue(value, 'branch_code');
    const buildingNumber = stringValue(value, 'building_number');
    return id && name
      ? { id, name, branch_code: branchCode ?? '', building_number: buildingNumber ?? '' }
      : null;
  });
}

export function mapEntranceDtos(values: unknown[]): EntranceItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const buildingId = stringValue(value, 'building_id');
    const number = numberValue(value, 'number');
    return id && buildingId && number !== undefined ? { id, building_id: buildingId, number } : null;
  });
}

export function mapApartmentDtos(values: unknown[]): ApartmentItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const number = stringValue(value, 'number');
    const status = stringValue(value, 'status');
    const entranceId = stringValue(value, 'entrance_id');
    return id && number && entranceId ? { id, number, status: status ?? '', entrance_id: entranceId } : null;
  });
}

export function mapResidentDtos(values: unknown[]): ApiResident[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const login = stringValue(value, 'login');
    const name = stringValue(value, 'name');
    if (!id || !login || !name) return null;
    return {
      id, login, name,
      ...(stringValue(value, 'phone') !== undefined && { phone: stringValue(value, 'phone') }),
      ...(stringValue(value, 'address') !== undefined && { address: stringValue(value, 'address') }),
      ...(stringValue(value, 'apartment') !== undefined && { apartment: stringValue(value, 'apartment') }),
      ...(stringValue(value, 'apartment_id') !== undefined && { apartment_id: stringValue(value, 'apartment_id') }),
      ...(stringValue(value, 'building_id') !== undefined && { building_id: stringValue(value, 'building_id') }),
      ...(stringValue(value, 'entrance') !== undefined && { entrance: stringValue(value, 'entrance') }),
      ...(stringValue(value, 'floor') !== undefined && { floor: stringValue(value, 'floor') }),
      ...(stringValue(value, 'created_at') !== undefined && { created_at: stringValue(value, 'created_at') }),
      ...(stringValue(value, 'contract_signed_at') !== undefined && { contract_signed_at: stringValue(value, 'contract_signed_at') }),
      ...(stringValue(value, 'password_changed_at') !== undefined && { password_changed_at: stringValue(value, 'password_changed_at') }),
      ...(stringValue(value, 'last_login_at') !== undefined && { last_login_at: stringValue(value, 'last_login_at') }),
      ...(numberValue(value, 'vehicle_count') !== undefined && { vehicle_count: numberValue(value, 'vehicle_count') }),
    };
  });
}

export function mapResidentSearchDtos(values: unknown[]): ResidentSearchItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const name = stringValue(value, 'name');
    if (!id || !name) return null;
    return {
      id, name,
      ...(stringValue(value, 'phone') !== undefined && { phone: stringValue(value, 'phone') }),
      ...(stringValue(value, 'apartment') !== undefined && { apartment: stringValue(value, 'apartment') }),
      ...(stringValue(value, 'address') !== undefined && { address: stringValue(value, 'address') }),
    };
  });
}

export function mapChangeLogDtos(values: unknown[]): ChangeLogItem[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const fieldName = stringValue(value, 'field_name');
    const oldValue = stringValue(value, 'old_value');
    const newValue = stringValue(value, 'new_value');
    const reason = stringValue(value, 'reason');
    const createdAt = stringValue(value, 'created_at');
    if (!id || fieldName === undefined || oldValue === undefined || newValue === undefined || !reason || !createdAt) return null;
    return {
      id, field_name: fieldName, old_value: oldValue, new_value: newValue, reason, created_at: createdAt,
      ...(stringValue(value, 'document_number') !== undefined && { document_number: stringValue(value, 'document_number') }),
      ...(stringValue(value, 'document_date') !== undefined && { document_date: stringValue(value, 'document_date') }),
      ...(stringValue(value, 'comment') !== undefined && { comment: stringValue(value, 'comment') }),
      ...(stringValue(value, 'changed_by_name') !== undefined && { changed_by_name: stringValue(value, 'changed_by_name') }),
    };
  });
}

export function mapBulkAccountDtos(values: unknown[]): Array<{ login: string; name: string }> {
  return compact(values, value => {
    const login = stringValue(value, 'login');
    const name = stringValue(value, 'name');
    return login && name ? { login, name } : null;
  });
}

export function mapResidentUpdateDto(value: unknown): { name?: string; phone?: string; apartment?: string } {
  if (!isRecord(value)) return {};
  return {
    ...(stringValue(value, 'name') !== undefined && { name: stringValue(value, 'name') }),
    ...(stringValue(value, 'phone') !== undefined && { phone: stringValue(value, 'phone') }),
    ...(stringValue(value, 'apartment') !== undefined && { apartment: stringValue(value, 'apartment') }),
  };
}

export function mapApartmentBalanceDto(value: unknown): {
  balance: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
} {
  if (!isRecord(value)) return { balance: 0 };
  const balanceRecord = isRecord(value.balance) ? value.balance : {};
  const balance = numberValue(balanceRecord, 'balance') ?? numberValue(balanceRecord, 'total_debt') ?? 0;
  const months = Array.isArray(value.charges_by_month) ? value.charges_by_month : [];
  for (let index = months.length - 1; index >= 0; index--) {
    const month = months[index];
    if (!isRecord(month)) continue;
    const paid = numberValue(month, 'paid');
    if (paid !== undefined && paid > 0) {
      const date = stringValue(month, 'period') ?? stringValue(month, 'month');
      return { balance, ...(date !== undefined && { lastPaymentDate: date }), lastPaymentAmount: paid };
    }
  }
  return { balance };
}

export function mapVehicleDtos(values: unknown[]): Vehicle[] {
  return compact(values, value => {
    const id = stringValue(value, 'id');
    const ownerId = stringValue(value, 'user_id');
    const plateNumber = stringValue(value, 'plate_number');
    const createdAt = stringValue(value, 'created_at');
    if (!id || !ownerId || !plateNumber || !createdAt) return null;
    const rawType = stringValue(value, 'vehicle_type');
    const rawOwnerType = stringValue(value, 'owner_type');
    const type = isVehicleType(rawType) ? rawType : 'car';
    const ownerType = isVehicleOwnerType(rawOwnerType) ? rawOwnerType : 'individual';
    return {
      id, ownerId, plateNumber, createdAt, type, ownerType,
      ownerName: stringValue(value, 'owner_name') ?? '',
      ownerPhone: stringValue(value, 'owner_phone') ?? '',
      apartment: stringValue(value, 'apartment') ?? '',
      address: stringValue(value, 'address') ?? '',
      brand: stringValue(value, 'brand') ?? '',
      model: stringValue(value, 'model') ?? '',
      color: stringValue(value, 'color') ?? '',
      ...(numberValue(value, 'year') !== undefined && { year: numberValue(value, 'year') }),
      ...(stringValue(value, 'company_name') !== undefined && { companyName: stringValue(value, 'company_name') }),
      ...(stringValue(value, 'parking_spot') !== undefined && { parkingSpot: stringValue(value, 'parking_spot') }),
      ...(stringValue(value, 'notes') !== undefined && { notes: stringValue(value, 'notes') }),
      ...(stringValue(value, 'updated_at') !== undefined && { updatedAt: stringValue(value, 'updated_at') }),
    };
  });
}
