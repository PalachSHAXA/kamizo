-- Performance indexes for common query patterns
-- Skip idx_finance_charges_apt_period — already exists as idx_finance_charges_apartment_period

CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active ON users(tenant_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_status ON requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_tenant_executor ON requests(tenant_id, executor_id, status);
CREATE INDEX IF NOT EXISTS idx_apartments_building_tenant ON apartments(building_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_charges_tenant_status ON finance_charges(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_payments_tenant_date ON finance_payments(tenant_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_active ON announcements(tenant_id, is_active, type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_date ON chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_meeting_agenda ON meeting_vote_records(meeting_id, agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at);
