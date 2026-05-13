-- Composite index for the most common admin/manager queries on the
-- requests page: filter by tenant_id + status, order by created_at DESC.
-- The existing idx_requests_status_created (status, created_at DESC) helps
-- single-tenant deployments, and idx_requests_status helps simple filters,
-- but neither one starts with tenant_id, so the multi-tenant pagination
-- query falls back to a sequential scan once a single tenant has more
-- than a few thousand requests.
--
-- New index keys exactly the WHERE/ORDER BY pattern used by
-- GET /api/requests:
--   WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status_created
  ON requests(tenant_id, status, created_at DESC);
