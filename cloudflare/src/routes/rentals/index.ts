// Barrel — registers all rental-related routes.
//
// Two distinct rentals surfaces, deliberately separate:
//   1. УК contract log (apartments.ts / records.ts) — management-only,
//      gated by feature flag `rentals`. Handles the УК-provisioned
//      short-term-stay logbook with passport data.
//   2. Resident rentals marketplace (listings.ts) — Sprint 88 v1, gated
//      by a NEW distinct feature flag `rental_listings` (default OFF
//      per-tenant). Handles resident-published listings, photos, reports.

import { registerVehicleRoutes } from './vehicles';
import { registerApartmentRoutes } from './apartments';
import { registerRecordRoutes } from './records';
import { registerGuestRoutes } from './guests';
import { registerScannerRoutes } from './scanner';
import { registerListingRoutes } from './listings';

export function registerRentalRoutes() {
  registerVehicleRoutes();
  registerApartmentRoutes();
  registerRecordRoutes();
  registerGuestRoutes();
  registerScannerRoutes();
  registerListingRoutes();
}
