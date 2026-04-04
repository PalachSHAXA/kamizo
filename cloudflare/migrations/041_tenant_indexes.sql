-- Add missing tenant_id indexes for frequently queried tables
-- Only includes tables that don't already have a tenant_id index

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guest_codes_tenant_id ON guest_access_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_tenant_id ON ads(tenant_id);
