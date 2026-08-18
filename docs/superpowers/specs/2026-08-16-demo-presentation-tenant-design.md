# Demo Presentation Tenant Design

## Goal

Turn the existing `demo` tenant into a repeatable client-presentation environment with working role journeys and realistic, non-empty domain data.

## Safety

- Provision only the tenant whose slug is exactly `demo`.
- Provision endpoint requires `super_admin`.
- Quick login is available only for active users in the `demo` tenant and never includes `super_admin`.
- Existing users keep their password hashes; missing demo users receive random inaccessible passwords and use demo quick login.
- Deterministic IDs and upserts make reruns idempotent.
- No table drops, broad deletes, or cross-tenant copies.

## Architecture

- `cloudflare/src/lib/demo/manifest.ts`: role and scenario manifest shared by provisioning and login APIs.
- `cloudflare/src/lib/demo/ids.ts`: deterministic UUID-like IDs from stable keys.
- `cloudflare/src/lib/demo/core.ts`: tenant metadata, users, buildings, entrances, apartments, requests, meetings, announcements and chat.
- `cloudflare/src/lib/demo/commerce.ts`: marketplace, rental records/listings, vehicles and guest access.
- `cloudflare/src/lib/demo/finance.ts`: estimate, staff/items, charges, payments, income, expenses and materials.
- `cloudflare/src/routes/users/demo.ts`: super-admin provision/status and public demo-role login/list endpoints.
- `LoginPage.tsx`: mobile-safe role grid populated from the backend, not hardcoded credentials.

Provisioning runs in restartable phases. Each phase returns created/updated counts. A failed phase can be rerun safely.

`POST /api/super-admin/demo/provision` accepts an optional plain
`{ "phases": ["core", "commerce", "finance"] }` body. Omitted bodies run all
phases. Requested commerce or finance work adds the core dependency, and work
always runs in `core`, `commerce`, `finance` order. A process-local per-tenant
guard rejects concurrent runs with `409`; deterministic IDs remain the
cross-process safety mechanism. Successful responses contain per-phase results
and aggregate counters. Safe `500` responses expose only completed phase names.

`GET /api/super-admin/demo/status` returns tenant-scoped counts for every table
seeded by all three phases, provisioned role keys available under tenant feature
flags, and `ready.core`, `ready.commerce`, and `ready.finance` booleans. Readiness
requires fixed deterministic sentinel IDs; table names come only from a server
constant and never from request input. Both super-admin endpoints are
cache-disabled.

## Roles

Primary: director, manager, resident, executor, security, marketplace manager.

Secondary: admin, department head, dispatcher, courier, tenant, advertiser.

Excluded: super-admin. Duplicate residents and specialists remain dataset actors but do not all need primary tiles.

Courier is persisted as the valid `executor` role with `courier`
specialization, so it follows existing executor frontend and backend behavior.

## Dataset

- 2 presentation buildings, entrances and 6 representative apartments.
- 12 role users plus a second resident and electrician for workflows.
- Requests covering new, assigned, accepted, in-progress, pending approval, completed and cancelled.
- One active vote and one approved historical protocol with valid resident area/eligibility.
- Resident/staff/all announcements and working building-general/private-support chat.
- Marketplace categories/products/orders across stock and on-demand statuses.
- Rental contract records and five listings with local presentation images.
- Vehicles and valid GAPASS passes/logs.
- Active finance estimate, charges, payments, credit/debt, expenses and materials.

## Quick Login

`GET /api/auth/demo-roles` returns available role descriptors for the resolved `demo` tenant.

`POST /api/auth/demo-login { roleKey }` resolves the allowlisted demo user and returns a short-lived JWT using the normal user response shape. It is rate-limited and cache-disabled. No passwords are sent to the browser.

The existing visual gate remains presentation-only. It is not treated as an authorization boundary.

## Verification

- Route tests for demo-only isolation, RBAC, missing roles and JWT output.
- SQLite integration test provisions twice and proves stable row counts.
- Domain contract tests validate current enums and foreign-key relationships.
- Isolated E2E logs in as every primary role and runs resident → manager → executor → resident, security and marketplace journeys.
- Full backend/frontend tests, strict TypeScript, build budget and iOS simulator refresh.

## Rollout

Code deploy is separate from data provisioning. Production provision requires an explicit super-admin call after backup and smoke checks. No production data changes occur during implementation.
