-- Migration: Add missing columns to buildings table
-- Date: 2025-12-29

-- Add cadastral_number (missing)
ALTER TABLE buildings ADD COLUMN cadastral_number TEXT;
