// Barrel — re-exports all user sub-route registrations
import { registerAuthRoutes } from './auth';
import { registerSeedRoutes } from './seed';
import { registerCrudRoutes } from './crud';
import { registerChangesRoutes } from './changes';
import { registerPasswordRoutes } from './password';
import { registerTeamRoutes } from './team';
import { registerExecutorRoutes } from './executors';
import { registerStatsRoutes } from './stats';
import { registerImportRoutes } from './import';
import { registerImpersonationExchangeRoutes } from './impersonation-exchange';
import { registerDemoRoutes } from './demo';

export function registerUserRoutes() {
  registerSeedRoutes();
  registerAuthRoutes();
  registerDemoRoutes();
  registerImpersonationExchangeRoutes();
  registerImportRoutes();
  registerCrudRoutes();
  registerChangesRoutes();
  registerPasswordRoutes();
  registerTeamRoutes();
  registerExecutorRoutes();
  registerStatsRoutes();
}
