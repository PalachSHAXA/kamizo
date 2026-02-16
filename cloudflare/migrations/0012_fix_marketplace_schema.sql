-- Fix marketplace schema: add missing tenant_id to order_items
ALTER TABLE marketplace_order_items ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_tenant ON marketplace_order_items(tenant_id);
