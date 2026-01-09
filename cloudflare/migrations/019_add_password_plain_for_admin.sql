-- Add password_plain column for admin access to staff passwords
-- This is for corporate management convenience (UK CRM)
-- Only staff passwords (executor, department_head, manager) will be stored here
-- Resident and admin passwords remain secure (hash-only)

ALTER TABLE users ADD COLUMN password_plain TEXT;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_users_password_plain ON users(id) WHERE password_plain IS NOT NULL;
