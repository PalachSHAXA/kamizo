// Route registry - imports all route modules to register their routes
// Each module calls route() from the router to register its handlers
// This barrel file ensures all routes are loaded when the worker starts
//
// EXTRACTED ROUTE MODULES (Proof of Concept):
// ✅ auth.ts       (login, register, register-bulk, password management)
// ✅ vehicles.ts   (vehicle CRUD, search)
// ✅ chat.ts       (channels, messages, read receipts)
// ✅ guest-access.ts (guest code CRUD, validation, QR scanning)
//
// PLANNED MODULES (still in index.ts):
// - users.ts      (user CRUD, profile routes)
// - rentals.ts    (apartments, records, exchange rate)
// - announcements.ts (announcement CRUD, views)
// - team.ts       (team management, password resets)
// - executors.ts  (executor CRUD, status, stats)
// - buildings.ts  (buildings, entrances, apartments, documents)
// - residents.ts  (resident CRUD, meters, readings)
// - requests.ts   (request lifecycle: create→assign→accept→start→complete→approve)
// - meetings.ts   (meeting CRUD, voting, protocols, OTP, reconsideration)
// - training.ts   (training partners, proposals, voting, feedback)
// - marketplace.ts (products, cart, orders, admin)
// - ads.ts        (advertisements, coupons)
// - notifications.ts (notification CRUD, push subscriptions)
// - settings.ts   (app settings, tenant config)
// - admin.ts      (metrics, monitoring, cache management)
// - tenants.ts    (tenant CRUD, super-admin analytics)
// - upload.ts     (file upload)

import type { Env } from '../types';
import { registerAuthRoutes } from './auth';
import { registerVehicleRoutes } from './vehicles';
import { registerChatRoutes } from './chat';
import { registerGuestAccessRoutes } from './guest-access';

export function registerAllRoutes(env: Env) {
  registerAuthRoutes(env);
  registerVehicleRoutes(env);
  registerChatRoutes(env);
  registerGuestAccessRoutes(env);

  // Additional route modules will be registered here as they are extracted
}
