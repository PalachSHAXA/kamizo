// Route registry - imports all route modules to register their routes
// Each module calls route() from the router to register its handlers
// This barrel file ensures all routes are loaded when the worker starts
//
// NOTE: Route modules are not yet extracted from index.ts.
// This file documents the planned route module structure for when
// the backend is migrated to datacenter (Express/Hono/Fastify).
//
// Planned modules:
// - auth.ts       (login, register, register-bulk)
// - users.ts      (user CRUD, password management)
// - vehicles.ts   (vehicle CRUD, search)
// - rentals.ts    (apartments, records, exchange rate)
// - guestCodes.ts (guest code CRUD, validation, QR scanning)
// - chat.ts       (channels, messages, read receipts)
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

export {};
