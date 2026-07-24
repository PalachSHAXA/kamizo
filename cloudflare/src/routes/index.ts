// Route registry - imports all route modules to register their routes
// Each module calls route() from the router to register its handlers

import { registerMeetingRoutes } from './meetings';
import { registerMarketplaceRoutes } from './marketplace';
import { registerTrainingRoutes } from './training';
import { registerSuperAdminRoutes } from './super-admin';
import { registerRequestRoutes } from './requests';
import { registerBuildingRoutes } from './buildings';
import { registerUserRoutes } from './users';
import { registerRentalRoutes } from './rentals';
import { registerNotificationRoutes } from './notifications';
import { registerMiscRoutes } from './misc';
import { registerFinanceRoutes } from './finance';
import { registerFinanceV2Routes } from './finance-v2';

export function registerAllRoutes() {
  registerUserRoutes();
  registerRentalRoutes();
  registerBuildingRoutes();
  registerRequestRoutes();
  registerMeetingRoutes();
  registerMarketplaceRoutes();
  registerTrainingRoutes();
  registerNotificationRoutes();
  registerFinanceRoutes();
  registerFinanceV2Routes();
  registerMiscRoutes();
  registerSuperAdminRoutes();
}
