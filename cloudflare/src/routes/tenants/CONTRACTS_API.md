# Tenant contract PDF storage — API contract (Sprint 85, commit 1 of 3)

Per-tenant scanned contract PDF — one document per УК, all residents of
that УК download the same file. Storage is Cloudflare R2 (binding
`CONTRACTS_BUCKET` in `wrangler.toml`), filesystem-shimmed on the VPS
Node.js path at `/opt/kamizo/data/contracts/`.

Commit 2 builds the super-admin + director upload UI. Commit 3 wires the
resident download into the profile page.

## Storage layout

R2 object key (also the filesystem path under the shim root):

```
tenants/<tenant_id>/contract-<ISO8601 stamp, colons → hyphens>.pdf
```

The `tenant_id` prefix means an attacker who somehow gets an object
listing can't guess into another tenant — keys aren't enumerable
across namespaces.

## DB columns (added by migration 051)

`tenants` table:

| Column | Type | Notes |
|---|---|---|
| `contract_r2_key` | TEXT | object key, NULL when no contract uploaded |
| `contract_filename` | TEXT | original filename (sanitised) for Content-Disposition |
| `contract_uploaded_at` | TEXT | `datetime('now')` stamp |
| `contract_uploaded_by` | TEXT | user id of uploader (audit) |

All nullable + default NULL; existing rows keep working.

## Validation enforced on every upload

| Check | Status | Returns |
|---|---|---|
| Content-Type ≠ `multipart/form-data` | reject | 400 |
| Field name ≠ `file` or value not a file | reject | 400 |
| MIME ≠ `application/pdf` (cheap path) | reject | 415 |
| File > 10 MB (`MAX_PDF_BYTES`) | reject | 413 |
| First 4 bytes ≠ `%PDF` | reject | 415 |

Original filename is sanitised before storage — Cyrillic / Latin
alphanumerics + `._- ` survive, everything else collapses to `_`,
`.pdf` suffix forced.

## Endpoints

### A. POST `/api/super-admin/tenants/:tenantId/contract`

Super-admin force-upload — replaces any existing contract on the
named tenant.

**Auth**: `super_admin` role globally.
**Body**: `multipart/form-data`, field `file=<pdf>`.
**Returns**: 200 with `{ contract_r2_key, contract_filename, contract_uploaded_at, contract_uploaded_by_name }`.

### B. POST `/api/admin/tenant/contract`

Director / admin self-upload — target tenant derived from JWT, **never**
from URL or body. Director **cannot** upload on behalf of another tenant.

**Auth**: `director` or `admin` role on caller's own tenant. Manager
and dispatcher are intentionally **rejected** with `403` — this is the
binding-contract artefact for the whole УК and replacing it shouldn't
delegate further.

**Body**: same as A.
**Returns**: same as A.

### C. GET `/api/resident/contract`

Resident downloads own tenant's contract. Tenant derived from JWT.

**Auth**: `resident` / `tenant` / `commercial_owner` roles.
**Returns**:
- 200 with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<sanitised>"; filename*=UTF-8''<urlencoded>` and `Cache-Control: private, max-age=300`.
- 404 with `{ "error": "Договор ещё не загружен. Обратитесь в управляющую компанию." }` if no contract.

### D. GET `/api/admin/tenant/contract`

Any staff role downloads own tenant's contract — director / admin /
manager / department_head / dispatcher / executor / security. Useful
for staff to verify what residents see.

**Auth**: any staff role.
**Returns**: same as C.

### E. DELETE `/api/super-admin/tenants/:tenantId/contract`

Super-admin delete. Nulls the four DB columns + drops the R2 object +
logs a `tenant_contract_deleted` row in `security_audit_log`. Director
intentionally cannot delete (avoid footgun).

**Auth**: `super_admin` role globally.
**Returns**: 204 No Content.

## List/detail enrichments

- **`GET /api/tenants`** (super-admin only) — every row now also
  includes `has_contract` (derived boolean) and the joined
  `contract_uploaded_by_name`. `contract_r2_key`, `contract_filename`,
  `contract_uploaded_at`, `contract_uploaded_by` ride through via
  `t.*`.
- **`GET /api/super-admin/tenants/:id/details`** — same enrichments
  applied to the single-row detail response.

There is no contract field in `/api/tenants/me`-style endpoints yet —
that's a commit-2 scope item if the director-dashboard surface needs
it.

## Tenant isolation summary

| Path | Tenant source | Cross-tenant attack outcome |
|---|---|---|
| A POST super-admin upload | URL param | global role gate already 403s non-super-admins |
| B POST director upload | JWT only | director's JWT-tenant is the only writable target |
| C GET resident download | JWT only | resident can't even pass a tenant param |
| D GET staff download | JWT only | same |
| E DELETE super-admin | URL param | global role gate already 403s non-super-admins |

There is no path where a non-super-admin caller can specify a tenant
id — the JWT is the single source of truth for tenant scope on B / C /
D.

## VPS filesystem shim

Code at `/opt/kamizo/app/src/shim/r2.js` (lives only on the VPS,
not in this repo today). The shim exposes:

- `put(key, body, opts)` → write to `${ROOT}/${key}`
- `get(key)` → `{ key, size, body, httpMetadata }` (matches R2)
- `delete(key)` → unlink + prune empty parent
- `head(key)` → metadata or `null`

`ROOT` defaults to `/opt/kamizo/data/contracts/`; overridable via
`CONTRACTS_FS_ROOT` env var for tests.

The shim defends against path traversal explicitly — any `..` in a key
throws `r2-shim: key escaped namespace` before touching the
filesystem.

## Migration

```sql
ALTER TABLE tenants ADD COLUMN contract_r2_key TEXT;
ALTER TABLE tenants ADD COLUMN contract_filename TEXT;
ALTER TABLE tenants ADD COLUMN contract_uploaded_at TEXT;
ALTER TABLE tenants ADD COLUMN contract_uploaded_by TEXT;
```

Applied on VPS at `/opt/kamizo/data/kamizo.db` on 2026-06-17.
`PRAGMA table_info(tenants)` shows the four new columns at indexes
24-27.

A scrapped per-resident variant (`051_resident_contracts.sql`) was
written then deleted **uncommitted** — see this commit's report for
the rollback verification.

## Live verification (2026-06-17 against `api.kamizo.uz`)

- B director upload (choko): 200 with key, filename, uploaded_at, uploaded_by_name ✓
- C resident download: 200, content-type application/pdf, body starts with `25 50 44 46` (`%PDF`) ✓
- D staff (director + manager) download: 200, same body ✓
- 415 on SVG (MIME): rejected ✓
- 415 on SVG-with-PDF-MIME (magic bytes): rejected ✓
- 413 on 11 MB file: rejected ✓
- 403 on manager upload: rejected ✓
- 403 on resident upload: rejected ✓
- 403 on resident GET admin endpoint: rejected ✓
- 403 on director hitting super-admin upload + delete: rejected ✓
- Cross-tenant: moon director uploads → choko row untouched, only moon row updated ✓
- Replacement: re-upload deletes prior R2/FS object, only new key on disk ✓

Super-admin endpoints A and E themselves verified via 403 from
director auth; A's happy-path upload and E's delete weren't exercised
because the live super-admin password wasn't available to the runner
— flagged in the commit report.
