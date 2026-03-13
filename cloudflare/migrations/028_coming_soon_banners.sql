ALTER TABLE tenants ADD COLUMN IF NOT EXISTS show_useful_contacts_banner INTEGER DEFAULT 1;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS show_marketplace_banner INTEGER DEFAULT 1;
