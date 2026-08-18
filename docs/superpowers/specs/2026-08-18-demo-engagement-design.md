# Demo Engagement Seeder Design

## Goal

Prevent enabled demo Trainings, Colleagues, and Notepad pages from appearing empty while preserving tenant isolation and user-mutated demo lifecycle state across provisioning reruns.

## Constraints

- Treat read-only live production `PRAGMA table_info` output as the schema contract.
- Do not add tables, columns, migrations, production writes, deploys, password resets, or broad data resets.
- Seed only the exact `demo` tenant using deterministic IDs and tenant-scoped SQL.
- Do not overwrite existing seeded rows on rerun. Missing deterministic rows may be repaired.
- Do not touch unrelated or cross-tenant rows.
- There is no live `employee_thanks` or `training_settings` table. Appreciation is represented by persisted employee-rating comments, and training settings remain frontend defaults.

## Architecture

Add `cloudflare/src/lib/demo/engagement.ts` implementing `DemoDomainSeeder`. Register an `engagement` phase after `core`; commerce and finance continue to depend only on core. Default provisioning runs core, commerce, finance, then engagement in fixed order.

The seeder resolves existing demo users by tenant and login, creates deterministic IDs with `demoId`, and inserts a coherent training lifecycle using the live minimal tables: partners, proposals, votes, registrations, and feedback. It also inserts employee ratings with comments and three private notes for each manager, director, and primary executor. Every lookup and write includes `tenant_id` where the live table supports it.

Insert-only conflict handling preserves mutable fields such as proposal status, attendance, feedback, ratings, comments, note content, and timestamps. Counters compare deterministic IDs before writes and report created rows; conflicts count as unchanged updates only if the existing demo conventions require aggregate accounting. Provisioning a missing row repairs that row without resetting surviving rows.

## Route Contracts

Adapt training routes to the live schema instead of the richer obsolete schema. Responses are projected into the frontend's existing domain shape: `title` becomes `topic`, users are joined for names, live dates map to scheduled/completed presentation fields, vote and registration rows are nested where needed, and missing advanced settings use documented defaults. Mutations write only live columns.

Update `/api/executors` to aggregate tenant-scoped `employee_ratings` alongside request statistics so seeded ratings appear in the colleagues leaderboard. No thanks endpoint or table is invented.

Notes retain their current ownership route contract. Seeded notes are scoped to both user and tenant, so manager, director, and executor only see their own notes.

## Frontend

Enable the exact existing feature keys `trainings`, `colleagues`, and `notepad` in demo core provisioning. Keep navigation labels unchanged because route and feature names already match.

Fetch partners, proposals, and default settings when `TrainingsPage` mounts. Adapt training mappers only where necessary for the live projected API response. Colleagues continue to load executors, now receiving persisted aggregate ratings from the backend rather than an empty/default leaderboard signal. Notes already fetch on mount.

## Status And Caching

Add engagement tables and deterministic sentinels to demo status reporting. Add engagement counters to provisioning summaries and invalidate relevant user/training/note caches after the phase. Explicit `engagement` requests expand to include `core`; existing phase dependency behavior remains unchanged.

## Testing

Use strict TDD:

1. Extend the checked-in production schema fixture and contract assertions with exact live engagement columns and constraints.
2. Add engagement integration tests that provision twice, mutate seeded lifecycle fields, delete one deterministic row, rerun, and prove mutation preservation, repair, stable counts, tenant isolation, and password preservation.
3. Extend combined provisioning and status tests for phase order, dependencies, counters, sentinels, and table counts.
4. Add route tests proving training lists/details and executor ratings expose seeded rows while notes remain user-private.
5. Add frontend tests proving Trainings fetches and renders proposals, Colleagues renders persisted ratings, and Notepad renders private notes.
6. Run backend tests and TypeScript checks, relevant frontend tests, full frontend build, Capacitor iOS sync, and the configured iPhone 17 Pro Max simulator run.

No production deployment or mutation is part of verification.
