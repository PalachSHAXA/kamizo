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
import { registerTenantContractRoutes } from './tenants/contracts';

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
  registerMiscRoutes();
  registerSuperAdminRoutes();
  // Sprint 85 commit 1 — tenant contract PDF upload/download/delete.
  // Order: after super-admin so the new /api/super-admin/tenants/
  // :tenantId/contract paths don't collide with the existing
  // /api/super-admin/tenants/:id/details route — both have :param
  // segments at the same depth, but contract endpoints add an extra
  // path segment so the router's longest-match wins regardless.
  registerTenantContractRoutes();
}
