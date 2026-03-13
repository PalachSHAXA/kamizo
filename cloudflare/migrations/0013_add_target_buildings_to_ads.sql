-- Add target_buildings column to ads table for building-level ad targeting
ALTER TABLE ads ADD COLUMN target_buildings TEXT;
