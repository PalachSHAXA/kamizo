-- Add personalized_data column to announcements (used for per-resident personalized content)
ALTER TABLE announcements ADD COLUMN personalized_data TEXT DEFAULT NULL;
