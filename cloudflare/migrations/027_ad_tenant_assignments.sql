-- Migration 027: Ad tenant assignments
-- One platform ad (tenant_id IS NULL) can be assigned to multiple tenants
-- Each tenant admin can enable/disable the ad locally

CREATE TABLE IF NOT EXISTS ad_tenant_assignments (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ad_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ata_ad_id ON ad_tenant_assignments(ad_id);
CREATE INDEX IF NOT EXISTS idx_ata_tenant_id ON ad_tenant_assignments(tenant_id, enabled);
