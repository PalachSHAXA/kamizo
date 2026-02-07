-- Add tenant_id to CRM tables that were missed in initial multi-tenancy migration

ALTER TABLE owners ADD COLUMN tenant_id TEXT;
ALTER TABLE crm_residents ADD COLUMN tenant_id TEXT;
ALTER TABLE personal_accounts ADD COLUMN tenant_id TEXT;
ALTER TABLE meters ADD COLUMN tenant_id TEXT;
ALTER TABLE meter_readings ADD COLUMN tenant_id TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_owners_tenant ON owners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_residents_tenant ON crm_residents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_tenant ON personal_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meters_tenant ON meters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_tenant ON meter_readings(tenant_id);
