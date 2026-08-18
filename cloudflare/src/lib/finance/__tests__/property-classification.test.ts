import { describe, expect, it } from 'vitest';

import { classifyApartmentForBilling } from '../property-classification';

describe('classifyApartmentForBilling', () => {
  it.each([
    [{ is_commercial: 0, is_basement: 0, is_parking: 0, property_type: 'commercial' }, 'residential'],
    [{ is_commercial: 0, is_basement: 0, is_parking: 0, property_type: 'non_commercial' }, 'residential'],
    [{ is_commercial: 1, is_basement: 0, is_parking: 0, property_type: 'commercial' }, 'commercial'],
    [{ is_commercial: 0, is_basement: 1, is_parking: 0, property_type: 'commercial' }, 'basement'],
    [{ is_commercial: 0, is_basement: 0, is_parking: 1, property_type: 'commercial' }, 'parking'],
  ] as const)('uses live boolean flags as authority for %j', (apartment, expected) => {
    expect(classifyApartmentForBilling(apartment)).toBe(expected);
  });

  it.each([
    [{ property_type: 'commercial' }, 'residential'],
    [{ property_type: 'non_commercial' }, 'commercial'],
    [{ property_type: 'basement' }, 'basement'],
    [{ property_type: 'parking' }, 'parking'],
    [{}, 'residential'],
  ] as const)('falls back to legacy property semantics for %j', (apartment, expected) => {
    expect(classifyApartmentForBilling(apartment)).toBe(expected);
  });

  it('keeps parking precedence when multiple imported flags are set', () => {
    expect(classifyApartmentForBilling({ is_commercial: 1, is_basement: 1, is_parking: 1 }))
      .toBe('parking');
  });
});
