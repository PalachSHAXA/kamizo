export type ApartmentBillingKind = 'residential' | 'commercial' | 'basement' | 'parking';

export interface ApartmentTypeFields {
  is_commercial?: unknown;
  is_basement?: unknown;
  is_parking?: unknown;
  property_type?: unknown;
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function classifyApartmentForBilling(apartment: ApartmentTypeFields): ApartmentBillingKind {
  const hasFlags = apartment.is_commercial != null
    || apartment.is_basement != null
    || apartment.is_parking != null;

  if (hasFlags) {
    if (enabled(apartment.is_parking)) return 'parking';
    if (enabled(apartment.is_basement)) return 'basement';
    if (enabled(apartment.is_commercial)) return 'commercial';
    return 'residential';
  }

  if (apartment.property_type === 'parking') return 'parking';
  if (apartment.property_type === 'basement') return 'basement';
  if (apartment.property_type === 'non_commercial') return 'commercial';
  return 'residential';
}
