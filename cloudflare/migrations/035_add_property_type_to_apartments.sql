-- 035: Add property_type to apartments for finance module compatibility
ALTER TABLE apartments ADD COLUMN property_type TEXT DEFAULT 'commercial' CHECK (property_type IN ('commercial','non_commercial'));

-- Migrate existing is_commercial flag to property_type
UPDATE apartments SET property_type = 'non_commercial' WHERE is_commercial = 1;
