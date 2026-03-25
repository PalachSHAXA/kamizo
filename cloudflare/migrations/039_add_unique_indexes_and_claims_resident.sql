-- Add resident_id to finance_claims for linking with crm_residents
ALTER TABLE finance_claims ADD COLUMN resident_id TEXT;

-- UNIQUE indexes on business keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_tenant ON users(login, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apartments_number_building ON apartments(number, building_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_access_user ON finance_access(user_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number, tenant_id);
