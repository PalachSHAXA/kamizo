# Admin chat channel actions — API contract (v200, commit 1 of 3)

Backend half of the InfoDropdown actions ("Назначить сотрудника" /
"Пометить решённым") wired up in v108. Frontend commit 2 calls these.

All endpoints are tenant-isolated via `recordBelongsToCaller` +
`auditCrossTenantAttempt` (same pattern as v93 / v109). Cross-tenant
attempts return `404 Channel not found` (don't leak existence) and
log a `cross_tenant_denied` row to `security_audit_log`.

## Endpoints

### `GET /api/chat/channels/:id`

Single channel detail. Used by the InfoDropdown to render current
assignment + resolved state without a second fetch.

**Auth**: any role; tenant-isolated.

**Response (200)** — includes all `chat_channels` columns + resident
join + new assignment join:

```jsonc
{
  "id": "...",
  "type": "private_support",
  "name": "...",
  "tenant_id": "...",
  "resident_id": "...",
  "assigned_to": "uuid|null",
  "assigned_to_name": "string|null",  // joined from users.name
  "assigned_to_role": "string|null",  // joined from users.role
  "resolved_at": "YYYY-MM-DD HH:MM:SS|null",
  "resolved_by": "uuid|null",
  "resolved_by_name": "string|null",  // joined from users.name
  "updated_at": "YYYY-MM-DD HH:MM:SS|null",
  "resident_apartment": "...",
  "resident_building_name": "...",
  "resident_branch_name": "...",
  "resident_phone": "...|null"
}
```

Residents get `assigned_to_*` and `resolved_by_*` set to `null` —
they shouldn't see UK's internal staffing.

**404**: channel doesn't exist OR belongs to another tenant.

### `PATCH /api/admin/chat/channels/:id/assign`

Assign a staff member to handle this channel.

**Auth**: `isManagement(user)` (director / admin / manager) + same
tenant as channel + assigned staff member.

**Body**:
```jsonc
{ "assigned_to": "uuid-of-staff" }   // assign
{ "assigned_to": null }              // unassign
```

**Validation**:
- `assigned_to` user exists + is_active + role ∈ STAFF_ROLES
  (director, admin, manager, department_head, dispatcher, executor,
  security) + same tenant as caller.
- Resident / tenant / commercial_owner can NOT be assigned (returns
  `400 Target user is not a staff role`).

**Response (200)**: full channel detail (same shape as GET above).

**WebSocket**: broadcasts `chat_channel_updated` to channels
`[chat:channel:${id}, chat:all]` scoped to the channel's tenant.
On VPS this is currently a no-op — see "WebSocket realtime" below.

### `PATCH /api/admin/chat/channels/:id/resolve`

Mark channel as resolved. Stamps `resolved_at = datetime('now')` +
`resolved_by = caller_user_id`.

**Auth**: `isManagement(user)` + same tenant.

**Body**: `{}` (server stamps everything).

**Idempotency**: if already resolved, returns 200 with the existing
`resolved_at` + `resolved_by` unchanged (preserving the original
resolver). Still broadcasts.

**Response (200)**: full channel detail.

### `PATCH /api/admin/chat/channels/:id/unresolve`

Re-open a previously-resolved channel. Clears `resolved_at` AND
`resolved_by`. Not surfaced in the v108 UI; shipped now so a future
"Reopen" action doesn't need another migration.

**Auth**: `isManagement(user)` + same tenant.

**Body**: `{}`.

**Response (200)**: full channel detail with `resolved_at: null,
resolved_by: null, resolved_by_name: null`.

## `GET /api/chat/channels` (list) — updated

The existing list endpoint's `isManagement` branch now LEFT JOINs
`users` twice more to include `assigned_to_name`, `assigned_to_role`,
and `resolved_by_name`. Resident branch unchanged. New columns
(`assigned_to`, `resolved_at`, `resolved_by`, `updated_at`) flow
through the `SELECT c.*` automatically.

## Existing endpoint to reuse — `GET /api/team`

Already exists at [users/team.ts:12](../users/team.ts#L12). Returns a
categorized payload:

```jsonc
{
  "directors": [...],
  "admins": [...],
  "managers": [...],
  "departmentHeads": [...],
  "executors": [...],
  "security": [...],
  "advertisers": [...]
}
```

Filters by `WHERE u.role IN ('director','admin','manager',
'department_head','executor','advertiser','security') AND
u.tenant_id = ?` (caller's tenant from JWT). Sorted by role rank then
name.

Frontend commit 2 should flatten this into a single sorted list for
the "Назначить сотрудника" modal. No need to ship a separate
`/api/admin/staff`.

## WebSocket realtime

The broadcast helper at `chat-channels.ts:broadcastChannelUpdated`
posts `chat_channel_updated` events through `env.CONNECTION_MANAGER`.

On the VPS deploy `CONNECTION_MANAGER` is a STUB (see
`/opt/kamizo/app/src/server.js:32`): `.fetch()` returns HTTP 503
"WebSocket disabled in Phase 1 migration". The broadcast attempt
completes without throwing — the response status is just ignored —
so the API path remains fast (~3 ms) and frontend polling (15 s
interval, already existing) closes the realtime gap.

When WebSocket is re-enabled (Phase 2 on VPS, or back on Cloudflare
Workers), the broadcast will fire and subscribed admin sessions
will see assign/resolve actions live without a refetch. Same
pattern as the existing `chat_message` broadcast in
`chat-messages.ts`.

## Migration

`cloudflare/migrations/050_chat_channel_assign_resolve.sql`:

```sql
ALTER TABLE chat_channels ADD COLUMN assigned_to TEXT;
ALTER TABLE chat_channels ADD COLUMN resolved_at TEXT;
ALTER TABLE chat_channels ADD COLUMN resolved_by TEXT;
ALTER TABLE chat_channels ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_channels_assigned_to ON chat_channels(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant_resolved ON chat_channels(tenant_id, resolved_at);
```

Applied on VPS at `/opt/kamizo/data/kamizo.db`. Backwards-compatible;
existing channels stay valid (all four columns nullable).
