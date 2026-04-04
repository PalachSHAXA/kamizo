-- Add district field to branches table
-- Branches now represent residential complexes (ЖК), grouped by district (Район)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS district TEXT;
