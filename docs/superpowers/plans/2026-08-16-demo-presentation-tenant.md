# Demo Presentation Tenant Implementation Plan

**Goal:** Provision a complete, idempotent `demo` tenant and expose secure quick-login role journeys.

**Spec:** `docs/superpowers/specs/2026-08-16-demo-presentation-tenant-design.md`

## Constraints

- Production schema PRAGMA is authoritative.
- No production write, deploy, migration, commit or push.
- Never overwrite existing password hashes.
- Every SQL statement is tenant-scoped.
- Deterministic IDs and upserts; no broad delete/reset.

## Tasks

1. Add manifest, deterministic IDs and core provisioning with SQLite integration tests.
2. Add commerce provisioning and local demo image assets with contract tests.
3. Add finance provisioning using canonical accounting helpers and tests.
4. Add demo status/provision/role-list/quick-login routes and rate limits.
5. Replace hardcoded two-account frontend login with backend-driven role grid.
6. Add isolated cross-role presentation E2E and rerun provision idempotency.
7. Independent backend, data, security, UX and final reviews.
8. Run complete gates and prepare a provision-only rollout command without executing it.
