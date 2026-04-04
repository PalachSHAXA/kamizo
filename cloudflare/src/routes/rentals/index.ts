// Barrel — registers all rental-related routes (vehicles, apartments, records, guests, scanner)

import { registerVehicleRoutes } from './vehicles';
import { registerApartmentRoutes } from './apartments';
import { registerRecordRoutes } from './records';
import { registerGuestRoutes } from './guests';
import { registerScannerRoutes } from './scanner';

export function registerRentalRoutes() {
  registerVehicleRoutes();
  registerApartmentRoutes();
  registerRecordRoutes();
  registerGuestRoutes();
  registerScannerRoutes();
}
