import { describe, expect, it } from 'vitest';
import {
  mapApartmentDtos,
  mapBranchDtos,
  mapBuildingDtos,
  mapBulkAccountDtos,
  mapChangeLogDtos,
  mapEntranceDtos,
  mapApartmentBalanceDto,
  mapResidentDtos,
  mapResidentUpdateDto,
  mapResidentSearchDtos,
  mapVehicleDtos,
} from './dtoMappers';

describe('resident DTO mappers', () => {
  it('maps valid cascading selector records and drops malformed records', () => {
    expect(mapBranchDtos([
      { id: 'branch-1', code: 'YS', name: 'Yunusobod', district: 'Yunusobod' },
      { id: 'branch-2', name: 'Missing code' },
    ])).toEqual([{ id: 'branch-1', code: 'YS', name: 'Yunusobod', district: 'Yunusobod' }]);

    expect(mapBuildingDtos([
      { id: 'building-1', name: '8A', branch_code: 'YS', building_number: '8A' },
      { id: 2, name: 'Invalid' },
    ])).toEqual([{ id: 'building-1', name: '8A', branch_code: 'YS', building_number: '8A' }]);

    expect(mapEntranceDtos([
      { id: 'entrance-1', building_id: 'building-1', number: 2 },
      { id: 'entrance-2', building_id: 'building-1', number: '2' },
    ])).toEqual([{ id: 'entrance-1', building_id: 'building-1', number: 2 }]);

    expect(mapApartmentDtos([
      { id: 'apartment-1', number: '21', status: 'vacant', entrance_id: 'entrance-1' },
      { id: 'apartment-2', status: 'vacant', entrance_id: 'entrance-1' },
    ])).toEqual([{ id: 'apartment-1', number: '21', status: 'vacant', entrance_id: 'entrance-1' }]);
  });

  it('keeps legacy buildings when optional branch and number fields are absent', () => {
    expect(mapBuildingDtos([
      { id: 'building-legacy', name: 'Legacy House' },
    ])).toEqual([{
      id: 'building-legacy',
      name: 'Legacy House',
      branch_code: '',
      building_number: '',
    }]);
  });

  it('keeps legacy apartments when optional status is absent', () => {
    expect(mapApartmentDtos([
      { id: 'apartment-legacy', number: '17', entrance_id: 'entrance-1' },
    ])).toEqual([{
      id: 'apartment-legacy',
      number: '17',
      status: '',
      entrance_id: 'entrance-1',
    }]);
  });

  it('maps resident records and preserves card-specific fields', () => {
    expect(mapResidentDtos([
      {
        id: 'resident-1', login: 'YS_8A_21', name: 'Ali Valiyev', apartment_id: 'apartment-1',
        building_id: 'building-1', vehicle_count: 2,
      },
      { id: 'resident-2', login: 'broken' },
    ])).toEqual([{
      id: 'resident-1', login: 'YS_8A_21', name: 'Ali Valiyev', apartment_id: 'apartment-1',
      building_id: 'building-1', vehicle_count: 2,
    }]);
  });

  it('maps change history, bulk accounts, and resident search records', () => {
    expect(mapChangeLogDtos([
      {
        id: 'change-1', field_name: 'name', old_value: 'A', new_value: 'B',
        reason: 'resident_request', created_at: '2026-08-15T00:00:00Z',
      },
      { id: 'change-2' },
    ])).toHaveLength(1);

    expect(mapBulkAccountDtos([{ login: 'one', name: 'One' }, { login: 2, name: 'Two' }]))
      .toEqual([{ login: 'one', name: 'One' }]);
    expect(mapResidentSearchDtos([{ id: 'one', name: 'One', phone: null }, { id: 'two' }]))
      .toEqual([{ id: 'one', name: 'One' }]);
  });

  it('maps resident updates and apartment finance values without casts', () => {
    expect(mapResidentUpdateDto({ name: 'New Name', phone: null, apartment: '12' }))
      .toEqual({ name: 'New Name', apartment: '12' });
    expect(mapResidentUpdateDto(null)).toEqual({});

    expect(mapApartmentBalanceDto({
      balance: { total_debt: 125000 },
      charges_by_month: [
        { month: '2026-07', paid: 0 },
        { period: '2026-08', paid: 50000 },
      ],
    })).toEqual({ balance: 125000, lastPaymentDate: '2026-08', lastPaymentAmount: 50000 });
  });

  it('maps vehicle enums only when they are recognized', () => {
    expect(mapVehicleDtos([{
      id: 'vehicle-1', user_id: 'resident-1', plate_number: '01A123BC',
      vehicle_type: 'suv', owner_type: 'resident', created_at: '2026-08-15T00:00:00Z',
    }])).toEqual([expect.objectContaining({
      id: 'vehicle-1', type: 'suv', ownerType: 'resident', plateNumber: '01A123BC',
    })]);

    expect(mapVehicleDtos([{
      id: 'vehicle-2', user_id: 'resident-2', plate_number: '01B234CD',
      vehicle_type: 'spaceship', owner_type: 'unknown', created_at: '2026-08-15T00:00:00Z',
    }])).toEqual([expect.objectContaining({ type: 'car', ownerType: 'individual' })]);
  });
});
