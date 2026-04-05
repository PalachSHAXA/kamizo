-- Additional composite indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_building_tenant_role ON users(building_id, tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status_resident ON requests(tenant_id, status, resident_id);
CREATE INDEX IF NOT EXISTS idx_vote_records_meeting_revote ON meeting_vote_records(meeting_id, is_revote);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_sender ON chat_messages(channel_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_personal_accounts_building ON personal_accounts(building_id, tenant_id);
