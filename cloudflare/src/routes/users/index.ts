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

export function registerUserRoutes() {
  registerSeedRoutes();
  registerAuthRoutes();
  registerImportRoutes();
  registerCrudRoutes();
  registerChangesRoutes();
  registerPasswordRoutes();
  registerTeamRoutes();
  registerExecutorRoutes();
  registerStatsRoutes();
}
