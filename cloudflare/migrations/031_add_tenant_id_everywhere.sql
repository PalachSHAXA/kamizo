-- Migration: Add tenant_id to all remaining tables for complete multi-tenancy support
-- Tables already covered by migrations 0003, 0004, 0005, 0009, 0012 are skipped

ALTER TABLE owner_apartments ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE training_notifications ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE training_settings ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE residents ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE executors ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE request_history ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE reschedule_requests ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE chat_participants ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE chat_message_reads ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE chat_channel_reads ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE notes ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE meeting_otp_records ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE meeting_voting_units ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE meeting_building_settings ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE employee_ratings ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE ad_views ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE marketplace_cart ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE marketplace_order_history ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE marketplace_favorites ADD COLUMN tenant_id TEXT DEFAULT '';

-- Indexes on key tables for tenant_id filtering
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant_id ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apartments_tenant_id ON apartments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_id ON requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_id ON meetings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_tenant_id ON marketplace_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_tenant_id ON marketplace_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant_id ON chat_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id ON chat_messages(tenant_id);
