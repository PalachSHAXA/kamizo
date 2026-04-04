-- Explicit UNIQUE index on apartments(building_id, number) to prevent duplicate apartments
-- The table DDL already has UNIQUE(building_id, number), but this index adds an explicit
-- named index for clarity and ensures it exists on databases created before the constraint was added.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apartments_building_number ON apartments(building_id, number);
