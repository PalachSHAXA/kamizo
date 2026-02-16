-- Add tenant_id to all remaining tables that were missed in previous migrations

-- Meeting system tables
ALTER TABLE meeting_agenda_comments ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_eligible_voters ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_participated_voters ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_protocols ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_schedule_options ADD COLUMN tenant_id TEXT;
ALTER TABLE meeting_schedule_votes ADD COLUMN tenant_id TEXT;

-- Executor zones
ALTER TABLE executor_zones ADD COLUMN tenant_id TEXT;

-- Guest access logs
ALTER TABLE guest_access_logs ADD COLUMN tenant_id TEXT;

-- Announcement views
ALTER TABLE announcement_views ADD COLUMN tenant_id TEXT;

-- Training system tables
ALTER TABLE training_partners ADD COLUMN tenant_id TEXT;
ALTER TABLE training_votes ADD COLUMN tenant_id TEXT;
ALTER TABLE training_feedback ADD COLUMN tenant_id TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_executor_zones_tenant ON executor_zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guest_access_logs_tenant ON guest_access_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participated_voters_tenant ON meeting_participated_voters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_schedule_options_tenant ON meeting_schedule_options(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_schedule_votes_tenant ON meeting_schedule_votes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_partners_tenant ON training_partners(tenant_id);
