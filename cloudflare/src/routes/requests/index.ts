// Barrel — registers all request-related routes

import { registerRequestCrudRoutes } from './crud';
import { registerAssignmentRoutes } from './assignment';
import { registerWorkflowRoutes } from './workflow';
import { registerPauseResumeRoutes } from './pause-resume';
import { registerApprovalRoutes } from './approval';
import { registerRescheduleRoutes } from './reschedule';
import { registerWorkOrderRoutes } from './work-orders';
import { registerCategoryRoutes } from './categories';
import { registerRequestMessageRoutes } from './messages';

export function registerRequestRoutes() {
  registerRequestCrudRoutes();
  registerAssignmentRoutes();
  registerWorkflowRoutes();
  registerPauseResumeRoutes();
  registerApprovalRoutes();
  registerRescheduleRoutes();
  registerWorkOrderRoutes();
  registerCategoryRoutes();
  registerRequestMessageRoutes();
}
