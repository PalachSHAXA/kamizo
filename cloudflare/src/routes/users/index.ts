// Barrel — re-exports all user sub-route registrations
import { registerAuthRoutes } from './auth';
import { registerAuth2FARoutes } from './auth-2fa';
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
  // /api/auth/2fa/* — gated on TWO_FA_ENABLED inside the handlers;
  // returns 'two_fa_disabled' (404) when the flag is off so clients
  // don't even discover the feature is hidden.
  registerAuth2FARoutes();
  registerImportRoutes();
  registerCrudRoutes();
  registerChangesRoutes();
  registerPasswordRoutes();
  registerTeamRoutes();
  registerExecutorRoutes();
  registerStatsRoutes();
}
