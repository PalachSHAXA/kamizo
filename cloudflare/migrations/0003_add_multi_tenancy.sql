-- Add multi-tenancy support by adding tenant_id to all main tables

-- Core tables
ALTER TABLE users ADD COLUMN tenant_id TEXT;
ALTER TABLE requests ADD COLUMN tenant_id TEXT;
ALTER TABLE buildings ADD COLUMN tenant_id TEXT;
ALTER TABLE announcements ADD COLUMN tenant_id TEXT;
ALTER TABLE meetings ADD COLUMN tenant_id TEXT;
ALTER TABLE vehicles ADD COLUMN tenant_id TEXT;
ALTER TABLE branches ADD COLUMN tenant_id TEXT;
ALTER TABLE categories ADD COLUMN tenant_id TEXT;

-- Chat tables
ALTER TABLE chat_channels ADD COLUMN tenant_id TEXT;
ALTER TABLE chat_messages ADD COLUMN tenant_id TEXT;

-- Marketplace tables
ALTER TABLE marketplace_products ADD COLUMN tenant_id TEXT;
ALTER TABLE marketplace_orders ADD COLUMN tenant_id TEXT;
ALTER TABLE marketplace_categories ADD COLUMN tenant_id TEXT;

-- Training tables
ALTER TABLE training_proposals ADD COLUMN tenant_id TEXT;
ALTER TABLE training_registrations ADD COLUMN tenant_id TEXT;

-- Guest access tables
ALTER TABLE guest_access_codes ADD COLUMN tenant_id TEXT;

-- Building related tables
ALTER TABLE building_documents ADD COLUMN tenant_id TEXT;
ALTER TABLE entrances ADD COLUMN tenant_id TEXT;
ALTER TABLE apartments ADD COLUMN tenant_id TEXT;

-- Rental tables
ALTER TABLE rental_apartments ADD COLUMN tenant_id TEXT;
ALTER TABLE rental_records ADD COLUMN tenant_id TEXT;

-- Meeting related tables
ALTER TABLE meeting_agenda_items ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_vote_records ADD COLUMN tenant_id TEXT;

-- Notifications
ALTER TABLE notifications ADD COLUMN tenant_id TEXT;

-- Create indexes for tenant_id to improve query performance
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requests_tenant ON requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant ON meetings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant ON chat_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_tenant ON marketplace_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_tenant ON marketplace_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_proposals_tenant ON training_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guest_access_codes_tenant ON guest_access_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_building_documents_tenant ON building_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entrances_tenant ON entrances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apartments_tenant ON apartments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_apartments_tenant ON rental_apartments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
