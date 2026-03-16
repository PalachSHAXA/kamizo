-- Security: Drop password_plain column from users table
-- Passwords are now stored ONLY as PBKDF2 hashes in password_hash
-- The password_plain column stored AES-GCM encrypted passwords that could be decrypted
-- with the key from wrangler.toml, which is a critical security vulnerability.

ALTER TABLE users DROP COLUMN password_plain;
