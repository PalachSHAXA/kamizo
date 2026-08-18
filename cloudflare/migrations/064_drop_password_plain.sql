-- Security rollout is backend-first: deploy hash-only code before applying this migration.
-- Apply manually only after the deployed backend no longer reads or writes the legacy column.
-- With sqlite3 input redirection, .bail exits on the first error; closing the connection
-- rolls back the still-open transaction, including the index drop.
.bail on
.timeout 30000
BEGIN IMMEDIATE;
DROP INDEX IF EXISTS idx_users_password_plain;
ALTER TABLE users DROP COLUMN password_plain;
COMMIT;
