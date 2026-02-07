-- Add tenant_id to ads/coupons tables for multi-tenancy

ALTER TABLE ads ADD COLUMN tenant_id TEXT;
ALTER TABLE ad_coupons ADD COLUMN tenant_id TEXT;
ALTER TABLE ad_categories ADD COLUMN tenant_id TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ads_tenant ON ads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_coupons_tenant ON ad_coupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_categories_tenant ON ad_categories(tenant_id);
