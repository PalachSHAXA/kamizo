-- Add tenant_id indexes to training tables for multi-tenancy performance
-- All training tables already have tenant_id TEXT DEFAULT '' column (added in earlier migration)
-- This migration adds missing indexes

CREATE INDEX IF NOT EXISTS idx_training_partners_tenant ON training_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_proposals_tenant ON training_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_votes_tenant ON training_votes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_registrations_tenant ON training_registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_feedback_tenant ON training_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_notifications_tenant ON training_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_settings_tenant ON training_settings(tenant_id);

-- Fix training_settings: PK is just 'key', so multi-tenant INSERT OR REPLACE would overwrite
-- Recreate with composite unique constraint (key, tenant_id)
-- SQLite doesn't support ALTER TABLE to change PK, so create new table and migrate data
CREATE TABLE IF NOT EXISTS training_settings_new (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT DEFAULT '',
  PRIMARY KEY (key, tenant_id)
);
INSERT OR IGNORE INTO training_settings_new (key, value, description, updated_at, tenant_id)
  SELECT key, value, description, updated_at, tenant_id FROM training_settings;
DROP TABLE IF EXISTS training_settings;
ALTER TABLE training_settings_new RENAME TO training_settings;
CREATE INDEX IF NOT EXISTS idx_training_settings_tenant ON training_settings(tenant_id);
