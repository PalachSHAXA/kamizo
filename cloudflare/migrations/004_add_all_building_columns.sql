-- Migration: Add ALL missing columns to buildings table
-- Date: 2025-12-29

-- Core columns
ALTER TABLE buildings ADD COLUMN entrances_count INTEGER DEFAULT 1;
ALTER TABLE buildings ADD COLUMN total_area REAL;
ALTER TABLE buildings ADD COLUMN living_area REAL;
ALTER TABLE buildings ADD COLUMN common_area REAL;
ALTER TABLE buildings ADD COLUMN land_area REAL;
ALTER TABLE buildings ADD COLUMN year_built INTEGER;
ALTER TABLE buildings ADD COLUMN year_renovated INTEGER;
ALTER TABLE buildings ADD COLUMN building_type TEXT DEFAULT 'monolith';
ALTER TABLE buildings ADD COLUMN roof_type TEXT DEFAULT 'flat';
ALTER TABLE buildings ADD COLUMN wall_material TEXT;
ALTER TABLE buildings ADD COLUMN foundation_type TEXT;

-- Engineering systems
ALTER TABLE buildings ADD COLUMN has_elevator INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN elevator_count INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN has_gas INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN heating_type TEXT DEFAULT 'central';
ALTER TABLE buildings ADD COLUMN has_hot_water INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN water_supply_type TEXT DEFAULT 'central';
ALTER TABLE buildings ADD COLUMN sewerage_type TEXT DEFAULT 'central';
ALTER TABLE buildings ADD COLUMN has_intercom INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN has_video_surveillance INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN has_concierge INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN has_parking_lot INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN parking_spaces INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN has_playground INTEGER DEFAULT 0;

-- Management
ALTER TABLE buildings ADD COLUMN manager_id TEXT;
ALTER TABLE buildings ADD COLUMN manager_name TEXT;
ALTER TABLE buildings ADD COLUMN management_start_date TEXT;
ALTER TABLE buildings ADD COLUMN contract_number TEXT;
ALTER TABLE buildings ADD COLUMN contract_end_date TEXT;

-- Financial
ALTER TABLE buildings ADD COLUMN monthly_budget INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN reserve_fund INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN total_debt INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN collection_rate REAL DEFAULT 0;

-- Stats
ALTER TABLE buildings ADD COLUMN residents_count INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN owners_count INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN tenants_count INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN vacant_apartments INTEGER DEFAULT 0;
ALTER TABLE buildings ADD COLUMN active_requests_count INTEGER DEFAULT 0;

-- Timestamps
ALTER TABLE buildings ADD COLUMN updated_at TEXT;
