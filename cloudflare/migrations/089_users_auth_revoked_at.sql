-- Token revocation is separate from onboarding's password_changed_at marker.
-- Admin-issued temporary passwords intentionally clear password_changed_at,
-- but must still revoke every previously issued JWT.
ALTER TABLE users ADD COLUMN auth_revoked_at TEXT;
